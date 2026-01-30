import { dbManager } from '../db/index.js'
import { runRepo } from '../db/run-repository.js'
import type { RunRecord } from '../db/run-types'
import { JobRunner } from './job-runner.js'
import { OpenCodeExecutorSDK } from './opencode-executor-sdk.js'

const executor = new OpenCodeExecutorSDK()
const defaultConcurrency = Math.max(1, Number(process.env.RUN_CONCURRENCY ?? 1))
const providerConcurrency = new Map<string, number>()
const providerRunners = new Map<string, JobRunner>()
const providerCache = new Map<string, string>()

const parseProviderConcurrency = (raw: string | undefined) => {
  if (!raw) return
  const entries = raw.split(',').map((pair) => pair.trim())
  for (const entry of entries) {
    if (!entry) continue
    const [key, value] = entry.split('=').map((part) => part.trim())
    if (!key) continue
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) continue
    providerConcurrency.set(key, Math.max(1, Math.floor(parsed)))
  }
}

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

const resolveProviderKey = (run: RunRecord): string => {
  const cached = providerCache.get(run.roleId)
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

  providerCache.set(run.roleId, providerKey)
  return providerKey
}

const getRunner = (providerKey: string) => {
  const existing = providerRunners.get(providerKey)
  if (existing) return existing

  const concurrency = providerConcurrency.get(providerKey) ?? defaultConcurrency
  const runner = new JobRunner(executor, { concurrency })
  providerRunners.set(providerKey, runner)
  return runner
}

parseProviderConcurrency(process.env.RUN_PROVIDER_CONCURRENCY)

const queuedRuns = runRepo.listByStatus('queued', 500)
const grouped: Record<string, string[]> = {}
for (const run of queuedRuns) {
  const providerKey = resolveProviderKey(run)
  grouped[providerKey] = grouped[providerKey] ?? []
  grouped[providerKey].push(run.id)
}
Object.entries(grouped).forEach(([providerKey, runIds]) => {
  getRunner(providerKey).init(runIds)
})

export const runService = {
  enqueue(runId: string) {
    const run = runRepo.getById(runId)
    if (!run) return
    const providerKey = resolveProviderKey(run)
    getRunner(providerKey).enqueue(runId)
  },
  cancel(runId: string) {
    const run = runRepo.getById(runId)
    if (!run) return Promise.resolve()
    const providerKey = resolveProviderKey(run)
    return getRunner(providerKey).cancel(runId)
  },
}
