import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { Platform } from "@/lib/pakitup-api";

export type DesktopProvider = "winget" | "homebrew" | "apt" | "dnf" | "flatpak";
export type ProviderAvailability = "available" | "unavailable" | "unknown";
export type PackageKind = "native" | "formula" | "cask" | "flatpak";
export type InstallPolicy = "install-missing" | "install-and-upgrade";
export type StepStatus =
	| "succeeded"
	| "failed"
	| "cancelled"
	| "timedOut"
	| "skipped";
export type ExecutionStatus =
	| "succeeded"
	| "partial"
	| "failed"
	| "cancelled"
	| "nothingToDo";
export type ProgressEventKind =
	| "planQueued"
	| "planStarted"
	| "stepStarted"
	| "stepOutput"
	| "stepFinished"
	| "planFinished";

export interface ProviderStatus {
	provider: DesktopProvider;
	availability: ProviderAvailability;
	executable: string | null;
	requiresElevation: boolean;
	detail: string | null;
}

export interface EnvironmentReport {
	platform: Platform;
	architecture: string;
	providers: ProviderStatus[];
}

export interface UnsupportedApp {
	appId: string;
	reason: string;
}

export interface SkippedApp {
	appId: string;
	displayName: string;
	provider: DesktopProvider;
	packageId: string;
	reason: string;
}

export interface DesktopInstallStep {
	appId: string;
	displayName: string;
	provider: DesktopProvider;
	packageKind: PackageKind;
	launchHint: string | null;
	executable: string;
	args: string[];
	requiresElevation: boolean;
}

export interface DesktopInstallPlan {
	planId: string;
	confirmationToken: string;
	platform: Platform;
	steps: DesktopInstallStep[];
	skipped: SkippedApp[];
	unsupported: UnsupportedApp[];
}

export interface InstallProgressEvent {
	planId: string;
	sequence: number;
	kind: ProgressEventKind;
	appId: string | null;
	provider: DesktopProvider | null;
	stream: "stdout" | "stderr" | null;
	chunk: string | null;
	stepStatus: StepStatus | null;
	executionStatus: ExecutionStatus | null;
	atMs: number;
}

export interface InstallStepResult {
	appId: string;
	provider: DesktopProvider;
	status: StepStatus;
	exitCode: number | null;
	stdout: string;
	stderr: string;
}

export interface InstallResult {
	planId: string;
	status: ExecutionStatus;
	startedAtMs: number;
	finishedAtMs: number;
	steps: InstallStepResult[];
	skipped: SkippedApp[];
	unsupported: UnsupportedApp[];
}

export const INSTALL_PROGRESS_EVENT = "install-progress";
export const PROFILE_OPEN_EVENT = "profile-open-requested";

export function isTauriRuntime() {
	return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export function detectEnvironment() {
	return invoke<EnvironmentReport>("detect_environment");
}

export function buildInstallPlan(appIds: string[], policy: InstallPolicy) {
	return invoke<DesktopInstallPlan>("build_install_plan", { appIds, policy });
}

export function executeInstallPlan(planId: string, confirmationToken: string) {
	return invoke<InstallResult>("execute_install_plan", {
		planId,
		confirmationToken,
	});
}

export function cancelInstallPlan(planId: string) {
	return invoke<boolean>("cancel_install_plan", { planId });
}

export function takePendingProfile() {
	return invoke<string | null>("take_pending_profile");
}

export function listenToProfileOpen(handler: () => void) {
	return listen<string>(PROFILE_OPEN_EVENT, () => handler());
}

export function listenToInstallProgress(
	handler: (event: InstallProgressEvent) => void,
) {
	return listen<InstallProgressEvent>(INSTALL_PROGRESS_EVENT, (event) => {
		handler(event.payload);
	});
}
