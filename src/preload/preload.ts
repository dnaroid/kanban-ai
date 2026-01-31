import { contextBridge, ipcRenderer } from 'electron'
import type { MainToRenderer, OpenCodeSessionEvent } from './ipc-contract.js'

const api: MainToRenderer = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo'),
  },
  opencode: {
    onEvent: (callback) => {
      const listener = (_event: unknown, data: unknown) => {
        callback(data as OpenCodeSessionEvent)
      }
      ipcRenderer.on('opencode:event', listener)
      return () => {
        ipcRenderer.removeListener('opencode:event', listener)
      }
    },
    generateUserStory: (input) => ipcRenderer.invoke('opencode:generateUserStory', input),
  },
  project: {
    selectFolder: () => ipcRenderer.invoke('project:selectFolder'),
    create: (input) => ipcRenderer.invoke('project:create', input),
    getAll: () => ipcRenderer.invoke('project:getAll'),
    getById: (id) => ipcRenderer.invoke('project:getById', id),
    update: (input) => ipcRenderer.invoke('project:update', input),
    delete: (input) => ipcRenderer.invoke('project:delete', input),
  },
  board: {
    getDefault: (input) => ipcRenderer.invoke('board:getDefault', input),
    updateColumns: (input) => ipcRenderer.invoke('board:updateColumns', input),
  },
  task: {
    create: (input) => ipcRenderer.invoke('task:create', input),
    listByBoard: (input) => ipcRenderer.invoke('task:listByBoard', input),
    update: (input) => ipcRenderer.invoke('task:update', input),
    move: (input) => ipcRenderer.invoke('task:move', input),
    delete: (input) => ipcRenderer.invoke('task:delete', input),
  },
  deps: {
    list: (input) => ipcRenderer.invoke('deps:list', input),
    add: (input) => ipcRenderer.invoke('deps:add', input),
    remove: (input) => ipcRenderer.invoke('deps:remove', input),
  },
  schedule: {
    get: (input) => ipcRenderer.invoke('schedule:get', input),
    update: (input) => ipcRenderer.invoke('schedule:update', input),
  },
  search: {
    query: (input) => ipcRenderer.invoke('search:query', input),
  },
  analytics: {
    getOverview: (input) => ipcRenderer.invoke('analytics:getOverview', input),
    getRunStats: (input) => ipcRenderer.invoke('analytics:getRunStats', input),
  },
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    install: (input) => ipcRenderer.invoke('plugins:install', input),
    enable: (input) => ipcRenderer.invoke('plugins:enable', input),
    reload: () => ipcRenderer.invoke('plugins:reload'),
  },
  roles: {
    list: () => ipcRenderer.invoke('roles:list'),
  },
  backup: {
    exportProject: (input) => ipcRenderer.invoke('backup:exportProject', input),
    importProject: (input) => ipcRenderer.invoke('backup:importProject', input),
  },
  diagnostics: {
    getLogs: (level, limit) => ipcRenderer.invoke('diagnostics:getLogs', level, limit),
    getLogTail: (lines) => ipcRenderer.invoke('diagnostics:getLogTail', lines),
    getSystemInfo: () => ipcRenderer.invoke('diagnostics:getSystemInfo'),
    getDbInfo: () => ipcRenderer.invoke('diagnostics:getDbInfo'),
  },
  run: {
    start: (input) => ipcRenderer.invoke('run:start', input),
    cancel: (input) => ipcRenderer.invoke('run:cancel', input),
    listByTask: (input) => ipcRenderer.invoke('run:listByTask', input),
    get: (input) => ipcRenderer.invoke('run:get', input),
  },
  events: {
    tail: (input) => ipcRenderer.invoke('run:events:tail', input),
  },
  artifact: {
    list: (input) => ipcRenderer.invoke('artifact:list', input),
    get: (input) => ipcRenderer.invoke('artifact:get', input),
  },
  appSetting: {
    getLastProjectId: () => ipcRenderer.invoke('appSetting:getLastProjectId'),
    setLastProjectId: (input: { projectId: string }) =>
      ipcRenderer.invoke('appSetting:setLastProjectId', input),
    getSidebarCollapsed: () => ipcRenderer.invoke('appSetting:getSidebarCollapsed'),
    setSidebarCollapsed: (input: { collapsed: boolean }) =>
      ipcRenderer.invoke('appSetting:setSidebarCollapsed', input),
  },
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: MainToRenderer
  }
}
