import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildProductionCsp,
	validateProductionApiUrl,
	writeReleaseTauriConfig,
} from "./validate-production-api-url.mjs";

test("accepts a public DNS HTTPS URL and derives its origin", () => {
	assert.equal(
		validateProductionApiUrl("https://api.example.com/v1").origin,
		"https://api.example.com",
	);
	assert.equal(
		validateProductionApiUrl("https://api.example.com:443").origin,
		"https://api.example.com",
	);
	assert.match(
		buildProductionCsp("https://api.example.com"),
		/https:\/\/api\.example\.com/,
	);
	assert.doesNotMatch(
		buildProductionCsp("https://api.example.com"),
		/ https:;/,
	);
});

for (const [name, value] of [
	["missing", ""],
	["HTTP", "http://api.example.com"],
	["localhost", "https://localhost"],
	["localhost with trailing dot", "https://localhost."],
	["localhost subdomain", "https://api.localhost"],
	["localhost subdomain with trailing dot", "https://api.localhost."],
	["public IPv4 literal", "https://8.8.8.8"],
	["IPv4 loopback", "https://127.0.0.1"],
	["IPv4 private address", "https://10.0.0.1"],
	["IPv4 link-local metadata address", "https://169.254.169.254"],
	["IPv6 loopback", "https://[::1]"],
	["IPv6 link-local address", "https://[fe80::1]"],
	["IPv6 private address", "https://[fd00::1]"],
	["IPv4-mapped IPv6 loopback", "https://[::ffff:127.0.0.1]"],
	["non-default HTTPS port", "https://api.example.com:8443"],
	["credentials", "https://user:pass@api.example.com"],
	["query", "https://api.example.com?debug=true"],
	["fragment", "https://api.example.com#debug"],
]) {
	test(`rejects ${name}`, () => {
		assert.throws(() => validateProductionApiUrl(value));
	});
}

test("writes a Tauri override with only the exact production API origin", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pakitup-release-csp-"));
	const configPath = join(directory, "tauri.release.conf.json");

	try {
		await writeReleaseTauriConfig(configPath, "https://api.example.com");
		const config = JSON.parse(await readFile(configPath, "utf8"));
		assert.equal(
			config.app.security.csp,
			buildProductionCsp("https://api.example.com"),
		);
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
});
