import { appContext } from './composition/create-app-context.js'
import { registerAllHandlers } from './handlers/index.js'

registerAllHandlers(appContext)

console.log('[IPC] Handlers registered')
