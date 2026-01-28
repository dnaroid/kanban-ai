import { contextBridge, ipcRenderer } from 'electron'
import type { MainToRenderer } from './ipc-contract.js'

const api: MainToRenderer = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo'),
  },
  project: {
    selectFolder: () => ipcRenderer.invoke('project:selectFolder'),
    create: (input) => ipcRenderer.invoke('project:create', input),
    getAll: () => ipcRenderer.invoke('project:getAll'),
    getById: (id) => ipcRenderer.invoke('project:getById', id),
    update: (input) => ipcRenderer.invoke('project:update', input),
    delete: (id) => ipcRenderer.invoke('project:delete', { id }),
  },
  board: {
    getDefault: (projectId) => ipcRenderer.invoke('board:getDefault', projectId),
    updateColumns: (boardId, columns) =>
      ipcRenderer.invoke('board:updateColumns', { boardId, columns }),
  },
  task: {
    create: (input) => ipcRenderer.invoke('task:create', input),
    listByBoard: (boardId) => ipcRenderer.invoke('task:listByBoard', boardId),
    update: (id, patch) => ipcRenderer.invoke('task:update', { id, patch }),
    move: (taskId, toColumnId, toIndex) =>
      ipcRenderer.invoke('task:move', { taskId, toColumnId, toIndex }),
  },
  diagnostics: {
    getLogs: (level, limit) => ipcRenderer.invoke('diagnostics:getLogs', level, limit),
    getLogTail: (lines) => ipcRenderer.invoke('diagnostics:getLogTail', lines),
    getSystemInfo: () => ipcRenderer.invoke('diagnostics:getSystemInfo'),
    getDbInfo: () => ipcRenderer.invoke('diagnostics:getDbInfo'),
  },
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: MainToRenderer
  }
}
