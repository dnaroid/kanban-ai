import { contextBridge, ipcRenderer } from 'electron'
import type { MainToRenderer, OpenCodeSessionEvent, TaskEvent } from './ipc-contract'

const api: MainToRenderer = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo'),
    openPath: (path: string) => ipcRenderer.invoke('app:openPath', path),
  },
  opencode: {
    onEvent: (sessionId, callback) => {
      const listener = (_event: unknown, data: unknown) => {
        callback(data as OpenCodeSessionEvent)
      }
      ipcRenderer.on('opencode:event', listener)
      if (sessionId) {
        void ipcRenderer.invoke('opencode:subscribeToEvents', { sessionId })
      }
      return () => {
        ipcRenderer.removeListener('opencode:event', listener)
        if (sessionId) {
          void ipcRenderer.invoke('opencode:unsubscribeFromEvents', { sessionId })
        }
      }
    },
    generateUserStory: (input) => ipcRenderer.invoke('opencode:generateUserStory', input),
    getSessionStatus: (input) => ipcRenderer.invoke('opencode:getSessionStatus', input),
    getActiveSessions: () => ipcRenderer.invoke('opencode:getActiveSessions'),
    getSessionMessages: (input) => ipcRenderer.invoke('opencode:getSessionMessages', input),
    getSessionTodos: (input) => ipcRenderer.invoke('opencode:getSessionTodos', input),
    listModels: () => ipcRenderer.invoke('opencode:listModels'),
    listEnabledModels: () => ipcRenderer.invoke('opencode:listEnabledModels'),
    refreshModels: () => ipcRenderer.invoke('opencode:refreshModels'),
    toggleModel: (input) => ipcRenderer.invoke('opencode:toggleModel', input),
    updateModelDifficulty: (input) => ipcRenderer.invoke('opencode:updateModelDifficulty', input),
    sendMessage: (input) => ipcRenderer.invoke('opencode:sendMessage', input),
    logProviders: (input) => ipcRenderer.invoke('opencode:logProviders', input),
  },
  project: {
    selectFolder: () => ipcRenderer.invoke('project:selectFolder'),
    selectFiles: () => ipcRenderer.invoke('project:selectFiles'),
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
    onEvent: (callback) => {
      const listener = (_event: unknown, data: unknown) => {
        callback(data as TaskEvent)
      }
      ipcRenderer.on('task:event', listener)
      ipcRenderer.invoke('task:subscribeToEvents', {})
      return () => {
        ipcRenderer.removeListener('task:event', listener)
        ipcRenderer.invoke('task:unsubscribeFromEvents', {})
      }
    },
    create: (input) => ipcRenderer.invoke('task:create', input),
    listByBoard: (input) => ipcRenderer.invoke('task:listByBoard', input),
    update: (input) => ipcRenderer.invoke('task:update', input),
    move: (input) => ipcRenderer.invoke('task:move', input),
    delete: (input) => ipcRenderer.invoke('task:delete', input),
  },
  tag: {
    create: (input) => ipcRenderer.invoke('tag:create', input),
    update: (input) => ipcRenderer.invoke('tag:update', input),
    delete: (input) => ipcRenderer.invoke('tag:delete', input),
    list: (input) => ipcRenderer.invoke('tag:list', input),
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
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    install: (input) => ipcRenderer.invoke('plugins:install', input),
    enable: (input) => ipcRenderer.invoke('plugins:enable', input),
    reload: () => ipcRenderer.invoke('plugins:reload'),
  },
  roles: {
    list: () => ipcRenderer.invoke('roles:list'),
  },
  diagnostics: {
    getLogs: (level, limit) => ipcRenderer.invoke('diagnostics:getLogs', level, limit),
    getLogTail: (lines) => ipcRenderer.invoke('diagnostics:getLogTail', lines),
    getSystemInfo: () => ipcRenderer.invoke('diagnostics:getSystemInfo'),
    getDbInfo: () => ipcRenderer.invoke('diagnostics:getDbInfo'),
    getMetrics: (input) => ipcRenderer.invoke('diagnostics:getMetrics', input),
  },
  database: {
    delete: (input) => ipcRenderer.invoke('database:delete', input),
  },
  run: {
    start: (input) => ipcRenderer.invoke('run:start', input),
    cancel: (input) => ipcRenderer.invoke('run:cancel', input),
    delete: (input) => ipcRenderer.invoke('run:delete', input),
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
    getDefaultModel: (input: any) => ipcRenderer.invoke('appSetting:getDefaultModel', input),
    setDefaultModel: (input: any) => ipcRenderer.invoke('appSetting:setDefaultModel', input),
    getOhMyOpencodePath: () => ipcRenderer.invoke('appSetting:getOhMyOpencodePath'),
    setOhMyOpencodePath: (input: { path: string }) =>
      ipcRenderer.invoke('appSetting:setOhMyOpencodePath', input),
    getRetentionPolicy: () => ipcRenderer.invoke('appSetting:getRetentionPolicy'),
    setRetentionPolicy: (input: { enabled: boolean; days: number }) =>
      ipcRenderer.invoke('appSetting:setRetentionPolicy', input),
    runRetentionCleanup: (input: { dryRun?: boolean; maxDeletes?: number }) =>
      ipcRenderer.invoke('appSetting:runRetentionCleanup', input),
  },
  ohMyOpencode: {
    readConfig: (input) => ipcRenderer.invoke('ohMyOpencode:readConfig', input),
    saveConfig: (input) => ipcRenderer.invoke('ohMyOpencode:saveConfig', input),
    listPresets: (input) => ipcRenderer.invoke('ohMyOpencode:listPresets', input),
    loadPreset: (input) => ipcRenderer.invoke('ohMyOpencode:loadPreset', input),
    savePreset: (input) => ipcRenderer.invoke('ohMyOpencode:savePreset', input),
    backupConfig: (input) => ipcRenderer.invoke('ohMyOpencode:backupConfig', input),
    restoreConfig: (input) => ipcRenderer.invoke('ohMyOpencode:restoreConfig', input),
  },
  dialog: {
    showOpenDialog: (input) => ipcRenderer.invoke('dialog:showOpenDialog', input),
  },
  fileSystem: {
    exists: (input) => ipcRenderer.invoke('fileSystem:exists', input),
  },
  vosk: {
    downloadModel: (input) => ipcRenderer.invoke('vosk:downloadModel', input),
  },
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: MainToRenderer
  }
}
