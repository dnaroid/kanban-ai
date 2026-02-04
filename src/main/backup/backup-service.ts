import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import AdmZip from 'adm-zip'
import { dbManager } from '../db/index.js'
import { projectRepo } from '../db/project-repository'
import { pluginRepo } from '../plugins/plugin-repository'

type ExportInput = {
  projectId: string
  toPath: string
}

type ImportInput = {
  zipPath: string
  mode: 'new' | 'overwrite'
  projectPath?: string
}

const getDbPath = () => path.join(app.getPath('userData'), 'bk-kanban.db')

const writeJson = (filePath: string, data: unknown) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

const extractZip = (zipPath: string, targetDir: string) => {
  const zip = new AdmZip(zipPath)
  zip.extractAllTo(targetDir, true)
}

const prepareExportDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-export-'))
  return dir
}

const copyIfExists = (fromPath: string, toPath: string) => {
  if (fs.existsSync(fromPath)) {
    fs.copyFileSync(fromPath, toPath)
  }
}

const makePlaceholders = (count: number) => Array(count).fill('?').join(',')

export const backupService = {
  exportProject({ projectId, toPath }: ExportInput) {
    const project = projectRepo.getById(projectId)
    if (!project) {
      throw new Error('Project not found')
    }

    const db = dbManager.connect()
    db.pragma('wal_checkpoint(TRUNCATE)')

    const tempDir = prepareExportDir()
    const exportDbPath = path.join(tempDir, 'app.db')
    copyIfExists(getDbPath(), exportDbPath)
    const artifacts = db
      .prepare(
        `
            SELECT a.id,
                   a.run_id        as runId,
                   a.kind,
                   a.title,
                   a.content,
                   a.metadata_json as metadataJson,
                   a.created_at    as createdAt
            FROM artifacts a
                     JOIN runs r ON r.id = a.run_id
                     JOIN tasks t ON t.id = r.task_id
            WHERE t.project_id = ?
        `
      )
      .all(projectId)

    writeJson(path.join(tempDir, 'project.json'), {
      project,
    })
    writeJson(path.join(tempDir, 'plugins.json'), pluginRepo.list())
    writeJson(path.join(tempDir, 'artifacts.json'), artifacts)

    const zip = new AdmZip()
    zip.addLocalFile(exportDbPath)
    zip.addLocalFile(path.join(tempDir, 'project.json'))
    zip.addLocalFile(path.join(tempDir, 'plugins.json'))
    zip.addLocalFile(path.join(tempDir, 'artifacts.json'))
    zip.writeZip(toPath)

    return { ok: true, path: toPath }
  },
  importProject({ zipPath, mode, projectPath }: ImportInput) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-import-'))
    extractZip(zipPath, tempDir)

    const exportDbPath = path.join(tempDir, 'app.db')
    if (!fs.existsSync(exportDbPath)) {
      throw new Error('Exported database not found')
    }

    const projectPayload = JSON.parse(
      fs.readFileSync(path.join(tempDir, 'project.json'), 'utf8')
    ) as {
      project: { id: string; name: string; path: string }
      vcsProject?: { repoPath?: string } | null
    }

    if (mode === 'overwrite') {
      fs.copyFileSync(exportDbPath, getDbPath())
      return { ok: true, projectId: projectPayload.project.id }
    }

    if (!projectPath) {
      throw new Error('Project path is required for new import')
    }

    const db = dbManager.connect()
    const now = new Date().toISOString()
    const newProjectId = randomUUID()
    const name = `${projectPayload.project.name} (imported)`

    db.exec(`ATTACH "${exportDbPath}" AS importdb;`)

    const sourceProjectId = projectPayload.project.id
    const safeAll = <T>(sql: string, params: unknown[] = []) => {
      try {
        return db.prepare(sql).all(...params) as T[]
      } catch {
        return []
      }
    }

    const boardRows = safeAll<{
      id: string
      name: string
      createdAt: string
      updatedAt: string
    }>(
      `
          SELECT id, name, created_at as createdAt, updated_at as updatedAt
          FROM importdb.boards
          WHERE project_id = ?
      `,
      [sourceProjectId]
    )
    const boardIdMap = new Map(boardRows.map((row) => [row.id, randomUUID()]))

    const boardIds = boardRows.map((row) => row.id)
    const columnRows = boardIds.length
      ? safeAll<{
          id: string
          boardId: string
          name: string
          orderIndex: number
          createdAt: string
          updatedAt: string
        }>(
          `
            SELECT id,
                   board_id    as boardId,
                   name,
                   order_index as orderIndex,
                   created_at  as createdAt,
                   updated_at  as updatedAt
            FROM importdb.board_columns
            WHERE board_id IN (${makePlaceholders(boardIds.length)})
        `,
          boardIds
        )
      : []
    const columnIdMap = new Map(columnRows.map((row) => [row.id, randomUUID()]))

    const taskRows = safeAll<{
      id: string
      boardId: string
      columnId: string
      title: string
      description: string | null
      descriptionMd: string | null
      status: string
      priority: string
      type: string
      orderInColumn: number
      tagsJson: string | null
      assignedAgent: string | null
      createdAt: string
      updatedAt: string
    }>(
      `
          SELECT id,
                 board_id        as boardId,
                 column_id       as columnId,
                 title,
                 description,
                 description_md  as descriptionMd,
                 status,
                 priority,
                 type,
                 order_in_column as orderInColumn,
                 tags_json       as tagsJson,
                 assigned_agent  as assignedAgent,
                 created_at      as createdAt,
                 updated_at      as updatedAt
          FROM importdb.tasks
          WHERE project_id = ?
      `,
      [sourceProjectId]
    )
    const taskIdMap = new Map(taskRows.map((row) => [row.id, randomUUID()]))
    const taskIds = taskRows.map((row) => row.id)

    const contextRows = taskIds.length
      ? safeAll<{
          id: string
          taskId: string
          kind: string
          summary: string
          payloadJson: string
          hash: string
          createdAt: string
        }>(
          `
            SELECT id,
                   task_id      as taskId,
                   kind,
                   summary,
                   payload_json as payloadJson,
                   hash,
                   created_at   as createdAt
            FROM importdb.context_snapshots
            WHERE task_id IN (${makePlaceholders(taskIds.length)})
        `,
          taskIds
        )
      : []
    const contextIdMap = new Map(contextRows.map((row) => [row.id, randomUUID()]))

    const runRows = taskIds.length
      ? safeAll<{
          id: string
          taskId: string
          roleId: string
          mode: string
          status: string
          startedAt: string | null
          finishedAt: string | null
          errorText: string | null
          budgetJson: string
          contextSnapshotId: string
          aiTokensIn: number | null
          aiTokensOut: number | null
          aiCostUsd: number | null
          createdAt: string
          updatedAt: string
        }>(
          `
            SELECT id,
                   task_id             as taskId,
                   role_id             as roleId,
                   mode,
                   status,
                   started_at          as startedAt,
                   finished_at         as finishedAt,
                   error_text          as errorText,
                   budget_json         as budgetJson,
                   context_snapshot_id as contextSnapshotId,
                   ai_tokens_in        as aiTokensIn,
                   ai_tokens_out       as aiTokensOut,
                   ai_cost_usd         as aiCostUsd,
                   created_at          as createdAt,
                   updated_at          as updatedAt
            FROM importdb.runs
            WHERE task_id IN (${makePlaceholders(taskIds.length)})
        `,
          taskIds
        )
      : []
    const runIdMap = new Map(runRows.map((row) => [row.id, randomUUID()]))
    const runIds = runRows.map((row) => row.id)

    const artifactRows = runIds.length
      ? safeAll<{
          id: string
          runId: string
          kind: string
          title: string
          content: string
          metadataJson: string
          createdAt: string
        }>(
          `
            SELECT id,
                   run_id        as runId,
                   kind,
                   title,
                   content,
                   metadata_json as metadataJson,
                   created_at    as createdAt
            FROM importdb.artifacts
            WHERE run_id IN (${makePlaceholders(runIds.length)})
        `,
          runIds
        )
      : []

    const taskEventRows = taskIds.length
      ? safeAll<{
          id: string
          taskId: string
          ts: string
          eventType: string
          payloadJson: string
        }>(
          `
            SELECT id, task_id as taskId, ts, event_type as eventType, payload_json as payloadJson
            FROM importdb.task_events
            WHERE task_id IN (${makePlaceholders(taskIds.length)})
        `,
          taskIds
        )
      : []

    const taskLinkRows = safeAll<{
      id: string
      fromTaskId: string
      toTaskId: string
      linkType: string
      createdAt: string
      updatedAt: string
    }>(
      `
          SELECT id,
                 from_task_id as fromTaskId,
                 to_task_id   as toTaskId,
                 link_type    as linkType,
                 created_at   as createdAt,
                 updated_at   as updatedAt
          FROM importdb.task_links
          WHERE project_id = ?
      `,
      [sourceProjectId]
    )

    const scheduleRows = taskIds.length
      ? safeAll<{
          taskId: string
          startDate: string | null
          dueDate: string | null
          estimatePoints: number
          estimateHours: number
          assignee: string
          updatedAt: string
        }>(
          `
            SELECT task_id         as taskId,
                   start_date      as startDate,
                   due_date        as dueDate,
                   estimate_points as estimatePoints,
                   estimate_hours  as estimateHours,
                   assignee,
                   updated_at      as updatedAt
            FROM importdb.task_schedule
            WHERE task_id IN (${makePlaceholders(taskIds.length)})
        `,
          taskIds
        )
      : []

    db.transaction(() => {
      db.prepare(
        `
            INSERT INTO projects (id, name, path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `
      ).run(newProjectId, name, projectPath, now, now)

      const insertBoard = db.prepare(
        `
            INSERT INTO boards (id, project_id, name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `
      )
      boardRows.forEach((row) => {
        const newId = boardIdMap.get(row.id) ?? randomUUID()
        insertBoard.run(newId, newProjectId, row.name, row.createdAt, row.updatedAt)
      })

      const insertColumn = db.prepare(
        `
            INSERT INTO board_columns (id, board_id, name, order_index, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      columnRows.forEach((row) => {
        const newId = columnIdMap.get(row.id) ?? randomUUID()
        const newBoardId = boardIdMap.get(row.boardId) ?? row.boardId
        insertColumn.run(newId, newBoardId, row.name, row.orderIndex, row.createdAt, row.updatedAt)
      })

      const insertTask = db.prepare(
        `
            INSERT INTO tasks (id, project_id, board_id, column_id, title, description, description_md,
                               status, priority, type, order_in_column, tags_json, assigned_agent,
                               created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      taskRows.forEach((row) => {
        const newId = taskIdMap.get(row.id) ?? randomUUID()
        const newBoardId = boardIdMap.get(row.boardId) ?? row.boardId
        const newColumnId = columnIdMap.get(row.columnId) ?? row.columnId
        insertTask.run(
          newId,
          newProjectId,
          newBoardId,
          newColumnId,
          row.title,
          row.description ?? null,
          row.descriptionMd ?? null,
          row.status,
          row.priority,
          row.type,
          row.orderInColumn,
          row.tagsJson ?? JSON.stringify([]),
          row.assignedAgent ?? null,
          row.createdAt,
          row.updatedAt
        )
      })

      const insertTaskEvent = db.prepare(
        `
            INSERT INTO task_events (id, task_id, ts, event_type, payload_json)
            VALUES (?, ?, ?, ?, ?)
        `
      )
      taskEventRows.forEach((row) => {
        const newTaskId = taskIdMap.get(row.taskId) ?? row.taskId
        insertTaskEvent.run(randomUUID(), newTaskId, row.ts, row.eventType, row.payloadJson)
      })

      const insertTaskLink = db.prepare(
        `
            INSERT INTO task_links (id, project_id, from_task_id, to_task_id, link_type, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      taskLinkRows.forEach((row) => {
        const fromTaskId = taskIdMap.get(row.fromTaskId) ?? row.fromTaskId
        const toTaskId = taskIdMap.get(row.toTaskId) ?? row.toTaskId
        insertTaskLink.run(
          randomUUID(),
          newProjectId,
          fromTaskId,
          toTaskId,
          row.linkType,
          row.createdAt,
          row.updatedAt
        )
      })

      const insertSchedule = db.prepare(
        `
            INSERT INTO task_schedule (task_id, start_date, due_date, estimate_points, estimate_hours, assignee,
                                       updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      scheduleRows.forEach((row) => {
        const newTaskId = taskIdMap.get(row.taskId) ?? row.taskId
        insertSchedule.run(
          newTaskId,
          row.startDate,
          row.dueDate,
          row.estimatePoints,
          row.estimateHours,
          row.assignee,
          row.updatedAt
        )
      })

      const insertContext = db.prepare(
        `
            INSERT INTO context_snapshots (id, task_id, kind, summary, payload_json, hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      contextRows.forEach((row) => {
        const newTaskId = taskIdMap.get(row.taskId) ?? row.taskId
        const newContextId = contextIdMap.get(row.id) ?? randomUUID()
        insertContext.run(
          newContextId,
          newTaskId,
          row.kind,
          row.summary,
          row.payloadJson,
          row.hash,
          row.createdAt
        )
      })

      const insertRun = db.prepare(
        `
            INSERT INTO runs (id, task_id, role_id, mode, status, started_at, finished_at, error_text,
                              budget_json, context_snapshot_id, ai_tokens_in, ai_tokens_out, ai_cost_usd,
                              created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      runRows.forEach((row) => {
        const newRunId = runIdMap.get(row.id) ?? randomUUID()
        const newTaskId = taskIdMap.get(row.taskId) ?? row.taskId
        const newContextId = contextIdMap.get(row.contextSnapshotId) ?? row.contextSnapshotId
        insertRun.run(
          newRunId,
          newTaskId,
          row.roleId,
          row.mode,
          row.status,
          row.startedAt,
          row.finishedAt,
          row.errorText || null,
          row.budgetJson,
          newContextId,
          row.aiTokensIn ?? 0,
          row.aiTokensOut ?? 0,
          row.aiCostUsd ?? 0,
          row.createdAt,
          row.updatedAt
        )
      })

      const insertArtifact = db.prepare(
        `
            INSERT INTO artifacts (id, run_id, kind, title, content, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      artifactRows.forEach((row) => {
        const newRunId = runIdMap.get(row.runId) ?? row.runId
        insertArtifact.run(
          randomUUID(),
          newRunId,
          row.kind,
          row.title,
          row.content,
          row.metadataJson,
          row.createdAt
        )
      })
    })()

    db.exec('DETACH importdb;')

    return { ok: true, projectId: newProjectId }
  },
}
