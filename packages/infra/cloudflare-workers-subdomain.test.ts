import assert from "node:assert/strict";
import test from "node:test";

import { getAccountSubdomain } from "alchemy/cloudflare";

import {
	requireCloudflareWorkersSubdomainForProduction,
	validateCloudflareWorkersSubdomain,
} from "./cloudflare-workers-subdomain";

const originalSubdomain = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN;
type CloudflareApi = Parameters<typeof getAccountSubdomain>[0];

function fakeApi(
	accountId: string,
	get: () => Promise<Response>,
): CloudflareApi {
	return { accountId, get } as unknown as CloudflareApi;
}

function restoreSubdomain() {
	if (originalSubdomain === undefined) {
		delete process.env.CLOUDFLARE_WORKERS_SUBDOMAIN;
	} else {
		process.env.CLOUDFLARE_WORKERS_SUBDOMAIN = originalSubdomain;
	}
}

test("validates the production opt-in without affecting local development", () => {
	const production = {
		stage: "production",
		phase: "up",
		local: false,
	} as const;
	assert.equal(
		requireCloudflareWorkersSubdomainForProduction(
			production,
			"pakitup-account",
		),
		"pakitup-account",
	);
	assert.throws(
		() => requireCloudflareWorkersSubdomainForProduction(production, undefined),
		/CLOUDFLARE_WORKERS_SUBDOMAIN is required/u,
	);
	assert.equal(
		requireCloudflareWorkersSubdomainForProduction(
			{ ...production, local: true },
			undefined,
		),
		undefined,
	);
	assert.throws(
		() =>
			requireCloudflareWorkersSubdomainForProduction(
				{ ...production, stage: "prod" },
				undefined,
			),
		/authoritative "production" stage/u,
	);
});

test("accepts only a strict workers.dev subdomain label", () => {
	for (const value of [
		"",
		"UPPERCASE",
		"-leading",
		"trailing-",
		"two.labels",
		"has space",
		"a".repeat(64),
	]) {
		assert.throws(() => validateCloudflareWorkersSubdomain(value));
	}
	for (const value of ["a", "pakitup-account", "account123", "a".repeat(63)]) {
		assert.equal(validateCloudflareWorkersSubdomain(value), value);
	}
});

test("patched Alchemy uses only an explicit valid fallback and preserves API errors", async () => {
	try {
		process.env.CLOUDFLARE_WORKERS_SUBDOMAIN = "pakitup-account";
		let apiCalls = 0;
		const configuredApi = fakeApi("configured-fallback-test", async () => {
			apiCalls += 1;
			throw new Error("API should not be called");
		});
		assert.equal(await getAccountSubdomain(configuredApi), "pakitup-account");
		assert.equal(apiCalls, 0);

		process.env.CLOUDFLARE_WORKERS_SUBDOMAIN = "invalid.example";
		await assert.rejects(
			getAccountSubdomain(
				fakeApi("invalid-fallback-test", async () => {
					throw new Error("API should not be called");
				}),
			),
			/lowercase DNS label/u,
		);

		delete process.env.CLOUDFLARE_WORKERS_SUBDOMAIN;
		const deniedApi = fakeApi("api-403-test", async () => {
			return new Response(
				JSON.stringify({
					success: false,
					result: null,
					errors: [{ code: 10000, message: "Authentication error" }],
					messages: [],
				}),
				{ status: 403, statusText: "Forbidden" },
			);
		});
		await assert.rejects(
			getAccountSubdomain(deniedApi),
			(error) =>
				error instanceof Error && "status" in error && error.status === 403,
		);
	} finally {
		restoreSubdomain();
	}
});
