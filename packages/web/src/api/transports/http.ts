import type { ApiTransport, RpcRequest, RpcResponse, RpcResponseOk } from '../transport'

interface HttpTransportOptions {
  baseUrl?: string
  token?: string
}

export class HttpTransport implements ApiTransport {
  private baseUrl: string
  private token?: string

  constructor(options: HttpTransportOptions = {}) {
    this.baseUrl = options.baseUrl || import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000'
    this.token = options.token
  }

  async rpc<TReq, TRes>(method: string, params: TReq): Promise<TRes> {
    const request: RpcRequest<TReq> = { method, params }

    const response = await fetch(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && { 'X-Local-Token': this.token }),
      },
      body: JSON.stringify(request),
    })

    const data = (await response.json()) as RpcResponse<unknown>

    if (!data.ok) {
      throw new Error(data.error.message || 'RPC request failed')
    }

    return this.normalizeResult<TRes>((data as RpcResponseOk<unknown>).result)
  }

  private normalizeResult<TRes>(result: unknown): TRes {
    if (!this.isRecord(result) || typeof result.ok !== 'boolean') {
      return result as TRes
    }

    if (!result.ok) {
      const errorMessage =
        this.isRecord(result.error) && typeof result.error.message === 'string'
          ? result.error.message
          : 'RPC request failed'
      throw new Error(errorMessage)
    }

    if ('data' in result) {
      return result.data as TRes
    }

    return result as TRes
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
  }

  private eventSource: EventSource | null = null

  subscribe(channel: string, onMessage: (data: unknown) => void): () => void {
    if (this.eventSource) {
      return this.addChannelListener(channel, onMessage)
    }

    const eventsUrl = new URL(`${this.baseUrl.replace(/\/+$/u, '')}/events`)
    if (this.token) {
      eventsUrl.searchParams.set('token', this.token)
    }
    this.eventSource = new EventSource(eventsUrl.toString())

    this.eventSource.addEventListener(channel, (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage(data)
      } catch (error) {
        console.error(`Failed to parse event data for channel ${channel}:`, error)
      }
    })

    return () => this.removeChannelListener(channel, onMessage)
  }

  private channelListeners = new Map<string, Set<(data: unknown) => void>>()

  private addChannelListener(channel: string, callback: (data: unknown) => void): () => void {
    if (!this.channelListeners.has(channel)) {
      this.channelListeners.set(channel, new Set())
    }
    this.channelListeners.get(channel)!.add(callback)

    return () => this.removeChannelListener(channel, callback)
  }

  private removeChannelListener(channel: string, callback: (data: unknown) => void): void {
    const listeners = this.channelListeners.get(channel)
    if (listeners) {
      listeners.delete(callback)
      if (listeners.size === 0) {
        this.channelListeners.delete(channel)
      }
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }
}
