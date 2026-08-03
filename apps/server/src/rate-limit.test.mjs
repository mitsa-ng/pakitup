import { describe, expect, test } from "bun:test";

import { createProfileRateLimitKey } from "./rate-limit.ts";

describe("profile creation rate limit key", () => {
	test("uses Cloudflare's connecting IP instead of a spoofable forwarding header", async () => {
		const trusted = new Request("https://api.example.test/api/profiles", {
			headers: {
				"CF-Connecting-IP": "203.0.113.10",
				"X-Forwarded-For": "198.51.100.99",
			},
		});
		const sameTrustedIp = new Request("https://api.example.test/api/profiles", {
			headers: {
				"CF-Connecting-IP": "203.0.113.10",
				"X-Forwarded-For": "192.0.2.1",
			},
		});

		expect(
			await createProfileRateLimitKey(
				trusted,
				"pakitup:test:profiles.create",
				"test-only-secret-that-is-at-least-32-characters",
			),
		).toBe(
			await createProfileRateLimitKey(
				sameTrustedIp,
				"pakitup:test:profiles.create",
				"test-only-secret-that-is-at-least-32-characters",
			),
		);
	});

	test("does not trust a forwarded IP when Cloudflare identity is absent", async () => {
		const spoofed = new Request("http://localhost/api/profiles", {
			headers: { "X-Forwarded-For": "198.51.100.2" },
		});
		const anonymous = new Request("http://localhost/api/profiles");

		expect(
			await createProfileRateLimitKey(
				spoofed,
				"pakitup:local:profiles.create",
				"test-only-secret-that-is-at-least-32-characters",
			),
		).toBe(
			await createProfileRateLimitKey(
				anonymous,
				"pakitup:local:profiles.create",
				"test-only-secret-that-is-at-least-32-characters",
			),
		);
	});

	test("returns a deterministic HMAC key without exposing the address", async () => {
		const request = new Request("https://api.example.test/api/profiles", {
			headers: { "CF-Connecting-IP": "203.0.113.10" },
		});
		const key = await createProfileRateLimitKey(
			request,
			"pakitup:test:profiles.create",
			"test-only-secret-that-is-at-least-32-characters",
		);

		expect(key).toMatch(/^[a-f0-9]{64}$/);
		expect(key).not.toContain("203.0.113.10");
		expect(key).toBe(
			await createProfileRateLimitKey(
				request,
				"pakitup:test:profiles.create",
				"test-only-secret-that-is-at-least-32-characters",
			),
		);
		expect(key).not.toBe(
			await createProfileRateLimitKey(
				request,
				"pakitup:test:profiles.create",
				"a-different-test-only-secret-with-32-characters",
			),
		);
	});
});
