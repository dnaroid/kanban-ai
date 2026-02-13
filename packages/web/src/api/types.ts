export interface KanbanApi {
  run: {
    listByTask(params: { taskId: string }): Promise<{ runs: any[] }>
    start(params: { taskId: string; roleId: string; mode?: string }): Promise<{ runId: string }>
  }
  task: {
    listByBoard(params: { boardId: string }): Promise<{ tasks: any[] }>
    create(params: any): Promise<any>
    update(params: any): Promise<any>
    delete(params: any): Promise<any>
  }
  board: {
    getDefault(params: any): Promise<{ board: any; columns: any[] }>
  }
  project: {
    list(): Promise<{ projects: any[] }>
    create(params: any): Promise<any>
  }
}
declare global {
  interface Window {
    api: KanbanApi
  }
}
