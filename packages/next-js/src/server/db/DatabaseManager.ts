import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
	INIT_DB_SQL,
	migrations,
	v017SystemKeySql,
	v019TaskBlockedReasonSql,
	v020TaskClosedReasonSql,
} from "./migrations";

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
		this.ensureCriticalSchema();
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
					try {
						this.db!.exec(migration.sql);
					} catch (err: unknown) {
						// Handle duplicate column error (migration already applied at schema level)
						if (
							err instanceof Error &&
							err.message.includes("duplicate column name")
						) {
							console.log(
								"[DB] Migration version",
								migration.version,
								"skipped - column already exists",
							);
						} else {
							throw err;
						}
					}
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

		const baseVersion = migrations[0]?.version ?? 0;
		this.db
			.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)")
			.run(baseVersion);

		this.runMigrations();
	}

	private hasColumn(tableName: string, columnName: string): boolean {
		if (!this.db) {
			return false;
		}

		const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as {
			name: string;
		}[];

		return rows.some((row) => row.name === columnName);
	}

	private ensureCriticalSchema(): void {
		if (!this.db) {
			return;
		}

		if (!this.hasColumn("board_columns", "system_key")) {
			console.log(
				"[DB] Repairing schema: adding board_columns.system_key column",
			);
			this.db.exec(v017SystemKeySql);
			this.db
				.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)")
				.run(17);
		}

		if (!this.hasColumn("tasks", "blocked_reason")) {
			console.log("[DB] Repairing schema: adding tasks.blocked_reason column");
			this.db.exec(v019TaskBlockedReasonSql);
			this.db
				.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)")
				.run(19);
		}

		if (!this.hasColumn("tasks", "closed_reason")) {
			console.log("[DB] Repairing schema: adding tasks.closed_reason column");
			this.db.exec(v020TaskClosedReasonSql);
			this.db
				.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)")
				.run(20);
		}
	}

	private seedAgentRoles(): void {
		if (!this.db) return;

		const now = new Date().toISOString();
		const insert = this.db.prepare(
			`INSERT INTO agent_roles
        (id, name, description, preset_json, created_at, updated_at)
        VALUES (@id, @name, @description, @preset_json, @created_at, @updated_at)`,
		);

		const roles = [
			{
				id: "ba",
				name: "Business Analyst",
				description: "Requirements, scope, acceptance criteria",
				preset_json: JSON.stringify({
					version: "1.0",
					provider: "openai",
					modelName: "gpt-5.3-codex",
					skills: ["product-manager", "business-analyst", "doc-coauthoring"],
					systemPrompt:
						"You are a Senior Business Analyst. Clarify requirements, define scope, and produce testable acceptance criteria. Resolve ambiguities before implementation.",
					mustDo: [
						"Define user story, business value, and non-goals",
						"Write clear acceptance criteria and edge cases",
						"List dependencies/risks/open questions",
					],
					outputContract: [
						"User story",
						"Acceptance criteria (Given/When/Then)",
						"Out of scope",
						"Risks",
					],
				}),
			},
			{
				id: "tl",
				name: "Tech Lead",
				description: "Solution design, decomposition, technical decisions",
				preset_json: JSON.stringify({
					version: "1.0",
					provider: "openai",
					modelName: "gpt-5.3-codex",
					skills: [
						"architect-reviewer",
						"fullstack-developer",
						"refactoring-specialist",
					],
					systemPrompt:
						"You are a Staff Tech Lead. Turn requirements into an executable technical plan with clear boundaries, trade-offs, and verification steps.",
					mustDo: [
						"Break work into atomic implementation steps",
						"Choose architecture and justify trade-offs",
						"Define API/contracts/data changes",
						"Define rollout and rollback strategy",
					],
					outputContract: [
						"Architecture decision",
						"Task breakdown",
						"Risks/mitigations",
						"DoD",
					],
				}),
			},
			{
				id: "fe",
				name: "Frontend Engineer",
				description: "UI implementation, accessibility, UX quality",
				preset_json: JSON.stringify({
					version: "1.0",
					provider: "openai",
					modelName: "gpt-5.3-codex",
					skills: [
						"frontend-developer",
						"react-specialist",
						"nextjs-developer",
						"accessibility-tester",
					],
					systemPrompt:
						"You are a Senior Frontend Engineer. Implement production-grade UI with accessibility, responsiveness, and maintainable component architecture.",
					mustDo: [
						"Follow existing design system/patterns",
						"Ensure keyboard and screen-reader basics",
						"Handle loading/error/empty states",
						"Add or adjust UI tests where relevant",
					],
					outputContract: [
						"Changed components/pages",
						"State/UX behavior",
						"A11y checks",
						"Test coverage",
					],
				}),
			},
			{
				id: "be",
				name: "Backend Engineer",
				description: "API/domain logic/data integrity/performance",
				preset_json: JSON.stringify({
					version: "1.0",
					provider: "openai",
					modelName: "gpt-5.3-codex",
					skills: [
						"backend-developer",
						"api-designer",
						"database-optimizer",
						"typescript-pro",
					],
					systemPrompt:
						"You are a Senior Backend Engineer. Build reliable APIs and domain logic with strict validation, transactional safety, and predictable failure modes.",
					mustDo: [
						"Define and validate input-output contracts",
						"Preserve data integrity and idempotency",
						"Handle errors explicitly",
						"Add tests for happy path and edge cases",
					],
					outputContract: [
						"API/domain changes",
						"Data model impact",
						"Failure handling",
						"Tests",
					],
				}),
			},
			{
				id: "qa",
				name: "QA Engineer",
				description: "Test strategy, automation, release confidence",
				preset_json: JSON.stringify({
					version: "1.0",
					provider: "openai",
					modelName: "gpt-5.3-codex",
					skills: ["qa-expert", "test-automator", "webapp-testing"],
					systemPrompt:
						"You are a Senior QA Engineer. Build a risk-based test strategy and automate critical paths to prevent regressions.",
					mustDo: [
						"Create test matrix by risk",
						"Cover positive/negative/boundary scenarios",
						"Define regression scope",
						"Report defects with clear repro",
					],
					outputContract: [
						"Test plan",
						"Automated checks",
						"Defects",
						"Release recommendation",
					],
				}),
			},
			{
				id: "sre",
				name: "SRE / DevOps",
				description: "Reliability, observability, deployment safety",
				preset_json: JSON.stringify({
					version: "1.0",
					provider: "openai",
					modelName: "gpt-5.3-codex",
					skills: [
						"devops-engineer",
						"sre-engineer",
						"deployment-engineer",
						"build-engineer",
					],
					systemPrompt:
						"You are an SRE. Ensure service reliability via SLO-oriented thinking, observability, safe deployment, and fast rollback.",
					mustDo: [
						"Define health checks and key metrics",
						"Validate CI/CD and deployment strategy",
						"Prepare rollback playbook",
						"Identify single points of failure",
					],
					outputContract: [
						"Operational risks",
						"Monitoring/alerts",
						"Deploy/rollback plan",
						"Runbook updates",
					],
				}),
			},
			{
				id: "sec",
				name: "Security Engineer",
				description: "Threat modeling, secure defaults, compliance checks",
				preset_json: JSON.stringify({
					version: "1.0",
					provider: "openai",
					modelName: "gpt-5.3-codex",
					skills: [
						"security-engineer",
						"security-auditor",
						"penetration-tester",
						"compliance-auditor",
					],
					systemPrompt:
						"You are a Security Engineer. Identify attack vectors early, enforce secure defaults, and provide practical remediation.",
					mustDo: [
						"Perform lightweight threat model",
						"Check authentication, authorization, secrets, and input handling",
						"Review dependency and infra risk",
						"Prioritize vulnerabilities by impact and likelihood",
					],
					outputContract: ["Threats", "Findings", "Severity", "Fix plan"],
				}),
			},
			{
				id: "data",
				name: "Data Engineer",
				description: "Data model, migrations, query performance",
				preset_json: JSON.stringify({
					version: "1.0",
					provider: "openai",
					modelName: "gpt-5.3-codex",
					skills: ["data-engineer", "postgres-pro", "sql-pro", "data-analyst"],
					systemPrompt:
						"You are a Data Engineer. Design evolvable schemas and efficient queries with safe migrations and measurable performance.",
					mustDo: [
						"Design schema and index strategy",
						"Plan safe migrations",
						"Validate query plans and bottlenecks",
						"Define data quality checks",
					],
					outputContract: [
						"Schema/migration plan",
						"Indexes/query optimizations",
						"Risks",
						"Validation metrics",
					],
				}),
			},
		];

		const existingRoleIds = new Set(
			(
				this.db.prepare("SELECT id FROM agent_roles").all() as Array<{
					id: string;
				}>
			).map((row) => row.id),
		);

		const missingRoles = roles.filter((role) => !existingRoleIds.has(role.id));
		if (missingRoles.length === 0) {
			return;
		}

		const tx = this.db.transaction(() => {
			for (const role of missingRoles) {
				insert.run({
					...role,
					created_at: now,
					updated_at: now,
				});
			}
		});
		tx();

		console.log(
			"[DB] Ensured agent roles:",
			missingRoles.map((role) => role.id).join(", "),
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
