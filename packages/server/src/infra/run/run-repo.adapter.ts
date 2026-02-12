import type { Run } from '@shared/types/ipc.ts'
import { ok, type Result } from '@shared/ipc'
import type { CreateRunInput, RunRepoPort } from '../../ports'
import { runRepo } from '../../db/run-repository'
import type { RunRecord } from '../../db/run-types'
import { toResultError } from '../../ipc/map-error'

const toRun = (record: RunRecord): Run => ({
  ...record,
  aiTokensIn: record.aiTokensIn ?? 0,
  aiTokensOut: record.aiTokensOut ?? 0,
  aiCostUsd: record.aiCostUsd ?? 0,
})

export class RunRepoAdapter implements RunRepoPort {
  create(input: CreateRunInput): Result<Run> {
    try {
      return ok(toRun(runRepo.create(input)))
    } catch (error) {
      return toResultError(error)
    }
  }

  getById(runId: string): Result<Run | null> {
    try {
      const run = runRepo.getById(runId)
      return ok(run ? toRun(run) : null)
    } catch (error) {
      return toResultError(error)
    }
  }

  listByTask(taskId: string): Result<Run[]> {
    try {
      return ok(runRepo.listByTask(taskId).map(toRun))
    } catch (error) {
      return toResultError(error)
    }
  }

  listByStatus(status: Run['status'], limit?: number): Result<Run[]> {
    try {
      return ok(runRepo.listByStatus(status, limit).map(toRun))
    } catch (error) {
      return toResultError(error)
    }
  }

  update(
    runId: string,
    patch: Partial<Omit<Run, 'id' | 'taskId' | 'createdAt' | 'updatedAt'>>
  ): Result<void> {
    try {
      runRepo.update(runId, patch)
      return ok(undefined)
    } catch (error) {
      return toResultError(error)
    }
  }

  delete(runId: string): Result<void> {
    try {
      runRepo.delete(runId)
      return ok(undefined)
    } catch (error) {
      return toResultError(error)
    }
  }
}
