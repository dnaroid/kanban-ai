import { ElectronTransport } from './transports/electron'
import { HttpTransport } from './transports/http'
import type { ApiTransport } from './transport'

export function createApiProxy(transport: ApiTransport) {
  const buildProxy = (path: string[]): any => {
    return new Proxy(() => {}, {
      get(_, prop) {
        if (typeof prop === 'symbol') {
          if (prop === Symbol.toStringTag) {
            return 'ApiProxy'
          }
          return undefined
        }

        const key = String(prop)
        if (key === 'then') {
          return undefined
        }

        return buildProxy([...path, key])
      },
      apply(_, __, args: unknown[]) {
        if (path.length === 0) {
          throw new Error('Cannot call API root directly')
        }

        const methodName = path[path.length - 1]
        const namespace = path.slice(0, -1).join('.')

        if (methodName === 'onEvent') {
          if (!transport.subscribe) {
            throw new Error('Transport does not support subscriptions')
          }

          const callbackCandidate = args.length > 1 ? args[1] : args[0]
          if (typeof callbackCandidate !== 'function') {
            throw new Error('onEvent requires a callback function')
          }

          const callback = callbackCandidate as (data: unknown) => void
          const channel = namespace ? `${namespace}:event` : 'event'
          return transport.subscribe(channel, callback)
        }

        const rpcMethod = namespace ? `${namespace}:${methodName}` : methodName
        return transport.rpc(rpcMethod, args[0])
      },
    })
  }

  return buildProxy([])
}

type ApiProxy = ReturnType<typeof createApiProxy>

let transportInstance: ApiProxy | null = null

export function createApiTransport(): ApiProxy {
  if (transportInstance) {
    return transportInstance
  }

  let baseTransport: ApiTransport

  if (typeof window !== 'undefined' && (window as any).electron) {
    console.log('[API] Using Electron transport')
    baseTransport = new ElectronTransport()
  } else {
    const token = (window as any).__LOCAL_WEB_TOKEN__
    console.log('[API] Using HTTP transport', token ? 'with token' : 'without token')
    baseTransport = new HttpTransport({ token })
  }

  transportInstance = createApiProxy(baseTransport)

  return transportInstance
}

export { ApiTransport }
export { ElectronTransport }
export { HttpTransport }

export const api = createApiTransport()

if (typeof window !== 'undefined') {
  ;(window as any).api = api
}
