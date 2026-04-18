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
		const orderIndex = this.db
			.prepare("SELECT COALESCE(MAX(order_index), -1) + 1 FROM projects")
			.pluck()
			.get() as number;

		const stmt = this.db.prepare(`
	      INSERT INTO projects (id, name, path, color, order_index, created_at, updated_at)
	      VALUES (?, ?, ?, ?, ?, ?, ?)
	    `);

		stmt.run(id, input.name, input.path, color, orderIndex, now, now);

		return {
			id,
			name: input.name,
			path: input.path,
			color,
			createdAt: now,
			updatedAt: now,
			lastActivityAt: null,
			orderIndex,
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
	        p.order_index as orderIndex,
	        MAX(t.updated_at) as last_activity_at
	      FROM projects p
	      LEFT JOIN tasks t ON t.project_id = p.id
	      GROUP BY p.id, p.name, p.path, p.color, p.created_at, p.updated_at, p.order_index
	      ORDER BY p.order_index ASC
	    `);

		const rows = stmt.all() as Array<{
			id: string;
			name: string;
			path: string;
			color: string;
			createdAt: string;
			updatedAt: string;
			orderIndex: number;
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
			orderIndex: row.orderIndex,
		}));
	}

	getById(id: string): Project | null {
		const stmt = this.db.prepare(`
	      SELECT id, name, path, color, created_at as createdAt, updated_at as updatedAt, NULL as lastActivityAt, order_index as orderIndex
	      FROM projects
	      WHERE id = ?
	    `);

		const row = stmt.get(id) as
			| {
					id: string;
					name: string;
					path: string;
					color: string;
					createdAt: string;
					updatedAt: string;
					lastActivityAt: string | null;
					orderIndex: number;
			  }
			| undefined;

		if (!row) return null;

		return {
			id: row.id,
			name: row.name,
			path: row.path,
			color: row.color,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			lastActivityAt: row.lastActivityAt,
			orderIndex: row.orderIndex,
		};
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
		if (updates.orderIndex !== undefined) {
			sets.push("order_index = ?");
			values.push(updates.orderIndex);
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

	reorder(id: string, direction: "up" | "down"): Project | null {
		const all = this.db
			.prepare(
				"SELECT id, order_index as orderIndex FROM projects ORDER BY order_index ASC",
			)
			.all() as Array<{ id: string; orderIndex: number }>;

		const currentIndex = all.findIndex((project) => project.id === id);
		if (currentIndex === -1) return null;

		const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
		if (swapIndex < 0 || swapIndex >= all.length) return null;

		const target = all[currentIndex];
		const adjacent = all[swapIndex];

		const swap = this.db.transaction(() => {
			this.db
				.prepare("UPDATE projects SET order_index = ? WHERE id = ?")
				.run(adjacent.orderIndex, target.id);
			this.db
				.prepare("UPDATE projects SET order_index = ? WHERE id = ?")
				.run(target.orderIndex, adjacent.id);
		});

		swap();
		return this.getById(id);
	}

	delete(id: string): boolean {
		const stmt = this.db.prepare("DELETE FROM projects WHERE id = ?");
		const result = stmt.run(id);
		return result.changes > 0;
	}
}

export const projectRepo = new ProjectRepository(dbManager.connect());
