import assert from "node:assert/strict";
import test from "node:test";

import { validateReleaseAssetNames } from "./validate-release-assets.mjs";

const validAssets = [
	"linux-x86_64-Pakitup_0.1.0_amd64.AppImage",
	"linux-x86_64-Pakitup_0.1.0_amd64.deb",
	"linux-x86_64-SHA256SUMS.txt",
	"macos-aarch64-Pakitup_0.1.0_aarch64.dmg",
	"macos-aarch64-SHA256SUMS.txt",
	"macos-x86_64-Pakitup_0.1.0_x64.dmg",
	"macos-x86_64-SHA256SUMS.txt",
	"windows-x86_64-Pakitup_0.1.0_x64-setup.exe",
	"windows-x86_64-Pakitup_0.1.0_x64_en-US.msi",
	"windows-x86_64-SHA256SUMS.txt",
];

test("accepts exactly one expected bundle and checksum per platform", () => {
	assert.deepEqual(
		validateReleaseAssetNames(validAssets, "v0.1.0"),
		[...validAssets].sort(),
	);
});

test("rejects a missing platform bundle", () => {
	assert.throws(
		() =>
			validateReleaseAssetNames(
				validAssets.filter((name) => !name.endsWith(".msi")),
				"0.1.0",
			),
		/allowlist mismatch/u,
	);
});

test("rejects stale, foreign, duplicate, misnamed, and wrong-version assets", () => {
	assert.throws(
		() => validateReleaseAssetNames([...validAssets, "notes.txt"], "0.1.0"),
		/allowlist mismatch/u,
	);
	assert.throws(
		() => validateReleaseAssetNames([...validAssets, validAssets[0]], "0.1.0"),
		/unique basenames/u,
	);
	assert.throws(
		() => validateReleaseAssetNames(validAssets, "0.2.0"),
		/allowlist mismatch/u,
	);
	assert.throws(
		() =>
			validateReleaseAssetNames(
				validAssets.map((name) =>
					name === "macos-x86_64-Pakitup_0.1.0_x64.dmg"
						? "macos-x86_64-Pakitup_0.1.0_anything.dmg"
						: name,
				),
				"0.1.0",
			),
		/allowlist mismatch/u,
	);
});
