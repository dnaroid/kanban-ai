import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'

export type AppMetricRecord = {
  id: string
  metricName: string
  metricValue: number
  tags: Record<string, unknown>
  createdAt: string
}

export const appMetricsRepo = {
  record(metricName: string, metricValue: number, tags: Record<string, unknown> = {}): void {
    const db = dbManager.connect()
    db.prepare(
      `
      INSERT INTO app_metrics (id, metric_name, metric_value, tags_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      `
    ).run(randomUUID(), metricName, metricValue, JSON.stringify(tags), new Date().toISOString())
  },

  list(limit = 200, metricName?: string): AppMetricRecord[] {
    const db = dbManager.connect()
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)))

    const rows = metricName
      ? db
          .prepare(
            `
            SELECT id,
                   metric_name  as metricName,
                   metric_value as metricValue,
                   tags_json    as tagsJson,
                   created_at   as createdAt
            FROM app_metrics
            WHERE metric_name = ?
            ORDER BY created_at DESC
            LIMIT ?
            `
          )
          .all(metricName, safeLimit)
      : db
          .prepare(
            `
            SELECT id,
                   metric_name  as metricName,
                   metric_value as metricValue,
                   tags_json    as tagsJson,
                   created_at   as createdAt
            FROM app_metrics
            ORDER BY created_at DESC
            LIMIT ?
            `
          )
          .all(safeLimit)

    return (
      rows as Array<{
        id: string
        metricName: string
        metricValue: number
        tagsJson: string
        createdAt: string
      }>
    ).map((row) => ({
      id: row.id,
      metricName: row.metricName,
      metricValue: row.metricValue,
      tags: JSON.parse(row.tagsJson || '{}') as Record<string, unknown>,
      createdAt: row.createdAt,
    }))
  },
}
