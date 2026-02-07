import type { Project, UpdateProjectInput } from '../../../../shared/types/ipc'
import { type Result } from '../../../../shared/ipc'
import type { ProjectRepoPort } from '../../../ports'

export class UpdateProjectUseCase {
  constructor(private readonly projectRepo: ProjectRepoPort) {}

  execute(input: UpdateProjectInput): Result<Project | null> {
    const { id, ...updates } = input
    return this.projectRepo.update(id, updates)
  }
}
