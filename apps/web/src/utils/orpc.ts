import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@pakitup/api/routers/index";
import { env } from "@pakitup/env/web";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function createQueryClient() {
	return new QueryClient({
		queryCache: new QueryCache({
			onError: (error, query) => {
				toast.error(`Error: ${error.message}`, {
					action: {
						label: "retry",
						onClick: () => {
							query.invalidate();
						},
					},
				});
			},
		}),
	});
}

export const queryClient = createQueryClient();

export const DEFAULT_RPC_TIMEOUT_MS = 15_000;

type FetchImplementation = (
	request: Request,
	init?: RequestInit,
) => Promise<Response>;

/**
 * Adds a bounded failure mode to API requests without dropping a caller's
 * cancellation signal. This keeps a blocked desktop CSP/network request from
 * leaving the catalog in a permanent loading state.
 */
export function createTimedFetch(
	fetchImplementation: FetchImplementation = globalThis.fetch.bind(globalThis),
	timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
): FetchImplementation {
	return async (request, init) => {
		const callerSignal = init?.signal ?? request.signal;
		const controller = new AbortController();
		let timedOut = false;
		const relayCallerAbort = () => controller.abort(callerSignal?.reason);

		if (callerSignal?.aborted) relayCallerAbort();
		else
			callerSignal?.addEventListener("abort", relayCallerAbort, { once: true });

		const timeout = setTimeout(() => {
			timedOut = true;
			controller.abort(
				new DOMException("The API request timed out", "TimeoutError"),
			);
		}, timeoutMs);

		try {
			return await fetchImplementation(request, {
				...init,
				signal: controller.signal,
			});
		} catch (error) {
			if (timedOut) {
				throw new Error(`Pakitup API request timed out after ${timeoutMs}ms`, {
					cause: error,
				});
			}
			throw error;
		} finally {
			clearTimeout(timeout);
			callerSignal?.removeEventListener("abort", relayCallerAbort);
		}
	};
}

function getServerUrl(url: string) {
	const normalized = url.endsWith("/") ? url.slice(0, -1) : url;

	if (!normalized.startsWith("/")) {
		return normalized;
	}

	if (typeof window !== "undefined") {
		return `${window.location.origin}${normalized}`;
	}

	const processEnv = (
		globalThis as {
			process?: { env?: Record<string, string | undefined> };
		}
	).process?.env;
	const vercelUrl =
		processEnv?.VERCEL_ENV === "production"
			? (processEnv?.VERCEL_PROJECT_PRODUCTION_URL ?? processEnv?.VERCEL_URL)
			: (processEnv?.VERCEL_URL ?? processEnv?.VERCEL_PROJECT_PRODUCTION_URL);
	if (vercelUrl) {
		const origin = vercelUrl.startsWith("http")
			? vercelUrl
			: `https://${vercelUrl}`;
		return `${origin}${normalized}`;
	}

	return `http://localhost:3000${normalized}`;
}
export const link = new RPCLink({
	url: `${getServerUrl(env.VITE_SERVER_URL)}/rpc`,
	fetch: createTimedFetch(),
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
