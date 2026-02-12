import { EventEmitter } from 'events'
import type { KanbanTask } from '../../../shared/dist/types/ipc'
import { publishEvent } from '../events/eventBus'

export type TaskEvent = {
  type: 'task.updated'
  task: KanbanTask
}

type EventMap = {
  'task:event': TaskEvent
}

class EventBusIpc {
  private readonly emitter = new EventEmitter()

  emit<K extends keyof EventMap>(channel: K, payload: EventMap[K]) {
    this.emitter.emit(channel, payload)
  }

  on<K extends keyof EventMap>(channel: K, handler: (payload: EventMap[K]) => void) {
    this.emitter.on(channel, handler)
    return () => this.emitter.off(channel, handler)
  }
}

export const eventBusIpc = new EventBusIpc()

export const emitTaskEvent = (event: TaskEvent) => {
  // Emit to IPC (for Electron compatibility)
  eventBusIpc.emit('task:event', event)

  // Publish to EventBus for SSE (for local-web)
  publishEvent('task:onEvent', event)
}

export const onTaskEvent = (handler: (event: TaskEvent) => void) => {
  return eventBusIpc.on('task:event', handler)
}
