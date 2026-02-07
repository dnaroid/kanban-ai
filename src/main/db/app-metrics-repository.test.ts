import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../tests/helpers/test-db'
import { appMetricsRepo } from './app-metrics-repository'

describe('appMetricsRepo', () => {
  it('records and lists metrics', () => {
    const testDb = createTestDb()
    try {
      appMetricsRepo.record('ipc.handler.latency_ms', 12.5, {
        channel: 'task:create',
        status: 'ok',
      })
      appMetricsRepo.record('run.queue.depth', 3, { providerKey: 'default' })

      const all = appMetricsRepo.list(10)
      expect(all.length).toBeGreaterThanOrEqual(2)

      const ipcOnly = appMetricsRepo.list(10, 'ipc.handler.latency_ms')
      expect(ipcOnly.length).toBeGreaterThanOrEqual(1)
      expect(ipcOnly.every((entry) => entry.metricName === 'ipc.handler.latency_ms')).toBe(true)
    } finally {
      testDb.cleanup()
    }
  })
})
