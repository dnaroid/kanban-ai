import { contextSnapshotRepo } from '../../db/context-snapshot-repository'
import type { ContextSnapshotRepoPort, CreateContextSnapshotInput } from '../../ports'
import { toResultError } from '../../ipc/map-error'

export class ContextSnapshotRepoAdapter implements ContextSnapshotRepoPort {
  create(input: CreateContextSnapshotInput) {
    try {
      const snapshot = contextSnapshotRepo.create(input)
      return { ok: true as const, data: { id: snapshot.id } }
    } catch (error) {
      return toResultError<{ id: string }>(error)
    }
  }
}
