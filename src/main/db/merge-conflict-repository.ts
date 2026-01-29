import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'

export type MergeConflictRecord = {
  id: string
  taskId: string
  prId: string
  status: 'detected' | 'suggested' | 'applied' | 'resolved' | 'aborted'
  baseBranch: string
  headBranch: string
  conflictFilesJson: string
  createdAt: string
  updatedAt: string
}

export class MergeConflictRepository {
  create(input: Omit<MergeConflictRecord, 'id' | 'createdAt' | 'updatedAt'>): MergeConflictRecord {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const id = randomUUID()

    db.prepare(
      `
      INSERT INTO merge_conflicts (
        id, task_id, pr_id, status, base_branch, head_branch, conflict_files_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.taskId,
      input.prId,
      input.status,
      input.baseBranch,
      input.headBranch,
      input.conflictFilesJson,
      now,
      now
    )

    return {
      id,
      ...input,
      createdAt: now,
      updatedAt: now,
    }
  }

  getById(conflictId: string): MergeConflictRecord | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT
          id,
          task_id as taskId,
          pr_id as prId,
          status,
          base_branch as baseBranch,
          head_branch as headBranch,
          conflict_files_json as conflictFilesJson,
          created_at as createdAt,
          updated_at as updatedAt
        FROM merge_conflicts
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(conflictId) as MergeConflictRecord | undefined

    return row ?? null
  }

  getLatestByTaskId(taskId: string): MergeConflictRecord | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT
          id,
          task_id as taskId,
          pr_id as prId,
          status,
          base_branch as baseBranch,
          head_branch as headBranch,
          conflict_files_json as conflictFilesJson,
          created_at as createdAt,
          updated_at as updatedAt
        FROM merge_conflicts
        WHERE task_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `
      )
      .get(taskId) as MergeConflictRecord | undefined

    return row ?? null
  }

  update(conflictId: string, patch: Partial<MergeConflictRecord>): MergeConflictRecord | null {
    const db = dbManager.connect()
    const now = new Date().toISOString()

    const sets: string[] = []
    const values: unknown[] = []

    const allowedFields: (keyof MergeConflictRecord)[] = [
      'status',
      'conflictFilesJson',
      'baseBranch',
      'headBranch',
      'prId',
      'taskId',
    ]

    allowedFields.forEach((field) => {
      if (patch[field] === undefined) return
      if (field === 'conflictFilesJson') {
        sets.push('conflict_files_json = ?')
        values.push(patch[field])
        return
      }
      if (field === 'baseBranch') {
        sets.push('base_branch = ?')
        values.push(patch[field])
        return
      }
      if (field === 'headBranch') {
        sets.push('head_branch = ?')
        values.push(patch[field])
        return
      }
      if (field === 'prId') {
        sets.push('pr_id = ?')
        values.push(patch[field])
        return
      }
      if (field === 'taskId') {
        sets.push('task_id = ?')
        values.push(patch[field])
        return
      }
      sets.push(`${field} = ?`)
      values.push(patch[field])
    })

    if (sets.length === 0) return this.getById(conflictId)

    values.push(now, conflictId)
    db.prepare(
      `
      UPDATE merge_conflicts
      SET ${sets.join(', ')}, updated_at = ?
      WHERE id = ?
    `
    ).run(...values)

    return this.getById(conflictId)
  }
}

export const mergeConflictRepo = new MergeConflictRepository()
