import { createAppContainer } from '../../di/app-container'

export function createAppContext() {
  return createAppContainer()
}

export type AppContext = ReturnType<typeof createAppContext>
