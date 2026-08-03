import { describe, expect, test } from "bun:test";

import {
	buildDesktopInstallKey,
	buildDesktopProfileUrl,
	consumePendingHandoffBatch,
	createPendingHandoffDrain,
	isProfileSlug,
	MAX_PENDING_HANDOFFS,
} from "./desktop-handoff.ts";

describe("desktop profile handoff", () => {
	test("builds the exact custom-scheme URL", () => {
		expect(buildDesktopProfileUrl("workstation-7655307cce")).toBe(
			"pakitup://workstation-7655307cce",
		);
		expect(isProfileSlug(`${"a".repeat(53)}-7655307cce`)).toBe(true);
	});

	test("does not serialize commands or extra URL parts", () => {
		for (const slug of [
			"workstation?provider=winget",
			"workstation#confirm",
			"workstation/extra",
			"work%73tation",
			"workstation;rm-rf",
			"work--station",
			"workstation",
			"workstation-7655307CCe",
			"a".repeat(65),
		]) {
			expect(() => buildDesktopProfileUrl(slug)).toThrow(RangeError);
		}
	});

	test("changes the installer instance key with profile identity or apps", () => {
		const alpha = "alpha-7655307cce";
		const beta = "beta-a1b2c3d4e5";
		const original = buildDesktopInstallKey(alpha, ["git", "vscode"]);

		expect(buildDesktopInstallKey(beta, ["git", "vscode"])).not.toBe(original);
		expect(buildDesktopInstallKey(alpha, ["git", "firefox"])).not.toBe(
			original,
		);
	});

	test("consumes at most one bounded pending batch", async () => {
		const pending = Array.from(
			{ length: MAX_PENDING_HANDOFFS + 4 },
			(_, index) => index,
		);
		const handled = [];
		const consumed = await consumePendingHandoffBatch(
			async () => pending.shift() ?? null,
			(value) => handled.push(value),
		);

		expect(consumed).toBe(MAX_PENDING_HANDOFFS);
		expect(handled).toHaveLength(MAX_PENDING_HANDOFFS);
		expect(pending).toHaveLength(4);
	});

	test("schedules one follow-up batch after an in-flight request", async () => {
		const scheduled = [];
		let consumeCount = 0;
		let finishFirst;
		const firstBatch = new Promise((resolve) => {
			finishFirst = resolve;
		});
		const drain = createPendingHandoffDrain(
			async () => {
				consumeCount += 1;
				if (consumeCount === 1) await firstBatch;
				return 1;
			},
			(callback) => scheduled.push(callback),
		);

		drain.request();
		drain.request();
		drain.request();
		expect(consumeCount).toBe(1);

		finishFirst();
		await Promise.resolve();
		await Promise.resolve();
		expect(scheduled).toHaveLength(1);

		scheduled[0]();
		await Promise.resolve();
		expect(consumeCount).toBe(2);
	});
});
