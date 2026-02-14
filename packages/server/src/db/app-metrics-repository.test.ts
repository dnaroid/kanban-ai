import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../tests/helpers/test-db.js'
import { createAppMetricsRepo } from './app-metrics-repository.js'

describe('app-metrics-repository', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let repo: ReturnType<typeof createAppMetricsRepo>

  beforeEach(async () => {
    testDb = await createTestDb()
    repo = createAppMetricsRepo(() => testDb.db)
  })

  afterEach(() => {
    testDb?.cleanup()
  })

  it('records a metric', () => {
    repo.record('test.metric', 42.5)
    const rows = testDb.db.prepare('SELECT * FROM app_metrics').all() as Array<{metric_name: string; metric_value: number}>
    expect(rows).toHaveLength(1)
    expect(rows[0].metric_name).toBe('test.metric')
    expect(rows[0].metric_value).toBe(42.5)
  })

  it('lists metrics with limit', () => {
    for (let i = 0; i < 10; i++) {
      repo.record('test.metric', i)
    }
    const result = repo.list(5)
    expect(result).toHaveLength(5)
  })

  it('filters metrics by name', () => {
    repo.record('metric.a', 1)
    repo.record('metric.b', 2)
    repo.record('metric.a', 3)
    const result = repo.list(100, 'metric.a')
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.metricName === 'metric.a')).toBe(true)
  })
})
