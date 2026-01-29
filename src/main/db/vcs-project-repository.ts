import { dbManager } from './index.js'

export interface VcsProject {
  projectId: string
  repoPath: string
  remoteUrl: string
  defaultBranch: string
  providerType: string
  providerRepoId: string
  createdAt: string
  updatedAt: string
}

export class VcsProjectRepository {
  getByProjectId(projectId: string): VcsProject | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT
          project_id as projectId,
          repo_path as repoPath,
          remote_url as remoteUrl,
          default_branch as defaultBranch,
          provider_type as providerType,
          provider_repo_id as providerRepoId,
          created_at as createdAt,
          updated_at as updatedAt
        FROM vcs_projects
        WHERE project_id = ?
        LIMIT 1
      `
      )
      .get(projectId) as VcsProject | undefined

    return row ?? null
  }

  upsert(projectId: string, patch: Partial<Omit<VcsProject, 'projectId'>>): VcsProject {
    const db = dbManager.connect()
    const existing = this.getByProjectId(projectId)
    const now = new Date().toISOString()

    const next = {
      repoPath: patch.repoPath ?? existing?.repoPath ?? '',
      remoteUrl: patch.remoteUrl ?? existing?.remoteUrl ?? '',
      defaultBranch: patch.defaultBranch ?? existing?.defaultBranch ?? 'main',
      providerType: patch.providerType ?? existing?.providerType ?? '',
      providerRepoId: patch.providerRepoId ?? existing?.providerRepoId ?? '',
    }

    db.prepare(
      `
      INSERT INTO vcs_projects (
        project_id, repo_path, remote_url, default_branch, provider_type, provider_repo_id,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        repo_path = excluded.repo_path,
        remote_url = excluded.remote_url,
        default_branch = excluded.default_branch,
        provider_type = excluded.provider_type,
        provider_repo_id = excluded.provider_repo_id,
        updated_at = excluded.updated_at
    `
    ).run(
      projectId,
      next.repoPath,
      next.remoteUrl,
      next.defaultBranch,
      next.providerType,
      next.providerRepoId,
      existing?.createdAt ?? now,
      now
    )

    return this.getByProjectId(projectId) as VcsProject
  }
}

export const vcsProjectRepo = new VcsProjectRepository()
