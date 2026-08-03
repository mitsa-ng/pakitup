const WORKERS_SUBDOMAIN_PATTERN =
	/^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

interface AlchemyDeploymentScope {
	stage: string;
	phase: "up" | "destroy" | "read";
	local: boolean;
}

export function validateCloudflareWorkersSubdomain(value: string): string {
	if (!WORKERS_SUBDOMAIN_PATTERN.test(value)) {
		throw new Error(
			"CLOUDFLARE_WORKERS_SUBDOMAIN must be a lowercase DNS label of 1-63 letters, digits, or interior hyphens",
		);
	}
	return value;
}

export function requireCloudflareWorkersSubdomainForProduction(
	scope: AlchemyDeploymentScope,
	value: string | undefined,
): string | undefined {
	if (scope.stage === "prod" && scope.phase === "up" && !scope.local) {
		throw new Error(
			'The Alchemy stage "prod" is forbidden; use the authoritative "production" stage to avoid creating a second resource set',
		);
	}
	if (scope.stage !== "production" || scope.phase !== "up" || scope.local) {
		return undefined;
	}
	if (value === undefined) {
		throw new Error(
			"CLOUDFLARE_WORKERS_SUBDOMAIN is required for a production deploy because the current OAuth token cannot read the account workers.dev subdomain",
		);
	}
	return validateCloudflareWorkersSubdomain(value);
}
