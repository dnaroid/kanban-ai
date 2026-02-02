import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'
import type { CreateRunInput, RunRecord } from './run-types'

const parseJsonObject = (value: string | null | undefined): Record<string, unknown> => {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch (error) {
    console.warn('[RunRepo] Failed to parse JSON:', error)
    return {}
  }
}

const mapRunRow = (row: {
  id: string
  taskId: string
  roleId: string
  mode: RunRecord['mode']
  kind: RunRecord['kind']
  status: RunRecord['status']
  startedAt: string | null
  finishedAt: string | null
  errorText: string
  budgetJson: string
  contextSnapshotId: string
  aiTokensIn: number
  aiTokensOut: number
  aiCostUsd: number
  sessionId: string | null
  createdAt: string
  updatedAt: string
}): RunRecord => ({
  id: row.id,
  taskId: row.taskId,
  roleId: row.roleId,
  mode: row.mode,
  kind: row.kind,
  status: row.status,
  startedAt: row.startedAt ?? undefined,
  finishedAt: row.finishedAt ?? undefined,
  errorText: row.errorText ?? '',
  budget: parseJsonObject(row.budgetJson),
  contextSnapshotId: row.contextSnapshotId,
  aiTokensIn: row.aiTokensIn ?? 0,
  aiTokensOut: row.aiTokensOut ?? 0,
  aiCostUsd: row.aiCostUsd ?? 0,
  sessionId: row.sessionId ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export class RunRepository {
  create(input: CreateRunInput): RunRecord {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const id = randomUUID()

    const mode = input.mode ?? 'execute'
    const kind = input.kind ?? 'task-run'
    const status = input.status ?? 'queued'
    const budgetJson = JSON.stringify(input.budget ?? {})

    db.prepare(
      `
      INSERT INTO runs (
        id, task_id, role_id, mode, kind, status, session_id, started_at, finished_at, error_text,
        budget_json, context_snapshot_id, ai_tokens_in, ai_tokens_out, ai_cost_usd, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.taskId,
      input.roleId,
      mode,
      kind,
      status,
      null,
      null,
      null,
      '',
      budgetJson,
      input.contextSnapshotId,
      0,
      0,
      0,
      now,
      now
    )

    return {
      id,
      taskId: input.taskId,
      roleId: input.roleId,
      mode,
      kind,
      status,
      errorText: '',
      budget: input.budget ?? {},
      contextSnapshotId: input.contextSnapshotId,
      aiTokensIn: 0,
      aiTokensOut: 0,
      aiCostUsd: 0,
      createdAt: now,
      updatedAt: now,
    }
  }

  getById(runId: string): RunRecord | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT
          r.id,
          r.task_id as taskId,
          r.role_id as roleId,
          r.mode,
          r.kind,
          r.status,
          r.session_id as sessionId,
          r.started_at as startedAt,
          r.finished_at as finishedAt,
          r.error_text as errorText,
          r.budget_json as budgetJson,
          r.context_snapshot_id as contextSnapshotId,
          r.ai_tokens_in as aiTokensIn,
          r.ai_tokens_out as aiTokensOut,
          r.ai_cost_usd as aiCostUsd,
          r.created_at as createdAt,
          r.updated_at as updatedAt
        FROM runs r
        WHERE r.id = ?
        LIMIT 1
      `
      )
      .get(runId) as
      | {
          id: string
          taskId: string
          roleId: string
          mode: RunRecord['mode']
          kind: RunRecord['kind']
          status: RunRecord['status']
          startedAt: string | null
          finishedAt: string | null
          errorText: string
          budgetJson: string
          contextSnapshotId: string
          aiTokensIn: number
          aiTokensOut: number
          aiCostUsd: number
          sessionId: string | null
          createdAt: string
          updatedAt: string
        }
      | undefined

    if (!row) return null
    return mapRunRow(row)
  }

  listByTask(taskId: string): RunRecord[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
        SELECT
          r.id,
          r.task_id as taskId,
          r.role_id as roleId,
          r.mode,
          r.kind,
          r.status,
          r.session_id as sessionId,
          r.started_at as startedAt,
          r.finished_at as finishedAt,
          r.error_text as errorText,
          r.budget_json as budgetJson,
          r.context_snapshot_id as contextSnapshotId,
          r.ai_tokens_in as aiTokensIn,
          r.ai_tokens_out as aiTokensOut,
          r.ai_cost_usd as aiCostUsd,
          r.created_at as createdAt,
          r.updated_at as updatedAt
        FROM runs r
        WHERE r.task_id = ?
        ORDER BY r.created_at DESC
      `
      )
      .all(taskId) as {
      id: string
      taskId: string
      roleId: string
      mode: RunRecord['mode']
      kind: RunRecord['kind']
      status: RunRecord['status']
      startedAt: string | null
      finishedAt: string | null
      errorText: string
      budgetJson: string
      contextSnapshotId: string
      aiTokensIn: number
      aiTokensOut: number
      aiCostUsd: number
      sessionId: string | null
      createdAt: string
      updatedAt: string
    }[]

    return rows.map(mapRunRow)
  }

  listByStatus(status: RunRecord['status'], limit?: number): RunRecord[] {
    const db = dbManager.connect()
    const values: unknown[] = [status]

    let sql = `
        SELECT
          r.id,
          r.task_id as taskId,
          r.role_id as roleId,
          r.mode,
          r.kind,
          r.status,
          r.session_id as sessionId,
          r.started_at as startedAt,
          r.finished_at as finishedAt,
          r.error_text as errorText,
          r.budget_json as budgetJson,
          r.context_snapshot_id as contextSnapshotId,
          r.ai_tokens_in as aiTokensIn,
          r.ai_tokens_out as aiTokensOut,
          r.ai_cost_usd as aiCostUsd,
          r.created_at as createdAt,
          r.updated_at as updatedAt
        FROM runs r
        WHERE r.status = ?
        ORDER BY r.created_at ASC
      `

    if (limit) {
      sql += ' LIMIT ?'
      values.push(limit)
    }

    const rows = db.prepare(sql).all(...values) as {
      id: string
      taskId: string
      roleId: string
      mode: RunRecord['mode']
      kind: RunRecord['kind']
      status: RunRecord['status']
      startedAt: string | null
      finishedAt: string | null
      errorText: string
      budgetJson: string
      contextSnapshotId: string
      aiTokensIn: number
      aiTokensOut: number
      aiCostUsd: number
      sessionId: string | null
      createdAt: string
      updatedAt: string
    }[]

    return rows.map(mapRunRow)
  }

  update(runId: string, patch: Partial<RunRecord>): void {
    const db = dbManager.connect()
    const now = new Date().toISOString()

    const sets: string[] = []
    const values: unknown[] = []

    const allowedFields: (keyof RunRecord)[] = [
      'roleId',
      'mode',
      'kind',
      'status',
      'sessionId',
      'startedAt',
      'finishedAt',
      'errorText',
      'budget',
      'contextSnapshotId',
      'aiTokensIn',
      'aiTokensOut',
      'aiCostUsd',
    ]

    allowedFields.forEach((field) => {
      if (patch[field] === undefined) return
      if (field === 'roleId') {
        sets.push('role_id = ?')
        values.push(patch[field])
        return
      }
      if (field === 'startedAt') {
        sets.push('started_at = ?')
        values.push(patch[field] ?? null)
        return
      }
      if (field === 'finishedAt') {
        sets.push('finished_at = ?')
        values.push(patch[field] ?? null)
        return
      }
      if (field === 'errorText') {
        sets.push('error_text = ?')
        values.push(patch[field] ?? '')
        return
      }
      if (field === 'budget') {
        sets.push('budget_json = ?')
        values.push(JSON.stringify(patch[field] ?? {}))
        return
      }
      if (field === 'contextSnapshotId') {
        sets.push('context_snapshot_id = ?')
        values.push(patch[field])
        return
      }
      if (field === 'sessionId') {
        sets.push('session_id = ?')
        values.push(patch[field] ?? null)
        return
      }
      sets.push(`${field} = ?`)
      values.push(patch[field])
    })

    if (sets.length === 0) return

    values.push(now, runId)
    db.prepare(
      `
      UPDATE runs
      SET ${sets.join(', ')}, updated_at = ?
      WHERE id = ?
    `
    ).run(...values)
  }

  delete(runId: string): void {
    const db = dbManager.connect()
    db.prepare('DELETE FROM runs WHERE id = ?').run(runId)
  }
}

export interface RunRepository {
  listByStatus(status: RunRecord['status'], limit?: number): RunRecord[]
}

export const runRepo = new RunRepository()
