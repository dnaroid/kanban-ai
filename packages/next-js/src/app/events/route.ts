import { randomUUID } from "crypto";
import { subscribeSse } from "@/server/events/sse-broker";
import "@/server/services/project-indicators-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatSseEvent(channel: string, payload: unknown): string {
	return `event: ${channel}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function getPayloadSessionId(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") {
		return null;
	}

	const record = payload as { sessionId?: unknown; sessionID?: unknown };
	if (typeof record.sessionId === "string" && record.sessionId.length > 0) {
		return record.sessionId;
	}
	if (typeof record.sessionID === "string" && record.sessionID.length > 0) {
		return record.sessionID;
	}

	return null;
}

export async function GET(request: Request): Promise<Response> {
	const encoder = new TextEncoder();
	let cleanup: (() => void) | null = null;
	const requestUrl = new URL(request.url);
	const requestedSessionId =
		requestUrl.searchParams.get("sessionId")?.trim() ?? "";
	const sessionIdFilter =
		requestedSessionId.length > 0 ? requestedSessionId : null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const listenerId = `sse:${randomUUID()}`;
			let closed = false;
			let heartbeat: ReturnType<typeof setInterval> | null = null;
			let unsubscribe: (() => void) | null = null;

			const safeCloseController = () => {
				try {
					controller.close();
				} catch {
					// The client may have already aborted/cancelled the stream.
				}
			};

			const close = () => {
				if (closed) {
					return;
				}
				closed = true;
				request.signal.removeEventListener("abort", close);
				unsubscribe?.();
				if (heartbeat !== null) {
					clearInterval(heartbeat);
				}
				safeCloseController();
			};

			const send = (chunk: string) => {
				if (closed) {
					return;
				}

				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					close();
				}
			};

			unsubscribe = subscribeSse(listenerId, (channel, payload) => {
				if (closed) {
					return;
				}

				if (channel === "opencode:event" && sessionIdFilter) {
					const payloadSessionId = getPayloadSessionId(payload);
					if (!payloadSessionId || payloadSessionId !== sessionIdFilter) {
						return;
					}
				}

				send(formatSseEvent(channel, payload));
			});

			heartbeat = setInterval(() => {
				if (closed) {
					return;
				}
				send(": heartbeat\n\n");
			}, 25_000);

			send(": connected\n\n");

			request.signal.addEventListener("abort", close, { once: true });
			cleanup = close;
		},
		cancel() {
			cleanup?.();
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"Access-Control-Allow-Origin": "*",
		},
	});
}
