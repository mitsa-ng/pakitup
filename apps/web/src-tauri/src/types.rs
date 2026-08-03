use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Windows,
    Macos,
    Linux,
    Android,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Winget,
    Homebrew,
    Apt,
    Dnf,
    Flatpak,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProviderAvailability {
    Available,
    Unavailable,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PackageKind {
    Native,
    Formula,
    Cask,
    Flatpak,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum InstallPolicy {
    #[serde(rename = "install-missing")]
    InstallMissing,
    #[serde(rename = "install-and-upgrade")]
    InstallAndUpgrade,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider: Provider,
    pub availability: ProviderAvailability,
    pub executable: Option<String>,
    pub requires_elevation: bool,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentReport {
    pub platform: Platform,
    pub architecture: String,
    pub providers: Vec<ProviderStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnsupportedApp {
    pub app_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkippedApp {
    pub app_id: String,
    pub display_name: String,
    pub provider: Provider,
    pub package_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallStep {
    pub app_id: String,
    pub display_name: String,
    pub provider: Provider,
    pub package_kind: PackageKind,
    pub launch_hint: Option<String>,
    pub executable: String,
    pub args: Vec<String>,
    pub requires_elevation: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub plan_id: String,
    pub confirmation_token: String,
    pub platform: Platform,
    pub policy: InstallPolicy,
    pub steps: Vec<InstallStep>,
    pub skipped: Vec<SkippedApp>,
    pub unsupported: Vec<UnsupportedApp>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StepStatus {
    Succeeded,
    Failed,
    Cancelled,
    TimedOut,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallStepResult {
    pub app_id: String,
    pub provider: Provider,
    pub status: StepStatus,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionStatus {
    Succeeded,
    Partial,
    Failed,
    Cancelled,
    NothingToDo,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProgressEventKind {
    PlanQueued,
    PlanStarted,
    StepStarted,
    StepOutput,
    StepFinished,
    PlanFinished,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OutputStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgressEvent {
    pub plan_id: String,
    pub sequence: u32,
    pub kind: ProgressEventKind,
    pub app_id: Option<String>,
    pub provider: Option<Provider>,
    pub stream: Option<OutputStream>,
    pub chunk: Option<String>,
    pub step_status: Option<StepStatus>,
    pub execution_status: Option<ExecutionStatus>,
    pub at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub plan_id: String,
    pub status: ExecutionStatus,
    pub started_at_ms: u64,
    pub finished_at_ms: u64,
    pub steps: Vec<InstallStepResult>,
    pub skipped: Vec<SkippedApp>,
    pub unsupported: Vec<UnsupportedApp>,
}

#[cfg(test)]
mod tests {
    use super::InstallPolicy;

    #[test]
    fn install_policy_is_closed_to_the_two_supported_wire_values() {
        assert_eq!(
            serde_json::from_str::<InstallPolicy>("\"install-missing\"").unwrap(),
            InstallPolicy::InstallMissing
        );
        assert_eq!(
            serde_json::from_str::<InstallPolicy>("\"install-and-upgrade\"").unwrap(),
            InstallPolicy::InstallAndUpgrade
        );
        assert!(serde_json::from_str::<InstallPolicy>("\"upgrade-everything\"").is_err());
    }
}
