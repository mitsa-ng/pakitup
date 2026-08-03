import { ORPCError } from "@orpc/server";

import type { CreateContextOptions } from "./context";

export const PROFILE_CREATE_RATE_LIMIT_WINDOW_SECONDS = 60;

export async function enforceProfileCreateRateLimit(
	binding: CreateContextOptions["profileCreateRateLimit"],
	key: string,
): Promise<void> {
	let result: { success: boolean };

	try {
		result = await binding.limit({ key });
	} catch (cause) {
		throw new ORPCError("RATE_LIMIT_UNAVAILABLE", {
			status: 503,
			message: "Profile creation is temporarily unavailable",
			data: { retryable: true },
			cause,
		});
	}

	if (!result.success) {
		throw new ORPCError("RATE_LIMITED", {
			status: 429,
			message: "Too many profile creation attempts",
			data: {
				retryAfterSeconds: PROFILE_CREATE_RATE_LIMIT_WINDOW_SECONDS,
			},
		});
	}
}
