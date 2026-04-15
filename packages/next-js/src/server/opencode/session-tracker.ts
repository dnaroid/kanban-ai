import type { OpenCodeMessage, OpenCodeTodo } from "@/types/ipc";
import {
	getOpencodeSessionManager,
	type SessionEvent,
} from "@/server/opencode/session-manager";

export type SessionSnapshot = {
	type: "session.snapshot";
	sessionId: string;
	messages: OpenCodeMessage[];
	todos: OpenCodeTodo[];
	updatedAt: number;
};

export type SessionTrackerEvent = SessionEvent | SessionSnapshot;

type SessionListener = (event: SessionTrackerEvent) => void;

type SessionTrackerState = {
	listeners: Map<string, SessionListener>;
	lastMessageId: string | null;
	lastTodoFingerprint: string;
};

export class OpencodeSessionTracker {
	private readonly manager = getOpencodeSessionManager();
	private readonly states = new Map<string, SessionTrackerState>();

	public async subscribe(
		sessionId: string,
		listenerId: string,
		listener: SessionListener,
	): Promise<void> {
		let state = this.states.get(sessionId);
		if (!state) {
			state = {
				listeners: new Map<string, SessionListener>(),
				lastMessageId: null,
				lastTodoFingerprint: "",
			};

			this.states.set(sessionId, state);
			await this.manager.subscribe(
				sessionId,
				this.managerSubscriberId(sessionId),
				(event) => {
					this.emit(sessionId, event);
					void this.refresh(sessionId);
				},
			);
		}

		state.listeners.set(listenerId, listener);
		await this.refresh(sessionId);
	}

	public async unsubscribe(
		sessionId: string,
		listenerId: string,
	): Promise<void> {
		const state = this.states.get(sessionId);
		if (!state) {
			return;
		}

		state.listeners.delete(listenerId);
		if (state.listeners.size > 0) {
			return;
		}

		this.states.delete(sessionId);
		await this.manager.unsubscribe(
			sessionId,
			this.managerSubscriberId(sessionId),
		);
	}

	public async ensureTracking(sessionId: string): Promise<void> {
		if (!this.states.has(sessionId)) {
			await this.subscribe(sessionId, `tracker:${sessionId}`, () => {});
		}
	}

	private async refresh(sessionId: string): Promise<void> {
		const state = this.states.get(sessionId);
		if (!state) {
			return;
		}

		try {
			const [messages, todos] = await Promise.all([
				this.manager.getMessages(sessionId),
				this.manager.getTodos(sessionId),
			]);

			const latestMessageId = messages.at(-1)?.id ?? null;
			const todoFingerprint = JSON.stringify(
				todos.map((todo) => [todo.id, todo.status, todo.priority]),
			);

			const hasChanged =
				latestMessageId !== state.lastMessageId ||
				todoFingerprint !== state.lastTodoFingerprint;

			if (!hasChanged) {
				return;
			}

			state.lastMessageId = latestMessageId;
			state.lastTodoFingerprint = todoFingerprint;

			this.emit(sessionId, {
				type: "session.snapshot",
				sessionId,
				messages,
				todos,
				updatedAt: Date.now(),
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to refresh tracked OpenCode session";
			this.emit(sessionId, { type: "error", sessionId, error: message });
		}
	}

	private emit(sessionId: string, event: SessionTrackerEvent): void {
		const state = this.states.get(sessionId);
		if (!state) {
			return;
		}

		for (const listener of state.listeners.values()) {
			listener(event);
		}
	}

	private managerSubscriberId(sessionId: string): string {
		return `manager:${sessionId}`;
	}
}

let trackerInstance: OpencodeSessionTracker | null = null;

export function getOpencodeSessionTracker(): OpencodeSessionTracker {
	if (!trackerInstance) {
		trackerInstance = new OpencodeSessionTracker();
	}
	return trackerInstance;
}
