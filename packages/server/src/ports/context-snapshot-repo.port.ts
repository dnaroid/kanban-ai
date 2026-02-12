import type { Result } from '../../../shared/dist/ipc'

export interface CreateContextSnapshotInput {
  taskId: string
  kind: string
  summary: string
  payload: unknown
  hash: string
}

export interface ContextSnapshotRepoPort {
  create(input: CreateContextSnapshotInput): Result<{ id: string }>
}
