import type { AppInfo, Project, CreateProjectInput, UpdateProjectInput, DeleteProjectInput, LogEntry } from '../shared/types/ipc'

export interface MainToRenderer {
  app: {
    getInfo(): Promise<AppInfo>
  }
  project: {
    create(input: CreateProjectInput): Promise<Project>
    getAll(): Promise<Project[]>
    getById(id: string): Promise<Project | null>
    update(input: UpdateProjectInput): Promise<Project | null>
    delete(input: DeleteProjectInput): Promise<boolean>
  }
  diagnostics: {
    getLogs(level?: string, limit?: number): Promise<LogEntry[]>
    getSystemInfo(): Promise<object>
    getDbInfo(): Promise<object>
  }
}

export interface RendererToMain {
  app: {
    getInfo(): Promise<AppInfo>
  }
  project: {
    create(input: CreateProjectInput): Promise<Project>
    getAll(): Promise<Project[]>
    getById(id: string): Promise<Project | null>
    update(input: UpdateProjectInput): Promise<Project | null>
    delete(input: DeleteProjectInput): Promise<boolean>
  }
  diagnostics: {
    getLogs(level?: string, limit?: number): Promise<LogEntry[]>
    getSystemInfo(): Promise<object>
    getDbInfo(): Promise<object>
  }
}

