import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { dbManager } from "../db";
import type { TaskLink, TaskLinkType } from "@/types/kanban";

interface CreateTaskLinkInput {
	projectId: string;
	fromTaskId: string;
	toTaskId: string;
	linkType: TaskLinkType;
}

export class TaskLinkRepository {
	constructor(private db: Database.Database) {}

	create(input: CreateTaskLinkInput): TaskLink {
		const id = randomUUID();
		const now = new Date().toISOString();

		this.db
			.prepare(
				`INSERT INTO task_links (id, project_id, from_task_id, to_task_id, link_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				id,
				input.projectId,
				input.fromTaskId,
				input.toTaskId,
				input.linkType,
				now,
				now,
			);

		return this.getById(id)!;
	}

	getById(id: string): TaskLink | null {
		const link = this.db
			.prepare(
				`SELECT id,
                project_id as projectId,
                from_task_id as fromTaskId,
                to_task_id as toTaskId,
                link_type as linkType,
                created_at as createdAt,
                updated_at as updatedAt
         FROM task_links
         WHERE id = ?`,
			)
			.get(id) as TaskLink | undefined;

		return link ?? null;
	}

	listByTaskId(taskId: string): TaskLink[] {
		return this.db
			.prepare(
				`SELECT id,
                project_id as projectId,
                from_task_id as fromTaskId,
                to_task_id as toTaskId,
                link_type as linkType,
                created_at as createdAt,
                updated_at as updatedAt
         FROM task_links
         WHERE from_task_id = ? OR to_task_id = ?
         ORDER BY created_at ASC`,
			)
			.all(taskId, taskId) as TaskLink[];
	}

	listByProject(projectId: string, linkType?: TaskLinkType): TaskLink[] {
		const baseQuery = `SELECT id,
                project_id as projectId,
                from_task_id as fromTaskId,
                to_task_id as toTaskId,
                link_type as linkType,
                created_at as createdAt,
                updated_at as updatedAt
         FROM task_links
         WHERE project_id = ?`;

		if (linkType) {
			return this.db
				.prepare(`${baseQuery} AND link_type = ? ORDER BY created_at ASC`)
				.all(projectId, linkType) as TaskLink[];
		}

		return this.db
			.prepare(`${baseQuery} ORDER BY created_at ASC`)
			.all(projectId) as TaskLink[];
	}

	findByEndpoints(
		fromTaskId: string,
		toTaskId: string,
		linkType: TaskLinkType,
	): TaskLink | null {
		if (linkType === "relates") {
			const link = this.db
				.prepare(
					`SELECT id,
                  project_id as projectId,
                  from_task_id as fromTaskId,
                  to_task_id as toTaskId,
                  link_type as linkType,
                  created_at as createdAt,
                  updated_at as updatedAt
           FROM task_links
           WHERE link_type = ?
             AND ((from_task_id = ? AND to_task_id = ?) OR (from_task_id = ? AND to_task_id = ?))
           LIMIT 1`,
				)
				.get(linkType, fromTaskId, toTaskId, toTaskId, fromTaskId) as
				| TaskLink
				| undefined;

			return link ?? null;
		}

		const link = this.db
			.prepare(
				`SELECT id,
                project_id as projectId,
                from_task_id as fromTaskId,
                to_task_id as toTaskId,
                link_type as linkType,
                created_at as createdAt,
                updated_at as updatedAt
         FROM task_links
         WHERE from_task_id = ? AND to_task_id = ? AND link_type = ?
         LIMIT 1`,
			)
			.get(fromTaskId, toTaskId, linkType) as TaskLink | undefined;

		return link ?? null;
	}

	delete(linkId: string): boolean {
		const result = this.db
			.prepare(`DELETE FROM task_links WHERE id = ?`)
			.run(linkId);
		return result.changes > 0;
	}
}

export const taskLinkRepo = new TaskLinkRepository(dbManager.connect());
