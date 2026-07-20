import { randomUUID } from "node:crypto";
import {
	createAgentSession,
	type AgentSession,
	type AgentSessionEvent,
	type ModelRuntime,
	SessionManager,
	type SessionInfo,
	type SessionMessageEntry,
} from "@earendil-works/pi-coding-agent";
import type {
	AgentSessionManager,
	PermissionData,
	QuestionData,
	SessionActivityStatus,
	SessionEvent,
	SessionInspectionResult,
	SessionStartPreferences,
} from "@/server/agent/session-types";
import { getPiModelRuntime } from "@/server/pi/runtime";
import type {
	MessageTokens,
	OpenCodeMessage,
	OpenCodeTodo,
	Part,
	ToolPart,
} from "@/types/ipc";

const KANBAN_SESSION_PREFIX = "kanban-";
const failureReport = "<REPORT>fail</REPORT>";

type Subscriber = (event: SessionEvent) => void;

type LiveSession = {
	session: AgentSession;
	directory: string;
	flushQueued: boolean;
	terminalFailure: boolean;
	streamStartedAt: number | null;
};

type ToolResult = {
	output: string;
	error?: string;
};

export interface PiSessionManagerDeps {
	createAgentSession: typeof createAgentSession;
	createPersistence: (directory: string, sessionId: string) => SessionManager;
	openPersistence: (session: SessionInfo) => SessionManager;
	listPersistedSessions: () => Promise<SessionInfo[]>;
	getModelRuntime: () => Promise<ModelRuntime>;
}

const defaultDeps: PiSessionManagerDeps = {
	createAgentSession,
	createPersistence: (directory, sessionId) =>
		SessionManager.create(directory, undefined, { id: sessionId }),
	openPersistence: (session) =>
		SessionManager.open(session.path, undefined, session.cwd),
	listPersistedSessions: () => SessionManager.listAll(),
	getModelRuntime: getPiModelRuntime,
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getTextContent(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	if (!Array.isArray(value)) {
		return "";
	}

	return value
		.map((item) => {
			const content = asRecord(item);
			return content?.type === "text" ? asString(content.text) ?? "" : "";
		})
		.join("");
}

function collectToolResults(entries: SessionMessageEntry[]): Map<string, ToolResult> {
	const results = new Map<string, ToolResult>();

	for (const entry of entries) {
		const message = asRecord(entry.message);
		if (message?.role !== "toolResult") {
			continue;
		}

		const toolCallId = asString(message.toolCallId);
		if (!toolCallId) {
			continue;
		}

		const output = getTextContent(message.content);
		results.set(toolCallId, {
			output,
			...(message.isError === true
				? { error: output || "Pi tool execution failed" }
				: {}),
		});
	}

	return results;
}

function normalizeUsage(value: unknown): MessageTokens | undefined {
	const usage = asRecord(value);
	if (!usage) {
		return undefined;
	}

	const input = asNumber(usage.input) ?? 0;
	const output = asNumber(usage.output) ?? 0;
	const reasoning = asNumber(usage.reasoning) ?? 0;
	const cacheRead = asNumber(usage.cacheRead) ?? 0;
	const cacheWrite = asNumber(usage.cacheWrite) ?? 0;

	return {
		input,
		output,
		reasoning,
		cache: { read: cacheRead, write: cacheWrite },
	};
}

function normalizeAssistantParts(
	message: Record<string, unknown>,
	toolResults: Map<string, ToolResult>,
): Part[] {
	const rawContent = Array.isArray(message.content) ? message.content : [];
	const parts: Part[] = [];

	for (const rawPart of rawContent) {
		const part = asRecord(rawPart);
		if (!part) {
			continue;
		}

		if (part.type === "text") {
			parts.push({ type: "text", text: asString(part.text) ?? "" });
			continue;
		}

		if (part.type === "thinking") {
			parts.push({
				type: "reasoning",
				text: asString(part.thinking) ?? "",
			});
			continue;
		}

		if (part.type === "toolCall") {
			const toolCallId = asString(part.id) ?? randomUUID();
			const result = toolResults.get(toolCallId);
			const toolPart: ToolPart = {
				type: "tool",
				id: toolCallId,
				tool: asString(part.name) ?? "tool",
				state: result ? (result.error ? "error" : "completed") : "running",
				input: part.arguments,
				...(result?.output ? { output: result.output } : {}),
				...(result?.error ? { error: result.error } : {}),
			};
			parts.push(toolPart);
		}
	}

	return parts;
}

function normalizeMessage(
	id: string,
	rawMessage: unknown,
	fallbackTimestamp: number,
	toolResults: Map<string, ToolResult>,
	isTerminalFailure: boolean,
): OpenCodeMessage | null {
	const message = asRecord(rawMessage);
	if (!message || (message.role !== "user" && message.role !== "assistant")) {
		return null;
	}

	const timestamp = asNumber(message.timestamp) ?? fallbackTimestamp;
	if (message.role === "user") {
		const content = getTextContent(message.content);
		return {
			id,
			role: "user",
			content,
			parts: [{ type: "text", text: content }],
			timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
		};
	}

	const parts = normalizeAssistantParts(message, toolResults);
	let content = parts
		.filter((part): part is Extract<Part, { type: "text" }> =>
			part.type === "text",
		)
		.map((part) => part.text)
		.join("");
	const stopReason = asString(message.stopReason);
	const errorMessage = asString(message.errorMessage);
	const modelId = asString(message.model);
	const providerId = asString(message.provider);
	const tokens = normalizeUsage(message.usage);

	if (stopReason === "error" && isTerminalFailure) {
		const errorText = errorMessage || content || "Pi model request failed";
		content = [content, errorText, failureReport].filter(Boolean).join("\n\n");
		parts.push({ type: "text", text: `\n\n${errorText}\n\n${failureReport}` });
	}

	return {
		id,
		role: "assistant",
		content,
		parts,
		timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
		...(modelId ? { modelID: modelId } : {}),
		...(providerId ? { providerID: providerId } : {}),
		...(tokens ? { tokens } : {}),
	};
}

function hasLastAssistantError(messages: readonly unknown[]): boolean {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = asRecord(messages[index]);
		if (message?.role === "assistant") {
			return message.stopReason === "error";
		}
	}
	return false;
}

export function projectPiMessages(
	session: AgentSession,
	terminalFailure = false,
): OpenCodeMessage[] {
	const messageEntries = session.sessionManager
		.getBranch()
		.filter((entry): entry is SessionMessageEntry => entry.type === "message");
	const toolResults = collectToolResults(messageEntries);
	const lastAssistantEntry = messageEntries.findLast((entry) => {
		return asRecord(entry.message)?.role === "assistant";
	});

	return messageEntries
		.map((entry) =>
			normalizeMessage(
				entry.id,
				entry.message,
				Date.parse(entry.timestamp),
				toolResults,
				terminalFailure && entry.id === lastAssistantEntry?.id,
			),
		)
		.filter((message): message is OpenCodeMessage => message !== null);
}

function isThinkingLevel(
	value: string,
): value is AgentSession["thinkingLevel"] {
	return (
		value === "off" ||
		value === "minimal" ||
		value === "low" ||
		value === "medium" ||
		value === "high" ||
		value === "xhigh" ||
		value === "max"
	);
}

export class PiSessionManager implements AgentSessionManager {
	private readonly deps: PiSessionManagerDeps;
	private readonly sessions = new Map<string, LiveSession>();
	private readonly restorations = new Map<
		string,
		Promise<LiveSession | null>
	>();
	private readonly subscribers = new Map<
		string,
		Map<string, Subscriber>
	>();
	private catalog = new Map<string, SessionInfo>();
	private catalogLoaded = false;
	private catalogPromise: Promise<void> | null = null;
	private disposalPromise: Promise<void> | null = null;
	private generation = 0;

	public constructor(deps: PiSessionManagerDeps = defaultDeps) {
		this.deps = deps;
	}

	public dispose(): Promise<void> {
		if (!this.disposalPromise) {
			this.generation += 1;
			this.disposalPromise = this.disposeSessions().finally(() => {
				this.disposalPromise = null;
			});
		}
		return this.disposalPromise;
	}

	private async disposeSessions(): Promise<void> {
		await Promise.allSettled(this.restorations.values());
		for (const live of this.sessions.values()) {
			live.session.dispose();
		}
		this.sessions.clear();
		this.restorations.clear();
		this.catalog.clear();
		this.catalogLoaded = false;
		this.catalogPromise = null;
	}

	public async createSession(
		title: string,
		directory: string,
	): Promise<string> {
		await this.disposalPromise;
		const generation = this.generation;
		const modelRuntime = await this.deps.getModelRuntime();
		const persistence = this.deps.createPersistence(
			directory,
			`${KANBAN_SESSION_PREFIX}${randomUUID()}`,
		);
		const { session } = await this.deps.createAgentSession({
			cwd: directory,
			modelRuntime,
			sessionManager: persistence,
		});
		if (generation !== this.generation) {
			session.dispose();
			throw new Error("Pi session creation was interrupted by a restart");
		}
		session.setSessionName(title);

		const live = this.bindSession(session, directory);
		this.sessions.set(session.sessionId, live);
		return session.sessionId;
	}

	public async abortSession(sessionId: string): Promise<void> {
		const live = await this.getRequiredSession(sessionId);
		await live.session.abort();
		await this.flushChanges(sessionId, live);
	}

	public async sendPrompt(
		sessionId: string,
		prompt: string,
		preferences?: SessionStartPreferences,
	): Promise<void> {
		const live = await this.getRequiredSession(sessionId);
		await this.applyPreferences(live.session, preferences);

		if (live.session.isStreaming) {
			await live.session.followUp(prompt);
			return;
		}

		await live.session.prompt(prompt);
		await this.flushChanges(sessionId, live);
	}

	public async getMessages(
		sessionId: string,
		limit?: number,
	): Promise<OpenCodeMessage[]> {
		const live = await this.getRequiredSession(sessionId);
		const messages = projectPiMessages(live.session, live.terminalFailure);
		if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
			return messages.slice(-Math.floor(limit));
		}
		return messages;
	}

	public async getTodos(sessionId: string): Promise<OpenCodeTodo[]> {
		await this.getRequiredSession(sessionId);
		return [];
	}

	public async inspectSession(
		sessionId: string,
	): Promise<SessionInspectionResult> {
		const live = await this.getOrRestoreSession(sessionId);
		if (!live) {
			return {
				probeStatus: "not_found",
				sessionStatus: "unknown",
				messages: [],
				todos: [],
				pendingPermissions: [],
				pendingQuestions: [],
				childSessions: [],
			};
		}

		return {
			probeStatus: "alive",
			sessionStatus: this.getActivityStatus(live.session),
			messages: projectPiMessages(
				live.session,
				live.terminalFailure,
			).slice(-50),
			todos: [],
			pendingPermissions: [],
			pendingQuestions: [],
			childSessions: [],
		};
	}

	public async replyToPermission(
		sessionId: string,
		_permissionId: string,
		_response: "once" | "always" | "reject",
	): Promise<boolean> {
		await this.getRequiredSession(sessionId);
		return false;
	}

	public async listPendingPermissions(
		sessionId: string,
	): Promise<PermissionData[]> {
		await this.getRequiredSession(sessionId);
		return [];
	}

	public async listPendingQuestions(
		sessionId: string,
	): Promise<QuestionData[]> {
		await this.getRequiredSession(sessionId);
		return [];
	}

	public async replyToQuestion(
		sessionId: string,
		_requestId: string,
		_answers: string[][],
	): Promise<void> {
		await this.getRequiredSession(sessionId);
		throw new Error("Pi session has no pending question to answer");
	}

	public async rejectQuestion(
		sessionId: string,
		_requestId: string,
	): Promise<void> {
		await this.getRequiredSession(sessionId);
		throw new Error("Pi session has no pending question to reject");
	}

	public async subscribe(
		sessionId: string,
		subscriberId: string,
		handler: Subscriber,
	): Promise<void> {
		await this.getRequiredSession(sessionId);
		let sessionSubscribers = this.subscribers.get(sessionId);
		if (!sessionSubscribers) {
			sessionSubscribers = new Map<string, Subscriber>();
			this.subscribers.set(sessionId, sessionSubscribers);
		}
		sessionSubscribers.set(subscriberId, handler);
	}

	public async unsubscribe(
		sessionId: string,
		subscriberId: string,
	): Promise<void> {
		const sessionSubscribers = this.subscribers.get(sessionId);
		if (!sessionSubscribers) {
			return;
		}
		sessionSubscribers.delete(subscriberId);
		if (sessionSubscribers.size === 0) {
			this.subscribers.delete(sessionId);
		}
	}

	public async resolveSessionDirectory(
		sessionId: string,
	): Promise<string | null> {
		await this.disposalPromise;
		const live = this.sessions.get(sessionId);
		if (live) {
			return live.directory;
		}
		return (await this.findPersistedSession(sessionId))?.cwd || null;
	}

	public async listAliveSessions(): Promise<
		Array<{
			sessionId: string;
			directory: string | null;
			status: SessionActivityStatus;
		}>
	> {
		await this.disposalPromise;
		return [...this.sessions.entries()].map(([sessionId, live]) => ({
			sessionId,
			directory: live.directory,
			status: this.getActivityStatus(live.session),
		}));
	}

	public async getActiveSessionCount(): Promise<{
		totalSessions: number;
		busySessions: number;
		busySessionIds: string[];
	}> {
		const sessions = await this.listAliveSessions();
		const busySessionIds = sessions
			.filter((session) => session.status === "busy" || session.status === "retry")
			.map((session) => session.sessionId);

		return {
			totalSessions: sessions.length,
			busySessions: busySessionIds.length,
			busySessionIds,
		};
	}

	private bindSession(session: AgentSession, directory: string): LiveSession {
		const live: LiveSession = {
			session,
			directory,
			flushQueued: false,
			terminalFailure: hasLastAssistantError(session.messages),
			streamStartedAt: null,
		};
		session.subscribe((event) => {
			this.handleSessionEvent(session.sessionId, live, event);
		});
		return live;
	}

	private handleSessionEvent(
		sessionId: string,
		live: LiveSession,
		event: AgentSessionEvent,
	): void {
		if (event.type === "message_start") {
			if (asRecord(event.message)?.role === "assistant") {
				live.streamStartedAt = Date.now();
			}
		}
		if (event.type === "message_update") {
			const message = normalizeMessage(
				this.streamingMessageId(sessionId),
				event.message,
				live.streamStartedAt ?? Date.now(),
				new Map(),
				false,
			);
			if (message?.role === "assistant") {
				this.emit(sessionId, {
					type: "message.updated",
					sessionId,
					message,
				});
			}
		}
		if (
			event.type === "message_end" &&
			asRecord(event.message)?.role === "assistant"
		) {
			this.emit(sessionId, {
				type: "message.removed",
				sessionId,
				messageId: this.streamingMessageId(sessionId),
			});
			live.streamStartedAt = null;
		}
		if (event.type === "agent_start") {
			live.terminalFailure = false;
		}
		if (event.type === "agent_end") {
			live.terminalFailure =
				!event.willRetry && hasLastAssistantError(event.messages);
		}

		if (
			event.type === "message_end" ||
			event.type === "tool_execution_end" ||
			event.type === "agent_end" ||
			event.type === "agent_settled" ||
			event.type === "entry_appended" ||
			event.type === "auto_retry_end"
		) {
			this.queueFlush(sessionId, live);
		}

		if (event.type === "auto_retry_start") {
			this.emit(sessionId, {
				type: "error",
				sessionId,
				error: `Pi retry ${event.attempt}/${event.maxAttempts}: ${event.errorMessage}`,
			});
		}
	}

	private streamingMessageId(sessionId: string): string {
		return `pi-stream-${sessionId}`;
	}

	private queueFlush(sessionId: string, live: LiveSession): void {
		if (live.flushQueued) {
			return;
		}
		live.flushQueued = true;
		queueMicrotask(() => {
			live.flushQueued = false;
			void this.flushChanges(sessionId, live).catch((error: unknown) => {
				this.emit(sessionId, {
					type: "error",
					sessionId,
					error:
						error instanceof Error
							? error.message
							: "Failed to project Pi session state",
				});
			});
		});
	}

	private async flushChanges(
		sessionId: string,
		live: LiveSession,
	): Promise<void> {
		const latestMessage = projectPiMessages(
			live.session,
			live.terminalFailure,
		).at(-1);
		if (latestMessage) {
			this.emit(sessionId, {
				type: "message.updated",
				sessionId,
				message: latestMessage,
			});
		}
	}

	private emit(sessionId: string, event: SessionEvent): void {
		const sessionSubscribers = this.subscribers.get(sessionId);
		if (!sessionSubscribers) {
			return;
		}
		for (const subscriber of sessionSubscribers.values()) {
			subscriber(event);
		}
	}

	private getActivityStatus(session: AgentSession): SessionActivityStatus {
		if (session.isRetrying) {
			return "retry";
		}
		return session.isStreaming || !session.isIdle ? "busy" : "idle";
	}

	private async applyPreferences(
		session: AgentSession,
		preferences?: SessionStartPreferences,
	): Promise<void> {
		const agent = preferences?.preferredLlmAgent?.trim();
		if (agent) {
			throw new Error(`Configured agent is not supported by Pi: ${agent}`);
		}

		const modelName = preferences?.preferredModelName?.trim();
		if (modelName) {
			const runtime = session.modelRuntime;
			const model = this.resolveModel(runtime, modelName);
			if (!model) {
				throw new Error(`Configured Pi model is not available: ${modelName}`);
			}
			if (
				session.model?.provider !== model.provider ||
				session.model.id !== model.id
			) {
				await session.setModel(model);
			}
		}

		const variant = preferences?.preferredModelVariant?.trim().toLowerCase();
		if (variant) {
			if (!isThinkingLevel(variant)) {
				throw new Error(
					`Configured Pi thinking level is not supported: ${variant}`,
				);
			}
			session.setThinkingLevel(variant);
		}
	}

	private resolveModel(
		runtime: ModelRuntime,
		modelName: string,
	): ReturnType<ModelRuntime["getModel"]> {
		const slashIndex = modelName.indexOf("/");
		if (slashIndex > 0 && slashIndex < modelName.length - 1) {
			return runtime.getModel(
				modelName.slice(0, slashIndex),
				modelName.slice(slashIndex + 1),
			);
		}

		return runtime
			.getModels()
			.find((model) => model.id === modelName || model.name === modelName);
	}

	private async getRequiredSession(sessionId: string): Promise<LiveSession> {
		const live = await this.getOrRestoreSession(sessionId);
		if (!live) {
			throw new Error(`Pi session not found: ${sessionId}`);
		}
		return live;
	}

	private async getOrRestoreSession(
		sessionId: string,
	): Promise<LiveSession | null> {
		await this.disposalPromise;
		const existing = this.sessions.get(sessionId);
		if (existing) {
			return existing;
		}

		const pending = this.restorations.get(sessionId);
		if (pending) {
			return pending;
		}

		const restoration = this.restoreSession(sessionId).finally(() => {
			this.restorations.delete(sessionId);
		});
		this.restorations.set(sessionId, restoration);
		return restoration;
	}

	private async restoreSession(sessionId: string): Promise<LiveSession | null> {
		if (!sessionId.startsWith(KANBAN_SESSION_PREFIX)) {
			return null;
		}
		const persisted = await this.findPersistedSession(sessionId);
		if (!persisted) {
			return null;
		}

		const persistence = this.deps.openPersistence(persisted);
		const { session } = await this.deps.createAgentSession({
			cwd: persisted.cwd,
			modelRuntime: await this.deps.getModelRuntime(),
			sessionManager: persistence,
		});
		const live = this.bindSession(session, persisted.cwd);
		this.sessions.set(sessionId, live);
		return live;
	}

	private async findPersistedSession(
		sessionId: string,
	): Promise<SessionInfo | null> {
		await this.loadCatalog();
		return this.catalog.get(sessionId) ?? null;
	}

	private async loadCatalog(): Promise<void> {
		if (this.catalogLoaded) {
			return;
		}
		if (this.catalogPromise) {
			return this.catalogPromise;
		}

		const generation = this.generation;
		const catalogPromise = this.deps
			.listPersistedSessions()
			.then((sessions) => {
				if (generation !== this.generation) {
					return;
				}
				this.catalog = new Map(
					sessions
						.filter((session) =>
							session.id.startsWith(KANBAN_SESSION_PREFIX),
						)
						.map((session) => [session.id, session]),
				);
				this.catalogLoaded = true;
			})
			.finally(() => {
				if (this.catalogPromise === catalogPromise) {
					this.catalogPromise = null;
				}
			});
		this.catalogPromise = catalogPromise;
		return catalogPromise;
	}
}
