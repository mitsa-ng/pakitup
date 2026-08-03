import { describe, expect, test } from "bun:test";

import { parseServerEnv } from "@pakitup/env/server";
import app from "./index.ts";

const bindings = {
	DATABASE_URL: "postgresql://user:password@example.test/neondb",
	CORS_ORIGIN: "https://app.example.test",
	PROFILE_CREATE_RATE_LIMIT: {
		async limit() {
			return { success: true };
		},
	},
	RATE_LIMIT_KEY_PREFIX: "pakitup:test:profiles.create",
	RATE_LIMIT_KEY_SECRET: "test-only-secret-that-is-at-least-32-characters",
};

describe("worker HTTP shell", () => {
	test("allows configured browser and Tauri origins only", async () => {
		const configuredOrigins = `${bindings.CORS_ORIGIN},tauri://localhost,http://tauri.localhost`;
		const allowed = await app.request(
			"https://api.example.test/",
			{ headers: { Origin: bindings.CORS_ORIGIN } },
			{ ...bindings, CORS_ORIGIN: configuredOrigins },
		);
		expect(allowed.status).toBe(200);
		expect(allowed.headers.get("access-control-allow-origin")).toBe(
			bindings.CORS_ORIGIN,
		);
		expect(allowed.headers.get("access-control-allow-credentials")).toBe(
			"true",
		);
		const tauriAllowed = await app.request(
			"https://api.example.test/",
			{ headers: { Origin: "tauri://localhost" } },
			{ ...bindings, CORS_ORIGIN: configuredOrigins },
		);
		expect(tauriAllowed.headers.get("access-control-allow-origin")).toBe(
			"tauri://localhost",
		);

		const denied = await app.request(
			"https://api.example.test/",
			{ headers: { Origin: "https://evil.example.test" } },
			bindings,
		);
		expect(denied.status).toBe(200);
		expect(denied.headers.get("access-control-allow-origin")).toBeNull();
	});

	test("rejects malformed CORS origin allowlist entries", () => {
		for (const CORS_ORIGIN of [
			"https://app.example.test/path",
			"https://*.example.test",
			"ftp://app.example.test",
			"https://app.example.test,",
		]) {
			expect(() => parseServerEnv({ ...bindings, CORS_ORIGIN })).toThrow();
		}
	});

	test("returns structured not-found errors with a request id", async () => {
		const response = await app.request(
			"https://api.example.test/does-not-exist",
			undefined,
			bindings,
		);
		expect(response.status).toBe(404);
		const body = await response.json();
		expect(body.error.code).toBe("NOT_FOUND");
		expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
	});

	test("mounts the validated oRPC OpenAPI health route", async () => {
		const response = await app.request(
			"https://api.example.test/api/health",
			undefined,
			{
				...bindings,
				PROFILE_CREATE_RATE_LIMIT: {
					async limit() {
						throw new Error("health must not invoke the limiter");
					},
				},
			},
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
	});

	test("returns a structured 429 before a blocked profile write", async () => {
		const response = await app.request(
			"https://api.example.test/api/profiles",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"CF-Connecting-IP": "203.0.113.10",
				},
				body: JSON.stringify({
					name: "Blocked profile",
					appIds: ["chrome"],
					policy: "install-missing",
				}),
			},
			{
				...bindings,
				PROFILE_CREATE_RATE_LIMIT: {
					async limit() {
						return { success: false };
					},
				},
			},
		);

		expect(response.status).toBe(429);
		expect(response.headers.get("retry-after")).toBe("60");
		expect(await response.json()).toMatchObject({
			code: "RATE_LIMITED",
			status: 429,
			data: { retryAfterSeconds: 60 },
		});
	});

	test("returns a structured 503 when rate limiting is unavailable", async () => {
		const response = await app.request(
			"https://api.example.test/api/profiles",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "Unavailable profile",
					appIds: ["chrome"],
					policy: "install-missing",
				}),
			},
			{
				...bindings,
				PROFILE_CREATE_RATE_LIMIT: {
					async limit() {
						throw new Error("binding unavailable");
					},
				},
			},
		);

		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			code: "RATE_LIMIT_UNAVAILABLE",
			status: 503,
			data: { retryable: true },
		});
	});
});
