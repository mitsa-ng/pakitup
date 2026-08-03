import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const [inputDirectory, outputDirectory, platformLabel] = process.argv.slice(2);

if (!inputDirectory || !outputDirectory || !platformLabel) {
	throw new Error(
		"usage: node generate-checksums.mjs <bundle-dir> <output-dir> <platform-label>",
	);
}

const releaseExtensions = [".appimage", ".deb", ".dmg", ".exe", ".msi", ".rpm"];

async function walk(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walk(path)));
		} else if (
			releaseExtensions.some((extension) =>
				entry.name.toLowerCase().endsWith(extension),
			)
		) {
			files.push(path);
		}
	}
	return files;
}

function sha256(path) {
	return new Promise((resolve, reject) => {
		const hash = createHash("sha256");
		createReadStream(path)
			.on("error", reject)
			.on("data", (chunk) => hash.update(chunk))
			.on("end", () => resolve(hash.digest("hex")));
	});
}

await mkdir(outputDirectory, { recursive: true });
const bundles = await walk(inputDirectory);
if (bundles.length === 0) {
	throw new Error(`no release bundles found under ${inputDirectory}`);
}

const checksumLines = [];
for (const source of bundles.sort()) {
	const outputName = `${platformLabel}-${basename(source)}`;
	const destination = join(outputDirectory, outputName);
	await copyFile(source, destination);
	checksumLines.push(`${await sha256(destination)}  ${outputName}`);
}

await writeFile(
	join(outputDirectory, `${platformLabel}-SHA256SUMS.txt`),
	`${checksumLines.join("\n")}\n`,
);
