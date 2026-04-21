import fs from "fs";
import os from "os";
import path from "path";

const envFilePath = path.resolve(process.cwd(), ".env.e2e");
if (typeof process.loadEnvFile === "function" && fs.existsSync(envFilePath)) {
	process.loadEnvFile(envFilePath);
}

async function globalSetup() {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-e2e-"));
	const dbPath = path.join(tempDir, "test.db");

	process.env.DB_PATH = dbPath;
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
