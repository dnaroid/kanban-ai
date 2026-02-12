import { createServer } from 'node:http'
import { eventBus } from '../events/eventBus'
import { createSseHandler, sendSseEvent } from './sseHandler'

const HOST = '127.0.0.1'
const PORT = 3000

export function createAppServer(port: number = PORT) {
  const server = createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Local-Token',
      })
      res.end()
      return
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, status: 'server is running' }))
      return
    }

    // SSE endpoint for Server-Sent Events with multi-channel support
    if (req.method === 'GET' && req.url === '/events') {
      createSseHandler(req, res)

      // Track active subscriptions
      const unsubscribeList: Array<() => void> = []
      const channels = new Set<string>()

      // Helper to forward events to SSE with proper channel name
      const forwardEvent = (channel: string) => (data: unknown) => {
        try {
          sendSseEvent(res, channel, data)
        } catch (err) {
          console.error(`[SSE] Failed to send event to channel ${channel}:`, err)
        }
      }

      // Subscribe to initial known channels
      const knownChannels = ['task:onEvent', 'run:status', 'opencode:onEvent']
      knownChannels.forEach((channel) => {
        channels.add(channel)
        eventBus.on(channel, forwardEvent(channel))
        unsubscribeList.push(() => eventBus.off(channel, forwardEvent(channel)))
      })

      // Auto-subscribe to new channels via 'newListener' event
      const newListenerHandler = (event: string | symbol) => {
        if (typeof event === 'string' && !channels.has(event)) {
          channels.add(event)
          eventBus.on(event, forwardEvent(event))
          unsubscribeList.push(() => eventBus.off(event, forwardEvent(event)))
          console.log(`[SSE] Auto-subscribed to new channel: ${event}`)
        }
      }

      eventBus.on('newListener', newListenerHandler)
      unsubscribeList.push(() => eventBus.off('newListener', newListenerHandler))

      // Send initial connection event
      sendSseEvent(res, 'sse:connected', {
        type: 'connected',
        message: 'SSE connection established',
      })

      // Cleanup on disconnect
      req.on('close', () => {
        unsubscribeList.forEach((fn) => fn())
        console.log('[SSE] Client disconnected')
      })

      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: { message: 'Not found', code: 'NOT_FOUND' } }))
  })

  server.listen(port, HOST, () => {
    console.log(`[Server] Listening on http://${HOST}:${port}`)
  })

  return server
}

export { HOST, PORT }
