import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
	test: {
		globals: true,
		environment: "jsdom",
		include: ["src/**/*.test.{ts,tsx}"],
		setupFiles: ["src/test-setup.ts"],
		alias: {
			"@pi-fleet/shared": new URL("../shared/src/index.ts", import.meta.url)
				.pathname,
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
