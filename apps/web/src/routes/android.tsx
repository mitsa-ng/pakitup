import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Building2,
	Download,
	Hand,
	Info,
	ListChecks,
	ShieldAlert,
	Smartphone,
} from "lucide-react";

export const Route = createFileRoute("/android")({
	component: AndroidComponent,
});

function AndroidComponent() {
	return (
		<div className="android-page">
			<section className="android-hero section-shell">
				<div>
					<p className="eyebrow">
						<Smartphone aria-hidden="true" /> Android companion
					</p>
					<h1>A helpful handoff, never a hidden install.</h1>
					<p className="hero-deck">
						Android keeps installation decisions with you. Pakitup can organize
						a catalog and prepare downloads, but the system confirms apps one at
						a time.
					</p>
					<Link className="button button-primary" to="/">
						Build a cross-device profile <ArrowRight aria-hidden="true" />
					</Link>
				</div>
				<div className="android-device" aria-hidden="true">
					<div className="android-speaker" />
					<div className="android-screen">
						<span>Ready for review</span>
						<strong>3 apps</strong>
						<i />
						<i />
						<i />
						<em>System confirmation required</em>
					</div>
				</div>
			</section>

			<section
				className="android-flow section-shell"
				aria-labelledby="android-flow-title"
			>
				<div className="section-heading">
					<div>
						<p className="eyebrow">The consumer flow</p>
						<h2 id="android-flow-title">Three deliberate steps</h2>
					</div>
					<p>
						This route explains the intended companion experience; it is not
						itself an APK installer.
					</p>
				</div>
				<div className="android-step-grid">
					<article>
						<span>01</span>
						<ListChecks aria-hidden="true" />
						<h3>Choose from the catalog</h3>
						<p>
							Use the same readable profile to keep the set of apps consistent.
						</p>
					</article>
					<article>
						<span>02</span>
						<Download aria-hidden="true" />
						<h3>Prepare one download</h3>
						<p>
							Pakitup shows the source and package identity before handing off.
						</p>
					</article>
					<article>
						<span>03</span>
						<Hand aria-hidden="true" />
						<h3>Confirm with Android</h3>
						<p>
							The operating system owns the final prompt. Repeat only when you
							choose.
						</p>
					</article>
				</div>
			</section>

			<section
				className="limits-section section-shell"
				aria-labelledby="limits-title"
			>
				<div className="limits-card limits-card-primary">
					<ShieldAlert aria-hidden="true" />
					<div>
						<p className="kicker">Consumer devices</p>
						<h2 id="limits-title">No silent batch install</h2>
						<p>
							Pakitup does not use click automation, accessibility workarounds,
							or a background bypass. Each install remains visible and
							user-confirmed.
						</p>
					</div>
				</div>
				<div className="limits-card">
					<Building2 aria-hidden="true" />
					<div>
						<p className="kicker">Managed devices</p>
						<h2>Enterprise is a separate product boundary</h2>
						<p>
							Silent deployment is only considered for properly provisioned
							device-owner environments, with organization policy and audit
							controls.
						</p>
					</div>
				</div>
				<div className="android-notice">
					<Info aria-hidden="true" />
					<p>
						<strong>Release channel under review.</strong> Android
						package-install permissions and store distribution require separate
						policy validation before release.
					</p>
				</div>
			</section>
		</div>
	);
}
