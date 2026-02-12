import { type Result } from "../../shared/src/ipc'
import type { ProjectRepoPort } from '../../../ports'

export class DeleteProjectUseCase {
  constructor(private readonly projectRepo: ProjectRepoPort) {}

  execute(projectId: string): Result<boolean> {
    return this.projectRepo.delete(projectId)
  }
}
