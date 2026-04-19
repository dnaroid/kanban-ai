import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
	INIT_DB_SQL,
	migrations,
	v017SystemKeySql,
	v019TaskBlockedReasonSql,
	v020TaskClosedReasonSql,
	v021WorkflowConfigSql,
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
		this.backfillRoleBehaviorMetadata();

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

		for (const migration of migrations) {
			if (migration.version > maxVersion) {
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
						"INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
					).run(migration.version);
				});
				tx();
			}
		}
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

	private hasTable(tableName: string): boolean {
		if (!this.db) {
			return false;
		}

		const row = this.db
			.prepare(
				`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
			)
			.get(tableName) as { name?: string } | undefined;

		return typeof row?.name === "string";
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

		if (!this.hasTable("workflow_statuses")) {
			console.log(
				"[DB] Repairing schema: creating workflow configuration tables",
			);
			this.db.exec(v021WorkflowConfigSql);
			this.db
				.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)")
				.run(21);
		}
	}

	private seedAgentRoles(): void {
		if (!this.db) return;

		const now = new Date().toISOString();
		const insert = this.db.prepare(
			`INSERT INTO agent_roles
				(id, name, description, preset_json, preferred_model_name, preferred_model_variant, preferred_llm_agent, created_at, updated_at)
				VALUES (@id, @name, @description, @preset_json, NULL, NULL, NULL, @created_at, @updated_at)`,
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
					behavior: {
						preferredForStoryGeneration: true,
						recommended: true,
						quickSelect: true,
					},
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
					behavior: {
						recommended: true,
					},
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
					behavior: {
						recommended: true,
						quickSelect: true,
					},
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
					behavior: {
						recommended: true,
						quickSelect: true,
					},
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
					behavior: {
						preferredForQaTesting: true,
						recommended: true,
						quickSelect: true,
					},
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
					behavior: {
						optional: true,
					},
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
					behavior: {
						optional: true,
					},
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
			{
				id: "translator",
				name: "Translator",
				description: "i18n, localization, content translation",
				preset_json: JSON.stringify({
					version: "1.0",
					provider: "openai",
					modelName: "gpt-5.3-codex",
					skills: ["translator", "localization-specialist", "i18n-engineer"],
					systemPrompt:
						"You are a Senior Translator. Adapt content across languages with cultural accuracy, maintain i18n resource files, and ensure locale consistency throughout the application.",
					mustDo: [
						"Preserve meaning, tone, and context across all target locales",
						"Follow existing i18n key conventions and file structure",
						"Flag cultural ambiguities and propose locale-specific alternatives",
					],
					outputContract: [
						"Translated keys/files per locale",
						"Locale-specific notes",
						"Glossary updates",
					],
					behavior: {
						optional: true,
					},
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

	private backfillRoleBehaviorMetadata(): void {
		if (!this.db) return;

		const rows = this.db
			.prepare("SELECT id, preset_json FROM agent_roles")
			.all() as Array<{ id: string; preset_json: string }>;
		if (rows.length === 0) {
			return;
		}

		const updatePreset = this.db.prepare(
			"UPDATE agent_roles SET preset_json = ?, updated_at = ? WHERE id = ?",
		);
		const now = new Date().toISOString();
		let updatedCount = 0;

		const tx = this.db.transaction(() => {
			for (const row of rows) {
				let parsed: Record<string, unknown>;
				try {
					const json = JSON.parse(row.preset_json) as unknown;
					if (!json || typeof json !== "object") {
						continue;
					}
					parsed = json as Record<string, unknown>;
				} catch {
					continue;
				}

				const skills = Array.isArray(parsed.skills)
					? parsed.skills.filter(
							(skill): skill is string => typeof skill === "string",
						)
					: [];
				const existingBehavior =
					parsed.behavior && typeof parsed.behavior === "object"
						? (parsed.behavior as Record<string, unknown>)
						: {};

				const preferredForStoryGeneration =
					existingBehavior.preferredForStoryGeneration === true ||
					skills.includes("business-analyst");
				const preferredForQaTesting =
					existingBehavior.preferredForQaTesting === true ||
					skills.includes("qa-expert") ||
					skills.includes("test-automator");

				const nextBehavior = {
					...existingBehavior,
					preferredForStoryGeneration,
					preferredForQaTesting,
				};

				if (
					existingBehavior.preferredForStoryGeneration ===
						nextBehavior.preferredForStoryGeneration &&
					existingBehavior.preferredForQaTesting ===
						nextBehavior.preferredForQaTesting
				) {
					continue;
				}

				const nextPreset = {
					...parsed,
					behavior: nextBehavior,
				};
				updatePreset.run(JSON.stringify(nextPreset), now, row.id);
				updatedCount += 1;
			}
		});
		tx();

		if (updatedCount > 0) {
			console.log("[DB] Backfilled role behavior metadata:", updatedCount);
		}
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
