import type {
  AppInfo,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  DeleteProjectInput,
  LogEntry,
  Board,
  KanbanTask,
  CreateTaskInput,
} from '../shared/types/ipc'

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
  board: {
    getDefault(projectId: string): Promise<Board>
    updateColumns(boardId: string, columns: any[]): Promise<{ success: true }>
  }
  task: {
    create(input: CreateTaskInput): Promise<KanbanTask>
    listByBoard(boardId: string): Promise<KanbanTask[]>
    update(id: string, patch: any): Promise<{ success: true }>
    move(taskId: string, toColumnId: string, toIndex: number): Promise<{ success: true }>
  }
  diagnostics: {
    getLogs(level?: string, limit?: number): Promise<LogEntry[]>
    getLogTail(lines?: number): Promise<string[]>
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
  board: {
    getDefault(projectId: string): Promise<Board>
    updateColumns(boardId: string, columns: any[]): Promise<{ success: true }>
  }
  task: {
    create(input: CreateTaskInput): Promise<KanbanTask>
    listByBoard(boardId: string): Promise<KanbanTask[]>
    update(id: string, patch: any): Promise<{ success: true }>
    move(taskId: string, toColumnId: string, toIndex: number): Promise<{ success: true }>
  }
  diagnostics: {
    getLogs(level?: string, limit?: number): Promise<LogEntry[]>
    getLogTail(lines?: number): Promise<string[]>
    getSystemInfo(): Promise<object>
    getDbInfo(): Promise<object>
  }
}
