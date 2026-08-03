import type { ProfileRecord } from "@pakitup/db";
import { z } from "zod";

export const platformSchema = z.enum(["windows", "macos", "linux", "android"]);
export const policySchema = z.enum(["install-missing", "install-and-upgrade"]);
export const appIdSchema = z
	.string()
	.min(1)
	.max(80)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const profileSlugSchema = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const providerSchema = z
	.object({
		platform: platformSchema,
		provider: z.string().min(1).max(40),
		packageId: z.string().min(1).max(200),
	})
	.strict();

export const catalogAppSchema = z
	.object({
		id: appIdSchema,
		slug: appIdSchema,
		name: z.string().min(1).max(100),
		description: z.string().min(1).max(1000),
		category: z.string().min(1).max(80),
		publisher: z.string().min(1).max(100),
		homepage: z.url(),
		sourceUrl: z.url(),
		iconUrl: z.url().nullable().optional(),
		platforms: z.array(platformSchema),
		providers: z.array(providerSchema),
	})
	.strict();

export const profileSchema = z
	.object({
		slug: profileSlugSchema,
		name: z.string().min(1).max(80),
		description: z.string().min(1).max(500).optional(),
		policy: policySchema,
		apps: z.array(catalogAppSchema),
		createdAt: z.iso.datetime(),
	})
	.strict();

export const catalogListInputSchema = z
	.object({
		query: z.string().trim().min(1).max(100).optional(),
		platform: platformSchema.optional(),
		category: z.string().trim().min(1).max(80).optional(),
	})
	.strict();

export const catalogListOutputSchema = z
	.object({
		items: z.array(catalogAppSchema),
		categories: z.array(z.string().min(1).max(80)),
		total: z.number().int().nonnegative(),
	})
	.strict();

export const profileCreateInputSchema = z
	.object({
		name: z.string().trim().min(1).max(80),
		description: z.string().trim().min(1).max(500).optional(),
		appIds: z
			.array(appIdSchema)
			.min(1)
			.max(50)
			.refine(
				(ids) => new Set(ids).size === ids.length,
				"appIds must be unique",
			),
		policy: policySchema,
	})
	.strict();

export const profileGetInputSchema = z
	.object({ slug: profileSlugSchema })
	.strict();

export const installPlanInputSchema = z
	.object({
		profileSlug: profileSlugSchema,
		platform: platformSchema,
	})
	.strict();

export const installPlanStepSchema = z
	.object({
		appId: appIdSchema,
		appName: z.string().min(1).max(100),
		provider: z.string().min(1).max(40).nullable(),
		packageId: z.string().min(1).max(200).nullable(),
		supported: z.boolean(),
		reason: z.string().min(1).max(200).optional(),
	})
	.strict();

export const installPlanOutputSchema = z
	.object({
		profileSlug: profileSlugSchema,
		platform: platformSchema,
		steps: z.array(installPlanStepSchema),
		supportedCount: z.number().int().nonnegative(),
		unsupportedCount: z.number().int().nonnegative(),
	})
	.strict();

export type Platform = z.infer<typeof platformSchema>;
export type InstallPlan = z.infer<typeof installPlanOutputSchema>;

export function createInstallPlan(
	profile: ProfileRecord,
	platform: Platform,
): InstallPlan {
	const steps = profile.apps.map((app) => {
		const mapping = app.providers.find(
			(provider) => provider.platform === platform,
		);
		if (!mapping) {
			return {
				appId: app.id,
				appName: app.name,
				provider: null,
				packageId: null,
				supported: false,
				reason: `No curated provider mapping for ${platform}`,
			};
		}

		return {
			appId: app.id,
			appName: app.name,
			provider: mapping.provider,
			packageId: mapping.packageId,
			supported: true,
		};
	});
	const supportedCount = steps.filter((step) => step.supported).length;

	return {
		profileSlug: profile.slug,
		platform,
		steps,
		supportedCount,
		unsupportedCount: steps.length - supportedCount,
	};
}
