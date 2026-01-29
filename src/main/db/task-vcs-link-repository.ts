import { dbManager } from './index.js'

export interface TaskVcsLink {
  taskId: string
  branchName: string
  prId: string
  prUrl: string
  lastCommitSha: string
  createdAt: string
  updatedAt: string
}

export class TaskVcsLinkRepository {
  getByTaskId(taskId: string): TaskVcsLink | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT
          task_id as taskId,
          branch_name as branchName,
          pr_id as prId,
          pr_url as prUrl,
          last_commit_sha as lastCommitSha,
          created_at as createdAt,
          updated_at as updatedAt
        FROM task_vcs_links
        WHERE task_id = ?
        LIMIT 1
      `
      )
      .get(taskId) as TaskVcsLink | undefined

    return row ?? null
  }

  upsert(taskId: string, patch: Partial<Omit<TaskVcsLink, 'taskId'>>): TaskVcsLink {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const existing = this.getByTaskId(taskId)

    const next = {
      branchName: patch.branchName ?? existing?.branchName ?? '',
      prId: patch.prId ?? existing?.prId ?? '',
      prUrl: patch.prUrl ?? existing?.prUrl ?? '',
      lastCommitSha: patch.lastCommitSha ?? existing?.lastCommitSha ?? '',
    }

    db.prepare(
      `
      INSERT INTO task_vcs_links (
        task_id, branch_name, pr_id, pr_url, last_commit_sha, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        branch_name = excluded.branch_name,
        pr_id = excluded.pr_id,
        pr_url = excluded.pr_url,
        last_commit_sha = excluded.last_commit_sha,
        updated_at = excluded.updated_at
    `
    ).run(
      taskId,
      next.branchName,
      next.prId,
      next.prUrl,
      next.lastCommitSha,
      existing?.createdAt ?? now,
      now
    )

    return this.getByTaskId(taskId) as TaskVcsLink
  }
}

export const taskVcsLinkRepo = new TaskVcsLinkRepository()
