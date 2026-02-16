import type { OpenCodeMessage, OpenCodeTodo } from "@/types/ipc";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import {
	getOpencodeSessionManager,
	type SessionEvent,
} from "@/server/opencode/session-manager";
import {
	getOpencodeSessionTracker,
	type SessionTrackerEvent,
} from "@/server/opencode/session-tracker";
import { publishSseEvent } from "@/server/events/sse-broker";

const opencodeService = getOpencodeService();
const sessionManager = getOpencodeSessionManager();
const sessionTracker = getOpencodeSessionTracker();

let ensureServicePromise: Promise<void> | null = null;
const sseBridgedSessions = new Set<string>();

function getSseSubscriberId(sessionId: string): string {
	return `sse:${sessionId}`;
}

async function ensureServiceStarted(): Promise<void> {
	if (!ensureServicePromise) {
		ensureServicePromise = opencodeService.start().catch((error: unknown) => {
			ensureServicePromise = null;
			throw error;
		});
	}

	await ensureServicePromise;
}

async function ensureSseBridge(sessionId: string): Promise<void> {
	if (sseBridgedSessions.has(sessionId)) {
		return;
	}

	await sessionTracker.subscribe(
		sessionId,
		getSseSubscriberId(sessionId),
		(event) => {
			publishSseEvent("opencode:event", { sessionId, event });
		},
	);

	sseBridgedSessions.add(sessionId);
}

async function ensureSessionLive(sessionId: string): Promise<void> {
	await ensureServiceStarted();
	await sessionTracker.ensureTracking(sessionId);
	await ensureSseBridge(sessionId);
}

export async function getSessionMessages(
	sessionId: string,
	limit?: number,
): Promise<OpenCodeMessage[]> {
	await ensureSessionLive(sessionId);
	return sessionManager.getMessages(sessionId, limit);
}

export async function getSessionTodos(
	sessionId: string,
): Promise<OpenCodeTodo[]> {
	await ensureSessionLive(sessionId);
	return sessionManager.getTodos(sessionId);
}

export async function sendSessionMessage(
	sessionId: string,
	message: string,
): Promise<void> {
	await ensureSessionLive(sessionId);
	await sessionManager.sendPrompt(sessionId, message);
}

export async function subscribeSessionEvents(
	sessionId: string,
	subscriberId: string,
	handler: (event: SessionEvent | SessionTrackerEvent) => void,
): Promise<void> {
	await ensureSessionLive(sessionId);
	await sessionTracker.subscribe(sessionId, subscriberId, handler);
}

export async function unsubscribeSessionEvents(
	sessionId: string,
	subscriberId: string,
): Promise<void> {
	await sessionTracker.unsubscribe(sessionId, subscriberId);
}
