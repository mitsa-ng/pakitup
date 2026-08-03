import { asc, eq, inArray } from "drizzle-orm";

import type { Database } from "./index";
import {
	appProviders,
	catalogApps,
	type platformValues,
	profileApps,
	type profilePolicyValues,
	profiles,
} from "./schema";

export type Platform = (typeof platformValues)[number];
export type ProfilePolicy = (typeof profilePolicyValues)[number];

export type ProviderRecord = {
	platform: Platform;
	provider: string;
	packageId: string;
};

export type CatalogAppRecord = {
	id: string;
	slug: string;
	name: string;
	description: string;
	category: string;
	publisher: string;
	homepage: string;
	sourceUrl: string;
	iconUrl: string | null;
	platforms: Platform[];
	providers: ProviderRecord[];
};

export type ProfileRecord = {
	slug: string;
	name: string;
	description?: string;
	policy: ProfilePolicy;
	apps: CatalogAppRecord[];
	createdAt: string;
};

export class UnknownCatalogAppsError extends Error {
	readonly appIds: string[];

	constructor(appIds: string[]) {
		super("One or more catalog application identifiers are unknown");
		this.name = "UnknownCatalogAppsError";
		this.appIds = appIds;
	}
}

type FlatCatalogRow = {
	id: string;
	slug: string;
	name: string;
	description: string;
	category: string;
	publisher: string;
	homepage: string;
	sourceUrl: string;
	iconUrl: string | null;
	providerPlatform: Platform | null;
	provider: string | null;
	packageId: string | null;
};

function groupCatalogRows(rows: FlatCatalogRow[]): CatalogAppRecord[] {
	const grouped = new Map<string, CatalogAppRecord>();

	for (const row of rows) {
		let app = grouped.get(row.id);
		if (!app) {
			app = {
				id: row.id,
				slug: row.slug,
				name: row.name,
				description: row.description,
				category: row.category,
				publisher: row.publisher,
				homepage: row.homepage,
				sourceUrl: row.sourceUrl,
				iconUrl: row.iconUrl,
				platforms: [],
				providers: [],
			};
			grouped.set(row.id, app);
		}

		if (row.providerPlatform && row.provider && row.packageId) {
			app.platforms.push(row.providerPlatform);
			app.providers.push({
				platform: row.providerPlatform,
				provider: row.provider,
				packageId: row.packageId,
			});
		}
	}

	return [...grouped.values()];
}

const catalogSelection = {
	id: catalogApps.id,
	slug: catalogApps.slug,
	name: catalogApps.name,
	description: catalogApps.description,
	category: catalogApps.category,
	publisher: catalogApps.publisher,
	homepage: catalogApps.homepage,
	sourceUrl: catalogApps.sourceUrl,
	iconUrl: catalogApps.iconUrl,
	providerPlatform: appProviders.platform,
	provider: appProviders.provider,
	packageId: appProviders.packageId,
};

export async function listCatalogApps(
	db: Database,
	filters: { query?: string; platform?: Platform; category?: string },
) {
	const rows = await db
		.select(catalogSelection)
		.from(catalogApps)
		.leftJoin(appProviders, eq(appProviders.appId, catalogApps.id))
		.orderBy(asc(catalogApps.name), asc(appProviders.platform));

	const query = filters.query?.toLocaleLowerCase();
	const items = groupCatalogRows(rows).filter((app) => {
		if (filters.platform && !app.platforms.includes(filters.platform))
			return false;
		if (filters.category && app.category !== filters.category) return false;
		if (!query) return true;

		return [app.name, app.description, app.category, app.publisher].some(
			(value) => value.toLocaleLowerCase().includes(query),
		);
	});

	return {
		items,
		categories: [...new Set(items.map((item) => item.category))].sort(),
		total: items.length,
	};
}

export function createProfileSlug(
	name: string,
	randomId = crypto.randomUUID(),
) {
	const base = name
		.normalize("NFKD")
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40);
	return `${base || "profile"}-${randomId.replaceAll("-", "").slice(0, 10)}`;
}

export async function createProfileRecord(
	db: Database,
	input: {
		name: string;
		description?: string;
		appIds: string[];
		policy: ProfilePolicy;
	},
): Promise<ProfileRecord> {
	const existingApps = await db
		.select({ id: catalogApps.id })
		.from(catalogApps)
		.where(inArray(catalogApps.id, input.appIds));
	const existingIds = new Set(existingApps.map((app) => app.id));
	const missingIds = input.appIds.filter((appId) => !existingIds.has(appId));
	if (missingIds.length > 0) throw new UnknownCatalogAppsError(missingIds);

	const id = crypto.randomUUID();
	const slug = createProfileSlug(input.name);
	const createdAt = new Date();

	await db.batch([
		db.insert(profiles).values({
			id,
			slug,
			name: input.name,
			description: input.description,
			policy: input.policy,
			createdAt,
		}),
		db.insert(profileApps).values(
			input.appIds.map((appId, position) => ({
				profileId: id,
				appId,
				position,
			})),
		),
	]);

	const profile = await getProfileRecord(db, slug);
	if (!profile) throw new Error("Profile was created but could not be loaded");
	return profile;
}

export async function getProfileRecord(
	db: Database,
	slug: string,
): Promise<ProfileRecord | null> {
	const [profile] = await db
		.select({
			id: profiles.id,
			slug: profiles.slug,
			name: profiles.name,
			description: profiles.description,
			policy: profiles.policy,
			createdAt: profiles.createdAt,
		})
		.from(profiles)
		.where(eq(profiles.slug, slug))
		.limit(1);

	if (!profile) return null;

	const rows = await db
		.select(catalogSelection)
		.from(profileApps)
		.innerJoin(catalogApps, eq(catalogApps.id, profileApps.appId))
		.leftJoin(appProviders, eq(appProviders.appId, catalogApps.id))
		.where(eq(profileApps.profileId, profile.id))
		.orderBy(asc(profileApps.position), asc(appProviders.platform));

	return {
		slug: profile.slug,
		name: profile.name,
		...(profile.description ? { description: profile.description } : {}),
		policy: profile.policy,
		apps: groupCatalogRows(rows),
		createdAt: profile.createdAt.toISOString(),
	};
}
