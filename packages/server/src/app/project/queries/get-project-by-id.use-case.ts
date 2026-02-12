import type { Project } from '../../../../../shared/dist/types/ipc'
import { ok, fail, Result, unwrap } from '../../../../../shared/dist/ipc/result'
import type { Result } from '../../../../../shared/dist/ipc/result'
import type { ProjectRepoPort } from '../../../ports'

export class GetProjectByIdUseCase {
  constructor(private readonly projectRepo: ProjectRepoPort) {}

  execute(id: string): Result<Project | null> {
    return this.projectRepo.getById(id)
  }
}
