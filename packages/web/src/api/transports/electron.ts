import type { ApiTransport } from '../transport'

export class ElectronTransport implements ApiTransport {
  private electronApi: any

  constructor() {
    this.electronApi = (window as any).electron
    if (!this.electronApi) {
      throw new Error('Electron API not available. Make sure you are running in Electron.')
    }
  }

  async rpc<TReq, TRes>(method: string, params: TReq): Promise<TRes> {
    const response = await this.electronApi.invoke(method, params)
    return response
  }

  subscribe(channel: string, onMessage: (data: unknown) => void): () => void {
    const listener = (_event: any, data: unknown) => {
      onMessage(data)
    }

    this.electronApi.on(channel, listener)

    return () => {
      this.electronApi.removeListener(channel, listener)
    }
  }
}
