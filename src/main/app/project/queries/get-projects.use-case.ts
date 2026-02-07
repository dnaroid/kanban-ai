import type { Project } from '../../../../shared/types/ipc'
import { type Result } from '../../../../shared/ipc'
import type { ProjectRepoPort } from '../../../ports'

export class GetProjectsUseCase {
  constructor(private readonly projectRepo: ProjectRepoPort) {}

  execute(): Result<Project[]> {
    return this.projectRepo.getAll()
  }
}
