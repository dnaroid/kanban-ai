import { dbManager } from "../db";

export interface Tag {
	id: string;
	name: string;
	color: string;
	createdAt: string;
	updatedAt: string;
}

class TagRepository {
	listAll(): Tag[] {
		const db = dbManager.connect();
		const stmt = db.prepare(`
			SELECT
				id,
				name,
				color,
				created_at as createdAt,
				updated_at as updatedAt
			FROM tags
			ORDER BY name ASC
		`);
		return stmt.all() as Tag[];
	}

	listNames(): string[] {
		return this.listAll().map((tag) => tag.name);
	}
}

export const tagRepo = new TagRepository();
