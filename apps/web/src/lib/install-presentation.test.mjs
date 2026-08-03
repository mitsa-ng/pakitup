import { describe, expect, test } from "bun:test";

import {
	outputTextForDisplay,
	presentProgress,
} from "./install-presentation.ts";

function event(sequence, kind, chunk = null) {
	return {
		planId: "plan-1",
		sequence,
		kind,
		appId: "sevenzip",
		provider: "homebrew",
		stream: kind === "stepOutput" ? "stdout" : null,
		chunk,
		stepStatus: null,
		executionStatus: null,
		atMs: 1,
	};
}

describe("presentProgress", () => {
	test("keeps lifecycle milestones and omits blank output only from display", () => {
		const blank = event(2, "stepOutput", " \n\t");
		const presentation = presentProgress([
			event(1, "stepStarted"),
			blank,
			event(3, "stepFinished"),
		]);

		expect(presentation.milestones.map((item) => item.sequence)).toEqual([
			1, 3,
		]);
		expect(presentation.outputChunks).toEqual([]);
		expect(presentation.blankOutputChunks).toBe(1);
		expect(blank.chunk).toBe(" \n\t");
	});

	test("keeps non-empty raw chunks with their sequence and stream", () => {
		const raw = event(4, "stepOutput", "==> Pouring sevenzip\n");
		const presentation = presentProgress([raw]);

		expect(presentation.outputChunks).toEqual([raw]);
		expect(presentation.outputChunks[0].stream).toBe("stdout");
		expect(presentation.outputChunks[0].sequence).toBe(4);
	});

	test("sanitizes terminal control bytes only when output is rendered", () => {
		const raw = "safe\u0000\u001bunsafe\nnext";
		expect(outputTextForDisplay(raw)).toBe("safeunsafe\nnext");
		expect(raw).toContain("\u001b");
	});
});
