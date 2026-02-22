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
	public listByRun(runId: string): Artifact[] {
		const db = dbManager.connect();
		const rows = db
			.prepare(
				"SELECT id, run_id, kind, title, content, created_at FROM artifacts WHERE run_id = ? ORDER BY created_at DESC",
			)
			.all(runId) as ArtifactRow[];

		return rows.map(mapArtifact);
	}

	public getById(artifactId: string): Artifact | null {
		const db = dbManager.connect();
		const row = db
			.prepare(
				"SELECT id, run_id, kind, title, content, created_at FROM artifacts WHERE id = ?",
			)
			.get(artifactId) as ArtifactRow | undefined;

		return row ? mapArtifact(row) : null;
	}
}

export const artifactRepo = new ArtifactRepository();
