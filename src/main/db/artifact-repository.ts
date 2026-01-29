import { randomUUID } from 'node:crypto'
import { dbManager } from './index.js'
import type { ArtifactRecord, CreateArtifactInput } from './run-types'

const parseJsonObject = (value: string | null | undefined): Record<string, unknown> => {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch (error) {
    console.warn('[ArtifactRepo] Failed to parse JSON:', error)
    return {}
  }
}

const mapArtifactRow = (row: {
  id: string
  runId: string
  kind: ArtifactRecord['kind']
  title: string
  content: string
  metadataJson: string
  createdAt: string
}): ArtifactRecord => ({
  id: row.id,
  runId: row.runId,
  kind: row.kind,
  title: row.title,
  content: row.content,
  metadata: parseJsonObject(row.metadataJson),
  createdAt: row.createdAt,
})

export class ArtifactRepository {
  create(input: CreateArtifactInput): ArtifactRecord {
    const db = dbManager.connect()
    const id = randomUUID()
    const now = new Date().toISOString()
    const metadataJson = JSON.stringify(input.metadata ?? {})

    db.prepare(
      `
      INSERT INTO artifacts (id, run_id, kind, title, content, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(id, input.runId, input.kind, input.title, input.content, metadataJson, now)

    return {
      id,
      runId: input.runId,
      kind: input.kind,
      title: input.title,
      content: input.content,
      metadata: input.metadata ?? {},
      createdAt: now,
    }
  }

  getById(artifactId: string): ArtifactRecord | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
        SELECT
          id,
          run_id as runId,
          kind,
          title,
          content,
          metadata_json as metadataJson,
          created_at as createdAt
        FROM artifacts
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(artifactId) as
      | {
          id: string
          runId: string
          kind: ArtifactRecord['kind']
          title: string
          content: string
          metadataJson: string
          createdAt: string
        }
      | undefined

    if (!row) return null
    return mapArtifactRow(row)
  }

  listByRun(runId: string): ArtifactRecord[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
        SELECT
          id,
          run_id as runId,
          kind,
          title,
          content,
          metadata_json as metadataJson,
          created_at as createdAt
        FROM artifacts
        WHERE run_id = ?
        ORDER BY created_at DESC
      `
      )
      .all(runId) as {
      id: string
      runId: string
      kind: ArtifactRecord['kind']
      title: string
      content: string
      metadataJson: string
      createdAt: string
    }[]

    return rows.map(mapArtifactRow)
  }
}

export const artifactRepo = new ArtifactRepository()
