use std::ffi::OsStr;
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
use std::path::{Path, PathBuf};

use crate::catalog::PackageTarget;
use crate::types::{
    EnvironmentReport, InstallStep, PackageKind, Platform, Provider, ProviderAvailability,
    ProviderStatus,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PackagePresence {
    Installed,
    Missing,
    Unknown(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PackageAvailability {
    Available,
    Unavailable,
    Unknown(String),
}

const MACOS_BREW_PATHS: [&str; 2] = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];
const LINUX_PKEXEC: &str = "/usr/bin/pkexec";
const LINUX_APT: &str = "/usr/bin/apt-get";
const LINUX_APT_CACHE: &str = "/usr/bin/apt-cache";
const LINUX_DNF: &str = "/usr/bin/dnf";
const LINUX_FLATPAK: &str = "/usr/bin/flatpak";
const FLATHUB_STABLE_REPO_URL: &str = "https://dl.flathub.org/repo";
const WINGET_PATH_SUFFIX: [&str; 3] = ["Microsoft", "WindowsApps", "winget.exe"];
const WINGET_SOURCE: &str = "winget";
#[cfg(any(target_os = "windows", test))]
const WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
#[cfg(any(target_os = "windows", test))]
const WINDOWS_IO_REPARSE_TAG_APPEXECLINK: u32 = 0x8000_001b;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WindowsPathRoot {
    LocalDrive,
    Unc,
    Relative,
    #[cfg(target_os = "windows")]
    Other,
}

pub fn current_platform() -> Platform {
    if cfg!(target_os = "windows") {
        Platform::Windows
    } else if cfg!(target_os = "macos") {
        Platform::Macos
    } else if cfg!(target_os = "android") {
        Platform::Android
    } else {
        Platform::Linux
    }
}

pub fn detect_environment() -> EnvironmentReport {
    let platform = current_platform();
    let providers = match platform {
        Platform::Windows => vec![winget_status()],
        Platform::Macos => vec![homebrew_status()],
        Platform::Linux => vec![flatpak_status(), apt_status(), dnf_status()],
        Platform::Android => Vec::new(),
    };

    EnvironmentReport {
        platform,
        architecture: std::env::consts::ARCH.to_string(),
        providers,
    }
}

fn executable_availability(executable: impl AsRef<OsStr>) -> ProviderAvailability {
    match Command::new(executable)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
    {
        Ok(status) if status.success() => ProviderAvailability::Available,
        Ok(_) => ProviderAvailability::Unknown,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            ProviderAvailability::Unavailable
        }
        Err(_) => ProviderAvailability::Unknown,
    }
}

fn path_availability(path: &str) -> ProviderAvailability {
    match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => ProviderAvailability::Available,
        Ok(_) => ProviderAvailability::Unavailable,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            ProviderAvailability::Unavailable
        }
        Err(_) => ProviderAvailability::Unknown,
    }
}

fn combine_availability(
    left: ProviderAvailability,
    right: ProviderAvailability,
) -> ProviderAvailability {
    if left == ProviderAvailability::Unknown || right == ProviderAvailability::Unknown {
        ProviderAvailability::Unknown
    } else if left == ProviderAvailability::Unavailable
        || right == ProviderAvailability::Unavailable
    {
        ProviderAvailability::Unavailable
    } else {
        ProviderAvailability::Available
    }
}

fn winget_status() -> ProviderStatus {
    #[cfg(target_os = "windows")]
    {
        return match resolve_trusted_winget_executable() {
            Ok(path) => {
                let Some(executable) = path.to_str() else {
                    return unknown_winget_status("WinGet path is not valid Unicode");
                };
                match executable_availability(&path) {
                    ProviderAvailability::Available => ProviderStatus {
                        provider: Provider::Winget,
                        executable: Some(executable.to_string()),
                        availability: ProviderAvailability::Available,
                        requires_elevation: false,
                        detail: None,
                    },
                    _ => unknown_winget_status("trusted WinGet probe could not be confirmed"),
                }
            }
            Err(detail) => unknown_winget_status(detail),
        };
    }

    #[cfg(not(target_os = "windows"))]
    unknown_winget_status("WinGet can only be resolved on Windows")
}

fn unknown_winget_status(detail: &str) -> ProviderStatus {
    ProviderStatus {
        provider: Provider::Winget,
        executable: None,
        availability: ProviderAvailability::Unknown,
        requires_elevation: false,
        detail: Some(detail.to_string()),
    }
}

fn winget_path_shape_is_trusted(
    root: WindowsPathRoot,
    has_parent_dir: bool,
    components: &[&str],
) -> bool {
    root == WindowsPathRoot::LocalDrive
        && !has_parent_dir
        && components.len() >= WINGET_PATH_SUFFIX.len()
        && components[components.len() - WINGET_PATH_SUFFIX.len()..]
            .iter()
            .zip(WINGET_PATH_SUFFIX)
            .all(|(actual, expected)| actual.eq_ignore_ascii_case(expected))
}

#[cfg(any(target_os = "windows", test))]
fn winget_reparse_tag_is_trusted(file_attributes: u32, reparse_tag: u32) -> bool {
    file_attributes & WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT == 0
        || reparse_tag == WINDOWS_IO_REPARSE_TAG_APPEXECLINK
}

#[cfg(not(target_os = "windows"))]
fn portable_winget_path_shape_is_trusted(path: &str) -> bool {
    let bytes = path.as_bytes();
    let (root, component_start) = if bytes.len() >= 7
        && matches!(&bytes[..4], b"\\\\?\\" | b"//?/")
        && bytes[4].is_ascii_alphabetic()
        && bytes[5] == b':'
        && matches!(bytes[6], b'\\' | b'/')
    {
        (WindowsPathRoot::LocalDrive, 7)
    } else if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/')
    {
        (WindowsPathRoot::LocalDrive, 3)
    } else if path.starts_with("\\\\") || path.starts_with("//") {
        (WindowsPathRoot::Unc, 0)
    } else {
        (WindowsPathRoot::Relative, 0)
    };
    let components = path[component_start..]
        .split(['\\', '/'])
        .filter(|component| !component.is_empty())
        .collect::<Vec<_>>();
    let has_parent_dir = components
        .iter()
        .any(|component| matches!(*component, "." | ".."));
    winget_path_shape_is_trusted(root, has_parent_dir, &components)
}

#[cfg(target_os = "windows")]
fn windows_path_shape_is_trusted(path: &Path) -> bool {
    use std::path::{Component, Prefix};

    let mut components = path.components();
    let root = match components.next() {
        Some(Component::Prefix(prefix)) => match prefix.kind() {
            Prefix::Disk(_) | Prefix::VerbatimDisk(_) => WindowsPathRoot::LocalDrive,
            Prefix::UNC(_, _) | Prefix::VerbatimUNC(_, _) => WindowsPathRoot::Unc,
            _ => WindowsPathRoot::Other,
        },
        _ => WindowsPathRoot::Relative,
    };
    let mut has_parent_dir = false;
    let mut tail = Vec::new();
    for component in components {
        match component {
            Component::ParentDir | Component::CurDir => has_parent_dir = true,
            Component::Normal(value) => tail.push(value),
            Component::RootDir => {}
            Component::Prefix(_) => return false,
        }
    }
    let suffix = tail
        .iter()
        .rev()
        .take(WINGET_PATH_SUFFIX.len())
        .rev()
        .map(|component| component.to_str())
        .collect::<Option<Vec<_>>>();
    suffix.is_some_and(|suffix| winget_path_shape_is_trusted(root, has_parent_dir, &suffix))
}

#[cfg(target_os = "windows")]
fn local_app_data_known_folder() -> Result<PathBuf, &'static str> {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::System::Com::CoTaskMemFree;
    use windows_sys::Win32::UI::Shell::{FOLDERID_LocalAppData, SHGetKnownFolderPath};

    let mut path_ptr = std::ptr::null_mut();
    // SAFETY: SHGetKnownFolderPath initializes a COM-task-allocated, NUL-terminated
    // UTF-16 buffer on success. We scan only that buffer and release it exactly once.
    let result = unsafe {
        SHGetKnownFolderPath(
            &FOLDERID_LocalAppData,
            0,
            std::ptr::null_mut(),
            &mut path_ptr,
        )
    };
    if result < 0 || path_ptr.is_null() {
        unsafe { CoTaskMemFree(path_ptr.cast::<c_void>()) };
        return Err("Windows LocalAppData known folder could not be resolved");
    }
    let mut length = 0;
    unsafe {
        while *path_ptr.add(length) != 0 {
            length += 1;
        }
    }
    let wide = unsafe { std::slice::from_raw_parts(path_ptr, length) };
    let path = PathBuf::from(std::ffi::OsString::from_wide(wide));
    unsafe { CoTaskMemFree(path_ptr.cast::<c_void>()) };
    Ok(path)
}

#[cfg(target_os = "windows")]
fn resolve_trusted_winget_executable() -> Result<PathBuf, &'static str> {
    let known_folder = local_app_data_known_folder()?;
    if !windows_path_shape_is_local_drive(&known_folder) {
        return Err("Windows LocalAppData known folder is not a local absolute path");
    }
    let canonical_local_app_data = std::fs::canonicalize(&known_folder)
        .map_err(|_| "Windows LocalAppData canonical path could not be resolved")?;
    if !windows_path_shape_is_local_drive(&canonical_local_app_data) {
        return Err("Windows LocalAppData canonical path is not a local absolute path");
    }

    let expected_parent = canonical_local_app_data
        .join(WINGET_PATH_SUFFIX[0])
        .join(WINGET_PATH_SUFFIX[1]);
    let canonical_parent = std::fs::canonicalize(&expected_parent)
        .map_err(|_| "trusted WindowsApps directory could not be resolved")?;
    if canonical_parent != expected_parent {
        return Err("trusted WindowsApps directory redirects outside its expected path");
    }

    let candidate = canonical_parent.join(WINGET_PATH_SUFFIX[2]);
    if !windows_path_shape_is_trusted(&candidate)
        || candidate.parent() != Some(canonical_parent.as_path())
        || candidate.file_name() != Some(OsStr::new(WINGET_PATH_SUFFIX[2]))
    {
        return Err("WinGet candidate did not match its expected absolute path");
    }
    let metadata = std::fs::symlink_metadata(&candidate)
        .map_err(|_| "trusted WinGet executable could not be inspected")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("WinGet candidate is not a regular non-symlink file");
    }
    if !windows_winget_reparse_tag_is_trusted(&candidate)? {
        return Err("WinGet candidate uses an untrusted reparse redirect");
    }
    Ok(candidate)
}

#[cfg(target_os = "windows")]
fn windows_winget_reparse_tag_is_trusted(path: &Path) -> Result<bool, &'static str> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FileAttributeTagInfo, GetFileInformationByHandleEx, FILE_ATTRIBUTE_TAG_INFO,
        FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
        OPEN_EXISTING,
    };

    let wide_path = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let handle = unsafe {
        CreateFileW(
            wide_path.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_OPEN_REPARSE_POINT,
            std::ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err("WinGet candidate reparse metadata could not be opened");
    }
    let mut info = FILE_ATTRIBUTE_TAG_INFO::default();
    let success = unsafe {
        GetFileInformationByHandleEx(
            handle,
            FileAttributeTagInfo,
            (&mut info as *mut FILE_ATTRIBUTE_TAG_INFO).cast(),
            std::mem::size_of::<FILE_ATTRIBUTE_TAG_INFO>() as u32,
        )
    };
    unsafe { CloseHandle(handle) };
    if success == 0 {
        return Err("WinGet candidate reparse metadata could not be read");
    }
    Ok(winget_reparse_tag_is_trusted(
        info.FileAttributes,
        info.ReparseTag,
    ))
}

#[cfg(target_os = "windows")]
fn windows_path_shape_is_local_drive(path: &Path) -> bool {
    use std::path::{Component, Prefix};

    matches!(
        path.components().next(),
        Some(Component::Prefix(prefix))
            if matches!(prefix.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_))
    ) && path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
}

fn winget_executable_is_trusted(executable: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        return resolve_trusted_winget_executable()
            .ok()
            .is_some_and(|resolved| resolved == Path::new(executable));
    }

    #[cfg(not(target_os = "windows"))]
    portable_winget_path_shape_is_trusted(executable)
}

fn homebrew_status() -> ProviderStatus {
    let (availability, executable) = MACOS_BREW_PATHS.iter().fold(
        (ProviderAvailability::Unavailable, None),
        |(current, selected), path| {
            if current == ProviderAvailability::Available {
                return (current, selected);
            }
            match path_availability(path) {
                ProviderAvailability::Available => match executable_availability(path) {
                    ProviderAvailability::Available => {
                        (ProviderAvailability::Available, Some(*path))
                    }
                    ProviderAvailability::Unknown => (ProviderAvailability::Unknown, selected),
                    ProviderAvailability::Unavailable => (current, selected),
                },
                ProviderAvailability::Unavailable => (current, selected),
                ProviderAvailability::Unknown => (ProviderAvailability::Unknown, selected),
            }
        },
    );
    ProviderStatus {
        provider: Provider::Homebrew,
        availability,
        executable: executable.map(str::to_string),
        requires_elevation: false,
        detail: None,
    }
}

fn flatpak_status() -> ProviderStatus {
    let executable_availability = match path_availability(LINUX_FLATPAK) {
        ProviderAvailability::Available => executable_availability(LINUX_FLATPAK),
        availability => availability,
    };
    let availability = match executable_availability {
        ProviderAvailability::Available => match has_user_flathub_remote() {
            Ok(true) => ProviderAvailability::Available,
            Ok(false) => ProviderAvailability::Unavailable,
            Err(()) => ProviderAvailability::Unknown,
        },
        other => other,
    };
    ProviderStatus {
        provider: Provider::Flatpak,
        executable: (availability == ProviderAvailability::Available)
            .then(|| LINUX_FLATPAK.to_string()),
        availability,
        requires_elevation: false,
        detail: None,
    }
}

fn elevated_linux_status(
    provider: Provider,
    package_manager: &str,
    query_executable: &str,
) -> ProviderStatus {
    let availability = [package_manager, query_executable, LINUX_PKEXEC]
        .iter()
        .map(|path| path_availability(path))
        .fold(ProviderAvailability::Available, combine_availability);

    ProviderStatus {
        provider,
        executable: (availability == ProviderAvailability::Available)
            .then(|| LINUX_PKEXEC.to_string()),
        availability,
        requires_elevation: true,
        detail: None,
    }
}

fn apt_status() -> ProviderStatus {
    elevated_linux_status(Provider::Apt, LINUX_APT, LINUX_APT_CACHE)
}

fn dnf_status() -> ProviderStatus {
    elevated_linux_status(Provider::Dnf, LINUX_DNF, LINUX_DNF)
}

fn command_stdout(
    executable: &str,
    args: &[&str],
) -> Result<(Option<i32>, bool, String, String), ()> {
    let output = Command::new(executable)
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|_| ())?;
    Ok((
        output.status.code(),
        output.status.success(),
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
    ))
}

fn has_user_flathub_remote() -> Result<bool, ()> {
    command_stdout(LINUX_FLATPAK, &["remotes", "--user", "--columns=name,url"]).and_then(
        |(_, success, stdout, _)| {
            success
                .then_some(flatpak_remotes_include_official_flathub(&stdout))
                .ok_or(())
        },
    )
}

fn flatpak_remotes_include_official_flathub(stdout: &str) -> bool {
    stdout.lines().any(|line| {
        let mut columns = line.split_whitespace();
        let name = columns.next();
        let url = columns.next();
        name == Some("flathub")
            && url.is_some_and(is_official_flathub_repo_url)
            && columns.next().is_none()
    })
}

fn is_official_flathub_repo_url(url: &str) -> bool {
    url.strip_suffix('/').unwrap_or(url) == FLATHUB_STABLE_REPO_URL
}

fn apt_candidate_available(stdout: &str) -> bool {
    stdout.lines().any(|line| {
        line.trim()
            .strip_prefix("Candidate:")
            .is_some_and(|candidate| candidate.trim() != "(none)")
    })
}

fn apt_candidate_is_missing(stdout: &str) -> bool {
    stdout.lines().any(|line| {
        line.trim()
            .strip_prefix("Candidate:")
            .is_some_and(|candidate| candidate.trim() == "(none)")
    })
}

fn dnf_package_available(stdout: &str, package_id: &str) -> bool {
    stdout.lines().any(|line| {
        let Some(package_with_arch) = line.split_whitespace().next() else {
            return false;
        };
        package_with_arch == package_id
            || package_with_arch
                .rsplit_once('.')
                .is_some_and(|(name, architecture)| name == package_id && !architecture.is_empty())
    })
}

pub fn package_available(
    provider_status: &ProviderStatus,
    target: PackageTarget,
) -> PackageAvailability {
    if provider_status.availability != ProviderAvailability::Available {
        return PackageAvailability::Unknown(
            "provider availability could not be confirmed".to_string(),
        );
    }

    match provider_status.provider {
        Provider::Flatpak
            if provider_status.executable.as_deref() == Some(LINUX_FLATPAK)
                && target.kind == PackageKind::Flatpak =>
        {
            match command_stdout(
                LINUX_FLATPAK,
                &["remote-info", "--user", "flathub", target.package_id],
            ) {
                Ok((_, true, _, _)) => PackageAvailability::Available,
                Ok((exit_code, false, _, stderr)) => PackageAvailability::Unknown(
                    command_failure_detail("Flatpak package lookup", exit_code, &stderr),
                ),
                Err(()) => PackageAvailability::Unknown(
                    "Flatpak package lookup could not be started".to_string(),
                ),
            }
        }
        Provider::Apt if provider_status.executable.as_deref() == Some(LINUX_PKEXEC) => {
            match command_stdout(LINUX_APT_CACHE, &["policy", target.package_id]) {
                Ok((_, true, stdout, _)) if apt_candidate_available(&stdout) => {
                    PackageAvailability::Available
                }
                Ok((_, true, stdout, _)) if apt_candidate_is_missing(&stdout) => {
                    PackageAvailability::Unavailable
                }
                Ok((exit_code, true, _, stderr)) => PackageAvailability::Unknown(
                    command_failure_detail("APT package lookup", exit_code, &stderr),
                ),
                Ok((exit_code, false, _, stderr)) => PackageAvailability::Unknown(
                    command_failure_detail("APT package lookup", exit_code, &stderr),
                ),
                Err(()) => PackageAvailability::Unknown(
                    "APT package lookup could not be started".to_string(),
                ),
            }
        }
        Provider::Dnf if provider_status.executable.as_deref() == Some(LINUX_PKEXEC) => {
            match command_stdout(LINUX_DNF, &["--quiet", "list", target.package_id]) {
                Ok((exit_code, true, stdout, stderr)) => dnf_package_availability_from_stdout(
                    &stdout,
                    target.package_id,
                    exit_code,
                    &stderr,
                ),
                Ok((exit_code, false, _, stderr)) => PackageAvailability::Unknown(
                    command_failure_detail("DNF package lookup", exit_code, &stderr),
                ),
                Err(()) => PackageAvailability::Unknown(
                    "DNF package lookup could not be started".to_string(),
                ),
            }
        }
        Provider::Winget
            if target.kind == PackageKind::Native
                && provider_status
                    .executable
                    .as_deref()
                    .is_some_and(winget_executable_is_trusted) =>
        {
            let executable = provider_status.executable.as_deref().unwrap_or_default();
            match command_stdout(
                executable,
                &[
                    "show",
                    "--id",
                    target.package_id,
                    "--exact",
                    "--source",
                    WINGET_SOURCE,
                    "--accept-source-agreements",
                    "--disable-interactivity",
                ],
            ) {
                Ok((_, true, _, _)) => PackageAvailability::Available,
                Ok((exit_code, false, _, stderr)) => PackageAvailability::Unknown(
                    command_failure_detail("WinGet package lookup", exit_code, &stderr),
                ),
                Err(()) => PackageAvailability::Unknown(
                    "WinGet package lookup could not be started".to_string(),
                ),
            }
        }
        Provider::Homebrew => PackageAvailability::Available,
        _ => PackageAvailability::Unknown("provider package lookup is not allowlisted".to_string()),
    }
}

fn dnf_package_availability_from_stdout(
    stdout: &str,
    package_id: &str,
    exit_code: Option<i32>,
    stderr: &str,
) -> PackageAvailability {
    if dnf_package_available(stdout, package_id) {
        PackageAvailability::Available
    } else if stdout.trim().is_empty() {
        PackageAvailability::Unavailable
    } else {
        PackageAvailability::Unknown(command_failure_detail(
            "DNF package lookup",
            exit_code,
            stderr,
        ))
    }
}

pub fn package_presence(
    provider_status: &ProviderStatus,
    target: PackageTarget,
) -> PackagePresence {
    if provider_status.availability != ProviderAvailability::Available {
        return PackagePresence::Unknown(
            "provider availability could not be confirmed".to_string(),
        );
    }

    match provider_status.provider {
        Provider::Winget
            if target.kind == PackageKind::Native
                && provider_status
                    .executable
                    .as_deref()
                    .is_some_and(winget_executable_is_trusted) =>
        {
            winget_presence(
                provider_status.executable.as_deref().unwrap_or_default(),
                target.package_id,
            )
        }
        Provider::Homebrew
            if MACOS_BREW_PATHS
                .contains(&provider_status.executable.as_deref().unwrap_or_default()) =>
        {
            let executable = provider_status.executable.as_deref().unwrap_or_default();
            let kind = match target.kind {
                PackageKind::Formula => "--formula",
                PackageKind::Cask => "--cask",
                _ => {
                    return PackagePresence::Unknown(
                        "Homebrew package kind is not allowlisted".to_string(),
                    )
                }
            };
            command_presence(
                executable,
                &["list", "--versions", kind, "--", target.package_id],
                PresenceCheck::Homebrew,
            )
        }
        Provider::Apt if provider_status.executable.as_deref() == Some(LINUX_PKEXEC) => {
            command_presence(
                "/usr/bin/dpkg-query",
                &[
                    "--show",
                    "--showformat=${db:Status-Status}",
                    "--",
                    target.package_id,
                ],
                PresenceCheck::Dpkg,
            )
        }
        Provider::Dnf if provider_status.executable.as_deref() == Some(LINUX_PKEXEC) => {
            command_presence(
                "/usr/bin/rpm",
                &["--query", "--quiet", "--", target.package_id],
                PresenceCheck::Rpm,
            )
        }
        Provider::Flatpak
            if provider_status.executable.as_deref() == Some(LINUX_FLATPAK)
                && target.kind == PackageKind::Flatpak =>
        {
            flatpak_presence(target.package_id)
        }
        _ => PackagePresence::Unknown("provider presence check is not allowlisted".to_string()),
    }
}

enum PresenceCheck {
    Homebrew,
    Dpkg,
    Rpm,
}

fn winget_presence(executable: &str, package_id: &str) -> PackagePresence {
    match command_stdout(
        executable,
        &[
            "list",
            "--id",
            package_id,
            "--exact",
            "--source",
            WINGET_SOURCE,
            "--accept-source-agreements",
            "--disable-interactivity",
        ],
    ) {
        Ok((_, true, stdout, _)) if winget_list_contains_exact_id(&stdout, package_id) => {
            PackagePresence::Installed
        }
        Ok((_, true, _, _)) => PackagePresence::Missing,
        Ok((exit_code, false, _, stderr)) => PackagePresence::Unknown(command_failure_detail(
            "WinGet installed-package check",
            exit_code,
            &stderr,
        )),
        Err(()) => PackagePresence::Unknown(
            "WinGet installed-package check could not be started".to_string(),
        ),
    }
}

fn winget_list_contains_exact_id(stdout: &str, package_id: &str) -> bool {
    stdout.lines().any(|line| {
        line.split_whitespace()
            .any(|column| column.eq_ignore_ascii_case(package_id))
    })
}

fn command_presence(executable: &str, args: &[&str], check: PresenceCheck) -> PackagePresence {
    let output = match Command::new(executable)
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .output()
    {
        Ok(output) => output,
        Err(_) => {
            return PackagePresence::Unknown(
                "installed-package check could not be started".to_string(),
            )
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    presence_from_command(output.status.code(), &stdout, &stderr, check)
}

fn presence_from_command(
    exit_code: Option<i32>,
    stdout: &str,
    stderr: &str,
    check: PresenceCheck,
) -> PackagePresence {
    let status = match check {
        PresenceCheck::Homebrew if exit_code == Some(0) => PackagePresence::Installed,
        PresenceCheck::Homebrew
            if exit_code == Some(1) && stdout.trim().is_empty() && stderr.trim().is_empty() =>
        {
            PackagePresence::Missing
        }
        PresenceCheck::Dpkg if exit_code == Some(0) && stdout.trim() == "installed" => {
            PackagePresence::Installed
        }
        PresenceCheck::Dpkg if exit_code == Some(0) && stdout.trim() == "not-installed" => {
            PackagePresence::Missing
        }
        PresenceCheck::Rpm if exit_code == Some(0) => PackagePresence::Installed,
        PresenceCheck::Rpm if exit_code == Some(1) && stderr.trim().is_empty() => {
            PackagePresence::Missing
        }
        _ => PackagePresence::Unknown(command_failure_detail(
            "installed-package check",
            exit_code,
            stderr,
        )),
    };
    status
}

fn flatpak_presence(package_id: &str) -> PackagePresence {
    let user = flatpak_scope_presence("--user", package_id);
    let system = flatpak_scope_presence("--system", package_id);
    flatpak_presence_from_scopes(user, system)
}

fn flatpak_presence_from_scopes(user: PackagePresence, system: PackagePresence) -> PackagePresence {
    match (&user, &system) {
        (PackagePresence::Installed, _) | (_, PackagePresence::Installed) => {
            PackagePresence::Installed
        }
        (PackagePresence::Unknown(detail), _) | (_, PackagePresence::Unknown(detail)) => {
            PackagePresence::Unknown(detail.clone())
        }
        _ => PackagePresence::Missing,
    }
}

fn flatpak_scope_presence(scope: &str, package_id: &str) -> PackagePresence {
    match command_stdout(
        LINUX_FLATPAK,
        &["list", scope, "--app", "--columns=application"],
    ) {
        Ok((_, true, stdout, _)) => {
            if stdout.lines().any(|line| line.trim() == package_id) {
                PackagePresence::Installed
            } else {
                PackagePresence::Missing
            }
        }
        Ok((exit_code, false, _, stderr)) => PackagePresence::Unknown(command_failure_detail(
            "Flatpak installed-app check",
            exit_code,
            &stderr,
        )),
        Err(()) => {
            PackagePresence::Unknown("Flatpak installed-app check could not be started".to_string())
        }
    }
}

fn command_failure_detail(operation: &str, exit_code: Option<i32>, _stderr: &str) -> String {
    exit_code
        .map(|code| format!("{operation} could not be confirmed (exit {code})"))
        .unwrap_or_else(|| format!("{operation} could not be confirmed"))
}

fn winget_install_args(package_id: &str) -> Vec<String> {
    [
        "install",
        "--id",
        package_id,
        "--exact",
        "--source",
        WINGET_SOURCE,
        "--accept-package-agreements",
        "--accept-source-agreements",
        "--disable-interactivity",
        "--no-upgrade",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

pub fn install_step(
    app_id: &str,
    display_name: &str,
    provider_status: &ProviderStatus,
    target: PackageTarget,
) -> Option<InstallStep> {
    if provider_status.availability != ProviderAvailability::Available {
        return None;
    }
    let executable = provider_status.executable.as_deref()?;

    let args: Vec<String> = match provider_status.provider {
        Provider::Winget
            if target.kind == PackageKind::Native && winget_executable_is_trusted(executable) =>
        {
            winget_install_args(target.package_id)
        }
        Provider::Homebrew if MACOS_BREW_PATHS.contains(&executable) => {
            let mut values = vec!["install".to_string()];
            if target.kind == PackageKind::Cask {
                values.push("--cask".to_string());
            }
            values.push(target.package_id.to_string());
            values
        }
        Provider::Apt if executable == LINUX_PKEXEC => {
            [LINUX_APT, "install", "-y", target.package_id]
                .into_iter()
                .map(str::to_string)
                .collect()
        }
        Provider::Dnf if executable == LINUX_PKEXEC => {
            [LINUX_DNF, "install", "-y", target.package_id]
                .into_iter()
                .map(str::to_string)
                .collect()
        }
        Provider::Flatpak if executable == LINUX_FLATPAK => [
            "install",
            "--user",
            "--noninteractive",
            "flathub",
            target.package_id,
        ]
        .into_iter()
        .map(str::to_string)
        .collect(),
        _ => return None,
    };

    Some(InstallStep {
        app_id: app_id.to_string(),
        display_name: display_name.to_string(),
        provider: provider_status.provider,
        package_kind: target.kind,
        launch_hint: target.launch_hint.map(str::to_string),
        executable: executable.to_string(),
        args,
        requires_elevation: provider_status.requires_elevation,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider_status(provider: Provider, executable: &str) -> ProviderStatus {
        ProviderStatus {
            provider,
            availability: ProviderAvailability::Available,
            executable: Some(executable.to_string()),
            requires_elevation: matches!(provider, Provider::Apt | Provider::Dnf),
            detail: None,
        }
    }

    #[test]
    fn winget_install_args_are_portable_but_step_still_requires_a_trusted_path() {
        let target = PackageTarget {
            package_id: "Mozilla.Firefox",
            kind: PackageKind::Native,
            launch_hint: None,
        };
        assert_eq!(
            winget_install_args(target.package_id),
            [
                "install",
                "--id",
                "Mozilla.Firefox",
                "--exact",
                "--source",
                "winget",
                "--accept-package-agreements",
                "--accept-source-agreements",
                "--disable-interactivity",
                "--no-upgrade",
            ]
        );

        assert!(install_step(
            "firefox",
            "Mozilla Firefox",
            &provider_status(Provider::Winget, "winget.exe"),
            target,
        )
        .is_none());

        #[cfg(not(target_os = "windows"))]
        {
            let step = install_step(
                "firefox",
                "Mozilla Firefox",
                &provider_status(
                    Provider::Winget,
                    r"C:\Users\Alice\AppData\Local\Microsoft\WindowsApps\winget.exe",
                ),
                target,
            )
            .unwrap();
            assert_eq!(step.args, winget_install_args(target.package_id));
        }
    }

    #[test]
    fn homebrew_cask_is_an_argument_not_a_command_string() {
        let target = PackageTarget {
            package_id: "firefox",
            kind: PackageKind::Cask,
            launch_hint: None,
        };
        let step = install_step(
            "firefox",
            "Mozilla Firefox",
            &provider_status(Provider::Homebrew, "/opt/homebrew/bin/brew"),
            target,
        )
        .unwrap();
        assert_eq!(step.args, ["install", "--cask", "firefox"]);
        assert!(step.args.iter().all(|arg| !arg.contains(';')));
    }

    #[test]
    fn rejects_non_allowlisted_executable() {
        let target = PackageTarget {
            package_id: "firefox",
            kind: PackageKind::Cask,
            launch_hint: None,
        };
        assert!(install_step(
            "firefox",
            "Mozilla Firefox",
            &provider_status(Provider::Homebrew, "/tmp/brew"),
            target,
        )
        .is_none());
    }

    #[test]
    fn install_step_copies_only_the_allowlisted_formula_launch_hint() {
        let target = PackageTarget {
            package_id: "sevenzip",
            kind: PackageKind::Formula,
            launch_hint: Some("7zz"),
        };
        let step = install_step(
            "sevenzip",
            "7-Zip",
            &provider_status(Provider::Homebrew, "/opt/homebrew/bin/brew"),
            target,
        )
        .unwrap();
        assert_eq!(step.package_kind, PackageKind::Formula);
        assert_eq!(step.launch_hint.as_deref(), Some("7zz"));
    }

    #[test]
    fn flathub_remote_must_match_the_pinned_official_stable_repo() {
        assert!(flatpak_remotes_include_official_flathub(
            "flathub\thttps://dl.flathub.org/repo/\n"
        ));
        assert!(flatpak_remotes_include_official_flathub(
            "flathub https://dl.flathub.org/repo\n"
        ));
        assert!(!flatpak_remotes_include_official_flathub(
            "flathub\thttps://evil.example/repo/\n"
        ));
        assert!(!flatpak_remotes_include_official_flathub(
            "flathub\thttps://user:password@dl.flathub.org/repo/\n"
        ));
        assert!(!flatpak_remotes_include_official_flathub(
            "flathub\thttps://dl.flathub.org/repo/?token=secret\n"
        ));
        assert!(!flatpak_remotes_include_official_flathub("flathub\n"));
    }

    #[test]
    fn apt_requires_a_real_candidate() {
        assert!(apt_candidate_available(
            "firefox:\n  Installed: (none)\n  Candidate: 1.2.3\n"
        ));
        assert!(!apt_candidate_available(
            "unknown:\n  Installed: (none)\n  Candidate: (none)\n"
        ));
    }

    #[test]
    fn dnf_package_name_must_match_exactly_before_architecture() {
        assert!(dnf_package_available(
            "Available Packages\nfirefox.x86_64 1.2 repo\n",
            "firefox"
        ));
        assert!(!dnf_package_available(
            "Available Packages\nfirefox-beta.x86_64 1.2 repo\n",
            "firefox"
        ));
        assert!(!dnf_package_available(
            "Available Packages\nfirefox.beta.x86_64 1.2 repo\n",
            "firefox"
        ));
    }

    #[test]
    fn dnf_nonempty_mismatch_is_unknown_not_unavailable() {
        assert_eq!(
            dnf_package_availability_from_stdout("", "firefox", Some(0), ""),
            PackageAvailability::Unavailable
        );
        assert!(matches!(
            dnf_package_availability_from_stdout(
                "Available Packages\nfirefox-beta.x86_64 1.2 repo\n",
                "firefox",
                Some(0),
                "",
            ),
            PackageAvailability::Unknown(_)
        ));
    }

    #[test]
    fn presence_parser_defaults_nonzero_errors_to_unknown() {
        assert_eq!(
            presence_from_command(Some(1), "", "", PresenceCheck::Homebrew),
            PackagePresence::Missing
        );
        assert_eq!(
            presence_from_command(Some(2), "", "permission denied", PresenceCheck::Homebrew),
            PackagePresence::Unknown(
                "installed-package check could not be confirmed (exit 2)".to_string()
            )
        );
    }

    #[test]
    fn winget_path_shape_rejects_relative_unc_traversal_and_wrong_names() {
        let valid = [
            "Users",
            "Alice",
            "AppData",
            "Local",
            "Microsoft",
            "WindowsApps",
            "winget.exe",
        ];
        assert!(winget_path_shape_is_trusted(
            WindowsPathRoot::LocalDrive,
            false,
            &valid,
        ));
        assert!(!winget_path_shape_is_trusted(
            WindowsPathRoot::Relative,
            false,
            &valid,
        ));
        assert!(!winget_path_shape_is_trusted(
            WindowsPathRoot::Unc,
            false,
            &valid,
        ));
        assert!(!winget_path_shape_is_trusted(
            WindowsPathRoot::LocalDrive,
            true,
            &valid,
        ));
        assert!(!winget_path_shape_is_trusted(
            WindowsPathRoot::LocalDrive,
            false,
            &[
                "Users",
                "Alice",
                "Microsoft",
                "WindowsApps",
                "evil-winget.exe",
            ],
        ));

        #[cfg(not(target_os = "windows"))]
        {
            assert!(portable_winget_path_shape_is_trusted(
                r"C:\Users\Alice\AppData\Local\Microsoft\WindowsApps\winget.exe"
            ));
            assert!(portable_winget_path_shape_is_trusted(
                r"\\?\C:\Users\Alice\AppData\Local\Microsoft\WindowsApps\winget.exe"
            ));
            assert!(!portable_winget_path_shape_is_trusted("winget.exe"));
            assert!(!portable_winget_path_shape_is_trusted(
                r"\\server\share\Microsoft\WindowsApps\winget.exe"
            ));
            assert!(!portable_winget_path_shape_is_trusted(
                r"\\?\UNC\server\share\Microsoft\WindowsApps\winget.exe"
            ));
            assert!(!portable_winget_path_shape_is_trusted(
                r"C:\Users\Alice\..\Microsoft\WindowsApps\winget.exe"
            ));
        }
    }

    #[test]
    fn winget_reparse_policy_allows_only_regular_files_or_app_execution_aliases() {
        assert!(winget_reparse_tag_is_trusted(0, 0));
        assert!(winget_reparse_tag_is_trusted(
            WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT,
            WINDOWS_IO_REPARSE_TAG_APPEXECLINK,
        ));
        assert!(!winget_reparse_tag_is_trusted(
            WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT,
            0xa000_000c,
        ));
        assert!(!winget_reparse_tag_is_trusted(
            WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT,
            0xa000_0003,
        ));
    }

    #[test]
    fn winget_list_parser_matches_only_an_exact_package_id_column() {
        let stdout = "Name             Id                Version\nMozilla Firefox  Mozilla.Firefox   141.0\n";
        assert!(winget_list_contains_exact_id(stdout, "Mozilla.Firefox"));
        assert!(!winget_list_contains_exact_id(stdout, "Mozilla.Fire"));
        assert!(!winget_list_contains_exact_id(
            "No installed package found matching input criteria.\n",
            "Mozilla.Firefox"
        ));
    }

    #[test]
    fn probe_failure_detail_redacts_credential_urls_and_stderr() {
        let detail = command_failure_detail(
            "Flatpak installed-app check",
            Some(2),
            "https://user:secret@example.test/private",
        );
        assert_eq!(
            detail,
            "Flatpak installed-app check could not be confirmed (exit 2)"
        );
        assert!(!detail.contains("secret"));
        assert!(!detail.contains("example.test"));
    }

    #[test]
    fn flatpak_system_install_wins_over_a_missing_user_scope() {
        assert_eq!(
            flatpak_presence_from_scopes(PackagePresence::Missing, PackagePresence::Installed),
            PackagePresence::Installed
        );
        assert!(matches!(
            flatpak_presence_from_scopes(
                PackagePresence::Missing,
                PackagePresence::Unknown("probe error".to_string()),
            ),
            PackagePresence::Unknown(_)
        ));
    }
}
