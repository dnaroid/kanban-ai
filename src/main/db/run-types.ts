export type RunMode = 'plan-only' | 'execute' | 'critique'
export type RunKind = 'task-run' | 'task-description-improve'
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
export type RunEventType =
  | 'stdout'
  | 'stderr'
  | 'message'
  | 'tool'
  | 'artifact'
  | 'status'
  | 'debug'
  | 'usage'
export type ArtifactKind = 'markdown' | 'json' | 'patch' | 'file_ref' | 'link'

export type RunRecord = {
  id: string
  taskId: string
  roleId: string
  mode: RunMode
  kind: RunKind
  status: RunStatus
  startedAt?: string
  finishedAt?: string
  errorText: string
  budget: Record<string, unknown>
  contextSnapshotId: string
  aiTokensIn?: number
  aiTokensOut?: number
  aiCostUsd?: number
  sessionId?: string
  createdAt: string
  updatedAt: string
}

export type CreateRunInput = {
  taskId: string
  roleId: string
  mode?: RunMode
  kind?: RunKind
  status?: RunStatus
  budget?: Record<string, unknown>
  contextSnapshotId: string
}

export type RunEventRecord = {
  id: string
  runId: string
  ts: string
  eventType: RunEventType
  payload: unknown
  messageId?: string
}

export type CreateRunEventInput = {
  runId: string
  eventType: RunEventType
  payload: unknown
  ts?: string
  messageId?: string
}

export type ArtifactRecord = {
  id: string
  runId: string
  kind: ArtifactKind
  title: string
  content: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type CreateArtifactInput = {
  runId: string
  kind: ArtifactKind
  title: string
  content: string
  metadata?: Record<string, unknown>
}

export type ContextSnapshotRecord = {
  id: string
  taskId: string
  kind: string
  summary: string
  payload: unknown
  hash: string
  createdAt: string
}

export type CreateContextSnapshotInput = {
  taskId: string
  kind: string
  summary?: string
  payload: unknown
  hash: string
}
