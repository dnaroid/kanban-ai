export interface RpcRequest<T = unknown> {
	method: string;
	params?: T;
}

export interface RpcResponseOk<T = unknown> {
	ok: true;
	result: T;
}

export interface RpcResponseError {
	ok: false;
	error: {
		code: string;
		message: string;
	};
}

export type RpcResponse<T = unknown> = RpcResponseOk<T> | RpcResponseError;

export interface ApiTransport {
	rpc<TReq = unknown, TRes = unknown>(
		method: string,
		params?: TReq,
	): Promise<TRes>;
	subscribe?(channel: string, callback: (data: unknown) => void): () => void;
}
