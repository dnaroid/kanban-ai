import { createServerContainer } from '../../di/app-container'

export function createAppContext() {
  return createServerContainer(
    null as any, // Will be provided at runtime
    null as any,
    console,
    new (require('events').EventEmitter)()
  )
}

export type AppContext = ReturnType<typeof createAppContext>
