import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "packages/next-js/src"),
		},
	},
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["./vitest.setup.ts"],
		include: ["packages/*/src/**/*.{test,spec}.{ts,tsx}"],
		exclude: ["node_modules/**", "dist/**"],
	},
});
