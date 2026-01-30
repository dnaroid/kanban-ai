import { dbManager } from '../db/index.js'
import type { PluginManifest, PluginRecord, PluginType } from '../../shared/types/ipc'

type PluginRow = {
  id: string
  name: string
  version: string
  enabled: number
  type: PluginType
  manifestJson: string
  installedAt: string
  updatedAt: string
}

const parseManifest = (manifestJson: string): PluginManifest => {
  try {
    return JSON.parse(manifestJson) as PluginManifest
  } catch {
    return {
      id: 'unknown',
      name: 'Unknown',
      version: '0.0.0',
      type: 'integration',
      entrypoint: 'index.js',
      permissions: {
        canRegisterRoles: false,
        canRegisterExecutors: false,
        canCallNetwork: false,
      },
    }
  }
}

const mapRow = (row: PluginRow): PluginRecord => ({
  id: row.id,
  name: row.name,
  version: row.version,
  enabled: row.enabled === 1,
  type: row.type,
  manifest: parseManifest(row.manifestJson),
  installedAt: row.installedAt,
  updatedAt: row.updatedAt,
})

export class PluginRepository {
  list(): PluginRecord[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
          SELECT
            id,
            name,
            version,
            enabled,
            type,
            manifest_json as manifestJson,
            installed_at as installedAt,
            updated_at as updatedAt
          FROM plugins
          ORDER BY installed_at DESC
        `
      )
      .all() as PluginRow[]

    return rows.map(mapRow)
  }

  getById(id: string): PluginRecord | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
          SELECT
            id,
            name,
            version,
            enabled,
            type,
            manifest_json as manifestJson,
            installed_at as installedAt,
            updated_at as updatedAt
          FROM plugins
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(id) as PluginRow | undefined

    return row ? mapRow(row) : null
  }

  upsert(manifest: PluginManifest, enabled: boolean): PluginRecord {
    const db = dbManager.connect()
    const existing = this.getById(manifest.id)
    const now = new Date().toISOString()
    const installedAt = existing?.installedAt ?? now
    const manifestJson = JSON.stringify(manifest)

    db.prepare(
      `
        INSERT INTO plugins (
          id, name, version, enabled, type, manifest_json, installed_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          version = excluded.version,
          enabled = excluded.enabled,
          type = excluded.type,
          manifest_json = excluded.manifest_json,
          updated_at = excluded.updated_at
      `
    ).run(
      manifest.id,
      manifest.name,
      manifest.version,
      enabled ? 1 : 0,
      manifest.type,
      manifestJson,
      installedAt,
      now
    )

    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      enabled,
      type: manifest.type,
      manifest,
      installedAt,
      updatedAt: now,
    }
  }

  setEnabled(id: string, enabled: boolean): PluginRecord {
    const db = dbManager.connect()
    const existing = this.getById(id)
    if (!existing) {
      throw new Error('Plugin not found')
    }
    const now = new Date().toISOString()

    db.prepare('UPDATE plugins SET enabled = ?, updated_at = ? WHERE id = ?').run(
      enabled ? 1 : 0,
      now,
      id
    )

    return {
      ...existing,
      enabled,
      updatedAt: now,
    }
  }
}

export const pluginRepo = new PluginRepository()
