import { describe, expect, test } from "bun:test";

process.env.VITE_SERVER_URL = "http://localhost:3000";

const { createTimedFetch } = await import("./orpc.ts");

describe("createTimedFetch", () => {
	test("rejects a hanging request with an explicit timeout", async () => {
		const fetchWithTimeout = createTimedFetch(
			(_request, init) =>
				new Promise((_, reject) => {
					init.signal.addEventListener(
						"abort",
						() => reject(init.signal.reason),
						{
							once: true,
						},
					);
				}),
			10,
		);

		await expect(
			fetchWithTimeout(new Request("https://api.example.test/rpc")),
		).rejects.toThrow("Pakitup API request timed out after 10ms");
	});

	test("relays a caller abort without replacing it with a timeout", async () => {
		const caller = new AbortController();
		const fetchWithTimeout = createTimedFetch(
			(_request, init) =>
				new Promise((_, reject) => {
					init.signal.addEventListener(
						"abort",
						() => reject(init.signal.reason),
						{
							once: true,
						},
					);
				}),
			1_000,
		);
		const pending = fetchWithTimeout(
			new Request("https://api.example.test/rpc", { signal: caller.signal }),
		);
		caller.abort(new Error("caller cancelled"));

		await expect(pending).rejects.toThrow("caller cancelled");
	});
});
