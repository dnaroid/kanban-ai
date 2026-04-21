import fs from "fs";
import { defineConfig, devices } from "@playwright/test";
import os from "os";
import path from "path";

const envFilePath = path.resolve(process.cwd(), ".env.e2e");
if (typeof process.loadEnvFile === "function" && fs.existsSync(envFilePath)) {
	process.loadEnvFile(envFilePath);
}

if (!process.env.DB_PATH) {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-e2e-"));
	process.env.DB_PATH = path.join(tempDir, "test.db");
}

export default defineConfig({
	testDir: "./e2e/tests",
	globalSetup: "./e2e/fixtures/global-setup.ts",
	globalTeardown: "./e2e/fixtures/global-teardown.ts",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: [["list"], ["html", { open: "never" }]],
	outputDir: "e2e/results",

	use: {
		baseURL: process.env.E2E_APP_URL || "http://127.0.0.1:3100",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],

	webServer: {
		command: "pnpm dev",
		url: "http://127.0.0.1:3100",
		reuseExistingServer: false,
		timeout: 60_000,
		env: {
			...process.env,
			DB_PATH: process.env.DB_PATH || "",
			AI_RUNTIME_MODE: process.env.AI_RUNTIME_MODE || "fake",
			NEXT_PUBLIC_API_URL: "http://127.0.0.1:3000",
			NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
		},
	},
});
