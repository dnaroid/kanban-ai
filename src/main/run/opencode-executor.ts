import { spawn } from 'node:child_process'
import { artifactRepo } from '../db/artifact-repository.js'
import { projectRepo } from '../db/project-repository.js'
import { runEventRepo } from '../db/run-event-repository.js'
import { taskRepo } from '../db/task-repository.js'
import { runRepo } from '../db/run-repository.js'
import type { RunRecord, RunEventType } from '../db/run-types'
import { createGitAdapter } from '../git/git-adapter.js'
import { ensureTaskBranchName } from '../git/task-branch-service.js'
import type { RunExecutor } from './job-runner'
import { buildSafeSpawnEnv, isDeniedPath, redactText, redactValue } from './run-security.js'

const ALLOWED_EVENT_TYPES: RunEventType[] = [
  'stdout',
  'stderr',
  'message',
  'tool',
  'artifact',
  'status',
  'debug',
  'usage',
]

const toNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const extractUsage = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const usageRaw =
    root.usage && typeof root.usage === 'object' ? (root.usage as Record<string, unknown>) : root

  const inputTokens = toNumber(usageRaw.input_tokens) ?? toNumber(usageRaw.prompt_tokens) ?? null
  const outputTokens =
    toNumber(usageRaw.output_tokens) ?? toNumber(usageRaw.completion_tokens) ?? null
  const costUsd = toNumber(usageRaw.cost_usd) ?? toNumber(usageRaw.cost) ?? toNumber(usageRaw.usd)

  if (inputTokens === null && outputTokens === null && costUsd === null) return null

  return {
    inputTokens,
    outputTokens,
    costUsd,
  }
}

const applyUsageUpdate = (runId: string, usage: ReturnType<typeof extractUsage>) => {
  if (!usage) return
  const current = runRepo.getById(runId)
  if (!current) return

  const nextTokensIn = (current.aiTokensIn ?? 0) + (usage.inputTokens ?? 0)
  const nextTokensOut = (current.aiTokensOut ?? 0) + (usage.outputTokens ?? 0)
  const nextCost = (current.aiCostUsd ?? 0) + (usage.costUsd ?? 0)

  runRepo.update(runId, {
    aiTokensIn: nextTokensIn,
    aiTokensOut: nextTokensOut,
    aiCostUsd: nextCost,
  })
}

const gitAdapter = createGitAdapter()

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

type ParsedEvent = {
  eventType?: RunEventType
  payload?: unknown
  artifact?: {
    kind?: string
    title?: string
    content?: string
    metadata?: Record<string, unknown>
  }
}

export class OpenCodeExecutor implements RunExecutor {
  private processes = new Map<string, ReturnType<typeof spawn>>()

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
    await gitAdapter.ensureRepo(repoPath)
    const branchName = ensureTaskBranchName(task.id)
    try {
      await gitAdapter.checkoutBranch(repoPath, branchName)
    } catch {
      const defaultBranch = await gitAdapter.getDefaultBranch(repoPath)
      await gitAdapter.createBranch(repoPath, branchName, defaultBranch)
    }

    const command = process.env.OPENCODE_CMD || 'opencode'
    const extraArgs = (process.env.OPENCODE_ARGS || '').split(' ').filter(Boolean)
    const prompt = buildTaskPrompt(task, project)
    const baseArgs = ['run', '--format', 'json', '--agent', run.roleId]
    const printLogsArgs = extraArgs.includes('--print-logs') ? [] : ['--print-logs']
    const args = [...baseArgs, ...printLogsArgs, ...extraArgs, prompt]

    const child = spawn(command, args, {
      cwd: repoPath,
      env: buildSafeSpawnEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.processes.set(run.id, child)

    const emitEvent = (eventType: RunEventType, payload: unknown) => {
      const redactedPayload = redactValue(payload)
      runEventRepo.create({ runId: run.id, eventType, payload: redactedPayload })
    }

    const handleArtifact = (artifact: ParsedEvent['artifact']) => {
      const kind = artifact?.kind ?? 'markdown'
      const title = artifact?.title ?? 'Artifact'
      const rawContent = artifact?.content ?? ''
      const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent)
      const metadata = redactValue(artifact?.metadata ?? {})

      if (kind === 'file_ref' && isDeniedPath(content)) {
        emitEvent('debug', {
          message: 'Denied file_ref artifact by denylist',
          path: redactText(content),
        })
        return
      }

      const redactedContent = redactText(content)
      const record = artifactRepo.create({
        runId: run.id,
        kind: kind as 'markdown' | 'json' | 'patch' | 'file_ref' | 'link',
        title,
        content: redactedContent,
        metadata,
      })
      emitEvent('artifact', {
        artifactId: record.id,
        kind: record.kind,
        title: record.title,
      })
    }

    const parseJsonLine = (line: string): ParsedEvent | null => {
      const trimmed = line.trim()
      if (!trimmed) return null
      try {
        return JSON.parse(trimmed) as ParsedEvent
      } catch {
        return null
      }
    }

    const extractEventType = (value: unknown): RunEventType | undefined => {
      if (typeof value !== 'string') return undefined
      if (ALLOWED_EVENT_TYPES.includes(value as RunEventType)) {
        return value as RunEventType
      }
      const normalized = value.toLowerCase()
      if (normalized === 'error' || normalized === 'warn' || normalized === 'warning') {
        return 'stderr'
      }
      if (normalized === 'info' || normalized === 'log' || normalized === 'output') {
        return 'stdout'
      }
      if (
        normalized === 'assistant' ||
        normalized === 'assistant_message' ||
        normalized === 'message'
      ) {
        return 'message'
      }
      if (normalized === 'tool' || normalized === 'tool_call') {
        return 'tool'
      }
      if (normalized === 'status') {
        return 'status'
      }
      if (normalized === 'usage') {
        return 'usage'
      }
      if (normalized === 'debug') {
        return 'debug'
      }
      return undefined
    }

    const handleLine = (line: string, fallbackType: RunEventType) => {
      if (!line.trim()) return
      const parsed = parseJsonLine(line)
      if (parsed && typeof parsed === 'object') {
        const raw = parsed as Record<string, unknown>
        const eventNode = (raw.event as Record<string, unknown> | undefined) ?? undefined
        const rawEventType =
          raw.eventType ?? raw.type ?? raw.event_type ?? eventNode?.type ?? eventNode?.eventType
        const eventType = extractEventType(rawEventType)
        const artifact =
          raw.artifact ??
          eventNode?.artifact ??
          (raw.payload as Record<string, unknown> | undefined)?.artifact

        if (eventType === 'artifact' || artifact) {
          handleArtifact(artifact ?? (parsed as ParsedEvent).artifact)
          return
        }

        const payload =
          raw.payload ?? raw.data ?? eventNode?.payload ?? raw.message ?? raw.content ?? parsed

        const usage = extractUsage(payload)
        if (usage) {
          applyUsageUpdate(run.id, usage)
          emitEvent('usage', usage)
        }
        if (eventType) {
          emitEvent(eventType, payload)
          return
        }
        emitEvent('message', payload)
        return
      }
      emitEvent(fallbackType, redactText(line))
    }

    const stdOutChunks: string[] = []

    const createLineReader = (
      stream: NodeJS.ReadableStream,
      eventType: RunEventType,
      onChunk?: (chunk: string) => void
    ) => {
      let buffer = ''
      stream.on('data', (data) => {
        const chunk = data.toString()
        if (onChunk) {
          onChunk(chunk)
        }
        buffer += chunk
        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex)
          buffer = buffer.slice(newlineIndex + 1)
          handleLine(line, eventType)
          newlineIndex = buffer.indexOf('\n')
        }
      })
      stream.on('end', () => {
        if (buffer.trim()) {
          handleLine(buffer, eventType)
        }
      })
    }

    if (child.stdout) {
      createLineReader(child.stdout, 'stdout', (chunk) => {
        stdOutChunks.push(chunk)
      })
    }

    if (child.stderr) {
      createLineReader(child.stderr, 'stderr')
    }

    await new Promise<void>((resolve, reject) => {
      child.on('error', (error) => {
        reject(error)
      })

      child.on('close', (code, signal) => {
        this.processes.delete(run.id)

        if (signal) {
          resolve()
          return
        }

        if (code && code !== 0) {
          reject(new Error(`OpenCode exited with code ${code}`))
          return
        }

        const output = stdOutChunks.join('')
        const statusMatch = output.match(/STATUS:\s*(done|fail|question)/i)

        if (statusMatch) {
          const rawStatus = statusMatch[1].toLowerCase()
          const statusMap: Record<string, 'todo' | 'in-progress' | 'done'> = {
            done: 'done',
            fail: 'todo',
            question: 'in-progress',
          }
          taskRepo.update(task.id, { status: statusMap[rawStatus] })
        }

        resolve()
      })
    })
  }

  async cancel(runId: string): Promise<void> {
    const child = this.processes.get(runId)
    if (!child) return

    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      child.once('close', () => resolve())
      setTimeout(resolve, 5000)
    })
    this.processes.delete(runId)
  }
}
