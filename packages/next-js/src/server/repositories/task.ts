import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { dbManager } from "../db";
import type { Task, CreateTaskInput, UpdateTaskInput } from "../types";

export class TaskRepository {
	constructor(private db: Database.Database) {}

	create(input: CreateTaskInput): Task {
		const now = new Date().toISOString();
		const id = randomUUID();
		const status = typeof input.status === "string" ? input.status.trim() : "";
		if (!status) {
			throw new Error("Task status is required");
		}
		const blockedReason = input.blockedReason ?? null;
		const blockedReasonText = input.blockedReasonText ?? null;
		const closedReason = input.closedReason ?? null;
		const priority = input.priority ?? "normal";
		const difficulty = input.difficulty ?? "medium";
		const type = input.type ?? "chore";
		const tags = input.tags ? JSON.stringify(input.tags) : "[]";

		// Get the max order_in_column for this column
		const maxOrderStmt = this.db.prepare(`
			SELECT COALESCE(MAX(order_in_column), -1) as maxOrder
			FROM tasks
			WHERE board_id = ? AND column_id = ?
		`);
		const result = maxOrderStmt.get(input.boardId, input.columnId) as {
			maxOrder: number;
		};
		const orderInColumn = result.maxOrder + 1;

		const stmt = this.db.prepare(`
      INSERT INTO tasks (
				id, project_id, board_id, column_id, title, description, description_md,
				status, blocked_reason, blocked_reason_text, closed_reason, priority, difficulty, type, order_in_column, tags_json,
				due_date, assignee, model_name, commit_message, qa_report,
				is_generated, was_qa_rejected,
				created_at, updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

		stmt.run(
			id,
			input.projectId,
			input.boardId,
			input.columnId,
			input.title,
			input.description ?? null,
			null, // description_md
			status,
			blockedReason,
			blockedReasonText,
			closedReason,
			priority,
			difficulty,
			type,
			orderInColumn,
			tags,
			input.dueDate ?? null,
			null, // assignee
			input.modelName ?? null,
			input.commitMessage ?? null,
			input.qaReport ?? null,
			input.isGenerated ? "1" : "0",
			input.wasQaRejected ? "1" : "0",
			now,
			now,
		);

		return this.getById(id)!;
	}

	listByBoard(boardId: string): Task[] {
		const stmt = this.db.prepare(`
      SELECT
        id,
        project_id as projectId,
        board_id as boardId,
        column_id as columnId,
        title,
        description,
        description_md as descriptionMd,
        status,
        blocked_reason as blockedReason,
        blocked_reason_text as blockedReasonText,
        closed_reason as closedReason,
        priority,
        difficulty,
        type,
        order_in_column as orderInColumn,
        tags_json as tags,
        due_date as dueDate,
        assignee,
        model_name as modelName,
        commit_message as commitMessage,
        qa_report as qaReport,
        (is_generated = '1') as isGenerated,
        (was_qa_rejected = '1') as wasQaRejected,
        created_at as createdAt,
        updated_at as updatedAt
      FROM tasks
      WHERE board_id = ?
      ORDER BY column_id, order_in_column ASC
    `);

		return stmt.all(boardId) as Task[];
	}

	getById(id: string): Task | null {
		const stmt = this.db.prepare(`
      SELECT
        id,
        project_id as projectId,
        board_id as boardId,
        column_id as columnId,
        title,
        description,
        description_md as descriptionMd,
        status,
        blocked_reason as blockedReason,
        blocked_reason_text as blockedReasonText,
        closed_reason as closedReason,
        priority,
        difficulty,
        type,
        order_in_column as orderInColumn,
        tags_json as tags,
        due_date as dueDate,
        assignee,
        model_name as modelName,
        commit_message as commitMessage,
        qa_report as qaReport,
        (is_generated = '1') as isGenerated,
        (was_qa_rejected = '1') as wasQaRejected,
        created_at as createdAt,
        updated_at as updatedAt
      FROM tasks
      WHERE id = ?
    `);

		return stmt.get(id) as Task | null;
	}

	update(id: string, updates: UpdateTaskInput): Task | null {
		const now = new Date().toISOString();

		const sets: string[] = [];
		const values: unknown[] = [];

		if (updates.columnId !== undefined) {
			sets.push("column_id = ?");
			values.push(updates.columnId);
		}
		if (updates.title !== undefined) {
			sets.push("title = ?");
			values.push(updates.title);
		}
		if (updates.description !== undefined) {
			sets.push("description = ?");
			values.push(updates.description);
		}
		if (updates.descriptionMd !== undefined) {
			sets.push("description_md = ?");
			values.push(updates.descriptionMd);
		}
		if (updates.status !== undefined) {
			sets.push("status = ?");
			values.push(updates.status);
		}
		if (updates.blockedReason !== undefined) {
			sets.push("blocked_reason = ?");
			values.push(updates.blockedReason);
		}
		if (updates.blockedReasonText !== undefined) {
			sets.push("blocked_reason_text = ?");
			values.push(updates.blockedReasonText);
		}
		if (updates.closedReason !== undefined) {
			sets.push("closed_reason = ?");
			values.push(updates.closedReason);
		}
		if (updates.priority !== undefined) {
			sets.push("priority = ?");
			values.push(updates.priority);
		}
		if (updates.difficulty !== undefined) {
			sets.push("difficulty = ?");
			values.push(updates.difficulty);
		}
		if (updates.type !== undefined) {
			sets.push("type = ?");
			values.push(updates.type);
		}
		if (updates.orderInColumn !== undefined) {
			sets.push("order_in_column = ?");
			values.push(updates.orderInColumn);
		}
		if (updates.tags !== undefined) {
			sets.push("tags_json = ?");
			values.push(updates.tags);
		}
		if (updates.dueDate !== undefined) {
			sets.push("due_date = ?");
			values.push(updates.dueDate);
		}
		if (updates.assignee !== undefined) {
			sets.push("assignee = ?");
			values.push(updates.assignee);
		}
		if (updates.modelName !== undefined) {
			sets.push("model_name = ?");
			values.push(updates.modelName);
		}
		if (updates.commitMessage !== undefined) {
			sets.push("commit_message = ?");
			values.push(updates.commitMessage);
		}
		if (updates.qaReport !== undefined) {
			sets.push("qa_report = ?");
			values.push(updates.qaReport);
		}
		if (updates.isGenerated !== undefined) {
			sets.push("is_generated = ?");
			values.push(updates.isGenerated ? "1" : "0");
		}
		if (updates.wasQaRejected !== undefined) {
			sets.push("was_qa_rejected = ?");
			values.push(updates.wasQaRejected ? "1" : "0");
		}

		if (sets.length === 0) return this.getById(id);

		values.push(now, id);

		const stmt = this.db.prepare(`
      UPDATE tasks
      SET ${sets.join(", ")}, updated_at = ?
      WHERE id = ?
    `);

		stmt.run(...values);

		return this.getById(id);
	}

	move(id: string, columnId: string, toIndex?: number): Task | null {
		const now = new Date().toISOString();

		const task = this.getById(id);
		if (!task) return null;

		const isSameColumn = task.columnId === columnId;

		const siblingsInColumn = (colId: string) =>
			(
				this.db
					.prepare(
						`SELECT id FROM tasks WHERE board_id = ? AND column_id = ? ORDER BY order_in_column ASC`,
					)
					.all(task.boardId, colId) as { id: string }[]
			).map((r) => r.id);

		const renumber = (ids: string[]) => {
			const updateStmt = this.db.prepare(
				`UPDATE tasks SET order_in_column = ?, updated_at = ? WHERE id = ?`,
			);
			for (let i = 0; i < ids.length; i++) {
				updateStmt.run(i, now, ids[i]);
			}
		};

		if (isSameColumn) {
			const ids = siblingsInColumn(columnId);
			const fromIdx = ids.indexOf(id);
			if (fromIdx === -1) return null;

			const clampedIndex = Math.max(
				0,
				Math.min(toIndex ?? ids.length - 1, ids.length - 1),
			);

			ids.splice(fromIdx, 1);
			ids.splice(clampedIndex, 0, id);
			renumber(ids);
		} else {
			const sourceIds = siblingsInColumn(task.columnId);
			const targetIds = siblingsInColumn(columnId);

			sourceIds.splice(sourceIds.indexOf(id), 1);

			const clampedIndex = Math.max(
				0,
				Math.min(toIndex ?? targetIds.length, targetIds.length),
			);

			targetIds.splice(clampedIndex, 0, id);

			this.db
				.prepare(
					`UPDATE tasks SET column_id = ?, order_in_column = ?, updated_at = ? WHERE id = ?`,
				)
				.run(columnId, clampedIndex, now, id);

			renumber(sourceIds);
			renumber(targetIds);
		}

		return this.getById(id);
	}

	delete(id: string): boolean {
		const stmt = this.db.prepare("DELETE FROM tasks WHERE id = ?");
		const result = stmt.run(id);
		return result.changes > 0;
	}
}

export const taskRepo = new TaskRepository(dbManager.connect());
