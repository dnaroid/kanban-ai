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
			(
				fs as unknown as {
					rmSync: (
						targetPath: string,
						options?: { recursive?: boolean; force?: boolean },
					) => void;
				}
			).rmSync(fullPath, { recursive: true, force: true });
			console.log(`[E2E Global Teardown] Cleaned up: ${fullPath}`);
		} catch (error) {
			console.warn(`[E2E Global Teardown] Failed to clean ${fullPath}:`, error);
		}
	}
}

export default globalTeardown;
