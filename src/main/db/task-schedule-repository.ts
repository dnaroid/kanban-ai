import { dbManager } from './index.js'
import { taskRepo } from './task-repository'
import { taskLinkRepo } from './task-link-repository'
import type { TimelineTask, TaskSchedule } from '../../shared/types/ipc'

type ScheduleUpdateInput = {
  taskId: string
  startDate: string | null
  dueDate: string | null
  estimatePoints?: number
  estimateHours?: number
  assignee?: string
}

type ScheduleRow = {
  taskId: string
  startDate: string | null
  dueDate: string | null
  estimatePoints: number | null
  estimateHours: number | null
  assignee: string | null
  updatedAt: string | null
}

export class TaskScheduleRepository {
  listByProject(projectId: string): TimelineTask[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
          SELECT
            tasks.id as id,
            tasks.project_id as projectId,
            tasks.title as title,
            tasks.status as status,
            tasks.priority as priority,
            tasks.tags_json as tagsJson,
            task_schedule.start_date as startDate,
            task_schedule.due_date as dueDate,
            task_schedule.estimate_points as estimatePoints,
            task_schedule.estimate_hours as estimateHours,
            task_schedule.assignee as assignee,
            task_schedule.updated_at as scheduleUpdatedAt,
            tasks.updated_at as taskUpdatedAt
          FROM tasks
          LEFT JOIN task_schedule ON task_schedule.task_id = tasks.id
          WHERE tasks.project_id = ?
          ORDER BY tasks.created_at ASC
        `
      )
      .all(projectId) as Array<{
      id: string
      projectId: string
      title: string
      status: TimelineTask['status']
      priority: TimelineTask['priority']
      tagsJson: string | null
      startDate: string | null
      dueDate: string | null
      estimatePoints: number | null
      estimateHours: number | null
      assignee: string | null
      scheduleUpdatedAt: string | null
      taskUpdatedAt: string
    }>

    return rows.map((row) => {
      let tags: string[] = []
      try {
        tags = row.tagsJson ? JSON.parse(row.tagsJson) : []
      } catch {
        tags = []
      }
      return {
        id: row.id,
        projectId: row.projectId,
        title: row.title,
        status: row.status,
        priority: row.priority,
        tags,
        startDate: row.startDate ?? null,
        dueDate: row.dueDate ?? null,
        estimatePoints: row.estimatePoints ?? 0,
        estimateHours: row.estimateHours ?? 0,
        assignee: row.assignee ?? '',
        updatedAt: row.scheduleUpdatedAt ?? row.taskUpdatedAt,
      }
    })
  }

  update(input: ScheduleUpdateInput): TaskSchedule {
    const task = taskRepo.getById(input.taskId)
    if (!task) {
      throw new Error('Task not found')
    }

    const db = dbManager.connect()
    const existing = db
      .prepare(
        `
          SELECT
            task_id as taskId,
            start_date as startDate,
            due_date as dueDate,
            estimate_points as estimatePoints,
            estimate_hours as estimateHours,
            assignee as assignee,
            updated_at as updatedAt
          FROM task_schedule
          WHERE task_id = ?
        `
      )
      .get(input.taskId) as ScheduleRow | undefined

    const now = new Date().toISOString()
    const startDate = input.startDate ?? existing?.startDate ?? null
    const dueDate = input.dueDate ?? existing?.dueDate ?? null
    const estimatePoints = input.estimatePoints ?? existing?.estimatePoints ?? 0
    const estimateHours = input.estimateHours ?? existing?.estimateHours ?? 0
    const assignee = input.assignee ?? existing?.assignee ?? ''

    if (startDate && dueDate) {
      const startTime = new Date(startDate).getTime()
      const dueTime = new Date(dueDate).getTime()
      if (Number.isFinite(startTime) && Number.isFinite(dueTime) && dueTime < startTime) {
        throw new Error('Due date cannot be before start date')
      }
    }

    if (dueDate) {
      const blockers = taskLinkRepo
        .listByTaskId(input.taskId)
        .filter((link) => link.linkType === 'blocks' && link.toTaskId === input.taskId)

      if (blockers.length > 0) {
        const blockerIds = blockers.map((link) => link.fromTaskId)
        const placeholders = blockerIds.map(() => '?').join(',')
        const rows = db
          .prepare(
            `
              SELECT
                task_id as taskId,
                due_date as dueDate
              FROM task_schedule
              WHERE task_id IN (${placeholders})
            `
          )
          .all(...blockerIds) as Array<{ taskId: string; dueDate: string | null }>

        const dueTime = new Date(dueDate).getTime()
        const invalid = rows.some((row) => {
          if (!row.dueDate) return false
          const blockerDue = new Date(row.dueDate).getTime()
          return Number.isFinite(blockerDue) && blockerDue > dueTime
        })

        if (invalid) {
          throw new Error('Due date cannot be before blocked-by tasks')
        }
      }
    }

    db.prepare(
      `
        INSERT INTO task_schedule (
          task_id, start_date, due_date, estimate_points, estimate_hours, assignee, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          start_date = excluded.start_date,
          due_date = excluded.due_date,
          estimate_points = excluded.estimate_points,
          estimate_hours = excluded.estimate_hours,
          assignee = excluded.assignee,
          updated_at = excluded.updated_at
      `
    ).run(input.taskId, startDate, dueDate, estimatePoints, estimateHours, assignee, now)

    return {
      taskId: input.taskId,
      startDate,
      dueDate,
      estimatePoints,
      estimateHours,
      assignee,
      updatedAt: now,
    }
  }
}

export const taskScheduleRepo = new TaskScheduleRepository()
