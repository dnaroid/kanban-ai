import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { INIT_DB_SQL, migrations } from "./migrations";

export class DatabaseManager {
	private db: Database.Database | null = null;
	private dbPath: string;

	constructor(dbPath: string) {
		this.dbPath = dbPath;
	}

	connect(): Database.Database {
		if (this.db) {
			return this.db;
		}

		const isNewDb = !fs.existsSync(this.dbPath);
		const dbDir = path.dirname(this.dbPath);

		if (!fs.existsSync(dbDir)) {
			fs.mkdirSync(dbDir, { recursive: true });
		}

		this.db = new Database(this.dbPath);
		this.db.pragma("journal_mode = WAL");

		if (isNewDb) {
			this.runInitSql();
		} else {
			this.runMigrations();
		}
		this.seedAgentRoles();

		console.log("[DB] Connected to database:", this.dbPath);

		return this.db;
	}

	disconnect(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}

	deleteDatabase(): void {
		this.disconnect();

		const dbFiles = [this.dbPath, `${this.dbPath}-wal`, `${this.dbPath}-shm`];
		for (const filePath of dbFiles) {
			if (fs.existsSync(filePath)) {
				fs.rmSync(filePath, { force: true });
			}
		}
	}

	private runMigrations(): void {
		if (!this.db) return;

		// Ensure schema_migrations table exists
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations
      (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

		const currentVersion = this.db
			.prepare("SELECT MAX(version) as version FROM schema_migrations")
			.get() as { version: number | null };
		const maxVersion = currentVersion.version ?? -1;
		console.log("[DB] Current max schema version:", maxVersion);

		for (const migration of migrations) {
			if (migration.version > maxVersion) {
				console.log("[DB] Running migration version:", migration.version);
				const tx = this.db.transaction(() => {
					this.db!.exec(migration.sql);
					this.db!.prepare(
						"INSERT INTO schema_migrations (version) VALUES (?)",
					).run(migration.version);
				});
				tx();
				console.log("[DB] Migration version", migration.version, "completed");
			}
		}

		const finalVersion = this.db
			.prepare("SELECT MAX(version) as version FROM schema_migrations")
			.get() as { version: number | null };
		console.log("[DB] Final max schema version:", finalVersion.version);
	}

	private runInitSql(): void {
		if (!this.db) return;

		this.db.exec(INIT_DB_SQL);

		const latestVersion = migrations[migrations.length - 1]?.version ?? 0;
		this.db
			.prepare("INSERT INTO schema_migrations (version) VALUES (?)")
			.run(latestVersion);
	}

	private seedAgentRoles(): void {
		if (!this.db) return;

		const row = this.db
			.prepare("SELECT COUNT(*) as count FROM agent_roles")
			.get() as {
			count: number;
		};
		if (row.count > 0) {
			return;
		}

		const now = new Date().toISOString();
		const insert = this.db.prepare(
			`INSERT INTO agent_roles
        (id, name, description, preset_json, created_at, updated_at)
        VALUES (@id, @name, @description, @preset_json, @created_at, @updated_at)`,
		);

		const roles = [
			{
				id: "ba",
				name: "BA",
				description: "Business Analyst",
				preset_json: JSON.stringify({
					output: "markdown",
					template:
						"User Story\n- As a ...\n- I want ...\n- So that ...\n\n" +
						"Acceptance Criteria\n- ...\n\n" +
						"Edge Cases\n- ...\n\n" +
						"Questions/Assumptions\n- ...",
				}),
			},
			{
				id: "dev",
				name: "DEV",
				description: "Developer",
				preset_json: JSON.stringify({
					output: "markdown",
					template:
						"Implementation Plan\n- Files/modules\n- Steps\n\n" +
						"Risks\n- ...",
				}),
			},
			{
				id: "qa",
				name: "QA",
				description: "Quality Assurance",
				preset_json: JSON.stringify({
					output: "markdown",
					template:
						"Test Plan\n- ...\n\n" +
						"Negative Cases\n- ...\n\n" +
						"Regression Checklist\n- ...",
				}),
			},
			{
				id: "merge-resolver",
				name: "Merge Resolver",
				description: "Resolve merge conflicts only",
				preset_json: JSON.stringify({
					output: "markdown",
					template:
						"Resolve merge conflicts only. Do not modify unrelated code.\n" +
						"Output artifacts:\n" +
						'- kind: patch, title: "Merge conflict resolution" (unified diff)\n' +
						'- kind: markdown, title: "Explanation"\n',
				}),
			},
			{
				id: "release-notes",
				name: "Release Notes",
				description: "Summarize changes for release notes",
				preset_json: JSON.stringify({
					output: "markdown",
					template:
						"Generate release notes from tasks and PRs.\n" +
						"Output concise markdown with sections: Features, Fixes, Chores.\n",
				}),
			},
		];

		const tx = this.db.transaction(() => {
			for (const role of roles) {
				insert.run({
					...role,
					created_at: now,
					updated_at: now,
				});
			}
		});
		tx();

		console.log(
			"[DB] Seeded agent roles:",
			roles.map((role) => role.id).join(", "),
		);
	}

	// Query helpers
	query<T>(sql: string, params: unknown[] = []): T[] {
		return this.db?.prepare(sql).all(...params) as T[];
	}

	get<T>(sql: string, params: unknown[] = []): T | undefined {
		return this.db?.prepare(sql).get(...params) as T | undefined;
	}

	exec(sql: string): void {
		this.db?.exec(sql);
	}
}
