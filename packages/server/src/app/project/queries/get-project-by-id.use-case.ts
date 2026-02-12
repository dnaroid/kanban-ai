import type { Project } from '@shared/types/ipc'
import { type Result } from '@shared/ipc'
import type { ProjectRepoPort } from '../../../ports'

export class GetProjectByIdUseCase {
  constructor(private readonly projectRepo: ProjectRepoPort) {}

  execute(id: string): Result<Project | null> {
    return this.projectRepo.getById(id)
  }
}
