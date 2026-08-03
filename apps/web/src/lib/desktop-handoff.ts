export const DESKTOP_DOWNLOAD_URL =
	"https://github.com/mitsa-ng/pakitup/releases/latest";

const PROFILE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{10}$/;
const MAX_PROFILE_SLUG_LENGTH = 64;
export const MAX_PENDING_HANDOFFS = 16;

export function isProfileSlug(value: string): boolean {
	return (
		value.length >= 1 &&
		value.length <= MAX_PROFILE_SLUG_LENGTH &&
		PROFILE_SLUG_PATTERN.test(value)
	);
}

export function buildDesktopProfileUrl(slug: string): string {
	if (!isProfileSlug(slug)) {
		throw new RangeError("Invalid Pakitup profile slug");
	}
	return `pakitup://${slug}`;
}

export function buildDesktopInstallKey(
	profileSlug: string,
	appIds: readonly string[],
): string {
	if (!isProfileSlug(profileSlug)) {
		throw new RangeError("Invalid Pakitup profile slug");
	}
	return JSON.stringify([profileSlug, appIds]);
}

export async function consumePendingHandoffBatch<T>(
	take: () => Promise<T | null>,
	handle: (value: T) => Promise<void> | void,
): Promise<number> {
	let consumed = 0;
	for (; consumed < MAX_PENDING_HANDOFFS; consumed += 1) {
		const value = await take();
		if (value === null) break;
		await handle(value);
	}
	return consumed;
}

export function createPendingHandoffDrain(
	consumeBatch: () => Promise<number>,
	schedule: (callback: () => void) => void = queueMicrotask,
	onError: () => void = () => {},
) {
	let disposed = false;
	let inFlight: Promise<void> | null = null;
	let drainRequested = false;
	let drainScheduled = false;

	function scheduleFollowUp() {
		if (disposed || drainScheduled) return;
		drainScheduled = true;
		schedule(() => {
			drainScheduled = false;
			startDrain();
		});
	}

	function startDrain() {
		if (disposed || inFlight) return;
		drainRequested = false;
		inFlight = (async () => {
			try {
				const consumed = await consumeBatch();
				if (consumed === MAX_PENDING_HANDOFFS) drainRequested = true;
			} catch {
				onError();
			} finally {
				inFlight = null;
				if (drainRequested) scheduleFollowUp();
			}
		})();
	}

	return {
		request() {
			if (disposed) return;
			drainRequested = true;
			if (!inFlight && !drainScheduled) startDrain();
		},
		dispose() {
			disposed = true;
		},
	};
}
