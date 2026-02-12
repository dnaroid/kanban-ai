import type { Project } from "@shared/types/ipc"
import * as ipcResult from '@shared/ipc/result'
import type { Result } from '@shared/ipc/result'
import type { ProjectRepoPort } from '../../../ports'

export class GetProjectByIdUseCase {
  constructor(private readonly projectRepo: ProjectRepoPort) {}

  execute(id: string): Result<Project | null> {
    return this.projectRepo.getById(id)
  }
}
