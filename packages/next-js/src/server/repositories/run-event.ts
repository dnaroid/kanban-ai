import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import type { RunEvent } from "@/types/ipc";
import { dbManager } from "@/server/db";

interface RunEventRow {
	id: string;
	run_id: string;
	ts: string;
	event_type: string;
	payload_json: string;
	message_id: string | null;
}

interface CreateRunEventInput {
	runId: string;
	eventType: string;
	payload: unknown;
	messageId?: string;
}

function parsePayload(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function mapRunEvent(row: RunEventRow): RunEvent {
	return {
		id: row.id,
		runId: row.run_id,
		ts: row.ts,
		eventType: row.event_type,
		payload: parsePayload(row.payload_json),
	};
}

export class RunEventRepository {
	constructor(private db: Database.Database) {}

	public create(input: CreateRunEventInput): RunEvent {
		const id = randomUUID();
		const ts = new Date().toISOString();
		const payloadJson = JSON.stringify(input.payload);

		this.db
			.prepare(
				`INSERT INTO run_events (
				id,
				run_id,
				ts,
				event_type,
				payload_json,
				message_id
			) VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.run(
				id,
				input.runId,
				ts,
				input.eventType,
				payloadJson,
				input.messageId ?? null,
			);

		return {
			id,
			runId: input.runId,
			ts,
			eventType: input.eventType,
			payload: input.payload,
		};
	}

	public listByRun(runId: string, limit = 200): RunEvent[] {
		const rows = this.db
			.prepare(
				"SELECT * FROM run_events WHERE run_id = ? ORDER BY ts DESC LIMIT ?",
			)
			.all(runId, limit) as RunEventRow[];

		return rows.map(mapRunEvent).reverse();
	}
}

export const runEventRepo = new RunEventRepository(dbManager.connect());
