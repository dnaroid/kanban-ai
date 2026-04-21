import fs from "fs";
import os from "os";
import path from "path";

async function globalTeardown() {
	const tmpDir = os.tmpdir();
	const entries = fs.readdirSync(tmpDir);

	for (const entry of entries) {
		if (!entry.startsWith("kanban-e2e-")) {
			continue;
		}

		const fullPath = path.join(tmpDir, entry);
		try {
			for (const file of fs.readdirSync(fullPath)) {
				fs.unlinkSync(path.join(fullPath, file));
			}
			fs.rmdirSync(fullPath);
			console.log(`[E2E Global Teardown] Cleaned up: ${fullPath}`);
		} catch (error) {
			console.warn(`[E2E Global Teardown] Failed to clean ${fullPath}:`, error);
		}
	}
}

export default globalTeardown;
