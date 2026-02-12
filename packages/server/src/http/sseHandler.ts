import type { IncomingMessage, ServerResponse } from 'node:http'

export function createSseHandler(req: IncomingMessage, res: ServerResponse): void {
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  }

  res.writeHead(200, headers)

  req.on('close', () => {
    console.log('[SSE] Client disconnected')
  })
}

export function sendSseEvent(res: ServerResponse, channel: string, data: unknown): void {
  const jsonData = JSON.stringify(data)
  res.write(`event: ${channel}\n`)
  res.write(`data: ${jsonData}\n\n`)
}
