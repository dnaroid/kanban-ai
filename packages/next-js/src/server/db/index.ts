export { DatabaseManager } from "./DatabaseManager";
export { INIT_DB_SQL, v017SystemKeySql, v018AppMetricsSql } from "./migrations";

import { DatabaseManager } from "./DatabaseManager";
import * as path from "node:path";

const dbPath = process.env.DB_PATH || path.join(process.cwd(), "kanban-ai.db");

export const dbManager = new DatabaseManager(dbPath);
