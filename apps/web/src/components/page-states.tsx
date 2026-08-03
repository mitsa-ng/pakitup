import { AlertTriangle, Inbox, RotateCcw } from "lucide-react";

export function LoadingState({ label = "Loading software catalog" }) {
	return (
		<div className="state-panel" role="status" aria-live="polite">
			<div className="state-lines" aria-hidden="true">
				<span />
				<span />
				<span />
			</div>
			<p>{label}…</p>
		</div>
	);
}

export function ErrorState({
	title = "We couldn’t load this just yet.",
	message,
	onRetry,
}: {
	title?: string;
	message?: string;
	onRetry?: () => void;
}) {
	return (
		<div className="state-panel state-panel-error" role="alert">
			<AlertTriangle aria-hidden="true" />
			<div>
				<h2>{title}</h2>
				<p>{message ?? "Check your connection, then try once more."}</p>
			</div>
			{onRetry ? (
				<button
					className="button button-secondary"
					type="button"
					onClick={onRetry}
				>
					<RotateCcw aria-hidden="true" /> Retry
				</button>
			) : null}
		</div>
	);
}

export function EmptyState({
	title,
	message,
}: {
	title: string;
	message: string;
}) {
	return (
		<div className="state-panel" role="status">
			<Inbox aria-hidden="true" />
			<div>
				<h2>{title}</h2>
				<p>{message}</p>
			</div>
		</div>
	);
}
