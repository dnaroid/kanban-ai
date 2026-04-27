import type {
	OpenCodeMessage,
	OpenCodeTodo,
	PermissionData,
	QuestionData,
} from "@/types/ipc";
import { bootstrapOpencodeService } from "@/server/opencode/opencode-bootstrap";
import {
	getOpencodeSessionManager,
	type SessionEvent,
} from "@/server/opencode/session-manager";
import {
	getOpencodeSessionTracker,
	type SessionTrackerEvent,
} from "@/server/opencode/session-tracker";
import { publishSseEvent } from "@/server/events/sse-broker";

const sessionManager = getOpencodeSessionManager();
const sessionTracker = getOpencodeSessionTracker();

let ensureServicePromise: Promise<void> | null = null;
const sseBridgedSessions = new Set<string>();

function getSseSubscriberId(sessionId: string): string {
	return `sse:${sessionId}`;
}

async function ensureServiceStarted(): Promise<void> {
	if (!ensureServicePromise) {
		ensureServicePromise = bootstrapOpencodeService().catch(
			(error: unknown) => {
				ensureServicePromise = null;
				throw error;
			},
		);
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

export async function ensureSessionLive(sessionId: string): Promise<void> {
	await ensureServiceStarted();
	await sessionTracker.ensureTracking(sessionId);
	await ensureSseBridge(sessionId);
}

export async function loadSessionSnapshot(
	sessionId: string,
	messageLimit?: number,
): Promise<{
	messages: OpenCodeMessage[];
	permissions: PermissionData[];
	questions: QuestionData[];
}> {
	await ensureServiceStarted();

	const [messages, permissions, questions] = await Promise.all([
		sessionManager.getMessages(sessionId, messageLimit),
		sessionManager.listPendingPermissions(sessionId),
		sessionManager.listPendingQuestions(sessionId),
	]);

	return { messages, permissions, questions };
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

export async function listPendingQuestions(
	sessionId: string,
): Promise<import("./session-manager").QuestionData[]> {
	await ensureSessionLive(sessionId);
	return sessionManager.listPendingQuestions(sessionId);
}

export async function listPendingPermissions(
	sessionId: string,
): Promise<PermissionData[]> {
	await ensureSessionLive(sessionId);
	return sessionManager.listPendingPermissions(sessionId);
}

export async function replyToQuestion(
	sessionId: string,
	requestId: string,
	answers: string[][],
): Promise<void> {
	await ensureSessionLive(sessionId);
	await sessionManager.replyToQuestion(sessionId, requestId, answers);
}

export async function rejectQuestion(
	sessionId: string,
	requestId: string,
): Promise<void> {
	await ensureSessionLive(sessionId);
	await sessionManager.rejectQuestion(sessionId, requestId);
}
