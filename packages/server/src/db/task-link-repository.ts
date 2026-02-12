import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'
import type { TaskLink, TaskLinkType } from "@shared/types/ipc"

type CreateTaskLinkInput = {
  projectId: string
  fromTaskId: string
  toTaskId: string
  linkType: TaskLinkType
}

export class TaskLinkRepository {
  create(input: CreateTaskLinkInput): TaskLink {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const id = randomUUID()

    db.prepare(
      `
        INSERT INTO task_links (
          id, project_id, from_task_id, to_task_id, link_type, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    ).run(id, input.projectId, input.fromTaskId, input.toTaskId, input.linkType, now, now)

    return {
      id,
      projectId: input.projectId,
      fromTaskId: input.fromTaskId,
      toTaskId: input.toTaskId,
      linkType: input.linkType,
      createdAt: now,
      updatedAt: now,
    }
  }

  listByTaskId(taskId: string): TaskLink[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
          SELECT
            id,
            project_id as projectId,
            from_task_id as fromTaskId,
            to_task_id as toTaskId,
            link_type as linkType,
            created_at as createdAt,
            updated_at as updatedAt
          FROM task_links
          WHERE from_task_id = ? OR to_task_id = ?
          ORDER BY created_at ASC
        `
      )
      .all(taskId, taskId) as TaskLink[]

    return rows
  }

  listByProject(projectId: string, linkType?: TaskLinkType): TaskLink[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
          SELECT
            id,
            project_id as projectId,
            from_task_id as fromTaskId,
            to_task_id as toTaskId,
            link_type as linkType,
            created_at as createdAt,
            updated_at as updatedAt
          FROM task_links
          WHERE project_id = ?
          ${linkType ? 'AND link_type = ?' : ''}
          ORDER BY created_at ASC
        `
      )
      .all(...(linkType ? [projectId, linkType] : [projectId])) as TaskLink[]

    return rows
  }

  findByEndpoints(fromTaskId: string, toTaskId: string, linkType: TaskLinkType): TaskLink | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
          SELECT
            id,
            project_id as projectId,
            from_task_id as fromTaskId,
            to_task_id as toTaskId,
            link_type as linkType,
            created_at as createdAt,
            updated_at as updatedAt
          FROM task_links
          WHERE from_task_id = ? AND to_task_id = ? AND link_type = ?
          LIMIT 1
        `
      )
      .get(fromTaskId, toTaskId, linkType) as TaskLink | undefined

    return row ?? null
  }

  delete(linkId: string): void {
    const db = dbManager.connect()
    db.prepare('DELETE FROM task_links WHERE id = ?').run(linkId)
  }
}

export const taskLinkRepo = new TaskLinkRepository()
