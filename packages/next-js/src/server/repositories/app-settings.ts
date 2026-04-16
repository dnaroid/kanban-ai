import type Database from "better-sqlite3";
import { dbManager } from "../db";

export interface AppSetting {
	key: string;
	value: string;
	updatedAt: string;
}

export class AppSettingsRepository {
	constructor(private db: Database.Database) {}

	get(key: string): string | null {
		const stmt = this.db.prepare(`
      SELECT value FROM app_settings WHERE key = ?
    `);
		const row = stmt.get(key) as { value: string } | undefined;
		return row?.value ?? null;
	}

	set(key: string, value: string): void {
		const now = new Date().toISOString();

		const stmt = this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);

		stmt.run(key, value, now);
	}

	getLastProjectId(): string | null {
		return this.get("lastProjectId");
	}

	setLastProjectId(projectId: string): void {
		this.set("lastProjectId", projectId);
	}

	getSidebarCollapsed(): boolean {
		return this.get("sidebarCollapsed") === "true";
	}

	setSidebarCollapsed(collapsed: boolean): void {
		this.set("sidebarCollapsed", collapsed ? "true" : "false");
	}
}

export const appSettingsRepo = new AppSettingsRepository(dbManager.connect());
