CREATE TYPE "public"."platform" AS ENUM('windows', 'macos', 'linux', 'android');--> statement-breakpoint
CREATE TYPE "public"."profile_policy" AS ENUM('install-missing', 'install-and-upgrade');--> statement-breakpoint
CREATE TABLE "app_providers" (
	"app_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"provider" text NOT NULL,
	"package_id" text NOT NULL,
	CONSTRAINT "app_providers_app_id_platform_pk" PRIMARY KEY("app_id","platform"),
	CONSTRAINT "app_providers_provider_length" CHECK (char_length("app_providers"."provider") BETWEEN 1 AND 40),
	CONSTRAINT "app_providers_package_id_length" CHECK (char_length("app_providers"."package_id") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "catalog_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"publisher" text NOT NULL,
	"homepage" text NOT NULL,
	"source_url" text NOT NULL,
	"icon_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_apps_id_format" CHECK ("catalog_apps"."id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "catalog_apps_slug_format" CHECK ("catalog_apps"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "catalog_apps_name_length" CHECK (char_length("catalog_apps"."name") BETWEEN 1 AND 100),
	CONSTRAINT "catalog_apps_description_length" CHECK (char_length("catalog_apps"."description") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "profile_apps" (
	"profile_id" uuid NOT NULL,
	"app_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "profile_apps_profile_id_app_id_pk" PRIMARY KEY("profile_id","app_id"),
	CONSTRAINT "profile_apps_position_nonnegative" CHECK ("profile_apps"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"policy" "profile_policy" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_slug_format" CHECK ("profiles"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "profiles_name_length" CHECK (char_length("profiles"."name") BETWEEN 1 AND 80),
	CONSTRAINT "profiles_description_length" CHECK ("profiles"."description" IS NULL OR char_length("profiles"."description") BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "app_providers" ADD CONSTRAINT "app_providers_app_id_catalog_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."catalog_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_apps" ADD CONSTRAINT "profile_apps_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_apps" ADD CONSTRAINT "profile_apps_app_id_catalog_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."catalog_apps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_providers_platform_idx" ON "app_providers" USING btree ("platform");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_apps_slug_key" ON "catalog_apps" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "catalog_apps_category_idx" ON "catalog_apps" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_apps_profile_position_key" ON "profile_apps" USING btree ("profile_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_slug_key" ON "profiles" USING btree ("slug");