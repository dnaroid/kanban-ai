import { ipcHandlers } from '../validation'
import { z } from 'zod'
import { onTaskEvent } from '../event-bus-ipc'

const taskEventSubscriptions = new Map<number, () => void>()

export function registerTaskEventsHandlers(): void {
  ipcHandlers.register('task:subscribeToEvents', z.object({}), async (event) => {
    const webContents = event.sender
    if (taskEventSubscriptions.has(webContents.id)) {
      return { ok: true, subscribed: true }
    }

    const unsubscribe = onTaskEvent((taskEvent) => {
      webContents.send('task:event', taskEvent)
    })

    taskEventSubscriptions.set(webContents.id, unsubscribe)

    webContents.once('destroyed', () => {
      const current = taskEventSubscriptions.get(webContents.id)
      if (current) current()
      taskEventSubscriptions.delete(webContents.id)
    })

    webContents.once('render-process-gone', () => {
      const current = taskEventSubscriptions.get(webContents.id)
      if (current) current()
      taskEventSubscriptions.delete(webContents.id)
    })

    return { ok: true, subscribed: true }
  })

  ipcHandlers.register('task:unsubscribeFromEvents', z.object({}), async (event) => {
    const webContents = event.sender
    const unsubscribe = taskEventSubscriptions.get(webContents.id)
    if (unsubscribe) {
      unsubscribe()
      taskEventSubscriptions.delete(webContents.id)
    }
    return { ok: true, subscribed: false }
  })
}
