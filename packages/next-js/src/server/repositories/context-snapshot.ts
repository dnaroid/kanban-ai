import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { dbManager } from "@/server/db";

type SnapshotKind = "run-start" | "user-story" | "qa-testing";

interface CreateContextSnapshotInput {
	taskId: string;
	kind: SnapshotKind;
	summary: string;
	payload: Record<string, unknown>;
}

export class ContextSnapshotRepository {
	constructor(private db: Database.Database) {}

	public create(input: CreateContextSnapshotInput): string {
		const id = randomUUID();
		const createdAt = new Date().toISOString();
		const payloadJson = JSON.stringify(input.payload);

		this.db
			.prepare(
				`INSERT INTO context_snapshots (
				id,
				task_id,
				kind,
				summary,
				payload_json,
				created_at
			) VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.run(id, input.taskId, input.kind, input.summary, payloadJson, createdAt);

		return id;
	}
}

export const contextSnapshotRepo = new ContextSnapshotRepository(
	dbManager.connect(),
);
