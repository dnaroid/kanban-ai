type SseListener = (channel: string, payload: unknown) => void;

const listeners = new Map<string, SseListener>();

export function subscribeSse(
	listenerId: string,
	listener: SseListener,
): () => void {
	listeners.set(listenerId, listener);

	return () => {
		listeners.delete(listenerId);
	};
}

export function publishSseEvent(channel: string, payload: unknown): void {
	for (const listener of listeners.values()) {
		listener(channel, payload);
	}
}
