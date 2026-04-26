import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import type { Run, RunStatus } from "@/types/ipc";
import { dbManager } from "@/server/db";

interface RunRow {
	id: string;
	task_id: string;
	role_id: string;
	mode: string;
	kind: string;
	status: RunStatus;
	session_id: string | null;
	started_at: string | null;
	finished_at: string | null;
	error_text: string;
	budget_json: string;
	metadata_json: string;
	created_at: string;
	updated_at: string;
	ai_tokens_in: number;
	ai_tokens_out: number;
	ai_cost_usd: number;
	duration_sec: number;
}

interface CreateRunInput {
	taskId: string;
	roleId: string;
	mode?: string;
	kind?: string;
	contextSnapshotId: string;
	metadata?: Run["metadata"];
}

interface UpdateRunInput {
	status?: RunStatus;
	sessionId?: string;
	startedAt?: string | null;
	finishedAt?: string | null;
	errorText?: string;
	mode?: string;
	roleId?: string;
	kind?: string;
	budget?: unknown;
	tokensIn?: number;
	tokensOut?: number;
	costUsd?: number;
	durationSec?: number;
	metadata?: Run["metadata"];
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	return value as Record<string, unknown>;
}

function serializeMetadata(metadata: Run["metadata"] | undefined): string {
	if (!metadata) {
		return "{}";
	}

	return JSON.stringify(metadata);
}

function mapRunRow(row: RunRow): Run {
	const budget = parseJson(row.budget_json);
	const metadata = {
		...asRecord(parseJson(row.metadata_json)),
		kind: row.kind,
		errorText: row.error_text,
		budget,
		tokensIn: row.ai_tokens_in,
		tokensOut: row.ai_tokens_out,
		costUsd: row.ai_cost_usd,
		durationSec: row.duration_sec,
	};

	return {
		id: row.id,
		taskId: row.task_id,
		sessionId: row.session_id ?? "",
		roleId: row.role_id,
		mode: row.mode,
		status: row.status,
		startedAt: row.started_at,
		endedAt: row.finished_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		metadata,
	};
}

export class RunRepository {
	constructor(private db: Database.Database) {}

	public create(input: CreateRunInput): Run {
		const id = randomUUID();
		const now = new Date().toISOString();

		this.db
			.prepare(
				`INSERT INTO runs (
				id,
				task_id,
				role_id,
				mode,
				kind,
				status,
				session_id,
				started_at,
				finished_at,
				error_text,
				budget_json,
				metadata_json,
				context_snapshot_id,
				ai_tokens_in,
				ai_tokens_out,
				ai_cost_usd,
				duration_sec,
				created_at,
				updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				id,
				input.taskId,
				input.roleId,
				input.mode ?? "execute",
				input.kind ?? "task-run",
				"queued",
				null,
				null,
				null,
				"",
				JSON.stringify({}),
				serializeMetadata(input.metadata),
				input.contextSnapshotId,
				0,
				0,
				0,
				0,
				now,
				now,
			);

		const run = this.getById(id);
		if (!run) {
			throw new Error("Failed to create run");
		}

		return run;
	}

	public getById(runId: string): Run | null {
		const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as
			| RunRow
			| undefined;
		return row ? mapRunRow(row) : null;
	}

	public getByTask(taskId: string): Run | null {
		const row = this.db
			.prepare(
				"SELECT * FROM runs WHERE task_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1",
			)
			.get(taskId) as RunRow | undefined;
		return row ? mapRunRow(row) : null;
	}

	public listAllByTask(taskId: string): Run[] {
		const rows = this.db
			.prepare(
				"SELECT * FROM runs WHERE task_id = ? ORDER BY updated_at DESC, created_at DESC",
			)
			.all(taskId) as RunRow[];
		return rows.map(mapRunRow);
	}

	public listByTask(taskId: string): Run[] {
		const run = this.getByTask(taskId);
		return run ? [run] : [];
	}

	public listByStatus(status: RunStatus): Run[] {
		const rows = this.db
			.prepare("SELECT * FROM runs WHERE status = ? ORDER BY created_at ASC")
			.all(status) as RunRow[];
		return rows.map(mapRunRow);
	}

	public listByStatuses(statuses: string[]): Run[] {
		if (statuses.length === 0) {
			return [];
		}

		const placeholders = statuses.map(() => "?").join(", ");
		const rows = this.db
			.prepare(
				`SELECT * FROM runs WHERE status IN (${placeholders}) ORDER BY created_at ASC`,
			)
			.all(...statuses) as RunRow[];
		return rows.map(mapRunRow);
	}

	public getLatestRunsByTaskIds(taskIds: string[]): Map<string, Run> {
		if (taskIds.length === 0) {
			return new Map();
		}

		const placeholders = taskIds.map(() => "?").join(", ");
		const rows = this.db
			.prepare(
				`SELECT *
				 FROM runs
				 WHERE task_id IN (${placeholders})
				 ORDER BY updated_at DESC, created_at DESC`,
			)
			.all(...taskIds) as RunRow[];

		const latestRunsByTaskId = new Map<string, Run>();
		for (const row of rows) {
			const run = mapRunRow(row);
			if (!latestRunsByTaskId.has(run.taskId)) {
				latestRunsByTaskId.set(run.taskId, run);
			}
		}

		return latestRunsByTaskId;
	}

	public update(runId: string, patch: UpdateRunInput): Run {
		const updates: string[] = ["updated_at = ?"];
		const values: unknown[] = [new Date().toISOString()];

		if (patch.status !== undefined) {
			updates.push("status = ?");
			values.push(patch.status);
		}
		if (patch.sessionId !== undefined) {
			updates.push("session_id = ?");
			values.push(patch.sessionId || null);
		}
		if (patch.startedAt !== undefined) {
			updates.push("started_at = ?");
			values.push(patch.startedAt);
		}
		if (patch.finishedAt !== undefined) {
			updates.push("finished_at = ?");
			values.push(patch.finishedAt);
		}
		if (patch.errorText !== undefined) {
			updates.push("error_text = ?");
			values.push(patch.errorText);
		}
		if (patch.mode !== undefined) {
			updates.push("mode = ?");
			values.push(patch.mode);
		}
		if (patch.roleId !== undefined) {
			updates.push("role_id = ?");
			values.push(patch.roleId);
		}
		if (patch.kind !== undefined) {
			updates.push("kind = ?");
			values.push(patch.kind);
		}
		if (patch.budget !== undefined) {
			updates.push("budget_json = ?");
			values.push(JSON.stringify(patch.budget ?? {}));
		}
		if (patch.tokensIn !== undefined) {
			updates.push("ai_tokens_in = ?");
			values.push(patch.tokensIn);
		}
		if (patch.tokensOut !== undefined) {
			updates.push("ai_tokens_out = ?");
			values.push(patch.tokensOut);
		}
		if (patch.costUsd !== undefined) {
			updates.push("ai_cost_usd = ?");
			values.push(patch.costUsd);
		}
		if (patch.durationSec !== undefined) {
			updates.push("duration_sec = ?");
			values.push(patch.durationSec);
		}
		if (patch.metadata !== undefined) {
			updates.push("metadata_json = ?");
			values.push(serializeMetadata(patch.metadata));
		}

		values.push(runId);
		this.db
			.prepare(`UPDATE runs SET ${updates.join(", ")} WHERE id = ?`)
			.run(...values);

		const run = this.getById(runId);
		if (!run) {
			throw new Error(`Run not found after update: ${runId}`);
		}

		return run;
	}

	public delete(runId: string): void {
		this.db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
	}

	public deleteAllExceptTaskRun(taskId: string, keepRunId: string): void {
		this.db
			.prepare("DELETE FROM runs WHERE task_id = ? AND id != ?")
			.run(taskId, keepRunId);
	}
}

export const runRepo = new RunRepository(dbManager.connect());
