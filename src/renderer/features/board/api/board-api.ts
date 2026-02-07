import type {
  Board,
  BoardColumn,
  BoardColumnInput,
  CreateTaskInput,
  KanbanTask,
  Tag,
} from '@/shared/types/ipc.ts'
import { unwrapIpcResult } from '../../../lib/ipc-result'

export interface BoardData {
  board: Board
  columns: BoardColumn[]
}

export async function fetchBoardData(projectId: string): Promise<BoardData> {
  return window.api.board.getDefault({ projectId })
}

export async function fetchGlobalTags(): Promise<Tag[]> {
  const response = await window.api.tag.list({})
  return response.tags
}

export async function fetchTasksByBoard(boardId: string): Promise<KanbanTask[]> {
  const response = unwrapIpcResult(await window.api.task.listByBoard({ boardId }))
  return response.tasks
}

export async function saveBoardColumns(boardId: string, columns: BoardColumnInput[]) {
  return window.api.board.updateColumns({ boardId, columns })
}

export async function createTask(input: CreateTaskInput) {
  return unwrapIpcResult(await window.api.task.create(input))
}

export async function deleteTask(taskId: string) {
  return unwrapIpcResult(await window.api.task.delete({ taskId }))
}

export async function moveTask(taskId: string, toColumnId: string, toIndex: number) {
  return unwrapIpcResult(await window.api.task.move({ taskId, toColumnId, toIndex }))
}

export async function updateTask(taskId: string, patch: Partial<KanbanTask>) {
  return unwrapIpcResult(await window.api.task.update({ taskId, patch }))
}

export function subscribeTaskUpdated(handler: (task: KanbanTask) => void): () => void {
  return window.api.task.onEvent((event) => {
    if (event.type === 'task.updated') {
      handler(event.task)
    }
  })
}
