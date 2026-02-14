import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { dbManager } from './index.js'

export type AppMetricRecord = {
  id: string
  metricName: string
  metricValue: number
  tags: Record<string, unknown>
  createdAt: string
}

export type AppMetricsRepo = {
  record: (metricName: string, metricValue: number, tags?: Record<string, unknown>) => void
  list: (limit?: number, metricName?: string) => AppMetricRecord[]
}

export function createAppMetricsRepo(getDb: () => Database): AppMetricsRepo {
  return {
    record(metricName: string, metricValue: number, tags: Record<string, unknown> = {}): void {
      const db = getDb()
      db.prepare(
        `INSERT INTO app_metrics (id, metric_name, metric_value, tags_json, created_at) VALUES (?, ?, ?, ?, ?)`
      ).run(randomUUID(), metricName, metricValue, JSON.stringify(tags), new Date().toISOString())
    },

    list(limit = 200, metricName?: string): AppMetricRecord[] {
      const db = getDb()
      const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)))
      const sql = metricName
        ? `SELECT id, metric_name as metricName, metric_value as metricValue, tags_json as tagsJson, created_at as createdAt FROM app_metrics WHERE metric_name = ? ORDER BY created_at DESC LIMIT ?`
        : `SELECT id, metric_name as metricName, metric_value as metricValue, tags_json as tagsJson, created_at as createdAt FROM app_metrics ORDER BY created_at DESC LIMIT ?`
      const rows = metricName ? db.prepare(sql).all(metricName, safeLimit) : db.prepare(sql).all(safeLimit)
      return (rows as Array<{id: string; metricName: string; metricValue: number; tagsJson: string; createdAt: string}>).map((r) => ({
        id: r.id, metricName: r.metricName, metricValue: r.metricValue, tags: JSON.parse(r.tagsJson || '{}'), createdAt: r.createdAt,
      }))
    },
  }
}

export const appMetricsRepo = createAppMetricsRepo(() => dbManager.connect())
