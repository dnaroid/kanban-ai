import type Database from "better-sqlite3";
import { dbManager } from "../db";

export interface Tag {
	id: string;
	name: string;
	color: string;
	createdAt: string;
	updatedAt: string;
}

class TagRepository {
	constructor(private db: Database.Database) {}

	listAll(): Tag[] {
		const stmt = this.db.prepare(`
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

export const tagRepo = new TagRepository(dbManager.connect());
