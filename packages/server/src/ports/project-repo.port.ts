import type { Project, CreateProjectInput } from "../../shared/src/types/ipc.ts'
import type { Result } from "../../shared/src/ipc'

export interface ProjectRepoPort {
  create(input: CreateProjectInput): Result<Project>
  getAll(): Result<Project[]>
  getById(id: string): Result<Project | null>
  update(
    id: string,
    updates: Partial<Pick<Project, 'name' | 'path' | 'color'>>
  ): Result<Project | null>
  delete(id: string): Result<boolean>
}
