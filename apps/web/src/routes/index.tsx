import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	CheckCircle2,
	ChevronRight,
	Laptop,
	Search,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { CatalogCard } from "@/components/catalog-card";
import { EmptyState, ErrorState, LoadingState } from "@/components/page-states";
import { useDesktopEnvironment } from "@/hooks/use-desktop-environment";
import {
	type CatalogApp,
	PLATFORM_LABELS,
	type Platform,
	pakitupApi,
} from "@/lib/pakitup-api";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

type PlatformFilter = Platform | "all";

function HomeComponent() {
	const environment = useDesktopEnvironment();
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query.trim());
	const [platform, setPlatform] = useState<PlatformFilter>(
		environment.platform,
	);
	const [category, setCategory] = useState("all");
	const [selected, setSelected] = useState<Set<string>>(() => new Set());

	const catalog = useQuery({
		queryKey: ["catalog", deferredQuery, platform, category],
		queryFn: () =>
			pakitupApi.catalog.list({
				query: deferredQuery || undefined,
				platform: platform === "all" ? undefined : platform,
				category: category === "all" ? undefined : category,
			}),
	});

	const selectedSearch = useMemo(
		() => Array.from(selected).sort().join(","),
		[selected],
	);

	function toggleApp(app: CatalogApp) {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(app.id)) next.delete(app.id);
			else if (next.size < 50) next.add(app.id);
			return next;
		});
	}

	return (
		<div className="home-page">
			<section className="hero section-shell" aria-labelledby="hero-title">
				<div className="hero-copy">
					<p className="eyebrow">
						<Sparkles aria-hidden="true" /> One list. A calmer setup.
					</p>
					<h1 id="hero-title">
						Install the useful things.
						<span className="hero-subline">Skip the scavenger hunt.</span>
					</h1>
					<p className="hero-deck">
						Choose trusted software, review a plain-language plan, and share the
						same setup with your next machine.
					</p>
					<div className="hero-actions">
						<a className="button button-primary" href="#catalog">
							Build a profile <ArrowRight aria-hidden="true" />
						</a>
						<Link className="text-link" to="/android">
							Using Android? Read this first <ChevronRight aria-hidden="true" />
						</Link>
					</div>
					<ul className="trust-list" aria-label="Pakitup safety principles">
						<li>
							<CheckCircle2 aria-hidden="true" /> Exact package IDs
						</li>
						<li>
							<CheckCircle2 aria-hidden="true" /> Plan before execution
						</li>
						<li>
							<CheckCircle2 aria-hidden="true" /> No bundled extras
						</li>
					</ul>
				</div>
				<aside className="hero-note" aria-label="How Pakitup works">
					<div className="note-tape" aria-hidden="true" />
					<p className="note-number">Setup note № 01</p>
					<h2>A list you can read before you run.</h2>
					<ol>
						<li>
							<span className="hero-note-step">01</span> Pick the apps you
							actually use.
						</li>
						<li>
							<span className="hero-note-step">02</span> Choose a conservative
							install policy.
						</li>
						<li>
							<span className="hero-note-step">03</span> Review every supported
							step.
						</li>
					</ol>
					<div className="environment-pill">
						<Laptop aria-hidden="true" />
						<span>
							<strong>{environment.label}</strong>
							{environment.isDesktop
								? `${PLATFORM_LABELS[environment.platform]} ready`
								: "Profiles work here; installs run in the desktop app"}
						</span>
					</div>
				</aside>
			</section>

			<section className="principles-band" aria-label="Product principles">
				<div className="section-shell principle-grid">
					<p>
						<ShieldCheck aria-hidden="true" />
						<span>
							<strong>Trust is a feature.</strong>
							Pakitup uses a curated catalog and shows unsupported items
							clearly.
						</span>
					</p>
					<p className="principle-quote">
						“Fewer mystery dialogs. More deliberate installs.”
					</p>
				</div>
			</section>

			<section
				className="catalog-section section-shell"
				id="catalog"
				aria-labelledby="catalog-title"
			>
				<div className="section-heading">
					<div>
						<p className="eyebrow">Curated catalog</p>
						<h2 id="catalog-title">What belongs on this machine?</h2>
					</div>
					<p>
						Select once. Refine the install policy on the next page. Nothing
						runs from this browser.
					</p>
				</div>

				<div className="catalog-toolbar">
					<label className="search-field">
						<span className="sr-only">Search software</span>
						<Search aria-hidden="true" />
						<input
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search by app, publisher, or purpose"
							autoComplete="off"
						/>
					</label>
					<fieldset className="filter-row">
						<legend className="sr-only">Filter by platform</legend>
						{(["all", "windows", "macos", "linux", "android"] as const).map(
							(item) => (
								<button
									key={item}
									type="button"
									aria-pressed={platform === item}
									onClick={() => {
										setPlatform(item);
										setCategory("all");
									}}
								>
									{item === "all" ? "All platforms" : PLATFORM_LABELS[item]}
								</button>
							),
						)}
					</fieldset>
				</div>

				{catalog.data?.categories.length ? (
					<fieldset className="category-row">
						<legend className="sr-only">Filter by category</legend>
						<button
							type="button"
							aria-pressed={category === "all"}
							onClick={() => setCategory("all")}
						>
							Everything
						</button>
						{catalog.data.categories.map((item) => (
							<button
								key={item}
								type="button"
								aria-pressed={category === item}
								onClick={() => setCategory(item)}
							>
								{item}
							</button>
						))}
					</fieldset>
				) : null}

				<div className="catalog-result-heading" aria-live="polite">
					<span>
						{catalog.data
							? `${catalog.data.total} ${catalog.data.total === 1 ? "app" : "apps"}`
							: "Finding apps"}
					</span>
					<span>{selected.size} selected</span>
				</div>

				{catalog.isPending ? <LoadingState /> : null}
				{catalog.isError ? (
					<ErrorState
						message={catalog.error.message}
						onRetry={() => void catalog.refetch()}
					/>
				) : null}
				{catalog.data && catalog.data.items.length === 0 ? (
					<EmptyState
						title="No matches in this drawer."
						message="Try a broader search or switch platforms. Your current selections are still saved."
					/>
				) : null}
				{catalog.data?.items.length ? (
					<div className="catalog-grid">
						{catalog.data.items.map((app) => (
							<CatalogCard
								key={app.id}
								app={app}
								selected={selected.has(app.id)}
								disabled={selected.size >= 50 && !selected.has(app.id)}
								onToggle={toggleApp}
							/>
						))}
					</div>
				) : null}
			</section>

			<div
				className={
					selected.size ? "is-visible selection-dock" : "selection-dock"
				}
				aria-live="polite"
			>
				<div>
					<strong>{selected.size || "No"} apps in your stack</strong>
					<span>
						{selected.size >= 50
							? "Profile limit reached: 50 apps maximum."
							: "Review names and install policy before sharing."}
					</span>
				</div>
				{selected.size ? (
					<Link
						className="button button-primary"
						to="/builder"
						search={{ apps: selectedSearch }}
					>
						Review profile <ArrowRight aria-hidden="true" />
					</Link>
				) : (
					<a className="button button-secondary" href="#catalog">
						Choose your first app
					</a>
				)}
			</div>
		</div>
	);
}
