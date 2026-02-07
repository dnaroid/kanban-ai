import { dbManager } from '../db'

export interface RetentionPolicy {
  enabled: boolean
  days: number
}

export interface RetentionCleanupInput {
  days: number
  dryRun?: boolean
  maxDeletes?: number
}

export interface RetentionCleanupResult {
  cutoffIso: string
  deletedRunEvents: number
  deletedArtifacts: number
  dryRun: boolean
}

export const retentionMaintenanceService = {
  runCleanup(input: RetentionCleanupInput): RetentionCleanupResult {
    const db = dbManager.connect()
    const days = Math.max(1, Math.floor(input.days))
    const dryRun = input.dryRun ?? false
    const maxDeletes = Math.max(1, Math.min(10000, Math.floor(input.maxDeletes ?? 5000)))
    const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const countEventsStmt = db.prepare('SELECT COUNT(*) as count FROM run_events WHERE ts < ?')
    const countArtifactsStmt = db.prepare(
      'SELECT COUNT(*) as count FROM artifacts WHERE created_at < ?'
    )

    if (dryRun) {
      const eventCount = (countEventsStmt.get(cutoffIso) as { count: number }).count
      const artifactCount = (countArtifactsStmt.get(cutoffIso) as { count: number }).count
      return {
        cutoffIso,
        deletedRunEvents: eventCount,
        deletedArtifacts: artifactCount,
        dryRun: true,
      }
    }

    const cleanupTx = db.transaction(() => {
      const deleteEvents = db
        .prepare(
          `
          DELETE FROM run_events
          WHERE id IN (
            SELECT id
            FROM run_events
            WHERE ts < ?
            ORDER BY ts ASC
            LIMIT ?
          )
        `
        )
        .run(cutoffIso, maxDeletes)

      const deleteArtifacts = db
        .prepare(
          `
          DELETE FROM artifacts
          WHERE id IN (
            SELECT id
            FROM artifacts
            WHERE created_at < ?
            ORDER BY created_at ASC
            LIMIT ?
          )
        `
        )
        .run(cutoffIso, maxDeletes)

      return {
        deletedRunEvents: deleteEvents.changes,
        deletedArtifacts: deleteArtifacts.changes,
      }
    })

    const result = cleanupTx()
    return {
      cutoffIso,
      deletedRunEvents: result.deletedRunEvents,
      deletedArtifacts: result.deletedArtifacts,
      dryRun: false,
    }
  },
}
