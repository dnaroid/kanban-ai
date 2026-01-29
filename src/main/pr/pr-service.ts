import { taskRepo } from '../db/task-repository.js'
import { projectRepo } from '../db/project-repository.js'
import { taskVcsLinkRepo } from '../db/task-vcs-link-repository.js'
import { pullRequestRepo } from '../db/pull-request-repository.js'
import { vcsProjectRepo } from '../db/vcs-project-repository.js'
import { createGitAdapter } from '../git/git-adapter.js'
import { ensureTaskBranchName } from '../git/task-branch-service.js'
import { createGitHubPRProvider } from './github-pr-provider.js'
import type { PRProvider } from './pr-provider.js'
import { DEFAULT_REQUIRED_APPROVALS, evaluateMergeGates } from './merge-gates.js'

const gitAdapter = createGitAdapter()

const getProvider = (providerType: string): PRProvider => {
  if (providerType === 'github') {
    return createGitHubPRProvider()
  }
  throw new Error('PR provider not configured')
}

const getRepoPath = (projectId: string, repoPathOverride?: string): string => {
  if (repoPathOverride) {
    return repoPathOverride
  }
  const project = projectRepo.getById(projectId)
  if (!project) {
    throw new Error('Project not found')
  }
  return project.path
}

const getVcsProject = (projectId: string) => {
  const vcsProject = vcsProjectRepo.getByProjectId(projectId)
  if (!vcsProject) {
    throw new Error('VCS project not configured')
  }
  if (!vcsProject.providerType || !vcsProject.providerRepoId) {
    throw new Error('VCS provider not configured')
  }
  return vcsProject
}

export const createPullRequest = async (input: {
  taskId: string
  title: string
  body: string
  draft?: boolean
}): Promise<{ providerPrId: string; url: string; state: string }> => {
  const task = taskRepo.getById(input.taskId)
  if (!task) {
    throw new Error('Task not found')
  }

  const vcsProject = getVcsProject(task.projectId)
  const provider = getProvider(vcsProject.providerType)
  const repoPath = getRepoPath(task.projectId, vcsProject.repoPath)
  const baseBranch = vcsProject.defaultBranch || (await gitAdapter.getDefaultBranch(repoPath))
  const headBranch = ensureTaskBranchName(input.taskId)

  const result = await provider.createPR({
    repoId: vcsProject.providerRepoId,
    base: baseBranch,
    head: headBranch,
    title: input.title,
    body: input.body,
    draft: input.draft,
  })

  const now = new Date().toISOString()

  pullRequestRepo.upsertByTaskId(input.taskId, {
    providerPrId: result.providerPrId,
    title: input.title,
    state: result.state,
    url: result.url,
    baseBranch,
    headBranch,
    ciStatus: 'unknown',
    approvalsCount: 0,
    requiredApprovals: DEFAULT_REQUIRED_APPROVALS,
    lastSyncedAt: now,
  })

  taskVcsLinkRepo.upsert(input.taskId, {
    prId: result.providerPrId,
    prUrl: result.url,
  })

  return result
}

export const refreshPullRequest = async (taskId: string) => {
  const task = taskRepo.getById(taskId)
  if (!task) {
    throw new Error('Task not found')
  }

  const link = taskVcsLinkRepo.getByTaskId(taskId)
  if (!link?.prId) {
    throw new Error('Pull request not linked')
  }

  const vcsProject = getVcsProject(task.projectId)
  const provider = getProvider(vcsProject.providerType)
  const existing = pullRequestRepo.getByTaskId(taskId)
  const result = await provider.getPR({
    repoId: vcsProject.providerRepoId,
    providerPrId: link.prId,
  })

  const now = new Date().toISOString()
  const requiredApprovals = Math.max(
    existing?.requiredApprovals ?? DEFAULT_REQUIRED_APPROVALS,
    DEFAULT_REQUIRED_APPROVALS
  )

  pullRequestRepo.upsertByTaskId(taskId, {
    providerPrId: link.prId,
    title: result.title,
    state: result.state,
    url: result.url,
    baseBranch: existing?.baseBranch ?? vcsProject.defaultBranch ?? 'main',
    headBranch: existing?.headBranch ?? ensureTaskBranchName(taskId),
    ciStatus: result.ciStatus,
    approvalsCount: result.approvals,
    requiredApprovals,
    lastSyncedAt: now,
  })

  return {
    ...result,
    requiredApprovals,
  }
}

export const mergePullRequest = async (input: {
  taskId: string
  method: 'merge' | 'squash' | 'rebase'
}): Promise<{ ok: true }> => {
  const task = taskRepo.getById(input.taskId)
  if (!task) {
    throw new Error('Task not found')
  }

  const link = taskVcsLinkRepo.getByTaskId(input.taskId)
  if (!link?.prId) {
    throw new Error('Pull request not linked')
  }

  const vcsProject = getVcsProject(task.projectId)
  const provider = getProvider(vcsProject.providerType)

  await provider.mergePR({
    repoId: vcsProject.providerRepoId,
    providerPrId: link.prId,
    method: input.method,
  })

  const existing = pullRequestRepo.getByTaskId(input.taskId)
  if (!existing) {
    throw new Error('Pull request not found')
  }

  const gateCheck = evaluateMergeGates(existing)
  if (!gateCheck.ok) {
    throw new Error(`Merge gates not satisfied: ${gateCheck.reasons.join(', ')}`)
  }
  const now = new Date().toISOString()

  pullRequestRepo.upsertByTaskId(input.taskId, {
    providerPrId: link.prId,
    title: existing.title,
    state: 'merged',
    url: existing.url ?? link.prUrl,
    baseBranch: existing.baseBranch ?? vcsProject.defaultBranch ?? 'main',
    headBranch: existing.headBranch ?? ensureTaskBranchName(input.taskId),
    ciStatus: existing.ciStatus ?? 'unknown',
    approvalsCount: existing.approvalsCount ?? 0,
    requiredApprovals: Math.max(existing.requiredApprovals, DEFAULT_REQUIRED_APPROVALS),
    lastSyncedAt: now,
  })

  return { ok: true }
}

export const refreshOpenPullRequests = async (): Promise<void> => {
  const openPrs = pullRequestRepo.listOpen()
  for (const pr of openPrs) {
    try {
      await refreshPullRequest(pr.taskId)
    } catch (err) {
      console.error('Failed to refresh PR', pr.taskId, err)
    }
  }
}
