import { ORPCError, type RouterClient } from "@orpc/server";
import {
	createProfileRecord,
	getProfileRecord,
	listCatalogApps,
	UnknownCatalogAppsError,
} from "@pakitup/db";
import { z } from "zod";
import {
	catalogListInputSchema,
	catalogListOutputSchema,
	createInstallPlan,
	installPlanInputSchema,
	installPlanOutputSchema,
	profileCreateInputSchema,
	profileGetInputSchema,
	profileSchema,
} from "../domain";
import { publicProcedure } from "../index";
import { enforceProfileCreateRateLimit } from "../rate-limit";

const notFound = () =>
	new ORPCError("NOT_FOUND", {
		message: "Profile not found",
	});

export const appRouter = {
	healthCheck: publicProcedure
		.route({ method: "GET", path: "/health" })
		.output(z.object({ status: z.literal("ok") }).strict())
		.handler(() => ({ status: "ok" as const })),
	catalog: {
		list: publicProcedure
			.route({ method: "GET", path: "/catalog" })
			.input(catalogListInputSchema)
			.output(catalogListOutputSchema)
			.handler(({ context, input }) => listCatalogApps(context.db, input)),
	},
	profiles: {
		create: publicProcedure
			.route({ method: "POST", path: "/profiles" })
			.input(profileCreateInputSchema)
			.output(profileSchema)
			.handler(async ({ context, input }) => {
				await enforceProfileCreateRateLimit(
					context.profileCreateRateLimit,
					context.profileCreateRateLimitKey,
				);

				try {
					return await createProfileRecord(context.db, input);
				} catch (error) {
					if (error instanceof UnknownCatalogAppsError) {
						throw new ORPCError("BAD_REQUEST", {
							message: error.message,
							data: { appIds: error.appIds },
						});
					}
					throw error;
				}
			}),
		get: publicProcedure
			.route({ method: "GET", path: "/profiles/{slug}" })
			.input(profileGetInputSchema)
			.output(profileSchema)
			.handler(async ({ context, input }) => {
				const profile = await getProfileRecord(context.db, input.slug);
				if (!profile) throw notFound();
				return profile;
			}),
	},
	plans: {
		create: publicProcedure
			.route({ method: "POST", path: "/plans" })
			.input(installPlanInputSchema)
			.output(installPlanOutputSchema)
			.handler(async ({ context, input }) => {
				const profile = await getProfileRecord(context.db, input.profileSlug);
				if (!profile) throw notFound();
				return createInstallPlan(profile, input.platform);
			}),
	},
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
