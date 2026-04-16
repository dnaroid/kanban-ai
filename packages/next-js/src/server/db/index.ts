export { DatabaseManager } from "./DatabaseManager";
export { INIT_DB_SQL, v017SystemKeySql, v018AppMetricsSql } from "./migrations";

import { DatabaseManager } from "./DatabaseManager";
import * as path from "path";

const dbPath =
	process.env.DB_PATH || path.join(process.cwd(), "..", "..", "kanban-ai.db");

// globalThis singleton survives Next.js dev server module recreation / HMR
const globalKey = "__kanban_ai_db_manager__" as const;

export const dbManager: DatabaseManager =
	(globalThis as unknown as Record<string, DatabaseManager>)[globalKey] ??
	(() => {
		const instance = new DatabaseManager(dbPath);
		(globalThis as unknown as Record<string, DatabaseManager>)[globalKey] =
			instance;
		return instance;
	})();
