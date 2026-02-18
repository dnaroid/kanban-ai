import { randomUUID } from "crypto";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import type { OpenCodeMessage, OpenCodeTodo, Part } from "@/types/ipc";
import { OpencodeStorageReader } from "@/server/opencode/opencode-storage-reader";
import { getOpencodeService } from "@/server/opencode/opencode-service";

type OpenCodeClient = ReturnType<typeof createOpencodeClient>;

type Subscriber = (event: SessionEvent) => void;

export type SessionEvent =
	| { type: "message.updated"; sessionId: string; message: OpenCodeMessage }
	| {
			type: "message.part.updated";
			sessionId: string;
			messageId: string;
			part: Part;
			delta?: string;
	  }
	| { type: "message.removed"; sessionId: string; messageId: string }
	| { type: "todo.updated"; sessionId: string; todos: OpenCodeTodo[] }
	| { type: "error"; sessionId: string; error: string };

interface SessionInfo {
	id: string;
	directory: string;
}

function getData<T>(value: unknown): T {
	if (typeof value === "object" && value !== null && "data" in value) {
		return (value as { data: T }).data;
	}
	return value as T;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	return null;
}

function normalizeTodoStatus(
	value: unknown,
): "pending" | "in_progress" | "completed" | "cancelled" {
	if (
		value === "pending" ||
		value === "in_progress" ||
		value === "completed" ||
		value === "cancelled"
	) {
		return value;
	}
	return "pending";
}

function normalizeTodoPriority(value: unknown): "high" | "medium" | "low" {
	if (value === "high" || value === "medium" || value === "low") {
		return value;
	}
	return "medium";
}

export class OpencodeSessionManager {
	private readonly sessionClients = new Map<string, OpenCodeClient>();
	private readonly directoryClients = new Map<string, OpenCodeClient>();
	private readonly sessions = new Map<string, SessionInfo>();
	private readonly subscribers = new Map<string, Map<string, Subscriber>>();
	private readonly directoryStreamControllers = new Map<
		string,
		AbortController
	>();
	private readonly directoryStreamPromises = new Map<string, Promise<void>>();
	private readonly storageReader = new OpencodeStorageReader((parts) =>
		this.buildMessageContent(parts),
	);

	public async createSession(
		title: string,
		directory: string,
	): Promise<string> {
		const client = this.getDirectoryClient(directory);
		const response = await client.session.create({ title, directory });
		const data = getData<unknown>(response);
		const sessionRecord = asRecord(data);
		const sessionId =
			asString(sessionRecord?.id) ??
			asString(sessionRecord?.sessionID) ??
			asString(asRecord(sessionRecord?.info)?.id) ??
			asString(asRecord(sessionRecord?.info)?.sessionID);

		if (!sessionId) {
			throw new Error("OpenCode returned invalid session ID");
		}

		this.sessions.set(sessionId, { id: sessionId, directory });
		this.sessionClients.set(sessionId, client);
		return sessionId;
	}

	public async abortSession(sessionId: string): Promise<void> {
		const client = await this.getSessionClient(sessionId);
		await client.session.abort({ sessionID: sessionId });
	}

	public async sendPrompt(sessionId: string, prompt: string): Promise<void> {
		const client = await this.getSessionClient(sessionId);
		await client.session.prompt({
			sessionID: sessionId,
			parts: [{ type: "text", text: prompt }],
		});
	}

	public async getMessages(
		sessionId: string,
		limit?: number,
	): Promise<OpenCodeMessage[]> {
		try {
			const client = await this.getSessionClient(sessionId);
			const response = await client.session.messages({
				sessionID: sessionId,
				limit,
			});
			const rawItems = getData<unknown[]>(response);
			if (!Array.isArray(rawItems)) {
				return [];
			}

			const messages = rawItems
				.map((item) => this.normalizeMessage(item))
				.filter((message): message is OpenCodeMessage => message !== null)
				.sort((a, b) => a.timestamp - b.timestamp);

			if (messages.length > 0) {
				return messages;
			}
		} catch {
			return this.storageReader.getMessagesFromFilesystem(sessionId, limit);
		}

		return this.storageReader.getMessagesFromFilesystem(sessionId, limit);
	}

	public async getTodos(sessionId: string): Promise<OpenCodeTodo[]> {
		try {
			const client = await this.getSessionClient(sessionId);
			const response = await client.session.todo({ sessionID: sessionId });
			const data = getData<unknown>(response);
			const rawTodos = Array.isArray(data) ? data : asRecord(data)?.todos;

			if (!Array.isArray(rawTodos)) {
				return [];
			}

			return rawTodos
				.map((todo, index) => this.normalizeTodo(todo, index))
				.filter((todo): todo is OpenCodeTodo => todo !== null);
		} catch {
			return [];
		}
	}

	public async subscribe(
		sessionId: string,
		subscriberId: string,
		handler: Subscriber,
	): Promise<void> {
		let sessionSubscribers = this.subscribers.get(sessionId);
		if (!sessionSubscribers) {
			sessionSubscribers = new Map<string, Subscriber>();
			this.subscribers.set(sessionId, sessionSubscribers);
		}

		sessionSubscribers.set(subscriberId, handler);

		const directory = await this.resolveSessionDirectory(sessionId);
		if (!directory) {
			throw new Error(
				`Cannot subscribe: unknown directory for session ${sessionId}`,
			);
		}

		if (this.directoryStreamControllers.has(directory)) {
			return;
		}

		const abortController = new AbortController();
		this.directoryStreamControllers.set(directory, abortController);

		const streamPromise = this.runEventStream(directory, abortController.signal)
			.catch((error: unknown) => {
				const message =
					error instanceof Error ? error.message : "Event stream failed";
				for (const [sid] of this.subscribers) {
					this.emit(sid, { type: "error", sessionId: sid, error: message });
				}
			})
			.finally(() => {
				this.directoryStreamControllers.delete(directory);
				this.directoryStreamPromises.delete(directory);
			});

		this.directoryStreamPromises.set(directory, streamPromise);
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
		if (sessionSubscribers.size > 0) {
			return;
		}

		this.subscribers.delete(sessionId);
	}

	public async resolveSessionDirectory(
		sessionId: string,
	): Promise<string | null> {
		const knownSession = this.sessions.get(sessionId);
		if (knownSession) {
			return knownSession.directory;
		}

		return this.storageReader.getSessionDirectoryFromStorage(sessionId);
	}

	private async runEventStream(
		directory: string,
		signal: AbortSignal,
	): Promise<void> {
		const client = this.getDirectoryClient(directory);
		const eventApi = asRecord(asRecord(client)?.event);
		if (!eventApi) {
			throw new Error("OpenCode event API not available");
		}

		const subscribe = eventApi["subscribe"] as
			| ((args: {
					directory?: string;
					signal?: AbortSignal;
			  }) => Promise<unknown>)
			| undefined;

		if (typeof subscribe !== "function") {
			throw new Error("OpenCode event.subscribe not available");
		}

		const streamResult = await subscribe.call(eventApi, { directory, signal });
		const streamSource =
			(asRecord(streamResult)?.stream as unknown) ??
			(asRecord(streamResult)?.data as unknown) ??
			streamResult;

		if (!this.isAsyncIterable(streamSource)) {
			throw new Error("OpenCode event stream is not iterable");
		}

		for await (const entry of streamSource) {
			if (signal.aborted) break;
			const event = this.normalizeEventFromStream(entry);
			if (event) {
				this.emit(event.sessionId, event);
			}
		}
	}

	private normalizeEventFromStream(raw: unknown): SessionEvent | null {
		const data = this.unwrapEventPayload(raw);
		if (!data) return null;

		const type = asString(data.type);
		if (!type) return null;

		const properties = asRecord(data.properties);
		if (!properties) return null;

		if (type === "todo.updated") {
			const sessionId = this.pickSessionId(properties, data);
			if (!sessionId) return null;

			const todosValue = properties?.todos;
			if (!Array.isArray(todosValue)) return null;
			const todos = todosValue
				.map((todo, index) => this.normalizeTodo(todo, index))
				.filter((todo): todo is OpenCodeTodo => todo !== null);
			return { type, sessionId, todos };
		}

		if (type === "message.updated") {
			const messageInfo =
				asRecord(properties.info) ??
				asRecord(properties.message) ??
				asRecord(data.message) ??
				properties;
			const sessionId = this.pickSessionId(messageInfo, properties, data);
			if (!sessionId) return null;

			const message = this.normalizeMessage(messageInfo);
			if (!message) return null;
			return { type, sessionId, message };
		}

		if (type === "message.part.updated") {
			const partRecord = asRecord(properties.part);
			const sessionId = this.pickSessionId(partRecord, properties, data);
			const messageId = this.pickMessageId(partRecord, properties, data);
			const part = this.normalizePart(partRecord);
			if (!sessionId || !messageId || !part) return null;
			return {
				type,
				sessionId,
				messageId,
				part,
				delta: asString(properties?.delta) ?? undefined,
			};
		}

		if (type === "message.removed") {
			const sessionId = this.pickSessionId(properties, data);
			const messageId = this.pickMessageId(properties, data);
			if (!sessionId || !messageId) return null;
			return { type, sessionId, messageId };
		}

		return null;
	}

	private unwrapEventPayload(raw: unknown): Record<string, unknown> | null {
		const root = asRecord(raw);
		if (!root) return null;

		const direct = this.asEventRecord(root);
		if (direct) {
			return direct;
		}

		const candidates: unknown[] = [root.payload, root.data];
		const nestedData = asRecord(root.data);
		if (nestedData) {
			candidates.push(nestedData.payload, nestedData.data);
		}

		for (const candidate of candidates) {
			const candidateRecord = this.asEventRecord(candidate);
			if (candidateRecord) {
				return candidateRecord;
			}

			const parsed = this.parseEventJson(candidate);
			if (!parsed) {
				continue;
			}

			const parsedRecord = this.asEventRecord(parsed);
			if (parsedRecord) {
				return parsedRecord;
			}

			const parsedPayloadRecord = this.asEventRecord(parsed.payload);
			if (parsedPayloadRecord) {
				return parsedPayloadRecord;
			}
		}

		return null;
	}

	private asEventRecord(value: unknown): Record<string, unknown> | null {
		const record = asRecord(value);
		if (!record) {
			return null;
		}

		const type = asString(record.type);
		const properties = asRecord(record.properties);
		if (!type || !properties) {
			return null;
		}

		return record;
	}

	private parseEventJson(value: unknown): Record<string, unknown> | null {
		if (typeof value !== "string" || value.trim().length === 0) {
			return null;
		}

		try {
			return asRecord(JSON.parse(value));
		} catch {
			return null;
		}
	}

	private pickSessionId(
		...sources: Array<Record<string, unknown> | null>
	): string | null {
		for (const source of sources) {
			const sessionId =
				asString(source?.sessionID) ?? asString(source?.sessionId);
			if (sessionId) {
				return sessionId;
			}
		}

		return null;
	}

	private pickMessageId(
		...sources: Array<Record<string, unknown> | null>
	): string | null {
		for (const source of sources) {
			const messageId =
				asString(source?.messageID) ??
				asString(source?.messageId) ??
				asString(source?.id);
			if (messageId) {
				return messageId;
			}
		}

		return null;
	}

	private emit(sessionId: string, event: SessionEvent): void {
		const sessionSubscribers = this.subscribers.get(sessionId);
		if (!sessionSubscribers) {
			return;
		}

		for (const callback of sessionSubscribers.values()) {
			callback(event);
		}
	}

	private async getSessionClient(sessionId: string): Promise<OpenCodeClient> {
		const existing = this.sessionClients.get(sessionId);
		if (existing) {
			return existing;
		}

		const directory = await this.resolveSessionDirectory(sessionId);
		if (!directory) {
			throw new Error(
				`Unable to resolve directory for OpenCode session ${sessionId}`,
			);
		}

		this.sessions.set(sessionId, { id: sessionId, directory });

		const client = this.getDirectoryClient(directory);
		this.sessionClients.set(sessionId, client);
		return client;
	}

	private getDirectoryClient(directory: string): OpenCodeClient {
		const cached = this.directoryClients.get(directory);
		if (cached) {
			return cached;
		}

		const service = getOpencodeService();
		const baseUrl =
			process.env.OPENCODE_URL ?? `http://127.0.0.1:${service.getPort()}`;

		const client = createOpencodeClient({
			baseUrl,
			throwOnError: true,
			directory,
		});

		this.directoryClients.set(directory, client);
		return client;
	}

	private normalizeMessage(raw: unknown): OpenCodeMessage | null {
		const container = asRecord(raw);
		if (!container) {
			return null;
		}

		const info = asRecord(container.info) ?? container;
		const id =
			asString(info.id) ??
			asString(info.messageID) ??
			asString(container.id) ??
			randomUUID();
		const role = info.role === "assistant" ? "assistant" : "user";

		const createdAt =
			asNumber(asRecord(info.time)?.created) ??
			asNumber(info.createdAt) ??
			Date.now();

		const partsRaw =
			(Array.isArray(container.parts) ? container.parts : null) ??
			(Array.isArray(info.parts) ? info.parts : null) ??
			[];

		const parts = partsRaw
			.map((part) => this.normalizePart(asRecord(part)))
			.filter((part): part is Part => part !== null);

		const content =
			asString(info.content) ??
			asString(container.content) ??
			this.buildMessageContent(parts);

		return {
			id,
			role,
			content,
			timestamp: createdAt,
			parts,
			modelID: asString(info.modelID) ?? undefined,
		};
	}

	private normalizeTodo(raw: unknown, index: number): OpenCodeTodo | null {
		const todo = asRecord(raw);
		if (!todo) return null;

		const id = asString(todo.id) ?? `${index}`;
		const content = asString(todo.content) ?? "";
		if (content.length === 0) return null;

		return {
			id,
			content,
			status: normalizeTodoStatus(todo.status),
			priority: normalizeTodoPriority(todo.priority),
		};
	}

	private normalizePart(raw: Record<string, unknown> | null): Part | null {
		if (!raw) return null;
		const type = raw.type;

		if (type === "text") {
			return { type: "text", text: asString(raw.text) ?? "" };
		}

		if (type === "reasoning") {
			return { type: "reasoning", text: asString(raw.text) ?? "" };
		}

		if (type === "tool") {
			const state = raw.state;
			const normalizedState =
				state === "pending" || state === "running" || state === "completed"
					? state
					: "error";

			return {
				type: "tool",
				tool: asString(raw.tool) ?? "",
				state: normalizedState,
				input: raw.input,
				output: raw.output,
				error: asString(raw.error) ?? undefined,
			};
		}

		if (type === "file") {
			return {
				type: "file",
				url: asString(raw.url) ?? "",
				mime: asString(raw.mime) ?? "",
				filename: asString(raw.filename) ?? undefined,
			};
		}

		if (type === "agent") {
			return { type: "agent", name: asString(raw.name) ?? "" };
		}

		if (type === "step-start") {
			return { type: "step-start" };
		}

		if (type === "snapshot") {
			return { type: "snapshot" };
		}

		return { type: "other" };
	}

	private buildMessageContent(parts: Part[]): string {
		const chunks: string[] = [];
		for (const part of parts) {
			if (part.type === "text" && part.text.trim().length > 0) {
				chunks.push(part.text.trim());
				continue;
			}
			if (part.type === "reasoning" && part.text.trim().length > 0) {
				chunks.push(part.text.trim());
				continue;
			}
			if (part.type === "tool") {
				if (typeof part.output === "string" && part.output.trim().length > 0) {
					chunks.push(part.output.trim());
				}
			}
		}
		return chunks.join("\n\n");
	}

	private isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
		if (!value || typeof value !== "object") {
			return false;
		}
		return Symbol.asyncIterator in value;
	}
}

let sessionManager: OpencodeSessionManager | null = null;

export function getOpencodeSessionManager(): OpencodeSessionManager {
	if (!sessionManager) {
		sessionManager = new OpencodeSessionManager();
	}
	return sessionManager;
}
