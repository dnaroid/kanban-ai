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
    getDefault: (input) => ipcRenderer.invoke('board:getDefault', input),
    updateColumns: (input) => ipcRenderer.invoke('board:updateColumns', input),
  },
  task: {
    create: (input) => ipcRenderer.invoke('task:create', input),
    listByBoard: (input) => ipcRenderer.invoke('task:listByBoard', input),
    update: (input) => ipcRenderer.invoke('task:update', input),
    move: (input) => ipcRenderer.invoke('task:move', input),
  },
  git: {
    status: (input) => ipcRenderer.invoke('git:status', input),
    branchCreate: (input) => ipcRenderer.invoke('git:branch:create', input),
    branchCheckout: (input) => ipcRenderer.invoke('git:branch:checkout', input),
    diff: (input) => ipcRenderer.invoke('git:diff', input),
    commit: (input) => ipcRenderer.invoke('git:commit', input),
    push: (input) => ipcRenderer.invoke('git:push', input),
  },
  pr: {
    create: (input) => ipcRenderer.invoke('pr:create', input),
    refresh: (input) => ipcRenderer.invoke('pr:refresh', input),
    merge: (input) => ipcRenderer.invoke('pr:merge', input),
  },
  vcs: {
    connectRepo: (input) => ipcRenderer.invoke('vcs:connectRepo', input),
  },
  integrations: {
    setProvider: (input) => ipcRenderer.invoke('integrations:setProvider', input),
    setToken: (input) => ipcRenderer.invoke('integrations:setToken', input),
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
  merge: {
    detect: (input) => ipcRenderer.invoke('merge:detect', input),
    suggest: (input) => ipcRenderer.invoke('merge:suggest', input),
    apply: (input) => ipcRenderer.invoke('merge:apply', input),
    abort: (input) => ipcRenderer.invoke('merge:abort', input),
  },
  autoMerge: {
    set: (input) => ipcRenderer.invoke('autoMerge:set', input),
    runOnce: (input) => ipcRenderer.invoke('autoMerge:runOnce', input),
  },
  release: {
    create: (input) => ipcRenderer.invoke('release:create', input),
    addItems: (input) => ipcRenderer.invoke('release:addItems', input),
    generateNotes: (input) => ipcRenderer.invoke('release:generateNotes', input),
    publish: (input) => ipcRenderer.invoke('release:publish', input),
    list: (input) => ipcRenderer.invoke('release:list', input),
    get: (input) => ipcRenderer.invoke('release:get', input),
  },
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: MainToRenderer
  }
}
