import { app, dialog } from 'electron'
import path from 'path'
import { ipcHandlers } from './validation'
import { z } from 'zod'
import { registerDiagnosticsHandlers } from './diagnostics-handlers'
import {
  AppInfoSchema,
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  DeleteProjectInputSchema,
  CreateTaskInputSchema,
  BoardGetDefaultInputSchema,
  BoardGetDefaultResponseSchema,
  BoardUpdateColumnsInputSchema,
  BoardUpdateColumnsResponseSchema,
  TaskListByBoardInputSchema,
  TaskListByBoardResponseSchema,
  TaskCreateResponseSchema,
  TaskUpdateInputSchema,
  TaskUpdateResponseSchema,
  TaskMoveInputSchema,
  TaskMoveResponseSchema,
  GitStatusInputSchema,
  GitStatusResponseSchema,
  GitBranchCreateInputSchema,
  GitBranchCreateResponseSchema,
  GitBranchCheckoutInputSchema,
  GitBranchCheckoutResponseSchema,
  GitDiffInputSchema,
  GitDiffResponseSchema,
  GitCommitInputSchema,
  GitCommitResponseSchema,
  GitPushInputSchema,
  GitPushResponseSchema,
  PrCreateInputSchema,
  PrCreateResponseSchema,
  PrRefreshInputSchema,
  PrRefreshResponseSchema,
  PrMergeInputSchema,
  PrMergeResponseSchema,
  VcsConnectRepoInputSchema,
  VcsConnectRepoResponseSchema,
  IntegrationsSetProviderInputSchema,
  IntegrationsSetProviderResponseSchema,
  IntegrationsSetTokenInputSchema,
  IntegrationsSetTokenResponseSchema,
  RunStartInputSchema,
  RunStartResponseSchema,
  RunCancelInputSchema,
  RunCancelResponseSchema,
  RunListByTaskInputSchema,
  RunListByTaskResponseSchema,
  RunGetInputSchema,
  RunGetResponseSchema,
  RunEventsTailInputSchema,
  RunEventsTailResponseSchema,
  ArtifactListInputSchema,
  ArtifactListResponseSchema,
  ArtifactGetInputSchema,
  ArtifactGetResponseSchema,
  MergeDetectInputSchema,
  MergeDetectResponseSchema,
  MergeSuggestInputSchema,
  MergeSuggestResponseSchema,
  MergeApplyInputSchema,
  MergeApplyResponseSchema,
  AutoMergeSetInputSchema,
  AutoMergeSetResponseSchema,
  AutoMergeRunOnceInputSchema,
  AutoMergeRunOnceResponseSchema,
  ReleaseCreateInputSchema,
  ReleaseCreateResponseSchema,
  ReleaseAddItemsInputSchema,
  ReleaseAddItemsResponseSchema,
  ReleaseGenerateNotesInputSchema,
  ReleaseGenerateNotesResponseSchema,
  ReleasePublishInputSchema,
  ReleasePublishResponseSchema,
  ReleaseListInputSchema,
  ReleaseListResponseSchema,
  ReleaseGetInputSchema,
  ReleaseGetResponseSchema,
} from '../../shared/types/ipc'
import { projectRepo } from '../db/project-repository'
import { boardRepo } from '../db/board-repository'
import { taskRepo } from '../db/task-repository'
import { taskVcsLinkRepo } from '../db/task-vcs-link-repository'
import { vcsProjectRepo } from '../db/vcs-project-repository'
import { runRepo } from '../db/run-repository'
import { runEventRepo } from '../db/run-event-repository'
import { artifactRepo } from '../db/artifact-repository'
import { autoMergeSettingsRepo } from '../db/auto-merge-settings-repository'
import { runService } from '../run/run-service'
import { buildContextSnapshot } from '../run/context-snapshot-builder'
import { createGitAdapter } from '../git/git-adapter'
import { ensureTaskBranchName } from '../git/task-branch-service'
import { createPullRequest, mergePullRequest, refreshPullRequest } from '../pr/pr-service'
import { runAutoMergeOnce } from '../pr/auto-merge'
import {
  addReleaseItems,
  createRelease,
  generateReleaseNotes,
  getRelease,
  listReleases,
  publishRelease,
} from '../release/release-service'
import {
  applyMergeResolution,
  detectMergeConflict,
  suggestMergeResolution,
} from '../merge/merge-service'
import { getSecretStore } from '../secrets/secret-store'

const gitAdapter = createGitAdapter()

const getProjectRepoPath = (projectId: string): string => {
  const project = projectRepo.getById(projectId)
  if (!project) {
    throw new Error('Project not found')
  }
  return project.path
}

const getTaskRepoPath = (taskId: string): string => {
  const task = taskRepo.getById(taskId)
  if (!task) {
    throw new Error('Task not found')
  }
  return getProjectRepoPath(task.projectId)
}

ipcHandlers.register('project:selectFolder', z.unknown(), async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Project Folder',
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const selectedPath = result.filePaths[0]
  const projectName = path.basename(selectedPath)

  return {
    path: selectedPath,
    name: projectName,
  }
})

ipcHandlers.register('app:getInfo', z.unknown(), async () => {
  return AppInfoSchema.parse({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    mode: app.isPackaged ? 'production' : 'development',
    userDataPath: app.getPath('userData'),
  })
})

ipcHandlers.register('project:create', CreateProjectInputSchema, async (_, input) => {
  console.log('[IPC] Creating project:', input)
  const project = projectRepo.create(input)
  console.log('[IPC] Project created:', project)
  return project
})

ipcHandlers.register('project:getAll', z.unknown(), async () => {
  const projects = projectRepo.getAll()
  console.log('[IPC] Returning projects:', projects)
  return projects
})

ipcHandlers.register('project:getById', z.string(), async (_, id) => {
  return projectRepo.getById(id)
})

ipcHandlers.register('project:update', UpdateProjectInputSchema, async (_, input) => {
  const { id, ...updates } = input
  return projectRepo.update(id, updates)
})

ipcHandlers.register('project:delete', DeleteProjectInputSchema, async (_, input) => {
  return projectRepo.delete(input.id)
})

ipcHandlers.register('board:getDefault', BoardGetDefaultInputSchema, async (_, { projectId }) => {
  const { columns = [], ...board } = boardRepo.getDefault(projectId)
  return BoardGetDefaultResponseSchema.parse({ board, columns })
})

ipcHandlers.register(
  'board:updateColumns',
  BoardUpdateColumnsInputSchema,
  async (_, { boardId, columns }) => {
    boardRepo.updateColumns(boardId, columns)
    const updatedColumns = boardRepo.getColumns(boardId)
    return BoardUpdateColumnsResponseSchema.parse({ columns: updatedColumns })
  }
)

ipcHandlers.register('task:create', CreateTaskInputSchema, async (_, input) => {
  const task = taskRepo.create(input)
  return TaskCreateResponseSchema.parse({ task })
})

ipcHandlers.register('task:listByBoard', TaskListByBoardInputSchema, async (_, { boardId }) => {
  const tasks = taskRepo.listByBoard(boardId)
  return TaskListByBoardResponseSchema.parse({ tasks })
})

ipcHandlers.register('task:update', TaskUpdateInputSchema, async (_, { taskId, patch }) => {
  taskRepo.update(taskId, patch)
  const task = taskRepo.getById(taskId)
  if (!task) {
    throw new Error('Task not found')
  }
  return TaskUpdateResponseSchema.parse({ task })
})

ipcHandlers.register(
  'task:move',
  TaskMoveInputSchema,
  async (_, { taskId, toColumnId, toIndex }) => {
    taskRepo.move(taskId, toColumnId, toIndex)
    return TaskMoveResponseSchema.parse({ success: true })
  }
)

ipcHandlers.register('git:status', GitStatusInputSchema, async (_, { projectId }) => {
  const repoPath = getProjectRepoPath(projectId)
  await gitAdapter.ensureRepo(repoPath)
  const status = await gitAdapter.getStatus(repoPath)
  return GitStatusResponseSchema.parse({ status })
})

ipcHandlers.register('git:branch:create', GitBranchCreateInputSchema, async (_, { taskId }) => {
  const repoPath = getTaskRepoPath(taskId)
  await gitAdapter.ensureRepo(repoPath)
  const branchName = ensureTaskBranchName(taskId)
  const defaultBranch = await gitAdapter.getDefaultBranch(repoPath)
  await gitAdapter.createBranch(repoPath, branchName, defaultBranch)
  return GitBranchCreateResponseSchema.parse({ branchName })
})

ipcHandlers.register('git:branch:checkout', GitBranchCheckoutInputSchema, async (_, { taskId }) => {
  const repoPath = getTaskRepoPath(taskId)
  await gitAdapter.ensureRepo(repoPath)
  const branchName = ensureTaskBranchName(taskId)
  await gitAdapter.checkoutBranch(repoPath, branchName)
  return GitBranchCheckoutResponseSchema.parse({ branchName })
})

ipcHandlers.register('git:diff', GitDiffInputSchema, async (_, { taskId }) => {
  const repoPath = getTaskRepoPath(taskId)
  await gitAdapter.ensureRepo(repoPath)
  const diff = await gitAdapter.getDiff(repoPath)
  return GitDiffResponseSchema.parse({ diff })
})

ipcHandlers.register('git:commit', GitCommitInputSchema, async (_, { taskId, message }) => {
  const repoPath = getTaskRepoPath(taskId)
  await gitAdapter.ensureRepo(repoPath)
  const { sha } = await gitAdapter.commitAll(repoPath, message)
  taskVcsLinkRepo.upsert(taskId, { lastCommitSha: sha })
  return GitCommitResponseSchema.parse({ sha })
})

ipcHandlers.register('git:push', GitPushInputSchema, async (_, { taskId }) => {
  const repoPath = getTaskRepoPath(taskId)
  await gitAdapter.ensureRepo(repoPath)
  const branchName = ensureTaskBranchName(taskId)
  await gitAdapter.push(repoPath, branchName)
  return GitPushResponseSchema.parse({ ok: true })
})

ipcHandlers.register(
  'pr:create',
  PrCreateInputSchema,
  async (_, { taskId, title, body, draft }) => {
    const result = await createPullRequest({ taskId, title, body, draft })
    return PrCreateResponseSchema.parse(result)
  }
)

ipcHandlers.register('pr:refresh', PrRefreshInputSchema, async (_, { taskId }) => {
  const result = await refreshPullRequest(taskId)
  return PrRefreshResponseSchema.parse(result)
})

ipcHandlers.register('pr:merge', PrMergeInputSchema, async (_, { taskId, method }) => {
  const result = await mergePullRequest({ taskId, method })
  return PrMergeResponseSchema.parse(result)
})

ipcHandlers.register('merge:detect', MergeDetectInputSchema, async (_, { taskId }) => {
  const result = await detectMergeConflict(taskId)
  return MergeDetectResponseSchema.parse({
    conflictId: result.conflictId,
    conflictPackage: result.conflictPackage,
  })
})

ipcHandlers.register('merge:suggest', MergeSuggestInputSchema, async (_, { conflictId }) => {
  const result = await suggestMergeResolution(conflictId)
  return MergeSuggestResponseSchema.parse(result)
})

ipcHandlers.register(
  'merge:apply',
  MergeApplyInputSchema,
  async (_, { conflictId, patchArtifactId }) => {
    const result = await applyMergeResolution({ conflictId, patchArtifactId })
    return MergeApplyResponseSchema.parse(result)
  }
)

ipcHandlers.register(
  'vcs:connectRepo',
  VcsConnectRepoInputSchema,
  async (_, { projectId, repoPath }) => {
    await gitAdapter.ensureRepo(repoPath)
    const defaultBranch = await gitAdapter.getDefaultBranch(repoPath)
    vcsProjectRepo.upsert(projectId, { repoPath, defaultBranch })
    return VcsConnectRepoResponseSchema.parse({ ok: true, defaultBranch })
  }
)

ipcHandlers.register(
  'integrations:setProvider',
  IntegrationsSetProviderInputSchema,
  async (_, { projectId, providerType, repoId }) => {
    vcsProjectRepo.upsert(projectId, { providerType, providerRepoId: repoId })
    return IntegrationsSetProviderResponseSchema.parse({ ok: true })
  }
)

ipcHandlers.register(
  'integrations:setToken',
  IntegrationsSetTokenInputSchema,
  async (_, { providerType, token }) => {
    const service = providerType === 'github' ? 'provider/github' : 'provider/gitlab'
    await getSecretStore().setPassword(service, 'token', token)
    return IntegrationsSetTokenResponseSchema.parse({ ok: true })
  }
)

ipcHandlers.register('run:start', RunStartInputSchema, async (_, input) => {
  const snapshot = buildContextSnapshot({
    taskId: input.taskId,
    roleId: input.roleId,
    mode: input.mode,
  })
  const run = runRepo.create({
    taskId: input.taskId,
    roleId: input.roleId,
    mode: input.mode,
    contextSnapshotId: snapshot.id,
  })
  runService.enqueue(run.id)
  return RunStartResponseSchema.parse({ runId: run.id })
})

ipcHandlers.register('run:cancel', RunCancelInputSchema, async (_, { runId }) => {
  await runService.cancel(runId)
  return RunCancelResponseSchema.parse({ ok: true })
})

ipcHandlers.register('run:listByTask', RunListByTaskInputSchema, async (_, { taskId }) => {
  const runs = runRepo.listByTask(taskId)
  return RunListByTaskResponseSchema.parse({ runs })
})

ipcHandlers.register('run:get', RunGetInputSchema, async (_, { runId }) => {
  const run = runRepo.getById(runId)
  if (!run) {
    throw new Error('Run not found')
  }
  return RunGetResponseSchema.parse({ run })
})

ipcHandlers.register('run:events:tail', RunEventsTailInputSchema, async (_, input) => {
  const events = runEventRepo.listByRun(input.runId, {
    afterTs: input.afterTs,
    limit: input.limit,
  })
  return RunEventsTailResponseSchema.parse({ events })
})

ipcHandlers.register('artifact:list', ArtifactListInputSchema, async (_, { runId }) => {
  const artifacts = artifactRepo.listByRun(runId)
  return ArtifactListResponseSchema.parse({ artifacts })
})

ipcHandlers.register('artifact:get', ArtifactGetInputSchema, async (_, { artifactId }) => {
  const artifact = artifactRepo.getById(artifactId)
  if (!artifact) {
    throw new Error('Artifact not found')
  }
  return ArtifactGetResponseSchema.parse({ artifact })
})

ipcHandlers.register('autoMerge:set', AutoMergeSetInputSchema, async (_, input) => {
  const settings = autoMergeSettingsRepo.upsert(input.projectId, {
    enabled: input.enabled,
    method: input.method,
    requireCiSuccess: input.requireCiSuccess,
    requiredApprovals: input.requiredApprovals,
    requireNoConflicts: input.requireNoConflicts,
  })
  return AutoMergeSetResponseSchema.parse({ settings })
})

ipcHandlers.register('autoMerge:runOnce', AutoMergeRunOnceInputSchema, async (_, { projectId }) => {
  const result = await runAutoMergeOnce(projectId)
  return AutoMergeRunOnceResponseSchema.parse(result)
})

ipcHandlers.register('release:create', ReleaseCreateInputSchema, async (_, input) => {
  const result = await createRelease(input)
  return ReleaseCreateResponseSchema.parse(result)
})

ipcHandlers.register('release:addItems', ReleaseAddItemsInputSchema, async (_, input) => {
  const result = await addReleaseItems(input)
  return ReleaseAddItemsResponseSchema.parse(result)
})

ipcHandlers.register('release:generateNotes', ReleaseGenerateNotesInputSchema, async (_, input) => {
  const result = await generateReleaseNotes(input.releaseId)
  return ReleaseGenerateNotesResponseSchema.parse(result)
})

ipcHandlers.register('release:publish', ReleasePublishInputSchema, async (_, input) => {
  const result = await publishRelease(input)
  return ReleasePublishResponseSchema.parse(result)
})

ipcHandlers.register('release:list', ReleaseListInputSchema, async (_, input) => {
  const result = await listReleases(input.projectId)
  return ReleaseListResponseSchema.parse(result)
})

ipcHandlers.register('release:get', ReleaseGetInputSchema, async (_, input) => {
  const result = await getRelease(input.releaseId)
  return ReleaseGetResponseSchema.parse(result)
})

registerDiagnosticsHandlers()

console.log('[IPC] Handlers registered')
