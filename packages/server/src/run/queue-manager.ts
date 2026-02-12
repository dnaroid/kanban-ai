import { dbManager } from '../db/index.js'
import { runRepo } from '../db/run-repository.js'
import type { RunRecord } from '../db/run-types'
import { appMetricsRepo } from '../db/app-metrics-repository.js'
import type { OpenCodePort } from '../ports'
import { JobRunner } from './job-runner.js'

const resolveProviderFromPreset = (preset: Record<string, unknown>): string | null => {
  const direct = preset.provider
  if (typeof direct === 'string' && direct) return direct

  const model = preset.model
  if (typeof model === 'string' && model) return model
  if (model && typeof model === 'object' && 'provider' in model) {
    const provider = (model as { provider?: unknown }).provider
    if (typeof provider === 'string' && provider) return provider
  }

  return null
}

export class QueueManager {
  private readonly defaultConcurrency: number
  private readonly providerConcurrency = new Map<string, number>()
  private readonly providerRunners = new Map<string, JobRunner>()
  private readonly providerCache = new Map<string, string>()

  constructor(
    private readonly executor: OpenCodePort,
    providerConcurrencyConfig: string | undefined,
    defaultConcurrency: number
  ) {
    this.defaultConcurrency = Math.max(1, defaultConcurrency)
    this.parseProviderConcurrency(providerConcurrencyConfig)
    this.restoreQueuedRuns()
  }

  enqueue(runId: string) {
    const run = runRepo.getById(runId)
    if (!run) return
    const providerKey = this.resolveProviderKey(run)
    this.getRunner(providerKey).enqueue(runId)
    this.recordQueueDepth(providerKey)
  }

  cancel(runId: string) {
    const run = runRepo.getById(runId)
    if (!run) return Promise.resolve()
    const providerKey = this.resolveProviderKey(run)
    return this.getRunner(providerKey)
      .cancel(runId)
      .finally(() => {
        this.recordQueueDepth(providerKey)
      })
  }

  getQueueStats() {
    let queued = 0
    let running = 0
    for (const runner of this.providerRunners.values()) {
      queued += this.readQueueDepth(runner)
      running += this.readRunningCount(runner)
    }

    return {
      providers: this.providerRunners.size,
      queued,
      running,
    }
  }

  private parseProviderConcurrency(raw: string | undefined) {
    if (!raw) return
    const entries = raw.split(',').map((pair) => pair.trim())
    for (const entry of entries) {
      if (!entry) continue
      const [key, value] = entry.split('=').map((part) => part.trim())
      if (!key) continue
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed <= 0) continue
      this.providerConcurrency.set(key, Math.max(1, Math.floor(parsed)))
    }
  }

  private resolveProviderKey(run: RunRecord): string {
    const cached = this.providerCache.get(run.roleId)
    if (cached) return cached

    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT preset_json as presetJson
        FROM agent_roles
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(run.roleId) as { presetJson: string } | undefined

    let providerKey = 'default'
    if (row?.presetJson) {
      try {
        const preset = JSON.parse(row.presetJson) as Record<string, unknown>
        providerKey = resolveProviderFromPreset(preset) ?? 'default'
      } catch (error) {
        console.warn('[RunService] Failed to parse role preset JSON:', error)
      }
    }

    this.providerCache.set(run.roleId, providerKey)
    return providerKey
  }

  private getRunner(providerKey: string) {
    const existing = this.providerRunners.get(providerKey)
    if (existing) return existing

    const concurrency = this.providerConcurrency.get(providerKey) ?? this.defaultConcurrency
    const runner = new JobRunner(this.executor, { concurrency })
    this.providerRunners.set(providerKey, runner)
    return runner
  }

  private restoreQueuedRuns() {
    const queuedRuns = runRepo.listByStatus('queued', 500)
    const grouped: Record<string, string[]> = {}
    for (const run of queuedRuns) {
      const providerKey = this.resolveProviderKey(run)
      grouped[providerKey] = grouped[providerKey] ?? []
      grouped[providerKey].push(run.id)
    }
    Object.entries(grouped).forEach(([providerKey, runIds]) => {
      this.getRunner(providerKey).init(runIds)
      this.recordQueueDepth(providerKey)
    })
  }

  private recordQueueDepth(providerKey: string) {
    const runner = this.providerRunners.get(providerKey)
    if (!runner) return

    try {
      appMetricsRepo.record('run.queue.depth', this.readQueueDepth(runner), { providerKey })
      appMetricsRepo.record('run.queue.running', this.readRunningCount(runner), { providerKey })
    } catch {
      // ignore metrics write failures in queue path
    }
  }

  private readQueueDepth(runner: JobRunner): number {
    const value = (runner as unknown as { getQueueDepth?: () => number }).getQueueDepth?.()
    return typeof value === 'number' ? value : 0
  }

  private readRunningCount(runner: JobRunner): number {
    const value = (runner as unknown as { getRunningCount?: () => number }).getRunningCount?.()
    return typeof value === 'number' ? value : 0
  }
}
