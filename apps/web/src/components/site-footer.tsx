import { Link } from "@tanstack/react-router";

export function SiteFooter() {
	return (
		<footer className="site-footer">
			<div className="site-footer-inner">
				<p>
					<strong>Pakitup</strong> builds a readable plan before it changes your
					machine.
				</p>
				<nav aria-label="Footer">
					<Link to="/">Catalog</Link>
					<Link to="/android">Android companion</Link>
				</nav>
			</div>
		</footer>
	);
}
