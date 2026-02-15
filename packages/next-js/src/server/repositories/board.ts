import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import type { Board, BoardColumn } from "../types";
import { dbManager } from "../db";

const DEFAULT_COLUMNS = [
	{ name: "To Do", systemKey: "todo", color: "#6366f1" },
	{ name: "In Progress", systemKey: "in_progress", color: "#f59e0b" },
	{ name: "Done", systemKey: "done", color: "#10b981" },
];

export interface BoardColumnInput {
	id?: string;
	name: string;
	systemKey?: string;
	orderIndex: number;
	color?: string;
}

export class BoardRepository {
	constructor(private db: Database.Database) {}

	create(input: { projectId: string; name: string }): Board {
		const boardId = randomUUID();
		const now = new Date().toISOString();

		this.db
			.prepare(
				`INSERT INTO boards (id, project_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
			)
			.run(boardId, input.projectId, input.name, now, now);

		for (let i = 0; i < DEFAULT_COLUMNS.length; i++) {
			const col = DEFAULT_COLUMNS[i];
			this.db
				.prepare(
					`INSERT INTO board_columns (id, board_id, name, system_key, order_index, color, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					randomUUID(),
					boardId,
					col.name,
					col.systemKey,
					i,
					col.color,
					now,
					now,
				);
		}

		return this.getById(boardId)!;
	}

	getByProjectId(projectId: string): Board | null {
		const board = this.db
			.prepare(
				`SELECT id, project_id as projectId, name, created_at as createdAt, updated_at as updatedAt
         FROM boards WHERE project_id = ? LIMIT 1`,
			)
			.get(projectId) as Omit<Board, "columns"> | undefined;

		if (!board) return null;
		return { ...board, columns: this.getColumns(board.id) };
	}

	getById(id: string): Board | null {
		const board = this.db
			.prepare(
				`SELECT id, project_id as projectId, name, created_at as createdAt, updated_at as updatedAt
         FROM boards WHERE id = ?`,
			)
			.get(id) as Omit<Board, "columns"> | undefined;

		if (!board) return null;
		return { ...board, columns: this.getColumns(id) };
	}

	private getColumns(boardId: string): BoardColumn[] {
		return this.db
			.prepare(
				`SELECT id, board_id as boardId, name, system_key as systemKey,
                order_index as orderIndex, wip_limit as wipLimit, color,
                created_at as createdAt, updated_at as updatedAt
         FROM board_columns WHERE board_id = ? ORDER BY order_index ASC`,
			)
			.all(boardId) as BoardColumn[];
	}

	// Full column update - replaces all columns with the provided list
	updateColumns(boardId: string, columns: BoardColumnInput[]): Board | null {
		const now = new Date().toISOString();
		const board = this.getById(boardId);
		if (!board) return null;

		const existingIds = new Set(board.columns.map((c) => c.id));
		const newIds = new Set(columns.filter((c) => c.id).map((c) => c.id));

		// Delete columns that are no longer in the list
		const deleteIds = [...existingIds].filter((id) => !newIds.has(id));
		for (const id of deleteIds) {
			this.db.prepare(`DELETE FROM board_columns WHERE id = ?`).run(id);
		}

		// Update or insert columns
		const updateStmt = this.db.prepare(`
			UPDATE board_columns
			SET name = ?, system_key = ?, order_index = ?, color = ?, updated_at = ?
			WHERE id = ? AND board_id = ?
		`);

		const insertStmt = this.db.prepare(`
			INSERT INTO board_columns (id, board_id, name, system_key, order_index, color, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`);

		for (const col of columns) {
			if (col.id && existingIds.has(col.id)) {
				// Update existing
				updateStmt.run(
					col.name,
					col.systemKey ?? "",
					col.orderIndex,
					col.color ?? "",
					now,
					col.id,
					boardId,
				);
			} else {
				// Insert new
				insertStmt.run(
					col.id ?? randomUUID(),
					boardId,
					col.name,
					col.systemKey ?? "",
					col.orderIndex,
					col.color ?? "",
					now,
					now,
				);
			}
		}

		this.db
			.prepare(`UPDATE boards SET updated_at = ? WHERE id = ?`)
			.run(now, boardId);

		return this.getById(boardId);
	}

	delete(id: string): void {
		this.db.prepare(`DELETE FROM board_columns WHERE board_id = ?`).run(id);
		this.db.prepare(`DELETE FROM boards WHERE id = ?`).run(id);
	}
}

export const boardRepo = new BoardRepository(dbManager.connect());
