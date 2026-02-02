import { projectRepo } from '../db/project-repository.js'
import { runEventRepo } from '../db/run-event-repository.js'
import { taskRepo } from '../db/task-repository.js'
import { runRepo } from '../db/run-repository.js'
import { opencodeSessionRepo } from '../db/opencode-session-repository.js'
import type { RunRecord } from '../db/run-types'
import type { RunExecutor } from './job-runner'
import { sessionManager } from './opencode-session-manager.js'
import { buildContextSnapshot } from './context-snapshot-builder.js'
import { buildUserStoryPrompt } from './prompts/user-story.js'
import { buildTaskPrompt } from './prompts/task.js'

export class OpenCodeExecutorSDK implements RunExecutor {
  async generateUserStory(taskId: string): Promise<string> {
    const task = taskRepo.getById(taskId)
    if (!task) {
      throw new Error('Task not found')
    }

    const project = projectRepo.getById(task.projectId)
    if (!project) {
      throw new Error('Project not found for task')
    }

    const roleId = 'ba'
    const prompt = buildUserStoryPrompt(task, project)
    const sessionTitle = `User Story: ${task.title}`

    let sessionInfo: { id: string; title: string; directory: string } | null = null
    let runId: string | null = null

    try {
      const contextSnapshot = await buildContextSnapshot({ taskId, roleId, mode: 'execute' })
      const run = runRepo.create({
        taskId,
        roleId,
        mode: 'execute',
        kind: 'task-description-improve',
        status: 'running',
        contextSnapshotId: contextSnapshot.id,
      })
      runId = run.id
      runRepo.update(runId, { startedAt: new Date().toISOString() })

      sessionInfo = await sessionManager.createSession(sessionTitle, project.path)

      if (!sessionInfo) {
        throw new Error('Failed to create OpenCode session')
      }

      opencodeSessionRepo.create({
        runId,
        sessionId: sessionInfo.id,
        title: sessionTitle,
        directory: project.path,
      })

      runEventRepo.create({
        runId,
        eventType: 'status',
        payload: { message: 'OpenCode session created', sessionId: sessionInfo.id },
      })

      console.log('[OpenCode] Request:', prompt)

      const sessionId = sessionInfo.id

      let content: string | null = null
      let timeoutHandle: NodeJS.Timeout | null = null
      let usePolling = false

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('Empty response from OpenCode (timeout)'))
        }, 60000)
      })

      let eventPromiseHandled: Promise<string> | null = null

      try {
        let eventResolve: (value: string) => void = () => {}
        let eventReject: (reason?: any) => void = () => {}
        let eventSettled = false

        const eventPromise = new Promise<string>((resolve, reject) => {
          eventResolve = resolve
          eventReject = reject
        })

        eventPromiseHandled = eventPromise.then(
          (value) => value,
          (error) => {
            throw error
          }
        )

        const handleEvent = async (event: any) => {
          try {
            if (event.type === 'message.created' || event.type === 'message.updated') {
              if (event.message && event.message.role === 'assistant') {
                const messages = await sessionManager.getMessagesRaw(sessionId)
                const lastMessage = messages[messages.length - 1]

                if (lastMessage && lastMessage.role === 'assistant') {
                  const messageContent = lastMessage.parts
                    .filter((p: any) => p.type === 'text' && !p.ignored)
                    .map((p: any) => p.text)
                    .join('\n')

                  if (messageContent) {
                    content = messageContent.trim()
                    console.log('[OpenCode] Response:', content)
                    await sessionManager.unsubscribeFromSessionEvents(sessionId)
                    if (!eventSettled) {
                      eventSettled = true
                      eventResolve(content)
                    }
                  }
                }
              }
            } else if (event.type === 'error') {
              await sessionManager.unsubscribeFromSessionEvents(sessionId)
              if (!eventSettled) {
                eventSettled = true
                eventReject(new Error(`OpenCode error: ${event.error}`))
              }
            }
          } catch (error) {
            await sessionManager.unsubscribeFromSessionEvents(sessionId)
            if (!eventSettled) {
              eventSettled = true
              eventReject(error)
            }
          }
        }

        await sessionManager.subscribeToSessionEvents(sessionId, handleEvent)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('Event stream is unavailable')) {
          usePolling = true
        } else {
          throw error
        }
      }

      await sessionManager.sendPromptAsync(sessionId, prompt)

      const pollForResponse = async (): Promise<string | null> => {
        const pollInterval = 2000
        const maxPollTime = 60000
        let elapsed = 0

        while (elapsed < maxPollTime) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval))
          elapsed += pollInterval

          const messages = await sessionManager.getMessagesRaw(sessionId)
          const lastMessage = messages[messages.length - 1]

          if (lastMessage && lastMessage.role === 'assistant') {
            const messageContent = lastMessage.parts
              .filter((p: any) => p.type === 'text' && !p.ignored)
              .map((p: any) => p.text)
              .join('\n')

            if (messageContent) {
              return messageContent.trim()
            }
          }
        }

        return null
      }

      try {
        if (usePolling) {
          content = await pollForResponse()
        } else if (eventPromiseHandled) {
          content = await Promise.race([eventPromiseHandled, timeoutPromise])
        } else {
          content = await Promise.race([timeoutPromise])
        }
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle)
      }

      if (!content) {
        throw new Error('Empty response from OpenCode')
      }

      taskRepo.update(taskId, { description: content })

      if (runId) {
        runRepo.update(runId, {
          status: 'succeeded',
          finishedAt: new Date().toISOString(),
          errorText: '',
        })
        opencodeSessionRepo.updateStatus(runId, 'completed')

        runEventRepo.create({
          runId,
          eventType: 'status',
          payload: { message: 'User story generated' },
        })
      }

      return content
    } catch (error) {
      if (runId) {
        runRepo.update(runId, {
          status: 'failed',
          finishedAt: new Date().toISOString(),
          errorText: error instanceof Error ? error.message : String(error),
        })
        opencodeSessionRepo.updateStatus(runId, 'aborted')
      }
      throw error
    }
  }

  async start(run: RunRecord): Promise<void> {
    const task = taskRepo.getById(run.taskId)
    if (!task) {
      throw new Error('Task not found for run')
    }

    const project = projectRepo.getById(task.projectId)
    if (!project) {
      throw new Error('Project not found for run')
    }

    const repoPath = project.path
    const prompt = buildTaskPrompt(task, project)
    const sessionTitle = `Task ${task.id}: ${task.title}`

    const sessionInfo = await sessionManager.createSession(sessionTitle, repoPath)

    opencodeSessionRepo.create({
      runId: run.id,
      sessionId: sessionInfo.id,
      title: sessionTitle,
      directory: repoPath,
    })

    runEventRepo.create({
      runId: run.id,
      eventType: 'status',
      payload: { message: 'OpenCode session created', sessionId: sessionInfo.id },
    })

    try {
      console.log('[OpenCode] Request:', prompt)
      await sessionManager.sendPromptAsync(sessionInfo.id, prompt)

      const pollInterval = 2000
      const maxPollTime = 3600000

      let elapsed = 0
      const messageContentById = new Map<string, string>()

      while (elapsed < maxPollTime) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
        elapsed += pollInterval

        const messages = await sessionManager.getMessagesRaw(sessionInfo.id)

        for (const msg of messages) {
          const previousContent = messageContentById.get(msg.id)
          const currentContent = msg.parts
            .filter((p) => p.type === 'text' && !p.ignored)
            .map((p) => (p as { text: string }).text)
            .join('\n')

          if (previousContent === undefined) {
            messageContentById.set(msg.id, currentContent)
            if (!currentContent) continue
          } else if (previousContent === currentContent) {
            continue
          } else {
            messageContentById.set(msg.id, currentContent)
          }

          runEventRepo.upsertMessage({
            runId: run.id,
            eventType: 'message',
            messageId: msg.id,
            payload: {
              role: msg.role,
              parts: msg.parts,
              timestamp: msg.timestamp,
            },
          })
        }

        const lastMessage = messages[messages.length - 1]
        if (lastMessage && lastMessage.role === 'assistant') {
          const content = lastMessage.parts
            .filter((p) => p.type === 'text' && !p.ignored)
            .map((p) => (p as { text: string }).text)
            .join('\n')
          console.log('[OpenCode] Response:', content)
          const statusMatch = content.match(/STATUS:\s*(done|fail|question)/i)

          if (statusMatch) {
            const rawStatus = statusMatch[1].toLowerCase()
            const statusMap: Record<
              string,
              'queued' | 'running' | 'question' | 'paused' | 'done' | 'failed'
            > = {
              done: 'done',
              fail: 'failed',
              question: 'question',
            }
            const newStatus = statusMap[rawStatus]
            if (newStatus) {
              taskRepo.update(task.id, { status: newStatus })
            }

            opencodeSessionRepo.updateStatus(run.id, 'completed')
            break
          }
        }
      }

      if (elapsed >= maxPollTime) {
        runEventRepo.create({
          runId: run.id,
          eventType: 'status',
          payload: { message: 'Session polling timeout' },
        })
      }
    } catch (error) {
      opencodeSessionRepo.updateStatus(run.id, 'aborted')
      throw error
    }
  }

  async cancel(runId: string): Promise<void> {
    const sessionRecord = opencodeSessionRepo.getByRunId(runId)
    if (!sessionRecord) return

    try {
      await sessionManager.abortSession(sessionRecord.sessionId)
      opencodeSessionRepo.updateStatus(runId, 'aborted')
    } catch (error) {
      console.error('[OpenCodeExecutorSDK] Failed to abort session:', error)
    }
  }
}
