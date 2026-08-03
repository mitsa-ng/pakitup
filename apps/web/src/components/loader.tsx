export default function Loader() {
	return (
		<div className="route-loader" role="status" aria-live="polite">
			<span className="route-loader-mark" aria-hidden="true">
				P
			</span>
			<span>Preparing the page…</span>
		</div>
	);
}
