import { ok, fail, Result, unwrap } from '../../../../../shared/dist/ipc/result'
import type { Result } from '../../../../../shared/dist/ipc/result'
import type { ProjectRepoPort } from '../../../ports'

export class DeleteProjectUseCase {
  constructor(private readonly projectRepo: ProjectRepoPort) {}

  execute(projectId: string): Result<boolean> {
    return this.projectRepo.delete(projectId)
  }
}
