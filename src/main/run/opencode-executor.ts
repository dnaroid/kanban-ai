import { spawn } from 'node:child_process'
import readline from 'node:readline'
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
    const args = ['run', '--role', run.roleId, '--mode', run.mode, ...extraArgs]

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
      try {
        return JSON.parse(line) as ParsedEvent
      } catch {
        return null
      }
    }

    const handleLine = (line: string, fallbackType: RunEventType) => {
      if (!line.trim()) return
      const parsed = parseJsonLine(line)
      if (parsed) {
        const eventType =
          parsed.eventType && ALLOWED_EVENT_TYPES.includes(parsed.eventType)
            ? parsed.eventType
            : undefined
        if (eventType === 'artifact') {
          handleArtifact(parsed.artifact ?? (parsed as ParsedEvent)['artifact'])
          return
        }
        const usage = extractUsage(parsed.payload ?? parsed)
        if (usage) {
          applyUsageUpdate(run.id, usage)
          emitEvent('usage', usage)
        }
        if (eventType) {
          emitEvent(eventType, parsed.payload ?? parsed)
          return
        }
        if (parsed.artifact) {
          handleArtifact(parsed.artifact)
          return
        }
      }
      emitEvent(fallbackType, redactText(line))
    }

    const createLineReader = (stream: NodeJS.ReadableStream, eventType: RunEventType) => {
      const rl = readline.createInterface({ input: stream })
      rl.on('line', (line) => handleLine(line, eventType))
      return rl
    }

    createLineReader(child.stdout, 'stdout')
    createLineReader(child.stderr, 'stderr')

    const payload = {
      runId: run.id,
      taskId: run.taskId,
      roleId: run.roleId,
      mode: run.mode,
      contextSnapshotId: run.contextSnapshotId,
    }
    if (child.stdin) {
      child.stdin.write(JSON.stringify(payload))
      child.stdin.end()
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
