function getClientIdentity(request: Request): string {
	const cloudflareConnectingIp = request.headers
		.get("cf-connecting-ip")
		?.trim();
	if (cloudflareConnectingIp) {
		return `cf:${cloudflareConnectingIp}`;
	}

	return "unknown";
}

export async function createProfileRateLimitKey(
	request: Request,
	prefix: string,
	secret: string,
): Promise<string> {
	const identity = getClientIdentity(request);
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const digest = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(`${prefix}:${identity}`),
	);

	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}
