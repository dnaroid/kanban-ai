import type { CreateProjectInput, Project } from "@shared/types/ipc"
import { type Result } from "../../shared/src/ipc'
import type { ProjectRepoPort } from '../../../ports'

export class CreateProjectUseCase {
  constructor(private readonly projectRepo: ProjectRepoPort) {}

  execute(input: CreateProjectInput): Result<Project> {
    return this.projectRepo.create(input)
  }
}
