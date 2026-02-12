import type { Project } from "@shared/types/ipc"
import * as ipcResult from '@shared/ipc/result'
import type { Result } from '@shared/ipc/result'
import type { ProjectRepoPort } from '../../../ports'

export class GetProjectsUseCase {
  constructor(private readonly projectRepo: ProjectRepoPort) {}

  execute(): Result<Project[]> {
    return this.projectRepo.getAll()
  }
}
