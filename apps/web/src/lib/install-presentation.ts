import type { InstallProgressEvent, ProgressEventKind } from "./desktop-client";

export type PresentedProgress = {
	milestones: InstallProgressEvent[];
	outputChunks: InstallProgressEvent[];
	blankOutputChunks: number;
};

export const progressLabels: Record<ProgressEventKind, string> = {
	planQueued: "Plan queued",
	planStarted: "Installation started",
	stepStarted: "Step started",
	stepOutput: "Installer output",
	stepFinished: "Step finished",
	planFinished: "Installation finished",
};

export function outputTextForDisplay(value: string | null): string {
	if (!value) return "";
	return Array.from(value)
		.filter((character) => {
			const code = character.charCodeAt(0);
			return code === 9 || code === 10 || code === 13 || code >= 32;
		})
		.join("");
}

/**
 * Keeps the event payload untouched. Whitespace is only used to decide whether
 * an output chunk is useful to render in the optional raw-log view.
 */
export function presentProgress(
	progress: InstallProgressEvent[],
): PresentedProgress {
	const milestones: InstallProgressEvent[] = [];
	const outputChunks: InstallProgressEvent[] = [];
	let blankOutputChunks = 0;

	for (const event of progress) {
		if (event.kind !== "stepOutput") {
			milestones.push(event);
			continue;
		}

		if (event.chunk?.trim()) {
			outputChunks.push(event);
		} else {
			blankOutputChunks += 1;
		}
	}

	return { milestones, outputChunks, blankOutputChunks };
}
