import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { z } from "zod";

import * as schema from "./schema";

const databaseUrlSchema = z
	.string()
	.url()
	.refine((value) => {
		const protocol = new URL(value).protocol;
		return protocol === "postgres:" || protocol === "postgresql:";
	}, "DATABASE_URL must use the postgres or postgresql protocol");

export function createDb(databaseUrl: string) {
	const sql = neon(databaseUrlSchema.parse(databaseUrl));
	return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
export * from "./repositories";
export * from "./schema";
