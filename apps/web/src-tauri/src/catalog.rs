use crate::types::{PackageKind, Provider};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CatalogApp {
    pub id: &'static str,
    pub display_name: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PackageTarget {
    pub package_id: &'static str,
    pub kind: PackageKind,
    pub launch_hint: Option<&'static str>,
}

pub const APP_IDS: [&str; 10] = [
    "chrome",
    "firefox",
    "vscode",
    "git",
    "nodejs-lts",
    "vlc",
    "sevenzip",
    "discord",
    "spotify",
    "docker-desktop",
];

pub fn app(app_id: &str) -> Option<CatalogApp> {
    let display_name = match app_id {
        "chrome" => "Google Chrome",
        "firefox" => "Mozilla Firefox",
        "vscode" => "Visual Studio Code",
        "git" => "Git",
        "nodejs-lts" => "Node.js LTS",
        "vlc" => "VLC media player",
        "sevenzip" => "7-Zip",
        "discord" => "Discord",
        "spotify" => "Spotify",
        "docker-desktop" => "Docker Desktop",
        _ => return None,
    };

    Some(CatalogApp {
        id: APP_IDS.iter().copied().find(|id| *id == app_id)?,
        display_name,
    })
}

pub fn target_for(app_id: &str, provider: Provider) -> Option<PackageTarget> {
    use PackageKind::{Cask, Flatpak, Formula, Native};
    use Provider::{Apt, Dnf, Homebrew, Winget};

    let (package_id, kind, launch_hint) = match (app_id, provider) {
        ("chrome", Winget) => ("Google.Chrome", Native, None),
        ("firefox", Winget) => ("Mozilla.Firefox", Native, None),
        ("vscode", Winget) => ("Microsoft.VisualStudioCode", Native, None),
        ("git", Winget) => ("Git.Git", Native, None),
        ("nodejs-lts", Winget) => ("OpenJS.NodeJS.LTS", Native, None),
        ("vlc", Winget) => ("VideoLAN.VLC", Native, None),
        ("sevenzip", Winget) => ("7zip.7zip", Native, None),
        ("discord", Winget) => ("Discord.Discord", Native, None),
        ("spotify", Winget) => ("Spotify.Spotify", Native, None),
        ("docker-desktop", Winget) => ("Docker.DockerDesktop", Native, None),

        ("chrome", Homebrew) => ("google-chrome", Cask, None),
        ("firefox", Homebrew) => ("firefox", Cask, None),
        ("vscode", Homebrew) => ("visual-studio-code", Cask, None),
        ("git", Homebrew) => ("git", Formula, Some("git")),
        ("nodejs-lts", Homebrew) => ("node@24", Formula, Some("node")),
        ("vlc", Homebrew) => ("vlc", Cask, None),
        ("sevenzip", Homebrew) => ("sevenzip", Formula, Some("7zz")),
        ("discord", Homebrew) => ("discord", Cask, None),
        ("spotify", Homebrew) => ("spotify", Cask, None),
        ("docker-desktop", Homebrew) => ("docker-desktop", Cask, None),

        ("chrome", Apt | Dnf) => ("google-chrome-stable", Native, None),
        ("firefox", Apt | Dnf) => ("firefox", Native, None),
        ("vscode", Apt | Dnf) => ("code", Native, None),
        ("git", Apt | Dnf) => ("git", Native, None),
        ("vlc", Apt | Dnf) => ("vlc", Native, None),
        ("sevenzip", Apt | Dnf) => ("7zip", Native, None),
        ("spotify", Apt) => ("spotify-client", Native, None),
        ("docker-desktop", Apt | Dnf) => ("docker-desktop", Native, None),

        ("chrome", Provider::Flatpak) => ("com.google.Chrome", Flatpak, None),
        ("firefox", Provider::Flatpak) => ("org.mozilla.firefox", Flatpak, None),
        ("vscode", Provider::Flatpak) => ("com.visualstudio.code", Flatpak, None),
        ("vlc", Provider::Flatpak) => ("org.videolan.VLC", Flatpak, None),
        ("discord", Provider::Flatpak) => ("com.discordapp.Discord", Flatpak, None),
        ("spotify", Provider::Flatpak) => ("com.spotify.Client", Flatpak, None),
        _ => return None,
    };

    Some(PackageTarget {
        package_id,
        kind,
        launch_hint,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist_matches_backend_seed() {
        assert_eq!(APP_IDS.len(), 10);
        assert!(APP_IDS.iter().all(|id| app(id).is_some()));
        assert!(app("raw-command").is_none());
    }

    #[test]
    fn provider_ids_are_not_frontend_values() {
        let target = target_for("chrome", Provider::Winget).unwrap();
        assert_eq!(target.package_id, "Google.Chrome");
        assert_ne!(target.package_id, "chrome");
    }

    #[test]
    fn formula_launch_hints_are_allowlisted_with_the_package_target() {
        for (app_id, package_id, launch_hint) in [
            ("sevenzip", "sevenzip", "7zz"),
            ("git", "git", "git"),
            ("nodejs-lts", "node@24", "node"),
        ] {
            let target = target_for(app_id, Provider::Homebrew).unwrap();
            assert_eq!(target.kind, PackageKind::Formula);
            assert_eq!(target.package_id, package_id);
            assert_eq!(target.launch_hint, Some(launch_hint));
        }
    }
}
