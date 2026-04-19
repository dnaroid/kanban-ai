import type Database from "better-sqlite3";
import type { Artifact } from "@/types/ipc";
import { dbManager } from "@/server/db";

interface ArtifactRow {
	id: string;
	run_id: string;
	kind: string;
	title: string;
	content: string;
	created_at: string;
}

function mapArtifact(row: ArtifactRow): Artifact {
	return {
		id: row.id,
		runId: row.run_id,
		kind: row.kind,
		title: row.title,
		content: row.content,
		createdAt: row.created_at,
	};
}

export class ArtifactRepository {
	constructor(private db: Database.Database) {}

	public listByRun(runId: string): Artifact[] {
		const rows = this.db
			.prepare(
				"SELECT id, run_id, kind, title, content, created_at FROM artifacts WHERE run_id = ? ORDER BY created_at DESC",
			)
			.all(runId) as ArtifactRow[];

		return rows.map(mapArtifact);
	}

	public listByTask(taskId: string): Artifact[] {
		const rows = this.db
			.prepare(
				"SELECT a.id, a.run_id, a.kind, a.title, a.content, a.created_at FROM artifacts a JOIN runs r ON a.run_id = r.id WHERE r.task_id = ? ORDER BY a.created_at DESC",
			)
			.all(taskId) as ArtifactRow[];

		return rows.map(mapArtifact);
	}

	public getById(artifactId: string): Artifact | null {
		const row = this.db
			.prepare(
				"SELECT id, run_id, kind, title, content, created_at FROM artifacts WHERE id = ?",
			)
			.get(artifactId) as ArtifactRow | undefined;

		return row ? mapArtifact(row) : null;
	}

	public deleteByRun(runId: string): void {
		this.db.prepare("DELETE FROM artifacts WHERE run_id = ?").run(runId);
	}
}

export const artifactRepo = new ArtifactRepository(dbManager.connect());
