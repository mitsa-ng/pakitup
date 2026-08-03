import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@pakitup/api/context";
import { PROFILE_CREATE_RATE_LIMIT_WINDOW_SECONDS } from "@pakitup/api/rate-limit";
import { appRouter } from "@pakitup/api/routers/index";
import { parseServerEnv } from "@pakitup/env/server";
import { initLogger } from "evlog";
import { type EvlogVariables, evlog } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { createProfileRateLimitKey } from "./rate-limit";

initLogger({
	env: { service: "pakitup-server" },
});

type AppEnvironment = {
	Bindings: {
		DATABASE_URL: string;
		CORS_ORIGIN: string;
		PROFILE_CREATE_RATE_LIMIT: {
			limit(options: { key: string }): Promise<{ success: boolean }>;
		};
		RATE_LIMIT_KEY_PREFIX: string;
		RATE_LIMIT_KEY_SECRET: string;
	};
	Variables: EvlogVariables["Variables"] & { requestId: string };
};

const app = new Hono<AppEnvironment>();

app.use(evlog());

app.use("/*", async (c, next) => {
	const incomingRequestId = c.req.header("x-request-id");
	const requestId =
		incomingRequestId && /^[A-Za-z0-9._-]{1,100}$/.test(incomingRequestId)
			? incomingRequestId
			: crypto.randomUUID();
	c.set("requestId", requestId);
	c.header("x-request-id", requestId);
	await next();
});

app.use(
	"/*",
	cors({
		origin: (origin, c) => {
			const { CORS_ORIGIN } = parseServerEnv(c.env);
			return CORS_ORIGIN.includes(origin) ? origin : null;
		},
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
		exposeHeaders: ["X-Request-Id"],
		credentials: true,
		maxAge: 600,
	}),
);

app.use("/*", async (c, next) => {
	await next();
	if (c.res.status === 429) {
		c.header("Retry-After", String(PROFILE_CREATE_RATE_LIMIT_WINDOW_SECONDS));
	}
});

function reportRpcError(error: unknown) {
	console.error(
		JSON.stringify({
			event: "rpc_error",
			message: error instanceof Error ? error.message : "Unknown error",
		}),
	);
}

export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
			docsTitle: "Pakitup API",
		}),
	],
	interceptors: [
		onError((error) => {
			reportRpcError(error);
		}),
	],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			reportRpcError(error);
		}),
	],
});

app.use("/*", async (c, next) => {
	const environment = parseServerEnv(c.env);
	const context = createContext({
		databaseUrl: environment.DATABASE_URL,
		profileCreateRateLimit: c.env.PROFILE_CREATE_RATE_LIMIT,
		profileCreateRateLimitKey: await createProfileRateLimitKey(
			c.req.raw,
			environment.RATE_LIMIT_KEY_PREFIX,
			environment.RATE_LIMIT_KEY_SECRET,
		),
	});

	const rpcResult = await rpcHandler.handle(c.req.raw, {
		prefix: "/rpc",
		context: context,
	});

	if (rpcResult.matched) {
		return c.newResponse(rpcResult.response.body, rpcResult.response);
	}

	const apiResult = await apiHandler.handle(c.req.raw, {
		prefix: "/api",
		context: context,
	});

	if (apiResult.matched) {
		return c.newResponse(apiResult.response.body, apiResult.response);
	}

	await next();
});

app.get("/", (c) => {
	return c.json({ status: "ok", service: "pakitup-server" });
});

app.notFound((c) =>
	c.json(
		{
			error: {
				code: "NOT_FOUND",
				message: "Route not found",
				requestId: c.get("requestId"),
			},
		},
		404,
	),
);

app.onError((error, c) => {
	reportRpcError(error);
	return c.json(
		{
			error: {
				code: "INTERNAL_SERVER_ERROR",
				message: "Internal server error",
				requestId: c.get("requestId"),
			},
		},
		500,
	);
});

export default app;
