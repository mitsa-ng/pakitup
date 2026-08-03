import { mkdir, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function normalizeHostname(hostname) {
	const withoutIpv6Brackets =
		hostname.startsWith("[") && hostname.endsWith("]")
			? hostname.slice(1, -1)
			: hostname;
	return withoutIpv6Brackets.toLowerCase().replace(/\.+$/u, "");
}

export function validateProductionApiUrl(value) {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error("VITE_SERVER_URL must be a non-empty HTTPS production URL");
	}
	if (value !== value.trim()) {
		throw new Error(
			"VITE_SERVER_URL must not contain leading or trailing whitespace",
		);
	}

	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error("VITE_SERVER_URL must be an absolute HTTPS URL");
	}

	if (url.protocol !== "https:") {
		throw new Error("VITE_SERVER_URL must use HTTPS");
	}
	if (url.port) {
		throw new Error("VITE_SERVER_URL must not use a non-default HTTPS port");
	}
	if (url.username || url.password) {
		throw new Error("VITE_SERVER_URL must not include credentials");
	}
	if (url.search) {
		throw new Error("VITE_SERVER_URL must not include a query string");
	}
	if (url.hash) {
		throw new Error("VITE_SERVER_URL must not include a fragment");
	}

	const hostname = normalizeHostname(url.hostname);
	if (hostname === "localhost" || hostname.endsWith(".localhost")) {
		throw new Error("VITE_SERVER_URL must not target localhost");
	}
	if (isIP(hostname) !== 0) {
		throw new Error(
			"VITE_SERVER_URL must use a public DNS hostname, not an IP literal",
		);
	}

	return url;
}

export function buildProductionCsp(apiOrigin) {
	return [
		"default-src 'self'",
		`connect-src 'self' ipc: http://ipc.localhost ${apiOrigin}`,
		"img-src 'self' asset: http://asset.localhost data:",
		"style-src 'self' 'unsafe-inline'",
		"font-src 'self' data:",
		"script-src 'self'",
	].join("; ");
}

export async function writeReleaseTauriConfig(path, apiOrigin) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		`${JSON.stringify(
			{
				app: {
					security: {
						csp: buildProductionCsp(apiOrigin),
					},
				},
			},
			null,
			2,
		)}\n`,
	);
}

function usage() {
	return "usage: VITE_SERVER_URL=<https-url> node validate-production-api-url.mjs [--config <path>]";
}

async function main() {
	const arguments_ = process.argv.slice(2);
	const value =
		arguments_[0] === "--config"
			? process.env.VITE_SERVER_URL
			: (arguments_.shift() ?? process.env.VITE_SERVER_URL);
	const [option, configPath, ...extra] = arguments_;
	if (
		!value ||
		extra.length > 0 ||
		(option && option !== "--config") ||
		(option && !configPath)
	) {
		throw new Error(usage());
	}

	const url = validateProductionApiUrl(value);
	if (configPath) await writeReleaseTauriConfig(configPath, url.origin);
	console.log(`production API URL validated: ${url.origin}`);
}

if (
	process.argv[1] &&
	fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
	await main();
}
