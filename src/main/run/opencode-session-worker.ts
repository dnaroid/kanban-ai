import { runEventRepo } from '../db/run-event-repository.js'
import { runRepo } from '../db/run-repository.js'
import { tagRepo } from '../db/tag-repository.js'
import { taskRepo } from '../db/task-repository.js'
import { boardRepo } from '../db/board-repository.js'
import type { RunRecord } from '../db/run-types'
import { OPENCODE_STATUS_REGEX, sessionManager } from './opencode-session-manager.js'
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

const allowedTaskTypes = ['feature', 'bug', 'chore', 'improvement'] as const
const allowedDifficulties = ['easy', 'medium', 'hard', 'epic'] as const

type AllowedTaskType = (typeof allowedTaskTypes)[number]
type AllowedDifficulty = (typeof allowedDifficulties)[number]

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
      const inProgressColumnId = this.resolveInProgressColumnId(input.taskId)
      this.updateTask(input.taskId, {
        status: 'running',
        ...(inProgressColumnId ? { columnId: inProgressColumnId } : {}),
      })
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
    let lastStatusMessageId: string | null = null
    let lastStatusValue: string | null = null

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
          const parsed = this.parseUserStoryResponse(content)
          const patch: Partial<{
            status: TaskStatus
            title: string
            description: string
            tags: string[]
            type: AllowedTaskType
            difficulty: AllowedDifficulty
          }> = {
            description: parsed.description,
            status: 'queued',
          }

          if (parsed.title) {
            patch.title = parsed.title
          }

          if (parsed.tags) {
            patch.tags = parsed.tags
          }
          if (parsed.type) {
            patch.type = parsed.type
          }
          if (parsed.difficulty) {
            patch.difficulty = parsed.difficulty
          }

          this.updateTask(input.taskId, patch)

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

          await this.finishSession(input.sessionId, input.runId, 'completed', true)
          return
        }

        const statusLine = content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => OPENCODE_STATUS_REGEX.test(line))
        if (!statusLine) {
          continue
        }

        const statusMatch = statusLine.match(OPENCODE_STATUS_REGEX)
        if (!statusMatch) {
          continue
        }

        const status = statusMatch[1].toLowerCase()
        const messageId = typeof lastMessage?.id === 'string' ? lastMessage.id : null
        if (messageId && lastStatusMessageId === messageId && lastStatusValue === status) {
          continue
        }
        if (messageId) {
          lastStatusMessageId = messageId
          lastStatusValue = status
        }
        if (status === 'done') {
          runRepo.update(input.runId, {
            status: 'succeeded',
            finishedAt: new Date().toISOString(),
            errorText: '',
          })
          this.updateTask(input.taskId, { status: 'done' })
          await this.finishSession(input.sessionId, input.runId, 'completed', false)
          console.log('[OpenCodeSessionWorker] trackSession:done', {
            runId: input.runId,
            sessionId: input.sessionId,
          })
          runEventRepo.create({
            runId: input.runId,
            eventType: 'status',
            payload: { message: statusLine },
          })
          return
        } else if (status === 'fail') {
          runRepo.update(input.runId, {
            status: 'failed',
            finishedAt: new Date().toISOString(),
            errorText: content,
          })
          this.updateTask(input.taskId, { status: 'failed' })
          await this.finishSession(input.sessionId, input.runId, 'failed', false)
          console.log('[OpenCodeSessionWorker] trackSession:fail', {
            runId: input.runId,
            sessionId: input.sessionId,
          })
          runEventRepo.create({
            runId: input.runId,
            eventType: 'status',
            payload: { message: statusLine },
          })
          return
        } else if (status === 'question') {
          this.updateTask(input.taskId, { status: 'question' })
          runEventRepo.create({
            runId: input.runId,
            eventType: 'status',
            payload: { message: statusLine },
          })
          console.log('[OpenCodeSessionWorker] trackSession:question', {
            runId: input.runId,
            sessionId: input.sessionId,
          })
          continue
        }
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

      await this.finishSession(
        input.sessionId,
        input.runId,
        'timeout',
        input.kind === 'task-description-improve'
      )
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

      await this.finishSession(
        input.sessionId,
        input.runId,
        'failed',
        input.kind === 'task-description-improve'
      )
    }
  }

  private async finishSession(
    sessionId: string,
    runId: string,
    status: SessionUpdate['status'],
    deleteArtifacts: boolean
  ) {
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

    if (deleteArtifacts) {
      try {
        await sessionManager.deleteSession(sessionId)
      } catch (error) {
        console.warn('[OpenCodeSessionWorker] finishSession:deleteSession:failed', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      try {
        runRepo.delete(runId)
      } catch (error) {
        console.warn('[OpenCodeSessionWorker] finishSession:deleteRun:failed', {
          runId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
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

  private parseUserStoryResponse(content: string): {
    description: string
    title?: string
    tags?: string[]
    type?: AllowedTaskType
    difficulty?: AllowedDifficulty
  } {
    const metaMatch = content.match(/<META>([\s\S]*?)<\/META>/i)
    const storyMatch = content.match(/<STORY>([\s\S]*?)<\/STORY>/i)

    const rawStory = storyMatch ? storyMatch[1] : content.replace(/<META>[\s\S]*?<\/META>/i, '')

    const description = rawStory.trim() || content.trim()
    const titleMatch = rawStory.match(/^[\s>*_-]*\*{0,2}Название\*{0,2}:\s*(.+)$/im)
    const title = titleMatch ? this.cleanStoryTitle(titleMatch[1]) : undefined

    if (!metaMatch) {
      return { description, title }
    }

    const metaRaw = metaMatch[1]
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim()

    let meta: any = null
    try {
      meta = JSON.parse(metaRaw)
    } catch {
      return { description, title }
    }

    const result: {
      description: string
      title?: string
      tags?: string[]
      type?: AllowedTaskType
      difficulty?: AllowedDifficulty
    } = {
      description,
    }

    if (title) {
      result.title = title
    }

    if (Array.isArray(meta.tags)) {
      const allowedTags = new Set(tagRepo.listAll().map((tag) => tag.name))
      const filtered = meta.tags
        .filter((tag: unknown): tag is string => typeof tag === 'string')
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag.length > 0 && allowedTags.has(tag))

      if (filtered.length > 0) {
        result.tags = Array.from(new Set(filtered))
      } else {
        result.tags = []
      }
    }

    if (typeof meta.type === 'string') {
      const normalized = meta.type.trim()
      if ((allowedTaskTypes as readonly string[]).includes(normalized)) {
        result.type = normalized as AllowedTaskType
      }
    }

    if (typeof meta.difficulty === 'string') {
      const normalized = meta.difficulty.trim()
      if ((allowedDifficulties as readonly string[]).includes(normalized)) {
        result.difficulty = normalized as AllowedDifficulty
      }
    }

    return result
  }

  private updateTask(
    taskId: string,
    patch: Partial<{
      status: TaskStatus
      title: string
      description: string
      tags: string[]
      type: AllowedTaskType
      difficulty: AllowedDifficulty
    }>
  ) {
    taskRepo.update(taskId, patch)
    const task = taskRepo.getById(taskId)
    if (task) {
      emitTaskEvent({ type: 'task.updated', task })
    }
  }

  private resolveInProgressColumnId(taskId: string): string | null {
    const task = taskRepo.getById(taskId)
    if (!task) return null
    const columns = boardRepo.getColumns(task.boardId)
    const normalizeName = (value: string) =>
      value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    const nameMatches = (entry: { name: string }) => {
      const normalized = normalizeName(entry.name)
      return (
        normalized === 'in progress' ||
        normalized.includes('progress') ||
        normalized === 'в работе' ||
        normalized.includes('работ')
      )
    }
    const column = columns.find(nameMatches)
    if (column) return column.id
    const fallback = columns.find((entry) => entry.orderIndex === 1)
    return fallback?.id ?? null
  }

  private cleanStoryTitle(value: string): string {
    let title = value.trim()
    title = title.replace(/^[\s>*_-]+/, '').replace(/[\s>*_-]+$/, '')
    if (
      (title.startsWith('**') && title.endsWith('**')) ||
      (title.startsWith('__') && title.endsWith('__'))
    ) {
      title = title.slice(2, -2).trim()
    }
    title = title.replace(/^\*+/, '').replace(/\*+$/, '').trim()
    title = title.replace(/^_+/, '').replace(/_+$/, '').trim()
    return title
  }
}

export const opencodeSessionWorker = new OpenCodeSessionWorker()
