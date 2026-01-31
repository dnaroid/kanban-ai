import {projectRepo} from "../db/project-repository.js"
import {runEventRepo} from "../db/run-event-repository.js"
import {taskRepo} from "../db/task-repository.js"
import {opencodeSessionRepo} from "../db/opencode-session-repository.js"
import type {RunRecord} from "../db/run-types"
import type {RunExecutor} from "./job-runner"
import {sessionManager} from "./opencode-session-manager.js"

const buildUserStoryPrompt = (task: any, project: any): string => {
  return `
Сформируй техническую user story ДЛЯ КОД-АГЕНТА на русском языке. Это не текст для человека-заказчика, а четкое задание для LLM-исполнителя.

ЗАДАЧА: ${task.title}
Текущее описание: ${task.description || "Нет описания"}

Контекст проекта:
- Путь: ${project.path}
- Название: ${project.name}
- ID проекта: ${project.id}

Требования к формату (строго придерживайся структуры):
**Название:** [кратко и технически точно]

**Цель:** [что именно должно измениться/появиться]

**Контекст проекта:**
- [1-3 пункта о домене/типе проекта, если можно предположить по пути]

**Скоуп:**
- Включено: [2-4 конкретных пункта]
- Исключено: [1-3 пункта, что делать не нужно]

**Требования:**
- [функциональное требование 1]
- [функциональное требование 2]
- [техническое требование 3]

**Ограничения:**
- [ограничение 1]
- [ограничение 2]

**Критерии приемки (проверяемые):**
- [критерий 1]
- [критерий 2]
- [критерий 3]

**Ожидаемый результат:** [конкретный итог, который должен получить агент]

Правила:
1. Пиши коротко, без «воды», ориентируйся на выполнение задачи код-агентом.
2. Не предлагай решения на уровне кода, только требования и критерии.
3. Не добавляй никаких вступлений, выводов или пояснений. Верни ТОЛЬКО текст по структуре выше.
`.trim()
}

const buildTaskPrompt = (task: any, project: any): string => {
  return `
ЗАДАЧА: ${task.title}

Описание: ${task.description || "Нет описания"}

Контекст проекта:
- Путь: ${project.path}
- ID проекта: ${project.id}

Требования:
1. Выполните задачу в директории проекта: ${project.path}
2. При завершении в самом конце выведи в формате:
   STATUS: done|fail|question
3. Если STATUS=fail — опиши причину
4. Если STATUS=question — задай конкретный вопрос пользователю
`.trim()
}

export class OpenCodeExecutorSDK implements RunExecutor {
  async generateUserStory(taskId: string): Promise<string> {
    const task = taskRepo.getById(taskId)
    if (!task) {
      throw new Error("Task not found")
    }

    const project = projectRepo.getById(task.projectId)
    if (!project) {
      throw new Error("Project not found for task")
    }

    const prompt = buildUserStoryPrompt(task, project)
    const sessionTitle = `User Story: ${task.title}`

    const sessionInfo = await sessionManager.createSession(sessionTitle, project.path)

    try {
      console.log("[OpenCode] Request:", prompt)
      const message = await sessionManager.sendPrompt(sessionInfo.id, prompt)
      console.log("[OpenCode] message:", message)
      const resolvedMessage = await sessionManager.getMessage(sessionInfo.id, message.id)
      const content = resolvedMessage?.content?.trim()
      console.log("[OpenCode] Response:", content)

      if (!content) {
        throw new Error("Empty response from OpenCode")
      }

      taskRepo.update(taskId, {description: content})

      return content
    } finally {
      try {
        await sessionManager.deleteSession(sessionInfo.id)
      } catch (error) {
        console.error("[OpenCodeExecutorSDK] Failed to delete temporary session:", error)
      }
    }
  }

  async start(run: RunRecord): Promise<void> {
    const task = taskRepo.getById(run.taskId)
    if (!task) {
      throw new Error("Task not found for run")
    }

    const project = projectRepo.getById(task.projectId)
    if (!project) {
      throw new Error("Project not found for run")
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
      eventType: "status",
      payload: {message: "OpenCode session created", sessionId: sessionInfo.id},
    })

    try {
      console.log("[OpenCode] Request:", prompt)
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
            .filter((p) => p.type === "text" && !p.ignored)
            .map((p) => (p as { text: string }).text)
            .join("\n")

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
            eventType: "message",
            payload: {
              role: msg.role,
              parts: msg.parts,
              timestamp: msg.timestamp,
            },
          })
        }

        const lastMessage = messages[messages.length - 1]
        if (lastMessage && lastMessage.role === "assistant") {
          const content = lastMessage.parts
            .filter((p) => p.type === "text" && !p.ignored)
            .map((p) => (p as { text: string }).text)
            .join("\n")
          console.log("[OpenCode] Response:", content)
          const statusMatch = content.match(/STATUS:\s*(done|fail|question)/i)

          if (statusMatch) {
            const rawStatus = statusMatch[1].toLowerCase()
            const statusMap: Record<
              string,
              "queued" | "running" | "question" | "paused" | "done" | "failed"
            > = {
              done: "done",
              fail: "failed",
              question: "question",
            }
            const newStatus = statusMap[rawStatus]
            if (newStatus) {
              taskRepo.update(task.id, {status: newStatus})
            }

            opencodeSessionRepo.updateStatus(run.id, "completed")
            break
          }
        }
      }

      if (elapsed >= maxPollTime) {
        runEventRepo.create({
          runId: run.id,
          eventType: "status",
          payload: {message: "Session polling timeout"},
        })
      }
    } catch (error) {
      opencodeSessionRepo.updateStatus(run.id, "aborted")
      throw error
    }
  }

  async cancel(runId: string): Promise<void> {
    const sessionRecord = opencodeSessionRepo.getByRunId(runId)
    if (!sessionRecord) return

    try {
      await sessionManager.abortSession(sessionRecord.sessionId)
      opencodeSessionRepo.updateStatus(runId, "aborted")
    } catch (error) {
      console.error("[OpenCodeExecutorSDK] Failed to abort session:", error)
    }
  }
}
