import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { dbManager } from "@/server/db";

export interface UploadRecord {
	id: string;
	taskId: string | null;
	storedName: string;
	originalName: string;
	absolutePath: string;
	mimeType: string;
	size: number;
	createdAt: string;
}

export class UploadRepository {
	constructor(private db: Database.Database) {}

	public create(input: {
		taskId?: string;
		storedName: string;
		originalName: string;
		absolutePath: string;
		mimeType: string;
		size: number;
	}): UploadRecord {
		const id = randomUUID();
		const now = new Date().toISOString();
		const stmt = this.db.prepare(`
			INSERT INTO uploads (id, task_id, stored_name, original_name, absolute_path, mime_type, size, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`);

		stmt.run(
			id,
			input.taskId ?? null,
			input.storedName,
			input.originalName,
			input.absolutePath,
			input.mimeType,
			input.size,
			now,
		);

		return this.getById(id)!;
	}

	public getById(id: string): UploadRecord | null {
		const stmt = this.db.prepare("SELECT * FROM uploads WHERE id = ?");
		const row = stmt.get(id) as Record<string, unknown> | undefined;

		return row ? this.mapRow(row) : null;
	}

	public listByTask(taskId: string): UploadRecord[] {
		const stmt = this.db.prepare(
			"SELECT * FROM uploads WHERE task_id = ? ORDER BY created_at",
		);

		return (stmt.all(taskId) as Record<string, unknown>[]).map((row) =>
			this.mapRow(row),
		);
	}

	public listStale(olderThanHours: number): UploadRecord[] {
		const stmt = this.db.prepare(`
			SELECT * FROM uploads
			WHERE task_id IS NULL
			  AND created_at < datetime('now', '-' || ? || ' hours')
			ORDER BY created_at
		`);

		return (stmt.all(olderThanHours) as Record<string, unknown>[]).map((row) =>
			this.mapRow(row),
		);
	}

	public associateWithTask(uploadIds: string[], taskId: string): void {
		const stmt = this.db.prepare(
			"UPDATE uploads SET task_id = ? WHERE id = ? AND task_id IS NULL",
		);
		const transaction = this.db.transaction((ids: string[]) => {
			for (const id of ids) {
				stmt.run(taskId, id);
			}
		});

		transaction(uploadIds);
	}

	public deleteById(id: string): boolean {
		const stmt = this.db.prepare("DELETE FROM uploads WHERE id = ?");
		return stmt.run(id).changes > 0;
	}

	public deleteByTask(taskId: string): string[] {
		const uploads = this.listByTask(taskId);
		const stmt = this.db.prepare("DELETE FROM uploads WHERE task_id = ?");

		stmt.run(taskId);

		return uploads.map((upload) => upload.absolutePath);
	}

	private mapRow(row: Record<string, unknown>): UploadRecord {
		return {
			id: row.id as string,
			taskId: row.task_id as string | null,
			storedName: row.stored_name as string,
			originalName: row.original_name as string,
			absolutePath: row.absolute_path as string,
			mimeType: row.mime_type as string,
			size: row.size as number,
			createdAt: row.created_at as string,
		};
	}
}

export const uploadRepo = new UploadRepository(dbManager.connect());
