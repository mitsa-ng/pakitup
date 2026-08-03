import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, PackageOpen, X } from "lucide-react";
import { useState } from "react";

import { BrandMark } from "./brand-mark";
import { ModeToggle } from "./mode-toggle";

export default function Header() {
	const [menuOpen, setMenuOpen] = useState(false);
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const links = [
		{ to: "/", label: "Catalog" },
		{ to: "/builder", label: "Profile builder" },
		{ to: "/android", label: "Android" },
	] as const;

	return (
		<header className="site-header">
			<div className="site-header-inner">
				<Link className="brand-link" to="/" aria-label="Pakitup home">
					<BrandMark />
				</Link>
				<nav
					id="mobile-navigation"
					className={menuOpen ? "is-open main-nav" : "main-nav"}
					aria-label="Primary"
				>
					{links.map(({ to, label }) => {
						return (
							<Link
								key={to}
								to={to}
								className={pathname === to ? "is-active" : undefined}
								onClick={() => setMenuOpen(false)}
							>
								{label}
							</Link>
						);
					})}
				</nav>
				<div className="header-actions">
					<span className="header-trust">
						<PackageOpen aria-hidden="true" /> Review before install
					</span>
					<ModeToggle />
					<button
						className="menu-toggle"
						type="button"
						aria-expanded={menuOpen}
						aria-controls="mobile-navigation"
						aria-label={menuOpen ? "Close navigation" : "Open navigation"}
						onClick={() => setMenuOpen((open) => !open)}
					>
						{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
					</button>
				</div>
			</div>
		</header>
	);
}
