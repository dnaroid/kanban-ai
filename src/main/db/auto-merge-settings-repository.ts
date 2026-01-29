import { dbManager } from './index.js'

export type AutoMergeSettingsRecord = {
  projectId: string
  enabled: boolean
  method: 'merge' | 'squash' | 'rebase'
  requireCiSuccess: boolean
  requiredApprovals: number
  requireNoConflicts: boolean
  createdAt: string
  updatedAt: string
}

export class AutoMergeSettingsRepository {
  getByProjectId(projectId: string): AutoMergeSettingsRecord | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT
          project_id as projectId,
          enabled,
          method,
          require_ci_success as requireCiSuccess,
          required_approvals as requiredApprovals,
          require_no_conflicts as requireNoConflicts,
          created_at as createdAt,
          updated_at as updatedAt
        FROM auto_merge_settings
        WHERE project_id = ?
        LIMIT 1
      `
      )
      .get(projectId) as
      | (Omit<AutoMergeSettingsRecord, 'enabled' | 'requireCiSuccess' | 'requireNoConflicts'> & {
          enabled: number
          requireCiSuccess: number
          requireNoConflicts: number
        })
      | undefined

    if (!row) return null

    return {
      ...row,
      enabled: Boolean(row.enabled),
      requireCiSuccess: Boolean(row.requireCiSuccess),
      requireNoConflicts: Boolean(row.requireNoConflicts),
    }
  }

  upsert(
    projectId: string,
    patch: Omit<AutoMergeSettingsRecord, 'projectId' | 'createdAt' | 'updatedAt'>
  ): AutoMergeSettingsRecord {
    const db = dbManager.connect()
    const existing = this.getByProjectId(projectId)
    const now = new Date().toISOString()

    const next = {
      enabled: patch.enabled,
      method: patch.method,
      requireCiSuccess: patch.requireCiSuccess,
      requiredApprovals: patch.requiredApprovals,
      requireNoConflicts: patch.requireNoConflicts,
    }

    db.prepare(
      `
      INSERT INTO auto_merge_settings (
        project_id, enabled, method, require_ci_success, required_approvals,
        require_no_conflicts, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        enabled = excluded.enabled,
        method = excluded.method,
        require_ci_success = excluded.require_ci_success,
        required_approvals = excluded.required_approvals,
        require_no_conflicts = excluded.require_no_conflicts,
        updated_at = excluded.updated_at
    `
    ).run(
      projectId,
      next.enabled ? 1 : 0,
      next.method,
      next.requireCiSuccess ? 1 : 0,
      next.requiredApprovals,
      next.requireNoConflicts ? 1 : 0,
      existing?.createdAt ?? now,
      now
    )

    return this.getByProjectId(projectId) as AutoMergeSettingsRecord
  }
}

export const autoMergeSettingsRepo = new AutoMergeSettingsRepository()
