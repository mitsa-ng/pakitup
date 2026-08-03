import { Check, PackagePlus } from "lucide-react";

import { type CatalogApp, PLATFORM_LABELS } from "@/lib/pakitup-api";

function initials(name: string) {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

export function CatalogCard({
	app,
	selected,
	disabled = false,
	onToggle,
}: {
	app: CatalogApp;
	selected: boolean;
	disabled?: boolean;
	onToggle: (app: CatalogApp) => void;
}) {
	return (
		<article className={selected ? "is-selected app-card" : "app-card"}>
			<button
				type="button"
				className="app-card-button"
				disabled={disabled}
				aria-pressed={selected}
				aria-label={
					disabled
						? `Profile limit reached; ${app.name} cannot be added`
						: `${selected ? "Remove" : "Add"} ${app.name} ${selected ? "from" : "to"} profile`
				}
				onClick={() => onToggle(app)}
			>
				<span className="app-icon" aria-hidden="true">
					{initials(app.name)}
				</span>
				<span className="app-copy">
					<span className="app-meta">
						<span>{app.category}</span>
						<span>by {app.publisher}</span>
					</span>
					<strong>{app.name}</strong>
					<span className="app-description">{app.description}</span>
					<span className="platform-list">
						<span className="sr-only">Available platforms:</span>
						{app.platforms.map((platform) => (
							<span key={platform}>{PLATFORM_LABELS[platform]}</span>
						))}
					</span>
				</span>
				<span className="select-indicator" aria-hidden="true">
					{selected ? <Check /> : <PackagePlus />}
				</span>
			</button>
		</article>
	);
}
