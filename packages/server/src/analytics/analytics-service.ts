import { dbManager } from '../db/index.js'
import type { AnalyticsRange } from "@shared/types/ipc"

const toRangeBounds = (range?: AnalyticsRange) => {
  if (!range) return { start: null, end: null }
  const start = range.from ? new Date(`${range.from}T00:00:00.000Z`).toISOString() : null
  const end = range.to ? new Date(`${range.to}T23:59:59.999Z`).toISOString() : null
  return { start, end }
}

export const analyticsService = {
  getOverview(projectId: string, range?: AnalyticsRange) {
    const db = dbManager.connect()
    const { start, end } = toRangeBounds(range)
    const rangeWhere: string[] = []
    const rangeParams: string[] = []

    if (start) {
      rangeWhere.push('updated_at >= ?')
      rangeParams.push(start)
    }
    if (end) {
      rangeWhere.push('updated_at <= ?')
      rangeParams.push(end)
    }

    const wipCount = db
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM tasks
          WHERE project_id = ? AND status = 'in-progress'
        `
      )
      .get(projectId) as { count: number }

    const doneCount = db
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM tasks
          WHERE project_id = ? AND status = 'done'
          ${rangeWhere.length ? `AND ${rangeWhere.join(' AND ')}` : ''}
        `
      )
      .get(projectId, ...rangeParams) as { count: number }

    const createdCount = db
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM tasks
          WHERE project_id = ?
          ${start ? 'AND created_at >= ?' : ''}
          ${end ? 'AND created_at <= ?' : ''}
        `
      )
      .get(projectId, ...[start, end].filter(Boolean)) as { count: number }

    const leadTimeRows = db
      .prepare(
        `
          SELECT created_at as createdAt, updated_at as updatedAt
          FROM tasks
          WHERE project_id = ? AND status = 'done'
          ${rangeWhere.length ? `AND ${rangeWhere.join(' AND ')}` : ''}
        `
      )
      .all(projectId, ...rangeParams) as Array<{ createdAt: string; updatedAt: string }>

    const aiTotals = db
      .prepare(
        `
          SELECT
            COALESCE(SUM(r.ai_tokens_in), 0) as aiTokensIn,
            COALESCE(SUM(r.ai_tokens_out), 0) as aiTokensOut,
            COALESCE(SUM(r.ai_cost_usd), 0) as aiCostUsd
          FROM runs r
          JOIN tasks t ON t.id = r.task_id
          WHERE t.project_id = ?
          ${start ? 'AND r.created_at >= ?' : ''}
          ${end ? 'AND r.created_at <= ?' : ''}
        `
      )
      .get(projectId, ...[start, end].filter(Boolean)) as {
      aiTokensIn: number
      aiTokensOut: number
      aiCostUsd: number
    }

    const leadTimes = leadTimeRows
      .map((row) => {
        const created = new Date(row.createdAt).getTime()
        const updated = new Date(row.updatedAt).getTime()
        if (!Number.isFinite(created) || !Number.isFinite(updated)) return null
        return Math.max(0, (updated - created) / 36e5)
      })
      .filter((value): value is number => value !== null)

    const leadTimeHours = leadTimes.length
      ? leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length
      : 0

    const cycleTimeHours = leadTimeHours

    const rangeDays =
      start && end
        ? Math.max(1, (new Date(end).getTime() - new Date(start).getTime()) / 86400000)
        : 1
    const throughputPerDay = rangeDays ? doneCount.count / rangeDays : doneCount.count

    return {
      wipCount: wipCount.count,
      throughputPerDay,
      doneCount: doneCount.count,
      createdCount: createdCount.count,
      leadTimeHours,
      cycleTimeHours,
      aiTokensIn: aiTotals.aiTokensIn ?? 0,
      aiTokensOut: aiTotals.aiTokensOut ?? 0,
      aiCostUsd: aiTotals.aiCostUsd ?? 0,
    }
  },
  getRunStats(projectId: string, range?: AnalyticsRange) {
    const db = dbManager.connect()
    const { start, end } = toRangeBounds(range)
    const where: string[] = ['t.project_id = ?']
    const params: string[] = [projectId]

    if (start) {
      where.push('r.created_at >= ?')
      params.push(start)
    }
    if (end) {
      where.push('r.created_at <= ?')
      params.push(end)
    }

    const rows = db
      .prepare(
        `
          SELECT
            COUNT(*) as totalRuns,
            SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END) as successRuns,
            AVG(r.duration_sec) as avgDurationSec
          FROM runs r
          JOIN tasks t ON t.id = r.task_id
          WHERE ${where.join(' AND ')}
        `
      )
      .get(...params) as {
      totalRuns: number
      successRuns: number | null
      avgDurationSec: number | null
    }

    const totalRuns = rows.totalRuns ?? 0
    const successRuns = rows.successRuns ?? 0
    const successRate = totalRuns > 0 ? successRuns / totalRuns : 0

    return {
      totalRuns,
      successRuns,
      successRate,
      avgDurationSec: rows.avgDurationSec ?? 0,
    }
  },
}
