import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { dbManager } from "../db";
import type { Project, CreateProjectInput, UpdateProjectInput } from "../types";

export class ProjectRepository {
	constructor(private db: Database.Database) {}

	create(input: CreateProjectInput): Project {
		const now = new Date().toISOString();
		const id = randomUUID();
		const color = input.color ?? "";

		const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, path, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

		stmt.run(id, input.name, input.path, color, now, now);

		return {
			id,
			name: input.name,
			path: input.path,
			color,
			createdAt: now,
			updatedAt: now,
			lastActivityAt: null,
		};
	}

	getAll(): Project[] {
		const stmt = this.db.prepare(`
      SELECT
        p.id,
        p.name,
        p.path,
        p.color,
        p.created_at as createdAt,
        p.updated_at as updatedAt,
        MAX(t.updated_at) as last_activity_at
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id, p.name, p.path, p.color, p.created_at, p.updated_at
      ORDER BY
        CASE WHEN MAX(t.updated_at) IS NULL THEN 1 ELSE 0 END ASC,
        COALESCE(MAX(t.updated_at), p.updated_at) DESC
    `);

		const rows = stmt.all() as Array<{
			id: string;
			name: string;
			path: string;
			color: string;
			createdAt: string;
			updatedAt: string;
			last_activity_at: string | null;
		}>;

		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			path: row.path,
			color: row.color,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			lastActivityAt: row.last_activity_at,
		}));
	}

	getById(id: string): Project | null {
		const stmt = this.db.prepare(`
      SELECT id, name, path, color, created_at as createdAt, updated_at as updatedAt, NULL as lastActivityAt
      FROM projects
      WHERE id = ?
    `);

		return stmt.get(id) as Project | null;
	}

	update(id: string, updates: UpdateProjectInput): Project | null {
		const now = new Date().toISOString();

		const sets: string[] = [];
		const values: unknown[] = [];

		if (updates.name !== undefined) {
			sets.push("name = ?");
			values.push(updates.name);
		}
		if (updates.path !== undefined) {
			sets.push("path = ?");
			values.push(updates.path);
		}
		if (updates.color !== undefined) {
			sets.push("color = ?");
			values.push(updates.color);
		}

		if (sets.length === 0) return this.getById(id);

		values.push(now, id);

		const stmt = this.db.prepare(`
      UPDATE projects
      SET ${sets.join(", ")}, updated_at = ?
      WHERE id = ?
    `);

		stmt.run(...values);

		return this.getById(id);
	}

	delete(id: string): boolean {
		const stmt = this.db.prepare("DELETE FROM projects WHERE id = ?");
		const result = stmt.run(id);
		return result.changes > 0;
	}
}

export const projectRepo = new ProjectRepository(dbManager.connect());
