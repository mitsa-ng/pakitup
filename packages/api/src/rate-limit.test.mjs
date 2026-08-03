import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";

import { enforceProfileCreateRateLimit } from "./rate-limit.ts";

describe("profile creation rate limit", () => {
	test("allows the write when the binding succeeds", async () => {
		const calls = [];
		const binding = {
			async limit(options) {
				calls.push(options);
				return { success: true };
			},
		};

		await expect(
			enforceProfileCreateRateLimit(binding, "hashed-client-key"),
		).resolves.toBeUndefined();
		expect(calls).toEqual([{ key: "hashed-client-key" }]);
	});

	test("returns a structured 429 when the binding blocks the write", async () => {
		const binding = {
			async limit() {
				return { success: false };
			},
		};

		try {
			await enforceProfileCreateRateLimit(binding, "hashed-client-key");
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(ORPCError);
			expect(error.code).toBe("RATE_LIMITED");
			expect(error.status).toBe(429);
			expect(error.data).toEqual({ retryAfterSeconds: 60 });
		}
	});

	test("fails closed with a structured 503 when the binding errors", async () => {
		const binding = {
			async limit() {
				throw new Error("binding unavailable");
			},
		};

		try {
			await enforceProfileCreateRateLimit(binding, "hashed-client-key");
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(ORPCError);
			expect(error.code).toBe("RATE_LIMIT_UNAVAILABLE");
			expect(error.status).toBe(503);
			expect(error.data).toEqual({ retryable: true });
		}
	});
});
