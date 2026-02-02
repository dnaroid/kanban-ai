import { runEventRepo } from '../db/run-event-repository.js'
import { runRepo } from '../db/run-repository.js'
import { taskRepo } from '../db/task-repository.js'
import type { RunRecord } from '../db/run-types'
import { sessionManager } from './opencode-session-manager.js'
import { emitTaskEvent } from '../ipc/task-event-bus.js'

const taskStatusValues = [
  'queued',
  'running',
  'question',
  'paused',
  'done',
  'failed',
  'generating',
] as const

type TaskStatus = (typeof taskStatusValues)[number]

const isTaskStatus = (value: string): value is TaskStatus =>
  (taskStatusValues as readonly string[]).includes(value)

type SessionTrackingInput = {
  runId: string
  taskId: string
  sessionId: string
  kind: RunRecord['kind']
  previousTaskStatus: string
}

type SessionUpdate = {
  sessionId: string
  runId: string
  status: 'running' | 'completed' | 'failed' | 'timeout'
  messageCount: number
  lastMessageAt?: number
}

export class OpenCodeSessionWorker {
  private active = new Map<string, SessionUpdate>()
  private listeners = new Map<string, Set<(update: SessionUpdate) => void>>()

  startTracking(input: SessionTrackingInput): void {
    console.log('[OpenCodeSessionWorker] startTracking', {
      runId: input.runId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      kind: input.kind,
    })
    if (this.active.has(input.sessionId)) return

    const previousStatus = isTaskStatus(input.previousTaskStatus)
      ? input.previousTaskStatus
      : 'queued'

    if (input.kind === 'task-description-improve') {
      this.updateTask(input.taskId, { status: 'generating' })
    } else {
      this.updateTask(input.taskId, { status: 'running' })
    }

    const update: SessionUpdate = {
      sessionId: input.sessionId,
      runId: input.runId,
      status: 'running',
      messageCount: 0,
    }

    this.active.set(input.sessionId, update)
    this.emitUpdate(update)

    setTimeout(() => {
      void this.trackSession(input, previousStatus)
    }, 0)
  }

  getSessionStatus(sessionId: string): SessionUpdate | null {
    return this.active.get(sessionId) ?? null
  }

  getActiveCount(): number {
    return this.active.size
  }

  onSessionUpdate(sessionId: string, cb: (update: SessionUpdate) => void): () => void {
    const current = this.listeners.get(sessionId) ?? new Set()
    current.add(cb)
    this.listeners.set(sessionId, current)
    return () => {
      const list = this.listeners.get(sessionId)
      if (!list) return
      list.delete(cb)
      if (list.size === 0) {
        this.listeners.delete(sessionId)
      }
    }
  }

  async getSessionMessages(sessionId: string, limit?: number) {
    return sessionManager.getMessagesRaw(sessionId, limit)
  }

  private emitUpdate(update: SessionUpdate): void {
    const listeners = this.listeners.get(update.sessionId)
    if (!listeners) return
    listeners.forEach((cb) => cb(update))
  }

  private async trackSession(
    input: SessionTrackingInput,
    restoreStatus: TaskStatus
  ): Promise<void> {
    const timeoutMs = input.kind === 'task-description-improve' ? 120000 : 3600000
    const initialDelayMs = input.kind === 'task-description-improve' ? 6000 : 3000
    const deadline = Date.now() + timeoutMs
    let pollInterval = 2000

    console.log('[OpenCodeSessionWorker] trackSession:start', {
      runId: input.runId,
      sessionId: input.sessionId,
      timeoutMs,
      initialDelayMs,
    })

    try {
      while (Date.now() < deadline) {
        if (pollInterval === 2000) {
          await new Promise((resolve) => setTimeout(resolve, initialDelayMs))
        } else {
          await new Promise((resolve) => setTimeout(resolve, pollInterval))
        }

        const messages = await sessionManager.getMessagesRaw(input.sessionId)
        if (messages.length === 0) {
          pollInterval = Math.min(pollInterval + 1000, 10000)
          console.log('[OpenCodeSessionWorker] trackSession:empty', {
            runId: input.runId,
            sessionId: input.sessionId,
            nextPollMs: pollInterval,
          })
          continue
        }

        pollInterval = 2000

        const lastMessage = messages[messages.length - 1]
        const content = this.extractAssistantText(lastMessage)

        const current = this.active.get(input.sessionId)
        if (current) {
          current.messageCount = messages.length
          current.lastMessageAt = lastMessage?.timestamp
          this.emitUpdate(current)
        }

        if (!content) {
          continue
        }

        console.log('[OpenCodeSessionWorker] trackSession:content', {
          runId: input.runId,
          sessionId: input.sessionId,
          kind: input.kind,
        })

        if (input.kind === 'task-description-improve') {
          this.updateTask(input.taskId, {
            description: content,
            status: restoreStatus,
          })

          runRepo.update(input.runId, {
            status: 'succeeded',
            finishedAt: new Date().toISOString(),
            errorText: '',
          })

          runEventRepo.create({
            runId: input.runId,
            eventType: 'status',
            payload: { message: 'User story generated' },
          })

          console.log('[OpenCodeSessionWorker] trackSession:completed', {
            runId: input.runId,
            sessionId: input.sessionId,
            status: 'completed',
          })

          this.finishSession(input.sessionId, input.runId, 'completed')
          return
        }

        const statusMatch = content.match(/STATUS:\s*(done|fail|question)/i)
        if (!statusMatch) {
          continue
        }

        const status = statusMatch[1].toLowerCase()
        if (status === 'done') {
          runRepo.update(input.runId, {
            status: 'succeeded',
            finishedAt: new Date().toISOString(),
            errorText: '',
          })
          this.updateTask(input.taskId, { status: 'done' })
          this.finishSession(input.sessionId, input.runId, 'completed')
          console.log('[OpenCodeSessionWorker] trackSession:done', {
            runId: input.runId,
            sessionId: input.sessionId,
          })
        } else if (status === 'fail') {
          runRepo.update(input.runId, {
            status: 'failed',
            finishedAt: new Date().toISOString(),
            errorText: content,
          })
          this.updateTask(input.taskId, { status: 'failed' })
          this.finishSession(input.sessionId, input.runId, 'failed')
          console.log('[OpenCodeSessionWorker] trackSession:fail', {
            runId: input.runId,
            sessionId: input.sessionId,
          })
        } else if (status === 'question') {
          runRepo.update(input.runId, {
            status: 'failed',
            finishedAt: new Date().toISOString(),
            errorText: content,
          })
          this.updateTask(input.taskId, { status: 'question' })
          this.finishSession(input.sessionId, input.runId, 'failed')
          console.log('[OpenCodeSessionWorker] trackSession:question', {
            runId: input.runId,
            sessionId: input.sessionId,
          })
        }

        runEventRepo.create({
          runId: input.runId,
          eventType: 'status',
          payload: { message: `STATUS: ${status}` },
        })

        return
      }

      runRepo.update(input.runId, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        errorText: 'OpenCode response timeout',
      })
      if (input.kind === 'task-description-improve') {
        this.updateTask(input.taskId, { status: restoreStatus })
      } else {
        this.updateTask(input.taskId, { status: 'failed' })
      }

      runEventRepo.create({
        runId: input.runId,
        eventType: 'status',
        payload: { message: 'Timeout waiting for OpenCode response' },
      })

      console.log('[OpenCodeSessionWorker] trackSession:timeout', {
        runId: input.runId,
        sessionId: input.sessionId,
      })

      this.finishSession(input.sessionId, input.runId, 'timeout')
    } catch (error) {
      runRepo.update(input.runId, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        errorText: error instanceof Error ? error.message : String(error),
      })
      if (input.kind === 'task-description-improve') {
        this.updateTask(input.taskId, { status: restoreStatus })
      } else {
        this.updateTask(input.taskId, { status: 'failed' })
      }

      runEventRepo.create({
        runId: input.runId,
        eventType: 'status',
        payload: { message: `Error: ${String(error)}` },
      })

      console.log('[OpenCodeSessionWorker] trackSession:error', {
        runId: input.runId,
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : String(error),
      })

      this.finishSession(input.sessionId, input.runId, 'failed')
    }
  }

  private finishSession(sessionId: string, runId: string, status: SessionUpdate['status']) {
    const current = this.active.get(sessionId)
    if (current) {
      current.status = status
      this.emitUpdate(current)
    }
    this.active.delete(sessionId)

    runEventRepo.create({
      runId,
      eventType: 'status',
      payload: { message: `Session ${status}` },
    })
  }

  private extractAssistantText(message: any): string | null {
    if (!message || message.role !== 'assistant') {
      return null
    }

    const content = message.parts
      .filter((part: any) => part.type === 'text' && !part.ignored)
      .map((part: any) => part.text)
      .join('\n')

    return content.trim() || null
  }

  private updateTask(taskId: string, patch: Partial<{ status: TaskStatus; description: string }>) {
    taskRepo.update(taskId, patch)
    const task = taskRepo.getById(taskId)
    if (task) {
      emitTaskEvent({ type: 'task.updated', task })
    }
  }
}

export const opencodeSessionWorker = new OpenCodeSessionWorker()
