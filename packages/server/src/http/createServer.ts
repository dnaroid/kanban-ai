import { createServer } from 'node:http'

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
  })

  server.listen(port, HOST, () => {
    console.log(`[Server] Listening on http:/${HOST}:${port}`)
  })

  return server
}

export { HOST, PORT }
