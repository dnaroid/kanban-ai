import type { CreateProjectInput, Project } from "@shared/types/ipc"
import { ok, type Result } from "@shared/ipc"
import type { ProjectRepoPort } from '../../ports'
import { projectRepo } from '../../db/project-repository'
import { toResultError } from '../../ipc/map-error'

export class ProjectRepoAdapter implements ProjectRepoPort {
  create(input: CreateProjectInput): Result<Project> {
    try {
      return ok(projectRepo.create(input))
    } catch (error) {
      return toResultError(error)
    }
  }

  getAll(): Result<Project[]> {
    try {
      return ok(projectRepo.getAll())
    } catch (error) {
      return toResultError(error)
    }
  }

  getById(id: string): Result<Project | null> {
    try {
      return ok(projectRepo.getById(id))
    } catch (error) {
      return toResultError(error)
    }
  }

  update(
    id: string,
    updates: Partial<Pick<Project, 'name' | 'path' | 'color'>>
  ): Result<Project | null> {
    try {
      return ok(projectRepo.update(id, updates))
    } catch (error) {
      return toResultError(error)
    }
  }

  delete(id: string): Result<boolean> {
    try {
      return ok(projectRepo.delete(id))
    } catch (error) {
      return toResultError(error)
    }
  }
}
