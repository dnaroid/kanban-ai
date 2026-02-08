import { dbManager } from './index.js'

type RoleRow = {
  id: string
  name: string
  description: string
  presetJson: string
  createdAt: string
  updatedAt: string
}

export type AgentRoleSummary = {
  id: string
  name: string
  description: string
}

export type AgentRolePreset = {
  id: string
  name: string
  description: string
  preset: Record<string, unknown>
}

export class AgentRoleRepository {
  getById(roleId: string): AgentRolePreset | null {
    const db = dbManager.connect()
    const row = db
      .prepare(
        `
          SELECT id, name, description, preset_json as presetJson
          FROM agent_roles
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(roleId) as
      | { id: string; name: string; description: string; presetJson: string }
      | undefined

    if (!row) {
      return null
    }

    let preset: Record<string, unknown> = {}
    try {
      preset = JSON.parse(row.presetJson) as Record<string, unknown>
    } catch (error) {
      console.warn('[AgentRoleRepository] Failed to parse role preset JSON:', error)
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      preset,
    }
  }

  list(): AgentRoleSummary[] {
    const db = dbManager.connect()
    const rows = db
      .prepare(
        `
          SELECT
            id,
            name,
            description,
            preset_json as presetJson,
            created_at as createdAt,
            updated_at as updatedAt
          FROM agent_roles
          ORDER BY name ASC
        `
      )
      .all() as RoleRow[]

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
    }))
  }

  upsert(
    roleId: string,
    data: { name: string; description: string; preset: Record<string, unknown> }
  ) {
    const db = dbManager.connect()
    const now = new Date().toISOString()
    const presetJson = JSON.stringify(data.preset)

    db.prepare(
      `
        INSERT INTO agent_roles (id, name, description, preset_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          preset_json = excluded.preset_json,
          updated_at = excluded.updated_at
      `
    ).run(roleId, data.name, data.description, presetJson, now, now)
  }
}

export const agentRoleRepo = new AgentRoleRepository()
