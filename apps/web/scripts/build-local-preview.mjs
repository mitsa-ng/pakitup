import { spawnSync } from "node:child_process";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpmCommand, ["exec", "vite", "build"], {
	stdio: "inherit",
	env: {
		...process.env,
		VITE_SERVER_URL: "http://localhost:3001",
	},
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
