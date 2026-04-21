import fs from "fs";
import path from "path";

async function globalSetup() {
	const dbPath = process.env.DB_PATH;
	if (!dbPath) {
		throw new Error(
			"DB_PATH is not set — playwright.config.ts should have configured it",
		);
	}

	const tempDir = path.dirname(dbPath);

	process.env.AI_RUNTIME_MODE = "fake";
	process.env.AI_RUNTIME_FAKE_SCENARIO =
		process.env.AI_RUNTIME_FAKE_SCENARIO || "happy-path";
	process.env.NODE_ENV = "test";

	fs.writeFileSync(
		path.join(tempDir, ".e2e-meta"),
		JSON.stringify({ dbPath, tempDir }),
	);

	console.log(`[E2E Global Setup] DB: ${dbPath}`);
}

export default globalSetup;
