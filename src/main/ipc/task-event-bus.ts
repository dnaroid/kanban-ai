import { EventEmitter } from 'events'
import type { KanbanTask } from '../../shared/types/ipc.js'

export type TaskEvent = {
  type: 'task.updated'
  task: KanbanTask
}

const emitter = new EventEmitter()

export const emitTaskEvent = (event: TaskEvent) => {
  emitter.emit('event', event)
}

export const onTaskEvent = (handler: (event: TaskEvent) => void) => {
  emitter.on('event', handler)
  return () => emitter.off('event', handler)
}
