import { randomUUID } from "node:crypto";
import type { OpenCodeMessage, OpenCodeTodo } from "@/types/ipc";

interface SessionState {
	messages: OpenCodeMessage[];
	todos: OpenCodeTodo[];
}

const sessions = new Map<string, SessionState>();

function getOrCreateSession(sessionId: string): SessionState {
	const existing = sessions.get(sessionId);
	if (existing) return existing;

	const state: SessionState = { messages: [], todos: [] };
	sessions.set(sessionId, state);
	return state;
}

export function getSessionMessages(
	sessionId: string,
	limit?: number,
): OpenCodeMessage[] {
	const state = getOrCreateSession(sessionId);
	if (!limit || limit <= 0) return state.messages;
	return state.messages.slice(Math.max(0, state.messages.length - limit));
}

export function getSessionTodos(sessionId: string): OpenCodeTodo[] {
	return getOrCreateSession(sessionId).todos;
}

export function sendSessionMessage(sessionId: string, message: string): void {
	const state = getOrCreateSession(sessionId);
	const timestamp = Date.now();

	state.messages.push({
		id: randomUUID(),
		role: "user",
		content: message,
		parts: [{ type: "text", text: message }],
		timestamp,
	});
}
