import { randomUUID } from "crypto";
import { subscribeSse } from "@/server/events/sse-broker";

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

			const close = () => {
				if (closed) {
					return;
				}
				closed = true;
				unsubscribe();
				clearInterval(heartbeat);
				controller.close();
			};

			const unsubscribe = subscribeSse(listenerId, (channel, payload) => {
				if (closed) {
					return;
				}

				if (channel === "opencode:event" && sessionIdFilter) {
					const payloadSessionId = getPayloadSessionId(payload);
					if (!payloadSessionId || payloadSessionId !== sessionIdFilter) {
						return;
					}
				}

				controller.enqueue(encoder.encode(formatSseEvent(channel, payload)));
			});

			const heartbeat = setInterval(() => {
				if (closed) {
					return;
				}
				controller.enqueue(encoder.encode(": heartbeat\n\n"));
			}, 25_000);

			controller.enqueue(encoder.encode(": connected\n\n"));

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
