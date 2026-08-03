import { client } from "@/utils/orpc";

export const PLATFORMS = ["windows", "macos", "linux", "android"] as const;

export type Platform = (typeof PLATFORMS)[number];
export type InstallPolicy = "install-missing" | "install-and-upgrade";

export interface CatalogProvider {
	platform: Platform;
	provider: string;
	packageId: string;
}

export interface CatalogApp {
	id: string;
	slug: string;
	name: string;
	description: string;
	category: string;
	publisher: string;
	homepage: string;
	sourceUrl: string;
	iconUrl?: string | null;
	platforms: Platform[];
	providers: CatalogProvider[];
}

export interface CatalogListResult {
	items: CatalogApp[];
	categories: string[];
	total: number;
}

export interface Profile {
	slug: string;
	name: string;
	description?: string;
	policy: InstallPolicy;
	apps: CatalogApp[];
	createdAt: string;
}

export interface PlanStep {
	appId: string;
	appName: string;
	provider: string | null;
	packageId: string | null;
	supported: boolean;
	reason?: string;
}

export interface InstallPlan {
	profileSlug: string;
	platform: Platform;
	steps: PlanStep[];
	supportedCount: number;
	unsupportedCount: number;
}

export const pakitupApi = client;

export const PLATFORM_LABELS: Record<Platform, string> = {
	windows: "Windows",
	macos: "macOS",
	linux: "Linux",
	android: "Android",
};
