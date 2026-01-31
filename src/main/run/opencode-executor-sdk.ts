import { projectRepo } from '../db/project-repository.js'
import { runEventRepo } from '../db/run-event-repository.js'
import { taskRepo } from '../db/task-repository.js'
import { opencodeSessionRepo } from '../db/opencode-session-repository.js'
import type { RunRecord } from '../db/run-types'
import type { RunExecutor } from './job-runner'
import { sessionManager } from './opencode-session-manager.js'

const buildTaskPrompt = (task: any, project: any): string => {
  return `
ЗАДАЧА: ${task.title}

Описание: ${task.description || 'Нет описания'}

Контекст проекта:
- Путь: ${project.path}
- ID проекта: ${project.id}

Требования:
1. Выполните задачу в директории проекта: ${project.path}
2. При завершении выведи в формате:
   STATUS: done|fail|question
3. Если STATUS=fail — опиши причину
4. Если STATUS=question — задай конкретный вопрос пользователю
`.trim()
}

export class OpenCodeExecutorSDK implements RunExecutor {
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

          runEventRepo.create({
            runId: run.id,
            eventType: 'message',
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
          const statusMatch = content.match(/STATUS:\s*(done|fail|question)/i)

          if (statusMatch) {
            const rawStatus = statusMatch[1].toLowerCase()
            const statusMap: Record<string, 'todo' | 'in-progress' | 'done'> = {
              done: 'done',
              fail: 'todo',
              question: 'in-progress',
            }
            taskRepo.update(task.id, { status: statusMap[rawStatus] })

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
