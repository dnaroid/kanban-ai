import { createAppServer, HOST, PORT } from './http/createServer'
import { createRpcRouter } from './http/rpcRouter'
import { createSseHandler, sendSseEvent } from './http/sseHandler'
import { PathsService } from './paths'
import type { ServerContainer } from './di/app-container'
import { createServerContainer } from './di/app-container'
import { DatabaseManager } from './db'
import EventEmitter from 'events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { eventBus } from './events/eventBus'

export async function startServer(container?: ServerContainer): Promise<void> {
  const paths = new PathsService()
  await paths.ensureDataDir()

  const logger = {
    info: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
  } as Console

  logger.info('Server starting...')

  const events = new EventEmitter()
  const db = new DatabaseManager(paths.getDbPath())

  container = createServerContainer(db, paths, logger, events)

  // Connect DB and run migrations
  await db.connect()
  logger.info('Database connected and migrations applied')

  const server = createAppServer(PORT)

  const rpcRouter = createRpcRouter(container)

  const sseClients = new Set<any>()

  eventBus.on('task:onEvent', (data) => {
    for (const client of sseClients) {
      sendSseEvent(client, 'task:event', data)
    }
  })

  eventBus.on('opencode:onEvent', (data) => {
    for (const client of sseClients) {
      sendSseEvent(client, 'opencode:event', data)
    }
  })

  server.on('request', async (req, res) => {
    const url = new URL(req.url || '', `http://${HOST}`)
    const pathname = url.pathname

    if (pathname === '/rpc') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            ok: false,
            error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
          })
        )
        return
      }

      const authHeader = req.headers['x-local-token']
      const serverToken = await container.paths.loadToken()
      if (serverToken && authHeader !== serverToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ ok: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } })
        )
        return
      }

      try {
        const body = await new Promise<string>((resolve) => {
          let data = ''
          req.on('data', (chunk) => {
            data += chunk
          })
          req.on('end', () => resolve(data))
        })

        const { method, params } = JSON.parse(body)
        const handler = rpcRouter.get(method)

        if (!handler) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              ok: false,
              error: { message: `Unknown method: ${method}`, code: 'NOT_FOUND' },
            })
          )
          return
        }

        const result = await handler(params)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, result }))
      } catch (error) {
        logger.error('[RPC] Error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            ok: false,
            error: {
              message: 'Internal server error',
              code: 'INTERNAL_ERROR',
              details: String(error),
            },
          })
        )
      }
    }

    if (pathname === '/events') {
      const serverToken = await container.paths.loadToken()
      const headerToken = Array.isArray(req.headers['x-local-token'])
        ? req.headers['x-local-token'][0]
        : req.headers['x-local-token']
      const queryToken = url.searchParams.get('token')
      const isAuthorized = !serverToken || headerToken === serverToken || queryToken === serverToken

      if (!isAuthorized && serverToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ ok: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } })
        )
        return
      }

      createSseHandler(req, res)
      sseClients.add(res)
      req.on('close', () => {
        sseClients.delete(res)
      })

      return
    }
  })

  logger.info(`Server listening on http://${HOST}:${PORT}`)

  server.on('close', () => {
    logger.info('Server closed')
    db.disconnect()
  })
}
