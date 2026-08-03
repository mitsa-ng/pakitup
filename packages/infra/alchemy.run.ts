import alchemy from "alchemy";
import { RateLimit, Vite, Worker } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const app = await alchemy("pakitup");
const databaseUrl = alchemy.secret.env.DATABASE_URL;
const corsOrigin = alchemy.env.CORS_ORIGIN;
const rateLimitKeySecret = alchemy.secret.env.RATE_LIMIT_KEY_SECRET;
if (!databaseUrl) {
	throw new Error("DATABASE_URL is required");
}
if (!corsOrigin) {
	throw new Error("CORS_ORIGIN is required");
}
if (!rateLimitKeySecret) {
	throw new Error("RATE_LIMIT_KEY_SECRET is required");
}

const profileCreateRateLimit = RateLimit({
	namespace_id: 2026080301,
	simple: {
		limit: 10,
		period: 60,
	},
});

export const server = await Worker("server", {
	cwd: "../../apps/server",
	entrypoint: "src/index.ts",
	compatibility: "node",
	url: true,
	bindings: {
		DATABASE_URL: databaseUrl,
		CORS_ORIGIN: corsOrigin,
		PROFILE_CREATE_RATE_LIMIT: profileCreateRateLimit,
		RATE_LIMIT_KEY_PREFIX: `pakitup:${app.stage}:profiles.create`,
		RATE_LIMIT_KEY_SECRET: rateLimitKeySecret,
	},
	dev: {
		port: 3000,
	},
});

if (!server.url) {
	throw new Error("server URL was not provisioned");
}

export const web = await Vite("web", {
	cwd: "../../apps/web",
	assets: "dist",
	bindings: {
		VITE_SERVER_URL: server.url,
	},
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
