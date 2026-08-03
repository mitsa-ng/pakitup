import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

const PLATFORM_ASSET_SUFFIXES = new Map([
	["linux-x86_64", ["_amd64.AppImage", "_amd64.deb"]],
	["macos-aarch64", ["_aarch64.dmg"]],
	["macos-x86_64", ["_x64.dmg"]],
	["windows-x86_64", ["_x64-setup.exe", "_x64_en-US.msi"]],
]);

function normalizedVersion(value) {
	const version = value?.startsWith("v") ? value.slice(1) : value;
	if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version ?? "")) {
		throw new Error("release version must have the exact form X.Y.Z or vX.Y.Z");
	}
	return version;
}

export function validateReleaseAssetNames(names, releaseVersion) {
	const version = normalizedVersion(releaseVersion);
	const uniqueNames = new Set(names);
	if (uniqueNames.size !== names.length) {
		throw new Error("release assets must have unique basenames");
	}

	const expectedNames = new Set();
	for (const [platform, assetSuffixes] of PLATFORM_ASSET_SUFFIXES) {
		expectedNames.add(`${platform}-SHA256SUMS.txt`);
		for (const assetSuffix of assetSuffixes) {
			expectedNames.add(`${platform}-Pakitup_${version}${assetSuffix}`);
		}
	}

	const unexpected = names.filter((name) => !expectedNames.has(name));
	const missing = [...expectedNames].filter((name) => !uniqueNames.has(name));
	if (unexpected.length > 0 || missing.length > 0) {
		throw new Error(
			`release asset allowlist mismatch: unexpected=[${unexpected.join(", ")}], missing=[${missing.join(", ")}]`,
		);
	}

	return [...expectedNames].sort();
}

async function walk(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(path)));
		else if (entry.isFile()) files.push(path);
	}
	return files;
}

async function main() {
	const [directory, releaseVersion, ...extra] = process.argv.slice(2);
	if (!directory || !releaseVersion || extra.length > 0) {
		throw new Error(
			"usage: node validate-release-assets.mjs <asset-directory> <X.Y.Z|vX.Y.Z>",
		);
	}

	const names = (await walk(directory)).map((path) => basename(path));
	const validated = validateReleaseAssetNames(names, releaseVersion);
	console.log(`release asset allowlist verified: ${validated.length} files`);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
	await main();
}
