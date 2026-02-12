import type { Project, UpdateProjectInput } from "@shared/types/ipc"
import * as ipcResult from '@shared/ipc/result'
import type { Result } from '@shared/ipc/result'
import type { ProjectRepoPort } from '../../../ports'

export class UpdateProjectUseCase {
  constructor(private readonly projectRepo: ProjectRepoPort) {}

  execute(input: UpdateProjectInput): Result<Project | null> {
    const { id, ...updates } = input
    return this.projectRepo.update(id, updates)
  }
}
