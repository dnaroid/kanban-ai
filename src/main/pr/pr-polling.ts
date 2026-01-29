import { refreshOpenPullRequests } from './pr-service.js'

const POLL_INTERVAL_MS = 20000

let poller: NodeJS.Timeout | null = null

export const startPrPolling = (): void => {
  if (poller) return
  poller = setInterval(() => {
    refreshOpenPullRequests().catch((err) => {
      console.error('PR polling failed', err)
    })
  }, POLL_INTERVAL_MS)
}

export const stopPrPolling = (): void => {
  if (!poller) return
  clearInterval(poller)
  poller = null
}
