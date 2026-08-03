import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const platformValues = ["windows", "macos", "linux", "android"] as const;
export const profilePolicyValues = [
	"install-missing",
	"install-and-upgrade",
] as const;

export const platformEnum = pgEnum("platform", platformValues);
export const profilePolicyEnum = pgEnum("profile_policy", profilePolicyValues);

export const catalogApps = pgTable(
	"catalog_apps",
	{
		id: text("id").primaryKey(),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		description: text("description").notNull(),
		category: text("category").notNull(),
		publisher: text("publisher").notNull(),
		homepage: text("homepage").notNull(),
		sourceUrl: text("source_url").notNull(),
		iconUrl: text("icon_url"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("catalog_apps_slug_key").on(table.slug),
		index("catalog_apps_category_idx").on(table.category),
		check(
			"catalog_apps_id_format",
			sql`${table.id} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
		),
		check(
			"catalog_apps_slug_format",
			sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
		),
		check(
			"catalog_apps_name_length",
			sql`char_length(${table.name}) BETWEEN 1 AND 100`,
		),
		check(
			"catalog_apps_description_length",
			sql`char_length(${table.description}) BETWEEN 1 AND 1000`,
		),
	],
);

export const appProviders = pgTable(
	"app_providers",
	{
		appId: text("app_id")
			.notNull()
			.references(() => catalogApps.id, { onDelete: "cascade" }),
		platform: platformEnum("platform").notNull(),
		provider: text("provider").notNull(),
		packageId: text("package_id").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.appId, table.platform] }),
		index("app_providers_platform_idx").on(table.platform),
		check(
			"app_providers_provider_length",
			sql`char_length(${table.provider}) BETWEEN 1 AND 40`,
		),
		check(
			"app_providers_package_id_length",
			sql`char_length(${table.packageId}) BETWEEN 1 AND 200`,
		),
	],
);

export const profiles = pgTable(
	"profiles",
	{
		id: uuid("id").primaryKey(),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		description: text("description"),
		policy: profilePolicyEnum("policy").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("profiles_slug_key").on(table.slug),
		check(
			"profiles_slug_format",
			sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
		),
		check(
			"profiles_name_length",
			sql`char_length(${table.name}) BETWEEN 1 AND 80`,
		),
		check(
			"profiles_description_length",
			sql`${table.description} IS NULL OR char_length(${table.description}) BETWEEN 1 AND 500`,
		),
	],
);

export const profileApps = pgTable(
	"profile_apps",
	{
		profileId: uuid("profile_id")
			.notNull()
			.references(() => profiles.id, { onDelete: "cascade" }),
		appId: text("app_id")
			.notNull()
			.references(() => catalogApps.id, { onDelete: "restrict" }),
		position: integer("position").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.profileId, table.appId] }),
		uniqueIndex("profile_apps_profile_position_key").on(
			table.profileId,
			table.position,
		),
		check("profile_apps_position_nonnegative", sql`${table.position} >= 0`),
	],
);
