import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'

export interface PullRequestRecord {
  id: string
  taskId: string
  providerPrId: string
  title: string
  state: string
  url: string
  baseBranch: string
  headBranch: string
  ciStatus: string
  approvalsCount: number
  requiredApprovals: number
  lastSyncedAt: string
  createdAt: string
  updatedAt: string
}

export class PullRequestRepository {
  getByTaskId(taskId: string): PullRequestRecord | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT
          id,
          task_id as taskId,
          provider_pr_id as providerPrId,
          title,
          state,
          url,
          base_branch as baseBranch,
          head_branch as headBranch,
          ci_status as ciStatus,
          approvals_count as approvalsCount,
          required_approvals as requiredApprovals,
          last_synced_at as lastSyncedAt,
          created_at as createdAt,
          updated_at as updatedAt
        FROM pull_requests
        WHERE task_id = ?
        LIMIT 1
      `
      )
      .get(taskId) as PullRequestRecord | undefined

    return row ?? null
  }

  listOpen(): PullRequestRecord[] {
    const db = dbManager.connect()
    return db
      .prepare(
        `
        SELECT
          id,
          task_id as taskId,
          provider_pr_id as providerPrId,
          title,
          state,
          url,
          base_branch as baseBranch,
          head_branch as headBranch,
          ci_status as ciStatus,
          approvals_count as approvalsCount,
          required_approvals as requiredApprovals,
          last_synced_at as lastSyncedAt,
          created_at as createdAt,
          updated_at as updatedAt
        FROM pull_requests
        WHERE state IN ('open', 'draft')
      `
      )
      .all() as PullRequestRecord[]
  }

  upsertByTaskId(
    taskId: string,
    patch: Omit<PullRequestRecord, 'id' | 'taskId' | 'createdAt' | 'updatedAt'> & {
      id?: string
      createdAt?: string
      updatedAt?: string
    }
  ): PullRequestRecord {
    const db = dbManager.connect()
    const existing = this.getByTaskId(taskId)
    const now = new Date().toISOString()
    const id = existing?.id ?? patch.id ?? randomUUID()
    const createdAt = existing?.createdAt ?? patch.createdAt ?? now
    const updatedAt = patch.updatedAt ?? now

    db.prepare(
      `
      INSERT INTO pull_requests (
        id, task_id, provider_pr_id, title, state, url, base_branch, head_branch,
        ci_status, approvals_count, required_approvals, last_synced_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        provider_pr_id = excluded.provider_pr_id,
        title = excluded.title,
        state = excluded.state,
        url = excluded.url,
        base_branch = excluded.base_branch,
        head_branch = excluded.head_branch,
        ci_status = excluded.ci_status,
        approvals_count = excluded.approvals_count,
        required_approvals = excluded.required_approvals,
        last_synced_at = excluded.last_synced_at,
        updated_at = excluded.updated_at
    `
    ).run(
      id,
      taskId,
      patch.providerPrId,
      patch.title,
      patch.state,
      patch.url,
      patch.baseBranch,
      patch.headBranch,
      patch.ciStatus,
      patch.approvalsCount,
      patch.requiredApprovals,
      patch.lastSyncedAt,
      createdAt,
      updatedAt
    )

    return this.getByTaskId(taskId) as PullRequestRecord
  }
}

export const pullRequestRepo = new PullRequestRepository()
