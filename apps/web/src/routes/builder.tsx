import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	ArrowRight,
	Check,
	CircleAlert,
	PackageCheck,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/page-states";
import { pakitupApi } from "@/lib/pakitup-api";

type BuilderSearch = { apps: string };

export const Route = createFileRoute("/builder")({
	validateSearch: (search: Record<string, unknown>): BuilderSearch => ({
		apps: typeof search.apps === "string" ? search.apps : "",
	}),
	component: BuilderComponent,
});

function parseAppIds(value: string) {
	return value
		.split(",")
		.map((id) => id.trim())
		.filter((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
		.slice(0, 50);
}

function BuilderComponent() {
	const { apps } = Route.useSearch();
	const navigate = useNavigate();
	const initialIds = useMemo(() => parseAppIds(apps), [apps]);
	const [selected, setSelected] = useState<Set<string>>(
		() => new Set(initialIds),
	);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [formError, setFormError] = useState<string | null>(null);

	const catalog = useQuery({
		queryKey: ["catalog", "builder"],
		queryFn: () => pakitupApi.catalog.list({}),
	});

	const createProfile = useMutation({
		mutationFn: () =>
			pakitupApi.profiles.create({
				name: name.trim(),
				description: description.trim() || undefined,
				appIds: Array.from(selected),
				policy: "install-missing",
			}),
		onSuccess: (profile) => {
			void navigate({ to: "/p/$slug", params: { slug: profile.slug } });
		},
		onError: (error) => setFormError(error.message),
	});

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);
		if (!name.trim()) {
			setFormError("Give this profile a short, recognizable name.");
			return;
		}
		if (selected.size === 0) {
			setFormError("Choose at least one app before creating a profile.");
			return;
		}
		if (selected.size > 50) {
			setFormError("Profiles can include up to 50 apps.");
			return;
		}
		createProfile.mutate();
	}

	function toggle(id: string) {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else if (next.size < 50) next.add(id);
			return next;
		});
	}

	return (
		<div className="builder-page section-shell">
			<Link className="back-link" to="/">
				<ArrowLeft aria-hidden="true" /> Back to catalog
			</Link>
			<header className="builder-heading">
				<div>
					<p className="eyebrow">
						<Sparkles aria-hidden="true" /> Profile workshop
					</p>
					<h1>Turn the shortlist into a setup.</h1>
				</div>
				<p>
					Name it clearly, choose how cautious Pakitup should be, then share one
					stable link.
				</p>
			</header>

			<form className="builder-layout" onSubmit={submit} noValidate>
				<div className="builder-main">
					<section
						className="editorial-panel"
						aria-labelledby="profile-details-title"
					>
						<div className="panel-heading">
							<span>01</span>
							<div>
								<p className="kicker">Identity</p>
								<h2 id="profile-details-title">Name the setup</h2>
							</div>
						</div>
						<label className="field-label" htmlFor="profile-name">
							Profile name
						</label>
						<input
							className="text-field"
							id="profile-name"
							name="name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Design workstation"
							maxLength={80}
							required
						/>
						<label className="field-label" htmlFor="profile-description">
							Short note <span>Optional</span>
						</label>
						<textarea
							className="textarea-field text-field"
							id="profile-description"
							name="description"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							placeholder="Everything needed for a fresh product design machine."
							maxLength={180}
						/>
						<p className="field-count">{description.length}/180</p>
					</section>

					<fieldset className="editorial-panel">
						<legend className="sr-only">Install policy</legend>
						<div className="panel-heading" aria-hidden="true">
							<span>02</span>
							<div>
								<p className="kicker">Policy</p>
								<h2>Choose the guardrails</h2>
							</div>
						</div>
						<div className="policy-grid">
							<label className="is-selected policy-card">
								<input
									type="radio"
									name="policy"
									value="install-missing"
									checked
									readOnly
								/>
								<span className="policy-check">
									<Check aria-hidden="true" />
								</span>
								<strong>Install missing only</strong>
								<span>Leaves software already on the machine untouched.</span>
								<em>Recommended</em>
							</label>
							<div className="policy-card is-coming-soon" aria-disabled="true">
								<span className="policy-check">
									<Check aria-hidden="true" />
								</span>
								<strong>Install and upgrade · Coming soon</strong>
								<span>
									Upgrade planning is not available yet, so new profiles stay on
									the conservative missing-only policy.
								</span>
								<em>Not selectable</em>
							</div>
						</div>
					</fieldset>

					<section className="editorial-panel" aria-labelledby="apps-title">
						<div className="panel-heading">
							<span>03</span>
							<div>
								<p className="kicker">Contents</p>
								<h2 id="apps-title">Confirm the apps</h2>
							</div>
							<strong className="count-badge">{selected.size} selected</strong>
						</div>
						{catalog.isPending ? (
							<LoadingState label="Loading your shortlist" />
						) : null}
						{catalog.isError ? (
							<ErrorState
								message={catalog.error.message}
								onRetry={() => void catalog.refetch()}
							/>
						) : null}
						{catalog.data?.items.length === 0 ? (
							<EmptyState
								title="The catalog is empty."
								message="Return later or ask the catalog maintainer to publish entries."
							/>
						) : null}
						<div className="selection-list">
							{catalog.data?.items.map((app) => (
								<label
									key={app.id}
									className={
										selected.has(app.id)
											? "is-selected selection-row"
											: "selection-row"
									}
								>
									<input
										type="checkbox"
										checked={selected.has(app.id)}
										disabled={selected.size >= 50 && !selected.has(app.id)}
										onChange={() => toggle(app.id)}
									/>
									<span className="selection-checkbox">
										<Check aria-hidden="true" />
									</span>
									<span>
										<strong>{app.name}</strong>
										<small>
											{app.publisher} · {app.category}
										</small>
									</span>
								</label>
							))}
						</div>
					</section>
				</div>

				<aside className="builder-summary">
					<div className="summary-sticky">
						<p className="kicker">Final check</p>
						<h2>{name.trim() || "Untitled profile"}</h2>
						<dl>
							<div>
								<dt>Apps</dt>
								<dd>{selected.size}</dd>
							</div>
							<div>
								<dt>Policy</dt>
								<dd>Missing only</dd>
							</div>
							<div>
								<dt>Link</dt>
								<dd>Stable + shareable</dd>
							</div>
						</dl>
						<div className="summary-trust">
							<ShieldCheck aria-hidden="true" />
							<p>
								<strong>No installation starts here.</strong> The shared page
								generates a platform-specific plan for review.
							</p>
						</div>
						{formError ? (
							<p className="form-error" role="alert">
								<CircleAlert aria-hidden="true" /> {formError}
							</p>
						) : null}
						<button
							className="button button-primary button-wide"
							type="submit"
							disabled={createProfile.isPending}
						>
							{createProfile.isPending
								? "Creating profile…"
								: "Create shareable profile"}
							{createProfile.isPending ? null : (
								<ArrowRight aria-hidden="true" />
							)}
						</button>
						<p className="summary-footnote">
							<PackageCheck aria-hidden="true" /> You can review support before
							installing.
						</p>
					</div>
				</aside>
			</form>
		</div>
	);
}
