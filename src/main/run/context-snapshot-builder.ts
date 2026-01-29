import { createHash } from 'node:crypto'
import { boardRepo } from '../db/board-repository.js'
import { contextSnapshotRepo } from '../db/context-snapshot-repository.js'
import { dbManager } from '../db/index.js'
import { projectRepo } from '../db/project-repository.js'
import { taskRepo } from '../db/task-repository.js'
import type { RunMode } from '../db/run-types'
import { DENYLIST_PATTERNS, redactValue } from './run-security.js'

type BuildContextSnapshotInput = {
  taskId: string
  roleId: string
  mode?: RunMode
}

type RolePreset = {
  id: string
  name: string
  description: string
  preset: Record<string, unknown>
}

const loadRolePreset = (roleId: string): RolePreset => {
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
    return {
      id: roleId,
      name: roleId.toUpperCase(),
      description: '',
      preset: {},
    }
  }

  let preset: Record<string, unknown> = {}
  try {
    preset = JSON.parse(row.presetJson) as Record<string, unknown>
  } catch (error) {
    console.warn('[ContextSnapshot] Failed to parse role preset JSON:', error)
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    preset,
  }
}

export const buildContextSnapshot = ({ taskId, roleId, mode }: BuildContextSnapshotInput) => {
  const task = taskRepo.getById(taskId)
  if (!task) {
    throw new Error('Task not found for context snapshot')
  }

  const project = projectRepo.getById(task.projectId)
  if (!project) {
    throw new Error('Project not found for context snapshot')
  }

  const columns = boardRepo.getColumns(task.boardId)
  const column = columns.find((col) => col.id === task.columnId)
  const rolePreset = loadRolePreset(roleId)

  const limits = {
    maxTimeMs: Number(process.env.RUN_MAX_TIME_MS ?? 0),
    maxOutputChars: Number(process.env.RUN_MAX_OUTPUT_CHARS ?? 0),
  }

  const payload = {
    task: {
      id: task.id,
      title: task.title,
      description: task.description ?? '',
      descriptionMd: task.descriptionMd ?? '',
      acceptanceCriteria: task.descriptionMd ?? task.description ?? '',
      type: task.type,
      priority: task.priority,
      tags: task.tags ?? [],
      status: task.status,
    },
    board: {
      id: task.boardId,
      column: {
        id: task.columnId,
        name: column?.name ?? '',
      },
    },
    project: {
      id: project.id,
      name: project.name,
      repoPath: project.path,
    },
    role: {
      id: rolePreset.id,
      name: rolePreset.name,
      description: rolePreset.description,
      preset: rolePreset.preset,
    },
    mode: mode ?? 'execute',
    limits,
    security: {
      denylist: DENYLIST_PATTERNS.map((pattern) => pattern.source),
      safeMode: process.env.OPENCODE_SAFE_MODE !== '0',
    },
  }

  const sanitizedPayload = redactValue(payload)
  const hash = createHash('sha256').update(JSON.stringify(sanitizedPayload)).digest('hex')

  const snapshot = contextSnapshotRepo.create({
    taskId: task.id,
    kind: 'run_input_v1',
    summary: task.title,
    payload: sanitizedPayload,
    hash,
  })

  return snapshot
}
