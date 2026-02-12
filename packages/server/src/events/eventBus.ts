import { EventEmitter } from 'node:events'

export const eventBus = new EventEmitter()

export function publishEvent(channel: string, data: unknown): void {
  eventBus.emit(channel, data)
}

export function subscribeToEvent(channel: string, callback: (data: unknown) => void): () => void {
  eventBus.on(channel, callback)

  return () => {
    eventBus.off(channel, callback)
  }
}
