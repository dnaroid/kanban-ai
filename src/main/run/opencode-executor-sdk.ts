import {projectRepo} from "../db/project-repository.js"
import {runEventRepo} from "../db/run-event-repository.js"
import {runRepo} from "../db/run-repository.js"
import {tagRepo} from "../db/tag-repository.js"
import {taskRepo} from "../db/task-repository.js"
import type {RunRecord} from "../db/run-types"
import type {RunExecutor, RunStartResult} from "./job-runner"
import {sessionManager} from "./opencode-session-manager.js"
import {opencodeSessionWorker} from "./opencode-session-worker.js"
import {buildContextSnapshot} from "./context-snapshot-builder.js"
import {buildTaskPrompt} from "./prompts/task.js"
import {buildUserStoryPrompt} from "./prompts/user-story.js"

export class OpenCodeExecutorSDK implements RunExecutor {
  async generateUserStory(taskId: string): Promise<string> {
    console.log("[OpenCodeExecutorSDK] generateUserStory:start", {taskId})
    const task = taskRepo.getById(taskId)
    if (!task) {
      throw new Error("Task not found")
    }

    const project = projectRepo.getById(task.projectId)
    if (!project) {
      throw new Error("Project not found for task")
    }

    const availableTags = tagRepo.listAll().map((tag) => tag.name)
    const prompt = buildUserStoryPrompt(task, project, {
      availableTags,
      availableTypes: ["feature", "bug", "chore", "improvement"],
      availableDifficulties: ["easy", "medium", "hard", "epic"],
    })
    const sessionTitle = `User Story: ${task.title}`

    const runId = await this.startTaskPrompt({
      taskId,
      prompt,
      roleId: "ba",
      kind: "task-description-improve",
      sessionTitle,
    })
    console.log("[OpenCodeExecutorSDK] generateUserStory:queued", {taskId, runId})
    return runId
  }

  async start(run: RunRecord): Promise<RunStartResult> {
    console.log("[OpenCodeExecutorSDK] start:run", {runId: run.id, taskId: run.taskId})
    const task = taskRepo.getById(run.taskId)
    if (!task) {
      throw new Error("Task not found for run")
    }

    const project = projectRepo.getById(task.projectId)
    if (!project) {
      throw new Error("Project not found for run")
    }

    const prompt = buildTaskPrompt(task, project)
    const sessionTitle = `Task ${task.id}: ${task.title}`

    const sessionId = await this.createSessionForRun({
      runId: run.id,
      sessionTitle,
      directory: project.path,
    })

    console.log("[OpenCodeExecutorSDK] start:prompt", {runId: run.id, sessionId})
    // await sessionManager.sendPromptAsync(sessionId, prompt)
    await sessionManager.sendPrompt(sessionId, prompt)

    opencodeSessionWorker.startTracking({
      runId: run.id,
      taskId: run.taskId,
      sessionId,
      kind: run.kind,
      previousTaskStatus: task.status,
    })

    return "deferred"
  }

  async cancel(runId: string): Promise<void> {
    const run = runRepo.getById(runId)
    if (!run?.sessionId) return

    try {
      await sessionManager.abortSession(run.sessionId)
    } catch (error) {
      console.error("[OpenCodeExecutorSDK] Failed to abort session:", error)
    }
  }

  private async startTaskPrompt(input: {
    taskId: string
    prompt: string
    roleId: string
    kind: RunRecord["kind"]
    sessionTitle: string
  }): Promise<string> {
    const task = taskRepo.getById(input.taskId)
    if (!task) {
      throw new Error("Task not found")
    }

    const project = projectRepo.getById(task.projectId)
    if (!project) {
      throw new Error("Project not found for task")
    }

    const contextSnapshot = await buildContextSnapshot({
      taskId: input.taskId,
      roleId: input.roleId,
      mode: "execute",
    })

    const run = runRepo.create({
      taskId: input.taskId,
      roleId: input.roleId,
      mode: "execute",
      kind: input.kind,
      status: "running",
      contextSnapshotId: contextSnapshot.id,
      budget: {previousTaskStatus: task.status},
    })
    console.log("[OpenCodeExecutorSDK] startTaskPrompt:runCreated", {
      taskId: input.taskId,
      runId: run.id,
      kind: input.kind,
    })

    runRepo.update(run.id, {startedAt: new Date().toISOString()})

    try {
      const sessionId = await this.createSessionForRun({
        runId: run.id,
        sessionTitle: input.sessionTitle,
        directory: project.path,
      })

      console.log("[OpenCodeExecutorSDK] startTaskPrompt:prompt", {
        runId: run.id,
        sessionId,
      })
      // await sessionManager.sendPromptAsync(sessionId, input.prompt)
      await sessionManager.sendPrompt(sessionId, input.prompt)

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
        status: "failed",
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

    runRepo.update(input.runId, {sessionId: sessionInfo.id})

    runEventRepo.create({
      runId: input.runId,
      eventType: "status",
      payload: {message: "OpenCode session created", sessionId: sessionInfo.id},
    })

    return sessionInfo.id
  }
}
