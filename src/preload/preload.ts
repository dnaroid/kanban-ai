import { contextBridge, ipcRenderer } from 'electron'
import type { MainToRenderer } from './ipc-contract.js'

const api: MainToRenderer = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo')
  },
  project: {
    create: (input) => ipcRenderer.invoke('project:create', input),
    getAll: () => ipcRenderer.invoke('project:getAll'),
    getById: (id) => ipcRenderer.invoke('project:getById', id),
    update: (input) => ipcRenderer.invoke('project:update', input),
    delete: (input) => ipcRenderer.invoke('project:delete', input)
  },
  diagnostics: {
    getLogs: (level, limit) => ipcRenderer.invoke('diagnostics:getLogs', level, limit),
    getSystemInfo: () => ipcRenderer.invoke('diagnostics:getSystemInfo'),
    getDbInfo: () => ipcRenderer.invoke('diagnostics:getDbInfo')
  }
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: MainToRenderer
  }
}
