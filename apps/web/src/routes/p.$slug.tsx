import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	Check,
	CheckCircle2,
	Clipboard,
	ClipboardCheck,
	ExternalLink,
	Laptop,
	PackageCheck,
	ShieldCheck,
	TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DesktopInstallExperience } from "@/components/desktop-install-experience";
import { ErrorState, LoadingState } from "@/components/page-states";
import { useDesktopEnvironment } from "@/hooks/use-desktop-environment";
import {
	buildDesktopInstallKey,
	buildDesktopProfileUrl,
	DESKTOP_DOWNLOAD_URL,
} from "@/lib/desktop-handoff";
import { PLATFORM_LABELS, type Platform, pakitupApi } from "@/lib/pakitup-api";

export const Route = createFileRoute("/p/$slug")({
	component: SharedProfileComponent,
});

function SharedProfileComponent() {
	const { slug } = Route.useParams();
	const environment = useDesktopEnvironment();
	const [platform, setPlatform] = useState<Platform>("windows");
	const [copied, setCopied] = useState(false);

	useEffect(() => setPlatform(environment.platform), [environment.platform]);

	const profile = useQuery({
		queryKey: ["profile", slug],
		queryFn: () => pakitupApi.profiles.get({ slug }),
		retry: 1,
	});

	const plan = useMutation({
		mutationFn: () => pakitupApi.plans.create({ profileSlug: slug, platform }),
	});

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
		}
	}

	if (profile.isPending) {
		return (
			<div className="section-shell standalone-state">
				<LoadingState label="Opening shared profile" />
			</div>
		);
	}

	if (profile.isError) {
		return (
			<div className="section-shell standalone-state">
				<ErrorState
					title="This profile isn’t available."
					message="The link may be incomplete, expired, or temporarily unreachable."
					onRetry={() => void profile.refetch()}
				/>
				<Link className="back-link" to="/">
					<ArrowLeft aria-hidden="true" /> Browse the catalog
				</Link>
			</div>
		);
	}

	const desktopProfileUrl = buildDesktopProfileUrl(profile.data.slug);
	const desktopAppIds = profile.data.apps.map((app) => app.id);
	const desktopInstallKey = buildDesktopInstallKey(
		profile.data.slug,
		desktopAppIds,
	);

	return (
		<div className="profile-page section-shell">
			<Link className="back-link" to="/">
				<ArrowLeft aria-hidden="true" /> Browse the catalog
			</Link>
			<header className="profile-hero">
				<div>
					<p className="eyebrow">
						<PackageCheck aria-hidden="true" /> Shared Pakitup profile
					</p>
					<h1>{profile.data.name}</h1>
					<p className="hero-deck">
						{profile.data.description ||
							"A focused software setup, ready to review."}
					</p>
					<div className="profile-meta">
						<span>{profile.data.apps.length} apps</span>
						<span>
							{profile.data.policy === "install-missing"
								? "Install missing only"
								: "Install and upgrade · currently unavailable"}
						</span>
					</div>
				</div>
				<div className="share-card">
					<ShieldCheck aria-hidden="true" />
					<strong>Readable by design</strong>
					<p>
						This link contains package references—not remote scripts or custom
						commands.
					</p>
					<button
						className="button button-secondary button-wide"
						type="button"
						onClick={() => void copyLink()}
					>
						{copied ? (
							<ClipboardCheck aria-hidden="true" />
						) : (
							<Clipboard aria-hidden="true" />
						)}
						{copied ? "Link copied" : "Copy profile link"}
					</button>
				</div>
			</header>

			<div className="profile-layout">
				<section className="profile-apps" aria-labelledby="included-apps-title">
					<div className="section-heading compact">
						<div>
							<p className="eyebrow">Contents</p>
							<h2 id="included-apps-title">Included in this profile</h2>
						</div>
					</div>
					<div className="profile-app-list">
						{profile.data.apps.map((app, index) => (
							<article key={app.id}>
								<span className="list-number">
									{String(index + 1).padStart(2, "0")}
								</span>
								<div>
									<h3>{app.name}</h3>
									<p>{app.description}</p>
									<small>
										{app.publisher} · {app.category}
									</small>
								</div>
								<Check aria-label="Included" />
							</article>
						))}
					</div>
				</section>

				{environment.isDesktop ? (
					<DesktopInstallExperience
						key={desktopInstallKey}
						appIds={desktopAppIds}
						policy={profile.data.policy}
						environment={environment.report}
						detectionError={environment.error}
					/>
				) : (
					<aside className="plan-panel">
						<div className="environment-pill">
							<Laptop aria-hidden="true" />
							<span>
								<strong>{environment.label}</strong>
								{environment.isDesktop
									? "Local planning is available"
									: "Preview here, install with desktop"}
							</span>
						</div>
						<h2>Install these apps</h2>
						<p>
							Open this profile in Pakitup Desktop to build a local install
							plan.
						</p>
						<a
							className="button button-primary button-wide"
							href={desktopProfileUrl}
						>
							<Laptop aria-hidden="true" /> Open in Pakitup
						</a>
						<a
							className="button button-secondary button-wide"
							href={DESKTOP_DOWNLOAD_URL}
							target="_blank"
							rel="noreferrer"
						>
							Download desktop app <ExternalLink aria-hidden="true" />
						</a>
						<p className="plan-disclaimer">
							<ShieldCheck aria-hidden="true" /> No installation starts until
							you review the exact local plan and explicitly confirm it in the
							desktop app.
						</p>
						<label className="field-label" htmlFor="plan-platform">
							Preview plan for
						</label>
						<select
							className="text-field"
							id="plan-platform"
							value={platform}
							onChange={(event) => {
								setPlatform(event.target.value as Platform);
								plan.reset();
							}}
						>
							{Object.entries(PLATFORM_LABELS).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
						<button
							className="button button-primary button-wide"
							type="button"
							disabled={plan.isPending}
							onClick={() => plan.mutate()}
						>
							{plan.isPending ? "Checking support…" : "Prepare install plan"}
						</button>
						<p className="plan-disclaimer">
							<ShieldCheck aria-hidden="true" /> Planning is read-only. You
							review support before any local action.
						</p>
						{plan.isError ? (
							<p className="form-error" role="alert">
								<TriangleAlert aria-hidden="true" /> {plan.error.message}
							</p>
						) : null}
					</aside>
				)}
			</div>

			{!environment.isDesktop && plan.data ? (
				<section className="plan-results" aria-labelledby="plan-results-title">
					<div className="plan-results-heading">
						<div>
							<p className="eyebrow">Dry-run result</p>
							<h2 id="plan-results-title">Review the proposed steps</h2>
						</div>
						<p>
							<strong>{plan.data.supportedCount}</strong> supported{" "}
							<span>·</span> <strong>{plan.data.unsupportedCount}</strong> need
							attention
						</p>
					</div>
					<ol>
						{plan.data.steps.map((step) => (
							<li
								key={step.appId}
								className={step.supported ? "is-supported" : "is-unsupported"}
							>
								{step.supported ? (
									<CheckCircle2 aria-hidden="true" />
								) : (
									<TriangleAlert aria-hidden="true" />
								)}
								<div>
									<strong>{step.appName}</strong>
									<span>
										{step.supported
											? `${step.provider} · ${step.packageId}`
											: step.reason ||
												"No provider available for this platform"}
									</span>
								</div>
								<em>{step.supported ? "Ready" : "Skipped"}</em>
							</li>
						))}
					</ol>
				</section>
			) : null}
		</div>
	);
}
