import { useEffect, useState } from "react";

import {
	detectEnvironment,
	type EnvironmentReport,
	isTauriRuntime,
} from "@/lib/desktop-client";
import type { Platform } from "@/lib/pakitup-api";

type DesktopEnvironment = {
	isDesktop: boolean;
	platform: Platform;
	label: string;
	report: EnvironmentReport | null;
	isDetecting: boolean;
	error: string | null;
};

declare global {
	interface Window {
		__TAURI_INTERNALS__?: unknown;
	}
}

function detectPlatform(userAgent: string): Platform {
	if (/android/i.test(userAgent)) return "android";
	if (/windows/i.test(userAgent)) return "windows";
	if (/macintosh|mac os x/i.test(userAgent)) return "macos";
	if (/linux/i.test(userAgent)) return "linux";
	return "windows";
}

export function useDesktopEnvironment(): DesktopEnvironment {
	const [environment] = useState<DesktopEnvironment>(() => {
		if (typeof window === "undefined") {
			return {
				isDesktop: false,
				platform: "windows",
				label: "Web preview",
				report: null,
				isDetecting: false,
				error: null,
			};
		}
		const isDesktop = isTauriRuntime();
		return {
			isDesktop,
			platform: detectPlatform(window.navigator.userAgent),
			label: isDesktop ? "Checking desktop tools" : "Web preview",
			report: null,
			isDetecting: isDesktop,
			error: null,
		};
	});
	const [detectedEnvironment, setDetectedEnvironment] =
		useState<DesktopEnvironment>(environment);

	useEffect(() => {
		if (!environment.isDesktop) return;
		let disposed = false;
		void detectEnvironment()
			.then((report) => {
				if (disposed) return;
				setDetectedEnvironment({
					isDesktop: true,
					platform: report.platform,
					label: "Desktop app detected",
					report,
					isDetecting: false,
					error: null,
				});
			})
			.catch((error: unknown) => {
				if (disposed) return;
				setDetectedEnvironment((current) => ({
					...current,
					label: "Desktop tools unavailable",
					isDetecting: false,
					error:
						error instanceof Error
							? error.message
							: "Environment detection failed",
				}));
			});
		return () => {
			disposed = true;
		};
	}, [environment.isDesktop]);

	return detectedEnvironment;
}
