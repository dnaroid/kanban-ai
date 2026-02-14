import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@shared": path.resolve(__dirname, "packages/shared/src"),
			"@server": path.resolve(__dirname, "packages/server/src"),
			"@web": path.resolve(__dirname, "packages/web/src"),
			electron: path.resolve(
				__dirname,
				"packages/server/src/__mocks__/electron.ts",
			),
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
