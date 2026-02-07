import { EventEmitter } from 'events'
import type { KanbanTask } from '../../shared/types/ipc.js'

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
  eventBusIpc.emit('task:event', event)
}

export const onTaskEvent = (handler: (event: TaskEvent) => void) => {
  return eventBusIpc.on('task:event', handler)
}
