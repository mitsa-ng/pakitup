import { readFile } from "node:fs/promises";

const [tag, cargoManifestPath, tauriConfigPath] = process.argv.slice(2);
const tagMatch = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag ?? "");

if (!tagMatch) {
	throw new Error(
		`release tag must have the exact form vX.Y.Z; received ${tag ?? "<missing>"}`,
	);
}
if (!cargoManifestPath || !tauriConfigPath) {
	throw new Error("Cargo.toml and tauri.conf.json paths are required");
}

const cargoManifest = await readFile(cargoManifestPath, "utf8");
let cargoVersion;
let inPackageSection = false;
for (const line of cargoManifest.split(/\r?\n/)) {
	const section = /^\s*\[([^\]]+)]\s*$/.exec(line);
	if (section) {
		inPackageSection = section[1] === "package";
		continue;
	}
	if (inPackageSection) {
		cargoVersion = /^\s*version\s*=\s*"([^"]+)"\s*$/.exec(line)?.[1];
		if (cargoVersion) break;
	}
}
const tauriVersion = JSON.parse(
	await readFile(tauriConfigPath, "utf8"),
).version;
const tagVersion = tag.slice(1);

if (!cargoVersion) {
	throw new Error(`could not read [package] version from ${cargoManifestPath}`);
}
if (cargoVersion !== tagVersion || tauriVersion !== tagVersion) {
	throw new Error(
		`version mismatch: tag=${tagVersion}, Cargo.toml=${cargoVersion}, tauri.conf.json=${tauriVersion}`,
	);
}

console.log(`release version verified: ${tagVersion}`);
