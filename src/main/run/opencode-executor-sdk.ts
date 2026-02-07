import { projectRepo } from '../db/project-repository.js'
import { runEventRepo } from '../db/run-event-repository.js'
import { runRepo } from '../db/run-repository.js'
import { tagRepo } from '../db/tag-repository.js'
import { taskRepo } from '../db/task-repository.js'
import { dbManager } from '../db/index.js'
import { ProjectRepoAdapter } from '../infra/project/project-repo.adapter.js'
import { TaskRepoAdapter } from '../infra/task/task-repo.adapter.js'
import { BoardRepoAdapter } from '../infra/board/board-repo.adapter.js'
import { ContextSnapshotRepoAdapter } from '../infra/context-snapshot/context-snapshot-repo.adapter.js'
import type { RunRecord } from '../db/run-types'
import type { RunExecutor, RunStartResult } from './job-runner'
import { sessionManager } from './opencode-session-manager.js'
import { opencodeSessionWorker } from './opencode-session-worker.js'
import { ContextSnapshotBuilder } from './context-snapshot-builder.js'
import { buildTaskPrompt } from './prompts/task.js'
import { buildUserStoryPrompt } from './prompts/user-story.js'
import type { OpenCodePort, RolePresetProvider } from '../ports'

const rolePresetProvider: RolePresetProvider = {
  getById(roleId) {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT id, name, description, preset_json as presetJson
        FROM agent_roles
        WHERE id = ?
        LIMIT 1
        `
      )
      .get(roleId) as
      | { id: string; name: string; description: string; presetJson: string }
      | undefined

    if (!row) {
      return {
        id: roleId,
        name: roleId.toUpperCase(),
        description: '',
        preset: {},
      }
    }

    let preset: Record<string, unknown> = {}
    try {
      preset = JSON.parse(row.presetJson) as Record<string, unknown>
    } catch (error) {
      console.warn('[ContextSnapshot] Failed to parse role preset JSON:', error)
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      preset,
    }
  },
}

const contextSnapshotBuilder = new ContextSnapshotBuilder({
  taskRepo: new TaskRepoAdapter(),
  projectRepo: new ProjectRepoAdapter(),
  boardRepo: new BoardRepoAdapter(),
  contextSnapshotRepo: new ContextSnapshotRepoAdapter(),
  rolePresetProvider,
})

export class OpenCodeExecutorSDK implements RunExecutor, OpenCodePort {
  async generateUserStory(taskId: string): Promise<string> {
    console.log('[OpenCodeExecutorSDK] generateUserStory:start', { taskId })
    const task = taskRepo.getById(taskId)
    if (!task) {
      throw new Error('Task not found')
    }

    const project = projectRepo.getById(task.projectId)
    if (!project) {
      throw new Error('Project not found for task')
    }

    const availableTags = tagRepo.listAll().map((tag) => tag.name)
    const prompt = buildUserStoryPrompt(task, project, {
      availableTags,
      availableTypes: ['feature', 'bug', 'chore', 'improvement'],
      availableDifficulties: ['easy', 'medium', 'hard', 'epic'],
    })
    const sessionTitle = `User Story: ${task.title}`

    const runId = await this.startTaskPrompt({
      taskId,
      prompt,
      roleId: 'ba',
      kind: 'task-description-improve',
      sessionTitle,
    })
    console.log('[OpenCodeExecutorSDK] generateUserStory:queued', { taskId, runId })
    return runId
  }

  async start(run: RunRecord): Promise<RunStartResult> {
    console.log('[OpenCodeExecutorSDK] start:run', { runId: run.id, taskId: run.taskId })
    const task = taskRepo.getById(run.taskId)
    if (!task) {
      throw new Error('Task not found for run')
    }

    const project = projectRepo.getById(task.projectId)
    if (!project) {
      throw new Error('Project not found for run')
    }

    const prompt = buildTaskPrompt(task, project)
    const sessionTitle = `Task ${task.id}: ${task.title}`

    const sessionId = await this.createSessionForRun({
      runId: run.id,
      sessionTitle,
      directory: project.path,
    })

    console.log('[OpenCodeExecutorSDK] start:prompt', { runId: run.id, sessionId })
    await sessionManager.sendPromptAsync(sessionId, prompt, task.modelName)

    opencodeSessionWorker.startTracking({
      runId: run.id,
      taskId: run.taskId,
      sessionId,
      kind: run.kind,
      previousTaskStatus: task.status,
    })

    return 'deferred'
  }

  async cancel(runId: string): Promise<void> {
    const run = runRepo.getById(runId)
    if (!run?.sessionId) return

    try {
      await sessionManager.abortSession(run.sessionId)
    } catch (error) {
      console.error('[OpenCodeExecutorSDK] Failed to abort session:', error)
    }
  }

  private async startTaskPrompt(input: {
    taskId: string
    prompt: string
    roleId: string
    kind: RunRecord['kind']
    sessionTitle: string
  }): Promise<string> {
    const task = taskRepo.getById(input.taskId)
    if (!task) {
      throw new Error('Task not found')
    }

    const project = projectRepo.getById(task.projectId)
    if (!project) {
      throw new Error('Project not found for task')
    }

    const contextSnapshotResult = contextSnapshotBuilder.build({
      taskId: input.taskId,
      roleId: input.roleId,
      mode: 'execute',
    })

    if (!contextSnapshotResult.ok) {
      throw new Error(contextSnapshotResult.error.message)
    }

    const run = runRepo.create({
      taskId: input.taskId,
      roleId: input.roleId,
      mode: 'execute',
      kind: input.kind,
      status: 'running',
      contextSnapshotId: contextSnapshotResult.data.id,
      budget: { previousTaskStatus: task.status },
    })
    console.log('[OpenCodeExecutorSDK] startTaskPrompt:runCreated', {
      taskId: input.taskId,
      runId: run.id,
      kind: input.kind,
    })

    runRepo.update(run.id, { startedAt: new Date().toISOString() })

    try {
      const sessionId = await this.createSessionForRun({
        runId: run.id,
        sessionTitle: input.sessionTitle,
        directory: project.path,
      })

      console.log('[OpenCodeExecutorSDK] startTaskPrompt:prompt', {
        runId: run.id,
        sessionId,
      })
      await sessionManager.sendPromptAsync(sessionId, input.prompt, task.modelName)

      opencodeSessionWorker.startTracking({
        runId: run.id,
        taskId: input.taskId,
        sessionId,
        kind: input.kind,
        previousTaskStatus: task.status,
      })

      return run.id
    } catch (error) {
      runRepo.update(run.id, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        errorText: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  private async createSessionForRun(input: {
    runId: string
    sessionTitle: string
    directory: string
  }): Promise<string> {
    const sessionInfo = await sessionManager.createSession(input.sessionTitle, input.directory)

    runRepo.update(input.runId, { sessionId: sessionInfo.id })

    runEventRepo.create({
      runId: input.runId,
      eventType: 'status',
      payload: { message: 'OpenCode session created', sessionId: sessionInfo.id },
    })

    return sessionInfo.id
  }
}
