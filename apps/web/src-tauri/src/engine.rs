use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::process::{Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::adapters::{
    install_step, package_available, package_presence, PackageAvailability, PackagePresence,
};
use crate::catalog::{app, target_for, PackageTarget};
use crate::types::{
    EnvironmentReport, ExecutionStatus, InstallPlan, InstallPolicy, InstallProgressEvent,
    InstallResult, InstallStep, InstallStepResult, OutputStream, ProgressEventKind,
    ProviderAvailability, ProviderStatus, SkippedApp, StepStatus, UnsupportedApp,
};

pub const INSTALL_PROGRESS_EVENT: &str = "install-progress";
const OUTPUT_LIMIT_BYTES: usize = 8_192;
const STREAM_CHUNK_BYTES: usize = 1_024;
const STREAM_QUEUE_CAPACITY: usize = 16;
const PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(100);
const STEP_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const MAX_PENDING_PLANS: usize = 32;
const MAX_REQUESTED_APP_IDS: usize = 32;
const MAX_APP_ID_CHARS: usize = 64;

#[derive(Clone, Default)]
pub struct PlanStore {
    plans: Arc<Mutex<HashMap<String, InstallPlan>>>,
}

impl PlanStore {
    pub fn create(
        &self,
        app_ids: Vec<String>,
        policy: InstallPolicy,
        environment: &EnvironmentReport,
    ) -> Result<InstallPlan, String> {
        if app_ids.len() > MAX_REQUESTED_APP_IDS {
            return Err(format!(
                "at most {MAX_REQUESTED_APP_IDS} app IDs may be planned at once"
            ));
        }
        if app_ids
            .iter()
            .any(|app_id| app_id.chars().count() > MAX_APP_ID_CHARS)
        {
            return Err(format!(
                "app IDs must not exceed {MAX_APP_ID_CHARS} characters"
            ));
        }
        let plan = build_plan(
            app_ids,
            policy,
            environment,
            random_token()?,
            random_token()?,
        );
        let mut plans = self
            .plans
            .lock()
            .map_err(|_| "install plan store is unavailable".to_string())?;
        if plans.len() >= MAX_PENDING_PLANS {
            return Err("too many unconsumed install plans".to_string());
        }
        plans.insert(plan.plan_id.clone(), plan.clone());
        Ok(plan)
    }

    pub fn take_confirmed(
        &self,
        plan_id: &str,
        confirmation_token: &str,
    ) -> Result<InstallPlan, String> {
        let mut plans = self
            .plans
            .lock()
            .map_err(|_| "install plan store is unavailable".to_string())?;
        let Some(plan) = plans.get(plan_id) else {
            return Err("install plan was not found or was already consumed".to_string());
        };
        if plan.confirmation_token != confirmation_token {
            return Err("confirmation token does not match the install plan".to_string());
        }
        plans
            .remove(plan_id)
            .ok_or_else(|| "install plan was already consumed".to_string())
    }
}

#[derive(Default)]
struct ExecutionState {
    serial: Mutex<()>,
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Clone, Default)]
pub struct ExecutionManager {
    state: Arc<ExecutionState>,
}

pub struct ExecutionRegistration {
    manager: ExecutionManager,
    plan_id: String,
    cancellation: Arc<AtomicBool>,
}

impl Drop for ExecutionRegistration {
    fn drop(&mut self) {
        if let Ok(mut active) = self.manager.state.active.lock() {
            active.remove(&self.plan_id);
        }
    }
}

impl ExecutionManager {
    pub fn register(&self, plan_id: &str) -> Result<ExecutionRegistration, String> {
        let cancellation = Arc::new(AtomicBool::new(false));
        let mut active = self
            .state
            .active
            .lock()
            .map_err(|_| "execution registry is unavailable".to_string())?;
        if active.contains_key(plan_id) {
            return Err("install plan is already executing".to_string());
        }
        active.insert(plan_id.to_string(), cancellation.clone());
        Ok(ExecutionRegistration {
            manager: self.clone(),
            plan_id: plan_id.to_string(),
            cancellation,
        })
    }

    pub fn cancel(&self, plan_id: &str) -> Result<bool, String> {
        let active = self
            .state
            .active
            .lock()
            .map_err(|_| "execution registry is unavailable".to_string())?;
        let Some(cancellation) = active.get(plan_id) else {
            return Ok(false);
        };
        cancellation.store(true, Ordering::Release);
        Ok(true)
    }
}

pub fn build_plan(
    app_ids: Vec<String>,
    policy: InstallPolicy,
    environment: &EnvironmentReport,
    plan_id: String,
    confirmation_token: String,
) -> InstallPlan {
    build_plan_with_availability(
        app_ids,
        policy,
        environment,
        plan_id,
        confirmation_token,
        package_available,
        package_presence,
    )
}

fn build_plan_with_availability<F>(
    app_ids: Vec<String>,
    policy: InstallPolicy,
    environment: &EnvironmentReport,
    plan_id: String,
    confirmation_token: String,
    availability: F,
    presence: impl Fn(&ProviderStatus, PackageTarget) -> PackagePresence,
) -> InstallPlan
where
    F: Fn(&ProviderStatus, PackageTarget) -> PackageAvailability,
{
    let mut seen = HashSet::new();
    let mut steps = Vec::new();
    let mut skipped = Vec::new();
    let mut unsupported = Vec::new();
    for app_id in app_ids {
        if !seen.insert(app_id.clone()) {
            continue;
        }
        let Some(catalog_app) = app(&app_id) else {
            unsupported.push(UnsupportedApp {
                app_id,
                reason: "app ID is not in the desktop allowlist".to_string(),
            });
            continue;
        };

        if policy == InstallPolicy::InstallAndUpgrade {
            unsupported.push(UnsupportedApp {
                app_id: catalog_app.id.to_string(),
                reason: "install-and-upgrade is coming soon and cannot execute packages yet"
                    .to_string(),
            });
            continue;
        }

        if environment.providers.iter().any(|provider_status| {
            provider_status.availability == ProviderAvailability::Unknown
                && target_for(catalog_app.id, provider_status.provider).is_some()
        }) {
            unsupported.push(UnsupportedApp {
                app_id: catalog_app.id.to_string(),
                reason: "provider availability could not be confirmed safely".to_string(),
            });
            continue;
        }

        let mut candidates = Vec::new();
        let mut availability_error = None;
        for provider_status in environment
            .providers
            .iter()
            .filter(|provider| provider.availability == ProviderAvailability::Available)
        {
            let Some(target) = target_for(catalog_app.id, provider_status.provider) else {
                continue;
            };
            match availability(provider_status, target) {
                PackageAvailability::Available => candidates.push((provider_status, target)),
                PackageAvailability::Unavailable => {}
                PackageAvailability::Unknown(reason) => availability_error = Some(reason),
            }
        }

        if let Some(reason) = availability_error {
            unsupported.push(UnsupportedApp {
                app_id: catalog_app.id.to_string(),
                reason,
            });
            continue;
        }

        if candidates.is_empty() {
            unsupported.push(UnsupportedApp {
                app_id,
                reason: format!(
                    "no installed {:?} provider exposes the exact allowlisted package",
                    environment.platform
                ),
            });
            continue;
        }

        let candidates: Vec<_> = candidates
            .into_iter()
            .map(|(provider_status, target)| {
                (provider_status, target, presence(provider_status, target))
            })
            .collect();
        let installed = candidates.iter().find(|(_, _, package_presence)| {
            matches!(package_presence, PackagePresence::Installed)
        });
        if let Some((provider_status, target, _)) = installed {
            skipped.push(SkippedApp {
                app_id: catalog_app.id.to_string(),
                display_name: catalog_app.display_name.to_string(),
                provider: provider_status.provider,
                package_id: target.package_id.to_string(),
                reason: "already installed".to_string(),
            });
            continue;
        }

        if let Some((_, _, PackagePresence::Unknown(reason))) =
            candidates.iter().find(|(_, _, package_presence)| {
                matches!(package_presence, PackagePresence::Unknown(_))
            })
        {
            unsupported.push(UnsupportedApp {
                app_id,
                reason: reason.clone(),
            });
            continue;
        }

        let Some((provider_status, target, _)) = candidates.first() else {
            continue;
        };
        if let Some(step) = install_step(
            catalog_app.id,
            catalog_app.display_name,
            provider_status,
            *target,
        ) {
            steps.push(step);
        } else {
            unsupported.push(UnsupportedApp {
                app_id,
                reason: "allowlisted install command could not be reconstructed".to_string(),
            });
        }
    }

    InstallPlan {
        plan_id,
        confirmation_token,
        platform: environment.platform,
        policy,
        steps,
        skipped,
        unsupported,
    }
}

struct ProgressReporter<F> {
    plan_id: String,
    sequence: u32,
    sink: F,
}

impl<F> ProgressReporter<F>
where
    F: Fn(InstallProgressEvent),
{
    fn emit(
        &mut self,
        kind: ProgressEventKind,
        step: Option<&InstallStep>,
        stream: Option<OutputStream>,
        chunk: Option<String>,
        step_status: Option<StepStatus>,
        execution_status: Option<ExecutionStatus>,
    ) {
        self.sequence = self.sequence.saturating_add(1);
        (self.sink)(InstallProgressEvent {
            plan_id: self.plan_id.clone(),
            sequence: self.sequence,
            kind,
            app_id: step.map(|value| value.app_id.clone()),
            provider: step.map(|value| value.provider),
            stream,
            chunk,
            step_status,
            execution_status,
            at_ms: now_ms(),
        });
    }
}

pub fn execute_plan<F>(
    plan: InstallPlan,
    registration: ExecutionRegistration,
    sink: F,
) -> InstallResult
where
    F: Fn(InstallProgressEvent),
{
    execute_plan_with_recheck(plan, registration, sink, recheck_install_step_presence)
}

fn execute_plan_with_recheck<F, R>(
    plan: InstallPlan,
    registration: ExecutionRegistration,
    sink: F,
    recheck: R,
) -> InstallResult
where
    F: Fn(InstallProgressEvent),
    R: Fn(&InstallStep) -> PackagePresence,
{
    let started_at_ms = now_ms();
    let cancellation = registration.cancellation.clone();
    let mut reporter = ProgressReporter {
        plan_id: plan.plan_id.clone(),
        sequence: 0,
        sink,
    };
    reporter.emit(ProgressEventKind::PlanQueued, None, None, None, None, None);

    let _serial_guard = registration
        .manager
        .state
        .serial
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    reporter.emit(ProgressEventKind::PlanStarted, None, None, None, None, None);

    let mut results = Vec::with_capacity(plan.steps.len());
    let mut skipped = plan.skipped.clone();
    let mut unsupported = plan.unsupported.clone();
    let mut cancelled = cancellation.load(Ordering::Acquire);

    for (index, step) in plan.steps.iter().enumerate() {
        if cancelled {
            for remaining in plan.steps.iter().skip(index) {
                results.push(InstallStepResult {
                    app_id: remaining.app_id.clone(),
                    provider: remaining.provider,
                    status: StepStatus::Skipped,
                    exit_code: None,
                    stdout: String::new(),
                    stderr: "cancelled before execution".to_string(),
                });
            }
            break;
        }
        if plan.policy != InstallPolicy::InstallMissing {
            unsupported.push(UnsupportedApp {
                app_id: step.app_id.clone(),
                reason: "install-and-upgrade is coming soon and cannot execute packages yet"
                    .to_string(),
            });
            continue;
        }
        match recheck(step) {
            PackagePresence::Installed => {
                skipped.push(skipped_step(step));
                continue;
            }
            PackagePresence::Unknown(reason) => {
                unsupported.push(UnsupportedApp {
                    app_id: step.app_id.clone(),
                    reason,
                });
                continue;
            }
            PackagePresence::Missing => {}
        }
        reporter.emit(
            ProgressEventKind::StepStarted,
            Some(step),
            None,
            None,
            None,
            None,
        );
        let result = if validate_install_step(step) {
            run_step(step, &cancellation, &mut reporter)
        } else {
            failed_step(step, "stored install step failed allowlist validation")
        };
        cancelled = result.status == StepStatus::Cancelled;
        reporter.emit(
            ProgressEventKind::StepFinished,
            Some(step),
            None,
            None,
            Some(result.status),
            None,
        );
        results.push(result);
    }

    let status = execution_status(&results, &unsupported, cancelled);
    let result = InstallResult {
        plan_id: plan.plan_id,
        status,
        started_at_ms,
        finished_at_ms: now_ms(),
        steps: results,
        skipped,
        unsupported,
    };
    reporter.emit(
        ProgressEventKind::PlanFinished,
        None,
        None,
        None,
        None,
        Some(result.status),
    );
    result
}

fn execution_status(
    results: &[InstallStepResult],
    unsupported: &[UnsupportedApp],
    cancelled: bool,
) -> ExecutionStatus {
    if cancelled
        || results
            .iter()
            .any(|result| result.status == StepStatus::Cancelled)
    {
        return ExecutionStatus::Cancelled;
    }
    if results.is_empty() {
        return if unsupported.is_empty() {
            ExecutionStatus::NothingToDo
        } else {
            ExecutionStatus::Failed
        };
    }
    let succeeded = results
        .iter()
        .filter(|result| result.status == StepStatus::Succeeded)
        .count();
    let failed = results
        .iter()
        .filter(|result| matches!(result.status, StepStatus::Failed | StepStatus::TimedOut))
        .count();
    if failed == 0 && unsupported.is_empty() {
        ExecutionStatus::Succeeded
    } else if succeeded == 0 && failed > 0 {
        ExecutionStatus::Failed
    } else {
        ExecutionStatus::Partial
    }
}

enum StreamMessage {
    Output(OutputStream, Vec<u8>),
}

fn run_step<F>(
    step: &InstallStep,
    cancellation: &AtomicBool,
    reporter: &mut ProgressReporter<F>,
) -> InstallStepResult
where
    F: Fn(InstallProgressEvent),
{
    let mut command = command_for_step(step);
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => return failed_step(step, &error.to_string()),
    };

    let (sender, receiver) = sync_channel(STREAM_QUEUE_CAPACITY);
    if let Some(stdout) = child.stdout.take() {
        spawn_reader(stdout, OutputStream::Stdout, sender.clone());
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_reader(stderr, OutputStream::Stderr, sender.clone());
    }
    drop(sender);

    let started = Instant::now();
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut forced_status = None;
    let exit_status = loop {
        receive_output(&receiver, step, &mut stdout, &mut stderr, reporter);

        if cancellation.load(Ordering::Acquire) {
            forced_status = Some(StepStatus::Cancelled);
            let _ = child.kill();
            break child.wait().ok();
        }
        if started.elapsed() >= STEP_TIMEOUT {
            forced_status = Some(StepStatus::TimedOut);
            let _ = child.kill();
            break child.wait().ok();
        }
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => thread::sleep(PROCESS_POLL_INTERVAL),
            Err(error) => return failed_step(step, &error.to_string()),
        }
    };

    drain_output(&receiver, step, &mut stdout, &mut stderr, reporter);
    let status = forced_status.unwrap_or_else(|| status_from_exit(exit_status.as_ref()));
    InstallStepResult {
        app_id: step.app_id.clone(),
        provider: step.provider,
        status,
        exit_code: exit_status.and_then(|value| value.code()),
        stdout: String::from_utf8_lossy(&stdout).into_owned(),
        stderr: String::from_utf8_lossy(&stderr).into_owned(),
    }
}

fn receive_output<F>(
    receiver: &Receiver<StreamMessage>,
    step: &InstallStep,
    stdout: &mut Vec<u8>,
    stderr: &mut Vec<u8>,
    reporter: &mut ProgressReporter<F>,
) where
    F: Fn(InstallProgressEvent),
{
    if let Ok(message) = receiver.recv_timeout(PROCESS_POLL_INTERVAL) {
        handle_output(message, step, stdout, stderr, reporter);
    }
    drain_output(receiver, step, stdout, stderr, reporter);
}

fn drain_output<F>(
    receiver: &Receiver<StreamMessage>,
    step: &InstallStep,
    stdout: &mut Vec<u8>,
    stderr: &mut Vec<u8>,
    reporter: &mut ProgressReporter<F>,
) where
    F: Fn(InstallProgressEvent),
{
    while let Ok(message) = receiver.try_recv() {
        handle_output(message, step, stdout, stderr, reporter);
    }
}

fn handle_output<F>(
    message: StreamMessage,
    step: &InstallStep,
    stdout: &mut Vec<u8>,
    stderr: &mut Vec<u8>,
    reporter: &mut ProgressReporter<F>,
) where
    F: Fn(InstallProgressEvent),
{
    let StreamMessage::Output(stream, bytes) = message;
    let destination = match stream {
        OutputStream::Stdout => stdout,
        OutputStream::Stderr => stderr,
    };
    if let Some(chunk) = append_bounded(destination, &bytes) {
        reporter.emit(
            ProgressEventKind::StepOutput,
            Some(step),
            Some(stream),
            Some(chunk),
            None,
            None,
        );
    }
}

fn spawn_reader<R>(mut reader: R, stream: OutputStream, sender: SyncSender<StreamMessage>)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || loop {
        let mut buffer = vec![0_u8; STREAM_CHUNK_BYTES];
        match reader.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(read) => {
                buffer.truncate(read);
                if sender.send(StreamMessage::Output(stream, buffer)).is_err() {
                    break;
                }
            }
        }
    });
}

fn append_bounded(destination: &mut Vec<u8>, bytes: &[u8]) -> Option<String> {
    let remaining = OUTPUT_LIMIT_BYTES.saturating_sub(destination.len());
    let accepted = &bytes[..bytes.len().min(remaining)];
    if accepted.is_empty() {
        return None;
    }
    destination.extend_from_slice(accepted);
    Some(String::from_utf8_lossy(accepted).into_owned())
}

fn status_from_exit(status: Option<&ExitStatus>) -> StepStatus {
    if status.is_some_and(ExitStatus::success) {
        StepStatus::Succeeded
    } else {
        StepStatus::Failed
    }
}

fn failed_step(step: &InstallStep, error: &str) -> InstallStepResult {
    InstallStepResult {
        app_id: step.app_id.clone(),
        provider: step.provider,
        status: StepStatus::Failed,
        exit_code: None,
        stdout: String::new(),
        stderr: truncate(error),
    }
}

fn validate_install_step(step: &InstallStep) -> bool {
    let Some(catalog_app) = app(&step.app_id) else {
        return false;
    };
    let Some(target) = target_for(catalog_app.id, step.provider) else {
        return false;
    };
    let provider_status = ProviderStatus {
        provider: step.provider,
        availability: ProviderAvailability::Available,
        executable: Some(step.executable.clone()),
        requires_elevation: step.requires_elevation,
        detail: None,
    };
    install_step(
        catalog_app.id,
        catalog_app.display_name,
        &provider_status,
        target,
    )
    .is_some_and(|expected| expected == *step)
}

fn recheck_install_step_presence(step: &InstallStep) -> PackagePresence {
    let Some(catalog_app) = app(&step.app_id) else {
        return PackagePresence::Unknown("stored app is no longer allowlisted".to_string());
    };
    let Some(target) = target_for(catalog_app.id, step.provider) else {
        return PackagePresence::Unknown("stored package is no longer allowlisted".to_string());
    };
    let provider_status = ProviderStatus {
        provider: step.provider,
        availability: ProviderAvailability::Available,
        executable: Some(step.executable.clone()),
        requires_elevation: step.requires_elevation,
        detail: None,
    };
    package_presence(&provider_status, target)
}

fn skipped_step(step: &InstallStep) -> SkippedApp {
    let package_id = app(&step.app_id)
        .and_then(|catalog_app| target_for(catalog_app.id, step.provider))
        .map(|target| target.package_id.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    SkippedApp {
        app_id: step.app_id.clone(),
        display_name: step.display_name.clone(),
        provider: step.provider,
        package_id,
        reason: "already installed before execution".to_string(),
    }
}

fn command_for_step(step: &InstallStep) -> Command {
    let mut command = Command::new(&step.executable);
    command
        .args(&step.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var_os("HOME");
        let lang = std::env::var_os("LANG");
        let display = std::env::var_os("DISPLAY");
        let wayland_display = std::env::var_os("WAYLAND_DISPLAY");
        let dbus = std::env::var_os("DBUS_SESSION_BUS_ADDRESS");
        command.env_clear().env(
            "PATH",
            "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        );
        for (key, value) in [
            ("HOME", home),
            ("LANG", lang),
            ("DISPLAY", display),
            ("WAYLAND_DISPLAY", wayland_display),
            ("DBUS_SESSION_BUS_ADDRESS", dbus),
        ] {
            if let Some(value) = value {
                command.env(key, value);
            }
        }
    }

    command
}

fn now_ms() -> u64 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    u64::try_from(millis).unwrap_or(u64::MAX)
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(|error| format!("secure random source failed: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn truncate(value: &str) -> String {
    value.chars().take(OUTPUT_LIMIT_BYTES).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Platform, Provider};

    fn environment(platform: Platform, providers: Vec<ProviderStatus>) -> EnvironmentReport {
        EnvironmentReport {
            platform,
            architecture: "test".to_string(),
            providers,
        }
    }

    fn available(provider: Provider, executable: &str, requires_elevation: bool) -> ProviderStatus {
        ProviderStatus {
            provider,
            availability: ProviderAvailability::Available,
            executable: Some(executable.to_string()),
            requires_elevation,
            detail: None,
        }
    }

    fn unknown(provider: Provider) -> ProviderStatus {
        ProviderStatus {
            provider,
            availability: ProviderAvailability::Unknown,
            executable: None,
            requires_elevation: false,
            detail: None,
        }
    }

    fn build_test_plan(app_ids: Vec<String>, environment: &EnvironmentReport) -> InstallPlan {
        build_plan_with_availability(
            app_ids,
            InstallPolicy::InstallMissing,
            environment,
            "plan".into(),
            "confirm".into(),
            |_, _| PackageAvailability::Available,
            |_, _| PackagePresence::Missing,
        )
    }

    #[test]
    fn plan_deduplicates_and_reports_unknown_ids() {
        let env = environment(
            Platform::Macos,
            vec![available(
                Provider::Homebrew,
                "/opt/homebrew/bin/brew",
                false,
            )],
        );
        let plan = build_test_plan(vec!["git".into(), "git".into(), "not-allowed".into()], &env);
        assert_eq!(plan.steps.len(), 1);
        assert_eq!(plan.unsupported.len(), 1);
        assert_eq!(plan.steps[0].args, ["install", "git"]);
    }

    #[test]
    fn linux_prefers_verified_user_flatpak_then_native_provider() {
        let env = environment(
            Platform::Linux,
            vec![
                available(Provider::Flatpak, "/usr/bin/flatpak", false),
                available(Provider::Apt, "/usr/bin/pkexec", true),
            ],
        );
        let plan = build_test_plan(vec!["firefox".into(), "git".into()], &env);
        assert_eq!(plan.steps[0].provider, Provider::Flatpak);
        assert_eq!(plan.steps[1].provider, Provider::Apt);
    }

    #[test]
    fn unavailable_exact_package_is_reported_not_guessed() {
        let env = environment(
            Platform::Linux,
            vec![available(Provider::Apt, "/usr/bin/pkexec", true)],
        );
        let plan = build_plan_with_availability(
            vec!["firefox".into()],
            InstallPolicy::InstallMissing,
            &env,
            "plan".into(),
            "confirm".into(),
            |_, _| PackageAvailability::Unavailable,
            |_, _| PackagePresence::Missing,
        );
        assert!(plan.steps.is_empty());
        assert_eq!(plan.unsupported[0].app_id, "firefox");
    }

    #[test]
    fn android_reports_every_desktop_app_as_unsupported() {
        let env = environment(Platform::Android, Vec::new());
        let plan = build_test_plan(vec!["chrome".into(), "git".into()], &env);
        assert!(plan.steps.is_empty());
        assert_eq!(plan.unsupported.len(), 2);
    }

    #[test]
    fn confirmation_is_required_and_plan_is_single_use() {
        let store = PlanStore::default();
        let env = environment(
            Platform::Macos,
            vec![available(
                Provider::Homebrew,
                "/opt/homebrew/bin/brew",
                false,
            )],
        );
        let plan = store
            .create(vec!["git".into()], InstallPolicy::InstallMissing, &env)
            .unwrap();
        assert!(store.take_confirmed(&plan.plan_id, "wrong").is_err());
        assert!(store
            .take_confirmed(&plan.plan_id, &plan.confirmation_token)
            .is_ok());
        assert!(store
            .take_confirmed(&plan.plan_id, &plan.confirmation_token)
            .is_err());
    }

    #[test]
    fn cancellation_targets_only_an_active_plan() {
        let manager = ExecutionManager::default();
        let registration = manager.register("plan").unwrap();
        assert!(manager.cancel("plan").unwrap());
        assert!(registration.cancellation.load(Ordering::Acquire));
        drop(registration);
        assert!(!manager.cancel("plan").unwrap());
    }

    #[test]
    fn streamed_output_is_strictly_bounded() {
        let mut output = Vec::new();
        assert!(append_bounded(&mut output, &vec![b'a'; OUTPUT_LIMIT_BYTES]).is_some());
        assert!(append_bounded(&mut output, b"ignored").is_none());
        assert_eq!(output.len(), OUTPUT_LIMIT_BYTES);
    }

    #[test]
    fn runtime_rejects_mutated_command_arguments() {
        let env = environment(
            Platform::Macos,
            vec![available(
                Provider::Homebrew,
                "/opt/homebrew/bin/brew",
                false,
            )],
        );
        let mut plan = build_test_plan(vec!["git".into()], &env);
        assert!(validate_install_step(&plan.steps[0]));
        plan.steps[0].args.push("; malicious".to_string());
        assert!(!validate_install_step(&plan.steps[0]));
    }

    #[test]
    fn plan_requests_are_bounded() {
        let store = PlanStore::default();
        let env = environment(
            Platform::Windows,
            vec![available(Provider::Winget, "winget.exe", false)],
        );
        assert!(store
            .create(
                vec!["git".into(); MAX_REQUESTED_APP_IDS + 1],
                InstallPolicy::InstallMissing,
                &env,
            )
            .is_err());
        assert!(store
            .create(
                vec!["x".repeat(MAX_APP_ID_CHARS + 1)],
                InstallPolicy::InstallMissing,
                &env,
            )
            .is_err());
    }

    #[test]
    fn installed_packages_are_skipped_for_install_missing() {
        let env = environment(
            Platform::Macos,
            vec![available(
                Provider::Homebrew,
                "/opt/homebrew/bin/brew",
                false,
            )],
        );
        let plan = build_plan_with_availability(
            vec!["sevenzip".into()],
            InstallPolicy::InstallMissing,
            &env,
            "plan".into(),
            "confirm".into(),
            |_, _| PackageAvailability::Available,
            |_, _| PackagePresence::Installed,
        );
        assert!(plan.steps.is_empty());
        assert!(plan.unsupported.is_empty());
        assert_eq!(plan.skipped.len(), 1);
        assert_eq!(plan.skipped[0].package_id, "sevenzip");
    }

    #[test]
    fn installed_provider_wins_over_missing_cross_provider_candidate() {
        let env = environment(
            Platform::Linux,
            vec![
                available(Provider::Flatpak, "/usr/bin/flatpak", false),
                available(Provider::Apt, "/usr/bin/pkexec", true),
            ],
        );
        let plan = build_plan_with_availability(
            vec!["firefox".into()],
            InstallPolicy::InstallMissing,
            &env,
            "plan".into(),
            "confirm".into(),
            |_, _| PackageAvailability::Available,
            |provider, _| {
                if provider.provider == Provider::Apt {
                    PackagePresence::Installed
                } else {
                    PackagePresence::Missing
                }
            },
        );
        assert!(plan.steps.is_empty());
        assert_eq!(plan.skipped[0].provider, Provider::Apt);
    }

    #[test]
    fn all_missing_candidates_use_the_existing_provider_priority() {
        let env = environment(
            Platform::Linux,
            vec![
                available(Provider::Flatpak, "/usr/bin/flatpak", false),
                available(Provider::Apt, "/usr/bin/pkexec", true),
            ],
        );
        let plan = build_plan_with_availability(
            vec!["firefox".into()],
            InstallPolicy::InstallMissing,
            &env,
            "plan".into(),
            "confirm".into(),
            |_, _| PackageAvailability::Available,
            |_, _| PackagePresence::Missing,
        );
        assert_eq!(plan.steps.len(), 1);
        assert_eq!(plan.steps[0].provider, Provider::Flatpak);
    }

    #[test]
    fn provider_probe_error_blocks_cross_provider_fallback() {
        let env = environment(
            Platform::Linux,
            vec![
                unknown(Provider::Flatpak),
                available(Provider::Apt, "/usr/bin/pkexec", true),
            ],
        );
        let plan = build_plan_with_availability(
            vec!["firefox".into()],
            InstallPolicy::InstallMissing,
            &env,
            "plan".into(),
            "confirm".into(),
            |_, _| PackageAvailability::Available,
            |_, _| PackagePresence::Missing,
        );
        assert!(plan.steps.is_empty());
        assert_eq!(
            plan.unsupported[0].reason,
            "provider availability could not be confirmed safely"
        );
    }

    #[test]
    fn package_lookup_error_blocks_cross_provider_fallback() {
        let env = environment(
            Platform::Linux,
            vec![
                available(Provider::Flatpak, "/usr/bin/flatpak", false),
                available(Provider::Apt, "/usr/bin/pkexec", true),
            ],
        );
        let plan = build_plan_with_availability(
            vec!["firefox".into()],
            InstallPolicy::InstallMissing,
            &env,
            "plan".into(),
            "confirm".into(),
            |provider, _| {
                if provider.provider == Provider::Flatpak {
                    PackageAvailability::Unknown(
                        "Flatpak package lookup failed (exit 2)".to_string(),
                    )
                } else {
                    PackageAvailability::Available
                }
            },
            |_, _| PackagePresence::Missing,
        );
        assert!(plan.steps.is_empty());
        assert_eq!(
            plan.unsupported[0].reason,
            "Flatpak package lookup failed (exit 2)"
        );
    }

    #[test]
    fn unknown_presence_fails_closed_without_an_install_step() {
        let env = environment(
            Platform::Windows,
            vec![available(Provider::Winget, "winget.exe", false)],
        );
        let plan = build_plan_with_availability(
            vec!["git".into()],
            InstallPolicy::InstallMissing,
            &env,
            "plan".into(),
            "confirm".into(),
            |_, _| PackageAvailability::Available,
            |_, _| PackagePresence::Unknown("test probe error".to_string()),
        );
        assert!(plan.steps.is_empty());
        assert_eq!(plan.unsupported[0].reason, "test probe error");
    }

    #[test]
    fn upgrade_policy_is_explicitly_unsupported_before_any_presence_check() {
        let env = environment(
            Platform::Macos,
            vec![available(
                Provider::Homebrew,
                "/opt/homebrew/bin/brew",
                false,
            )],
        );
        let plan = build_plan_with_availability(
            vec!["sevenzip".into()],
            InstallPolicy::InstallAndUpgrade,
            &env,
            "plan".into(),
            "confirm".into(),
            |_, _| PackageAvailability::Available,
            |_, _| PackagePresence::Installed,
        );
        assert!(plan.steps.is_empty());
        assert!(plan.skipped.is_empty());
        assert_eq!(
            plan.unsupported[0].reason,
            "install-and-upgrade is coming soon and cannot execute packages yet"
        );
    }

    #[test]
    fn execution_result_preserves_preflight_skips() {
        let manager = ExecutionManager::default();
        let plan = InstallPlan {
            plan_id: "plan".to_string(),
            confirmation_token: "confirm".to_string(),
            platform: Platform::Macos,
            policy: InstallPolicy::InstallMissing,
            steps: Vec::new(),
            skipped: vec![SkippedApp {
                app_id: "sevenzip".to_string(),
                display_name: "7-Zip".to_string(),
                provider: Provider::Homebrew,
                package_id: "sevenzip".to_string(),
                reason: "already installed".to_string(),
            }],
            unsupported: Vec::new(),
        };
        let result = execute_plan(plan, manager.register("plan").unwrap(), |_| {});
        assert_eq!(result.status, ExecutionStatus::NothingToDo);
        assert_eq!(result.skipped.len(), 1);
        assert_eq!(result.skipped[0].app_id, "sevenzip");
    }

    fn race_plan() -> InstallPlan {
        InstallPlan {
            plan_id: "race-plan".to_string(),
            confirmation_token: "confirm".to_string(),
            platform: Platform::Macos,
            policy: InstallPolicy::InstallMissing,
            steps: vec![InstallStep {
                app_id: "sevenzip".to_string(),
                display_name: "7-Zip".to_string(),
                provider: Provider::Homebrew,
                package_kind: crate::types::PackageKind::Formula,
                launch_hint: Some("7zz".to_string()),
                executable: "/opt/homebrew/bin/brew".to_string(),
                args: vec!["install".to_string(), "sevenzip".to_string()],
                requires_elevation: false,
            }],
            skipped: Vec::new(),
            unsupported: Vec::new(),
        }
    }

    #[test]
    fn execute_time_installed_recheck_skips_without_running_the_step() {
        let manager = ExecutionManager::default();
        let result = execute_plan_with_recheck(
            race_plan(),
            manager.register("race-plan").unwrap(),
            |_| {},
            |_| PackagePresence::Installed,
        );
        assert_eq!(result.status, ExecutionStatus::NothingToDo);
        assert!(result.steps.is_empty());
        assert_eq!(result.skipped.len(), 1);
        assert_eq!(
            result.skipped[0].reason,
            "already installed before execution"
        );
    }

    #[test]
    fn execute_time_unknown_recheck_blocks_execution_without_running_the_step() {
        let manager = ExecutionManager::default();
        let result = execute_plan_with_recheck(
            race_plan(),
            manager.register("race-plan").unwrap(),
            |_| {},
            |_| PackagePresence::Unknown("status probe failed (exit 2)".to_string()),
        );
        assert_eq!(result.status, ExecutionStatus::Failed);
        assert!(result.steps.is_empty());
        assert_eq!(result.unsupported[0].reason, "status probe failed (exit 2)");
    }
}
