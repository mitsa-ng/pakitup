import {
	Ban,
	CheckCircle2,
	CircleStop,
	Clock3,
	LoaderCircle,
	ShieldCheck,
	SquareTerminal,
	TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
	buildInstallPlan,
	cancelInstallPlan,
	type DesktopInstallPlan,
	type EnvironmentReport,
	type ExecutionStatus,
	executeInstallPlan,
	type InstallPolicy,
	type InstallProgressEvent,
	type InstallResult,
	listenToInstallProgress,
	type PackageKind,
} from "@/lib/desktop-client";
import {
	outputTextForDisplay,
	presentProgress,
	progressLabels,
} from "@/lib/install-presentation";
import { PLATFORM_LABELS } from "@/lib/pakitup-api";

const MAX_DESKTOP_APPS = 32;
const MAX_PROGRESS_EVENTS = 120;

type SafeInstallPlan = Omit<DesktopInstallPlan, "confirmationToken">;

type PlanSecret = {
	planId: string;
	confirmationToken: string;
};

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

const resultLabels: Record<ExecutionStatus, string> = {
	succeeded: "Completed",
	partial: "Completed with issues",
	failed: "Failed",
	cancelled: "Cancelled",
	nothingToDo: "Nothing to install",
};

const packageKindLabels: Record<PackageKind, string> = {
	native: "Native package",
	formula: "Formula · command-line tool",
	cask: "Cask · desktop application",
	flatpak: "Flatpak package",
};

export function DesktopInstallExperience({
	appIds,
	policy,
	environment,
	detectionError,
}: {
	appIds: string[];
	policy: InstallPolicy;
	environment: EnvironmentReport | null;
	detectionError: string | null;
}) {
	const [plan, setPlan] = useState<SafeInstallPlan | null>(null);
	const planSecret = useRef<PlanSecret | null>(null);
	const listenerCleanup = useRef<(() => void) | null>(null);
	const [reviewed, setReviewed] = useState(false);
	const [planConsumed, setPlanConsumed] = useState(false);
	const [isBuilding, setIsBuilding] = useState(false);
	const [isExecuting, setIsExecuting] = useState(false);
	const [isCancelling, setIsCancelling] = useState(false);
	const [cancelRequested, setCancelRequested] = useState(false);
	const [planError, setPlanError] = useState<string | null>(null);
	const [executionError, setExecutionError] = useState<string | null>(null);
	const [progress, setProgress] = useState<InstallProgressEvent[]>([]);
	const [result, setResult] = useState<InstallResult | null>(null);

	useEffect(
		() => () => {
			listenerCleanup.current?.();
			listenerCleanup.current = null;
			planSecret.current = null;
		},
		[],
	);

	async function buildPlan() {
		if (appIds.length > MAX_DESKTOP_APPS) {
			setPlanError(
				`Desktop plans currently support up to ${MAX_DESKTOP_APPS} apps. This profile contains ${appIds.length}.`,
			);
			return;
		}
		setIsBuilding(true);
		setPlanError(null);
		setExecutionError(null);
		setReviewed(false);
		setPlanConsumed(false);
		setResult(null);
		setProgress([]);
		planSecret.current = null;
		try {
			const desktopPlan = await buildInstallPlan(appIds, policy);
			const { confirmationToken, ...safePlan } = desktopPlan;
			planSecret.current = {
				planId: desktopPlan.planId,
				confirmationToken,
			};
			setPlan(safePlan);
		} catch (error) {
			setPlan(null);
			setPlanError(errorMessage(error));
		} finally {
			setIsBuilding(false);
		}
	}

	async function executePlan() {
		const secret = planSecret.current;
		if (!plan || !secret || secret.planId !== plan.planId || !reviewed) {
			setExecutionError(
				"Review the current plan before starting installation.",
			);
			return;
		}

		setIsExecuting(true);
		setPlanConsumed(true);
		setCancelRequested(false);
		setExecutionError(null);
		setResult(null);
		setProgress([]);
		try {
			const unlisten = await listenToInstallProgress((event) => {
				if (event.planId !== secret.planId) return;
				setProgress((current) => {
					const withoutDuplicate = current.filter(
						(item) => item.sequence !== event.sequence,
					);
					return [...withoutDuplicate, event]
						.sort((left, right) => left.sequence - right.sequence)
						.slice(-MAX_PROGRESS_EVENTS);
				});
			});
			listenerCleanup.current = unlisten;
			const installResult = await executeInstallPlan(
				secret.planId,
				secret.confirmationToken,
			);
			setResult(installResult);
		} catch (error) {
			setExecutionError(errorMessage(error));
		} finally {
			planSecret.current = null;
			listenerCleanup.current?.();
			listenerCleanup.current = null;
			setIsExecuting(false);
		}
	}

	async function cancelPlan() {
		if (!plan || !isExecuting) return;
		setIsCancelling(true);
		setExecutionError(null);
		try {
			const accepted = await cancelInstallPlan(plan.planId);
			if (!accepted) {
				setExecutionError("The active install could not be found to cancel.");
				return;
			}
			setCancelRequested(true);
		} catch (error) {
			setExecutionError(errorMessage(error));
		} finally {
			setIsCancelling(false);
		}
	}

	const hasExecutableSteps = Boolean(plan?.steps.length);
	const nothingToInstall = Boolean(plan && !hasExecutableSteps);
	const controlsLocked = isBuilding || isExecuting;
	const presentedProgress = presentProgress(progress);

	return (
		<>
			<aside className="desktop-install-controls plan-panel">
				<div className="environment-pill">
					<SquareTerminal aria-hidden="true" />
					<span>
						<strong>Local desktop planner</strong>
						{environment
							? `${PLATFORM_LABELS[environment.platform]} · ${environment.architecture}`
							: "Checking installed package tools"}
					</span>
				</div>

				{environment ? (
					<ul
						className="provider-status-list"
						aria-label="Detected package providers"
					>
						{environment.providers.map((provider) => (
							<li key={provider.provider}>
								<span
									className={
										provider.availability === "available"
											? "is-available"
											: undefined
									}
								/>
								<strong>{provider.provider}</strong>
								<em>
									{provider.availability === "available"
										? "Available"
										: provider.availability === "unknown"
											? "Needs attention"
											: "Unavailable"}
								</em>
							</li>
						))}
					</ul>
				) : null}

				{detectionError ? (
					<p className="form-error" role="alert">
						<TriangleAlert aria-hidden="true" /> {detectionError}
					</p>
				) : null}

				<button
					className="button button-primary button-wide"
					type="button"
					disabled={controlsLocked || appIds.length > MAX_DESKTOP_APPS}
					onClick={() => void buildPlan()}
				>
					{isBuilding ? (
						<>
							<LoaderCircle className="is-spinning" aria-hidden="true" />
							Building local plan…
						</>
					) : plan ? (
						"Rebuild local plan"
					) : (
						"Build local install plan"
					)}
				</button>
				<p className="plan-disclaimer">
					<ShieldCheck aria-hidden="true" /> This only inspects the allowlisted
					catalog and local providers. It does not install anything.
				</p>
				{appIds.length > MAX_DESKTOP_APPS ? (
					<p className="form-error" role="alert">
						<TriangleAlert aria-hidden="true" /> Desktop plans accept at most 32
						apps; this profile has {appIds.length}.
					</p>
				) : null}
				{planError ? (
					<p className="form-error" role="alert">
						<TriangleAlert aria-hidden="true" /> {planError}
					</p>
				) : null}
			</aside>

			{plan ? (
				<section
					className="desktop-plan-review"
					aria-labelledby="desktop-plan-title"
				>
					<div className="plan-results-heading">
						<div>
							<p className="eyebrow">Local execution plan</p>
							<h2 id="desktop-plan-title">
								Read every command before installing
							</h2>
						</div>
						<p>
							<strong>{plan.steps.length}</strong> executable steps{" "}
							<span>·</span> <strong>{plan.unsupported.length}</strong>{" "}
							unsupported <span>·</span> <strong>{plan.skipped.length}</strong>{" "}
							already installed
						</p>
					</div>

					{plan.skipped.length ? (
						<div className="skipped-review">
							<h3>
								<CheckCircle2 aria-hidden="true" /> Already installed
							</h3>
							<ul>
								{plan.skipped.map((item) => (
									<li key={`${item.appId}-${item.provider}-${item.packageId}`}>
										<strong>{item.displayName}</strong>
										<span>
											{item.provider} · {item.packageId} · {item.reason}
										</span>
									</li>
								))}
							</ul>
						</div>
					) : null}

					<div className="command-review-list">
						{plan.steps.map((step, index) => (
							<article key={step.appId}>
								<header>
									<span>{String(index + 1).padStart(2, "0")}</span>
									<div>
										<h3>{step.displayName}</h3>
										<p>
											{step.provider}
											{" · "}
											{packageKindLabels[step.packageKind]}
											{step.requiresElevation ? " · elevation required" : ""}
										</p>
									</div>
								</header>
								<dl>
									<div>
										<dt>Executable</dt>
										<dd>
											<code>{step.executable}</code>
										</dd>
									</div>
									<div>
										<dt>Arguments</dt>
										<dd>
											{step.args.length ? (
												<ol aria-label={`${step.displayName} argument vector`}>
													{step.args.map((argument, argumentIndex) => (
														<li key={`${step.appId}-${argumentIndex}`}>
															<code>{argument}</code>
														</li>
													))}
												</ol>
											) : (
												<em>No arguments</em>
											)}
										</dd>
									</div>
									{step.launchHint ? (
										<div>
											<dt>Run after install</dt>
											<dd>
												<code>{step.launchHint}</code>
											</dd>
										</div>
									) : null}
								</dl>
							</article>
						))}
					</div>

					{plan.unsupported.length ? (
						<div className="unsupported-review">
							<h3>
								<Ban aria-hidden="true" /> Unsupported items will be skipped
							</h3>
							<ul>
								{plan.unsupported.map((item) => (
									<li key={item.appId}>
										<strong>{item.appId}</strong>
										<span>{item.reason}</span>
									</li>
								))}
							</ul>
						</div>
					) : null}

					<div className="execution-consent">
						{nothingToInstall ? (
							<p className="plan-disclaimer">
								<ShieldCheck aria-hidden="true" /> Nothing to install. Every
								supported item is already installed or needs attention above.
							</p>
						) : null}
						<label>
							<input
								type="checkbox"
								checked={reviewed}
								disabled={
									isExecuting ||
									planConsumed ||
									Boolean(result) ||
									!hasExecutableSteps
								}
								onChange={(event) => setReviewed(event.target.checked)}
							/>
							<span>
								<strong>
									I reviewed the executable and every argument above.
								</strong>
								I understand Pakitup will now ask the local package provider to
								make these changes.
							</span>
						</label>
						<div className="execution-actions">
							<button
								className="button button-primary"
								type="button"
								disabled={
									!reviewed ||
									!hasExecutableSteps ||
									isExecuting ||
									planConsumed ||
									Boolean(result)
								}
								onClick={() => void executePlan()}
							>
								{isExecuting
									? "Installation running…"
									: "Install reviewed plan"}
							</button>
							{isExecuting ? (
								<button
									className="button button-danger"
									type="button"
									disabled={isCancelling || cancelRequested}
									onClick={() => void cancelPlan()}
								>
									<CircleStop aria-hidden="true" />
									{cancelRequested
										? "Cancellation requested"
										: "Cancel install"}
								</button>
							) : null}
						</div>
						{executionError ? (
							<p className="form-error" role="alert">
								<TriangleAlert aria-hidden="true" /> {executionError}
							</p>
						) : null}
					</div>
				</section>
			) : null}

			{progress.length ? (
				<section
					className="install-progress-panel"
					aria-labelledby="install-progress-title"
				>
					<div className="progress-heading">
						<div>
							<p className="eyebrow">Live progress</p>
							<h2 id="install-progress-title">
								{isExecuting ? "Installing your profile" : "Installation log"}
							</h2>
						</div>
						<span>
							{isExecuting ? (
								<LoaderCircle className="is-spinning" aria-hidden="true" />
							) : (
								<Clock3 aria-hidden="true" />
							)}
							{presentedProgress.milestones.length} milestones ·{" "}
							{presentedProgress.outputChunks.length} output chunks
						</span>
					</div>
					<ol
						className="progress-log"
						aria-live="polite"
						aria-relevant="additions"
					>
						{presentedProgress.milestones.map((event) => (
							<li key={event.sequence}>
								<span>{String(event.sequence).padStart(3, "0")}</span>
								<div>
									<strong>{progressLabels[event.kind]}</strong>
									<small>
										{event.appId || "Plan"}
										{event.stepStatus ? ` · ${event.stepStatus}` : ""}
									</small>
								</div>
							</li>
						))}
					</ol>
					{presentedProgress.outputChunks.length ? (
						<details className="installer-output-details">
							<summary>
								Installer output ({presentedProgress.outputChunks.length}{" "}
								chunks)
							</summary>
							<ol className="progress-log raw-output-log">
								{presentedProgress.outputChunks.map((event) => (
									<li key={event.sequence}>
										<span>{String(event.sequence).padStart(3, "0")}</span>
										<div>
											<strong>{event.appId || "Plan"}</strong>
											<small>{event.stream || "output"}</small>
											<pre>{outputTextForDisplay(event.chunk)}</pre>
										</div>
									</li>
								))}
							</ol>
						</details>
					) : null}
					{presentedProgress.blankOutputChunks ? (
						<p className="progress-note">
							{presentedProgress.blankOutputChunks} blank output chunks omitted
							from this view.
						</p>
					) : null}
				</section>
			) : null}

			{result ? (
				<section
					className={`install-result-panel status-${result.status}`}
					aria-labelledby="install-result-title"
				>
					<div className="result-summary">
						{result.status === "succeeded" ||
						result.status === "nothingToDo" ? (
							<CheckCircle2 aria-hidden="true" />
						) : (
							<TriangleAlert aria-hidden="true" />
						)}
						<div>
							<p className="eyebrow">Local result</p>
							<h2 id="install-result-title">{resultLabels[result.status]}</h2>
							<p>
								{Math.max(
									0,
									(result.finishedAtMs - result.startedAtMs) / 1000,
								).toFixed(1)}{" "}
								seconds · {result.steps.length} step results ·{" "}
								{result.skipped.length} already installed
							</p>
						</div>
					</div>
					<ul className="result-step-list">
						{result.skipped.map((item) => (
							<li
								key={`skipped-${item.appId}-${item.provider}-${item.packageId}`}
							>
								<strong>{item.displayName}</strong>
								<span>
									{item.provider} · {item.packageId}
								</span>
								<em>already installed</em>
							</li>
						))}
						{result.steps.map((step) => {
							const planStep = plan?.steps.find(
								(candidate) => candidate.appId === step.appId,
							);
							return (
								<li key={step.appId}>
									<strong>{planStep?.displayName || step.appId}</strong>
									<span>
										{step.provider}
										{planStep
											? ` · ${packageKindLabels[planStep.packageKind]}`
											: ""}
									</span>
									<em>
										{step.status}
										{step.exitCode === null ? "" : ` · exit ${step.exitCode}`}
									</em>
								</li>
							);
						})}
					</ul>
				</section>
			) : null}
		</>
	);
}
