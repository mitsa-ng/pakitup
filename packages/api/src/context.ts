import { createDb } from "@pakitup/db";

export type CreateContextOptions = {
	databaseUrl: string;
	profileCreateRateLimit: {
		limit(options: { key: string }): Promise<{ success: boolean }>;
	};
	profileCreateRateLimitKey: string;
};

export function createContext(options: CreateContextOptions) {
	return {
		db: createDb(options.databaseUrl),
		profileCreateRateLimit: options.profileCreateRateLimit,
		profileCreateRateLimitKey: options.profileCreateRateLimitKey,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
