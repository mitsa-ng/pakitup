import { Toaster } from "@pakitup/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";

import Header from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { ThemeProvider } from "@/components/theme-provider";
import {
	isTauriRuntime,
	listenToProfileOpen,
	takePendingProfile,
} from "@/lib/desktop-client";
import {
	consumePendingHandoffBatch,
	createPendingHandoffDrain,
	isProfileSlug,
} from "@/lib/desktop-handoff";
import type { orpc } from "@/utils/orpc";

import "../index.css";

export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{
				title: "Pakitup — install the useful things",
			},
			{
				name: "description",
				content:
					"Build a trusted, shareable software setup and review every step before installation.",
			},
		],
		links: [
			{
				rel: "icon",
				href: "/favicon.ico",
			},
		],
	}),
});

function RootComponent() {
	const navigate = useNavigate();

	useEffect(() => {
		if (!isTauriRuntime()) return;

		let disposed = false;
		let unlisten: (() => void) | null = null;

		const drain = createPendingHandoffDrain(
			() =>
				consumePendingHandoffBatch(takePendingProfile, async (slug) => {
					if (disposed || !isProfileSlug(slug)) return;
					await navigate({ to: "/p/$slug", params: { slug } });
				}),
			queueMicrotask,
			() => {
				// Desktop environment detection surfaces unavailable IPC separately.
			},
		);

		void listenToProfileOpen(() => {
			drain.request();
		})
			.then((cleanup) => {
				if (disposed) {
					cleanup();
					return;
				}
				unlisten = cleanup;
				drain.request();
			})
			.catch(() => {
				// Desktop environment detection will surface unavailable IPC separately.
			});

		return () => {
			disposed = true;
			drain.dispose();
			unlisten?.();
		};
	}, [navigate]);

	return (
		<>
			<HeadContent />
			<ThemeProvider
				attribute="class"
				defaultTheme="system"
				storageKey="vite-ui-theme"
			>
				<a className="skip-link" href="#main-content">
					Skip to content
				</a>
				<div className="site-shell">
					<Header />
					<main id="main-content" tabIndex={-1}>
						<Outlet />
					</main>
					<SiteFooter />
				</div>
				<Toaster richColors position="bottom-center" />
			</ThemeProvider>
		</>
	);
}
