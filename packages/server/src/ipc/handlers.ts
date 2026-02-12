import { createAppContext } from './composition/create-app-context.js'
import { registerAllHandlers } from './handlers/index.js'

const appContext = createAppContext()
registerAllHandlers(appContext)

console.log('[IPC] Handlers registered')
