import { z } from "zod";

const exactHttpOriginSchema = z.url().refine((value) => {
	const url = new URL(value);
	return (
		(url.protocol === "http:" || url.protocol === "https:") &&
		url.origin === value &&
		!url.hostname.includes("*")
	);
}, "CORS_ORIGIN must be an exact http(s) origin without a path");

const tauriOrigins = new Set([
	"tauri://localhost",
	"http://tauri.localhost",
	"https://tauri.localhost",
]);

const configuredCorsOriginSchema = z
	.string()
	.min(1, "CORS_ORIGIN must contain at least one origin")
	.transform((value, ctx) => {
		const origins = value.split(",");
		const allowedOrigins = new Set<string>();

		for (const origin of origins) {
			if (origin.length === 0) {
				ctx.addIssue({
					code: "custom",
					message: "CORS_ORIGIN cannot contain an empty origin",
				});
				continue;
			}

			if (tauriOrigins.has(origin)) {
				allowedOrigins.add(origin);
				continue;
			}

			const parsed = exactHttpOriginSchema.safeParse(origin);
			if (!parsed.success) {
				ctx.addIssue({
					code: "custom",
					message:
						"CORS_ORIGIN entries must be exact http(s) origins or supported Tauri origins",
				});
				continue;
			}

			allowedOrigins.add(origin);
		}

		if (ctx.issues.length > 0) return z.NEVER;
		return [...allowedOrigins];
	});

const databaseUrlSchema = z.url().refine((value) => {
	const protocol = new URL(value).protocol;
	return protocol === "postgres:" || protocol === "postgresql:";
}, "DATABASE_URL must use the postgres or postgresql protocol");

export const serverEnvSchema = z
	.object({
		DATABASE_URL: databaseUrlSchema,
		CORS_ORIGIN: configuredCorsOriginSchema,
		RATE_LIMIT_KEY_PREFIX: z.string().min(1).max(120),
		RATE_LIMIT_KEY_SECRET: z.string().min(32),
	})
	.passthrough();

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(input: unknown): ServerEnv {
	return serverEnvSchema.parse(input);
}
