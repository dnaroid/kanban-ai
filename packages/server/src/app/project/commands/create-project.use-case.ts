import type { CreateProjectInput, Project } from "@shared/types/ipc"
import * as ipcResult from '@shared/ipc/result'
import type { Result } from '@shared/ipc/result'
import type { ProjectRepoPort } from '../../../ports'

export class CreateProjectUseCase {
  constructor(private readonly projectRepo: ProjectRepoPort) {}

  execute(input: CreateProjectInput): Result<Project> {
    return this.projectRepo.create(input)
  }
}
