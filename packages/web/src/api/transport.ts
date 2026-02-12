export interface RpcRequest<TParams = unknown> {
  method: string
  params?: TParams
}

export interface RpcResponseOk<TResult = unknown> {
  ok: true
  result: TResult
}

export interface RpcResponseError {
  ok: false
  error: { message: string; code?: string; details?: unknown }
}

export type RpcResponse<TResult = unknown> = RpcResponseOk<TResult> | RpcResponseError

export interface ApiTransport {
  rpc<TReq, TRes>(method: string, params: TReq): Promise<TRes>
  subscribe?(channel: string, onMessage: (data: unknown) => void): () => void
}
