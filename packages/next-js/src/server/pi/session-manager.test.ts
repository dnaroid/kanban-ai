import { describe, expect, it, vi } from "vitest";
import type {
	AgentSession,
	AgentSessionEvent,
	ModelRuntime,
	SessionInfo,
	SessionManager,
	SessionMessageEntry,
} from "@earendil-works/pi-coding-agent";
import {
	PiSessionManager,
	type PiSessionManagerDeps,
	projectPiMessages,
} from "@/server/pi/session-manager";
import type { SessionEvent } from "@/server/agent/session-types";

const timestamp = "2026-01-01T00:00:00.000Z";

function messageEntry(
	id: string,
	message: Record<string, unknown>,
	parentId: string | null = null,
): SessionMessageEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp,
		message,
	} as unknown as SessionMessageEntry;
}

function createProjectionSession(
	entries: SessionMessageEntry[],
): AgentSession {
	return {
		sessionManager: {
			getBranch: () => entries,
		},
	} as unknown as AgentSession;
}

type FakeSession = {
	session: AgentSession;
	entries: SessionMessageEntry[];
	prompt: ReturnType<typeof vi.fn>;
	followUp: ReturnType<typeof vi.fn>;
	abort: ReturnType<typeof vi.fn>;
	dispose: ReturnType<typeof vi.fn>;
	setModel: ReturnType<typeof vi.fn>;
	setThinkingLevel: ReturnType<typeof vi.fn>;
	setSessionName: ReturnType<typeof vi.fn>;
	emit: (event: AgentSessionEvent) => void;
};

function createFakeSession(
	sessionId: string,
	runtime: ModelRuntime,
	initialEntries: SessionMessageEntry[] = [],
): FakeSession {
	const entries = [...initialEntries];
	const listeners = new Set<(event: AgentSessionEvent) => void>();
	let currentModel = runtime.getModels()[0];
	let streaming = false;

	const prompt = vi.fn(async (text: string) => {
		streaming = true;
		const userId = `user-${entries.length}`;
		entries.push(
			messageEntry(userId, {
				role: "user",
				content: text,
				timestamp: Date.parse(timestamp),
			}),
		);
		const assistantId = `assistant-${entries.length}`;
		entries.push(
			messageEntry(
				assistantId,
				{
					role: "assistant",
					content: [{ type: "text", text: `done\n\n<REPORT>done</REPORT>` }],
					provider: currentModel?.provider ?? "openai",
					model: currentModel?.id ?? "test-model",
					usage: {
						input: 1,
						output: 2,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 3,
						cost: {},
					},
					stopReason: "stop",
					timestamp: Date.parse(timestamp) + 1,
				},
				userId,
			),
		);
		streaming = false;
	});
	const followUp = vi.fn(async () => {});
	const abort = vi.fn(async () => {
		streaming = false;
	});
	const dispose = vi.fn();
	const setModel = vi.fn(async (model: NonNullable<typeof currentModel>) => {
		currentModel = model;
	});
	const setThinkingLevel = vi.fn();
	const setSessionName = vi.fn();

	const session = {
		sessionId,
		sessionManager: { getBranch: () => entries },
		modelRuntime: runtime,
		get model() {
			return currentModel;
		},
		get messages() {
			return entries.map((entry) => entry.message);
		},
		get isStreaming() {
			return streaming;
		},
		get isIdle() {
			return !streaming;
		},
		isRetrying: false,
		prompt,
		followUp,
		abort,
		dispose,
		setModel,
		setThinkingLevel,
		setSessionName,
		subscribe: (listener: (event: AgentSessionEvent) => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	} as unknown as AgentSession;

	return {
		session,
		entries,
		prompt,
		followUp,
		abort,
		dispose,
		setModel,
		setThinkingLevel,
		setSessionName,
		emit: (event) => {
			for (const listener of listeners) listener(event);
		},
	};
}

function createRuntime(): ModelRuntime {
	const models = [
		{
			provider: "openai",
			id: "default-model",
			name: "Default",
		},
		{
			provider: "anthropic",
			id: "target-model",
			name: "Target",
		},
	];
	return {
		getModels: () => models,
		getModel: (provider: string, modelId: string) =>
			models.find(
				(model) => model.provider === provider && model.id === modelId,
			),
	} as unknown as ModelRuntime;
}

function createDeps(options?: {
	persisted?: SessionInfo[];
	createDelay?: Promise<void>;
}): {
	deps: PiSessionManagerDeps;
	createdSessions: FakeSession[];
	createAgentSession: ReturnType<typeof vi.fn>;
} {
	const runtime = createRuntime();
	const createdSessions: FakeSession[] = [];
	const createAgentSessionMock = vi.fn(async (input: { sessionManager?: unknown }) => {
		await options?.createDelay;
		const persistence = input.sessionManager as {
			sessionId: string;
			entries?: SessionMessageEntry[];
		};
		const fake = createFakeSession(
			persistence.sessionId,
			runtime,
			persistence.entries,
		);
		createdSessions.push(fake);
		return { session: fake.session, extensionsResult: {} };
	});

	const deps: PiSessionManagerDeps = {
		createAgentSession:
			createAgentSessionMock as unknown as PiSessionManagerDeps["createAgentSession"],
		createPersistence: (_directory, sessionId) =>
			({ sessionId }) as unknown as SessionManager,
		openPersistence: (session) =>
			({ sessionId: session.id, entries: [] }) as unknown as SessionManager,
		listPersistedSessions: async () => options?.persisted ?? [],
		getModelRuntime: async () => runtime,
	};

	return { deps, createdSessions, createAgentSession: createAgentSessionMock };
}

describe("projectPiMessages", () => {
	it("projects Pi text, reasoning, tool results, and usage with stable entry IDs", () => {
		const entries = [
			messageEntry("user-1", {
				role: "user",
				content: "run tests",
				timestamp: 1,
			}),
			messageEntry(
				"assistant-1",
				{
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "checking" },
						{
							type: "toolCall",
							id: "tool-1",
							name: "bash",
							arguments: { command: "pnpm test" },
						},
						{ type: "text", text: "finished" },
					],
					provider: "openai",
					model: "gpt-test",
					usage: {
						input: 10,
						output: 5,
						reasoning: 2,
						cacheRead: 3,
						cacheWrite: 1,
					},
					stopReason: "toolUse",
					timestamp: 2,
				},
				"user-1",
			),
			messageEntry(
				"tool-result-1",
				{
					role: "toolResult",
					toolCallId: "tool-1",
					toolName: "bash",
					content: [{ type: "text", text: "all passed" }],
					isError: false,
					timestamp: 3,
				},
				"assistant-1",
			),
		];

		const messages = projectPiMessages(createProjectionSession(entries));

		expect(messages).toHaveLength(2);
		expect(messages[0]).toMatchObject({
			id: "user-1",
			role: "user",
			content: "run tests",
		});
		expect(messages[1]).toMatchObject({
			id: "assistant-1",
			role: "assistant",
			content: "finished",
			modelID: "gpt-test",
			providerID: "openai",
			tokens: {
				input: 10,
				output: 5,
				reasoning: 2,
				cache: { read: 3, write: 1 },
			},
		});
		expect(messages[1]?.parts).toEqual(
			expect.arrayContaining([
				{ type: "reasoning", text: "checking" },
				expect.objectContaining({
					type: "tool",
					id: "tool-1",
					tool: "bash",
					state: "completed",
					output: "all passed",
				}),
			]),
		);
	});

	it("adds a failure report only after the final Pi retry is exhausted", () => {
		const session = createProjectionSession([
			messageEntry("assistant-error", {
				role: "assistant",
				content: [],
				stopReason: "error",
				errorMessage: "rate limited",
				timestamp: 1,
			}),
		]);

		expect(projectPiMessages(session)[0]?.content).not.toContain(
			"<REPORT>fail</REPORT>",
		);
		expect(projectPiMessages(session, true)[0]?.content).toContain(
			"<REPORT>fail</REPORT>",
		);
	});
});

describe("PiSessionManager", () => {
	it("creates a persistent Pi session and applies model/thinking preferences", async () => {
		const { deps, createdSessions } = createDeps();
		const manager = new PiSessionManager(deps);
		const sessionId = await manager.createSession("Task run", "/tmp/project");
		const fake = createdSessions[0];
		expect(sessionId).toMatch(/^kanban-/);
		expect(fake?.setSessionName).toHaveBeenCalledWith("Task run");

		const events: SessionEvent[] = [];
		await manager.subscribe(sessionId, "test", (event) => events.push(event));
		await manager.sendPrompt(sessionId, "do work", {
			preferredModelName: "anthropic/target-model",
			preferredModelVariant: "high",
		});

		expect(fake?.setModel).toHaveBeenCalledWith(
			expect.objectContaining({ provider: "anthropic", id: "target-model" }),
		);
		expect(fake?.setThinkingLevel).toHaveBeenCalledWith("high");
		expect(fake?.prompt).toHaveBeenCalledWith("do work");
		expect(events.at(-1)).toMatchObject({
			type: "message.updated",
			sessionId,
			message: { role: "assistant" },
		});
	});

	it("projects streaming assistant updates with a temporary stable ID", async () => {
		const { deps, createdSessions } = createDeps();
		const manager = new PiSessionManager(deps);
		const sessionId = await manager.createSession("Task run", "/tmp/project");
		const events: SessionEvent[] = [];
		await manager.subscribe(sessionId, "test", (event) => events.push(event));
		const message = {
			role: "assistant",
			content: [{ type: "text", text: "working" }],
			provider: "openai",
			model: "default-model",
			timestamp: Date.parse(timestamp),
		};

		createdSessions[0]?.emit({
			type: "message_start",
			message,
		} as unknown as AgentSessionEvent);
		createdSessions[0]?.emit({
			type: "message_update",
			message,
			assistantMessageEvent: { type: "text_delta", delta: "working" },
		} as unknown as AgentSessionEvent);
		createdSessions[0]?.emit({
			type: "message_end",
			message,
		} as unknown as AgentSessionEvent);

		expect(events[0]).toMatchObject({
			type: "message.updated",
			sessionId,
			message: {
				id: `pi-stream-${sessionId}`,
				role: "assistant",
				content: "working",
			},
		});
		expect(events[1]).toEqual({
			type: "message.removed",
			sessionId,
			messageId: `pi-stream-${sessionId}`,
		});
	});

	it("fails an explicit unknown model instead of silently changing providers", async () => {
		const { deps, createdSessions } = createDeps();
		const manager = new PiSessionManager(deps);
		const sessionId = await manager.createSession("Task run", "/tmp/project");

		await expect(
			manager.sendPrompt(sessionId, "do work", {
				preferredModelName: "missing/model",
			}),
		).rejects.toThrow("Configured Pi model is not available: missing/model");
		expect(createdSessions[0]?.prompt).not.toHaveBeenCalled();
	});

	it("rejects OpenCode-only agent and variant preferences", async () => {
		const { deps, createdSessions } = createDeps();
		const manager = new PiSessionManager(deps);
		const sessionId = await manager.createSession("Task run", "/tmp/project");

		await expect(
			manager.sendPrompt(sessionId, "do work", {
				preferredLlmAgent: "legacy-agent",
			}),
		).rejects.toThrow("Configured agent is not supported by Pi: legacy-agent");
		await expect(
			manager.sendPrompt(sessionId, "do work", {
				preferredModelVariant: "fast",
			}),
		).rejects.toThrow(
			"Configured Pi thinking level is not supported: fast",
		);
		expect(createdSessions[0]?.prompt).not.toHaveBeenCalled();
	});

	it("coalesces concurrent restoration and aborts the restored session", async () => {
		let releaseCreation = () => {};
		const createDelay = new Promise<void>((resolve) => {
			releaseCreation = resolve;
		});
		const persisted: SessionInfo = {
			path: "/tmp/session.jsonl",
			id: "kanban-restored",
			cwd: "/tmp/project",
			created: new Date(timestamp),
			modified: new Date(timestamp),
			messageCount: 0,
			firstMessage: "",
			allMessagesText: "",
		};
		const { deps, createdSessions, createAgentSession } = createDeps({
			persisted: [persisted],
			createDelay,
		});
		const manager = new PiSessionManager(deps);

		const first = manager.inspectSession(persisted.id);
		const second = manager.inspectSession(persisted.id);
		releaseCreation();
		const [firstInspection, secondInspection] = await Promise.all([first, second]);

		expect(firstInspection.probeStatus).toBe("alive");
		expect(secondInspection.probeStatus).toBe("alive");
		expect(createAgentSession).toHaveBeenCalledTimes(1);

		await manager.abortSession(persisted.id);
		expect(createdSessions[0]?.abort).toHaveBeenCalledTimes(1);
	});

	it("disposes every live Pi session", async () => {
		const { deps, createdSessions } = createDeps();
		const manager = new PiSessionManager(deps);
		await manager.createSession("First", "/tmp/project");
		await manager.createSession("Second", "/tmp/project");

		await manager.dispose();

		expect(createdSessions[0]?.dispose).toHaveBeenCalledTimes(1);
		expect(createdSessions[1]?.dispose).toHaveBeenCalledTimes(1);
		expect(await manager.listAliveSessions()).toEqual([]);
	});

	it("disposes a session whose creation finishes after a restart", async () => {
		let releaseCreation = () => {};
		const createDelay = new Promise<void>((resolve) => {
			releaseCreation = resolve;
		});
		const { deps, createdSessions, createAgentSession } = createDeps({
			createDelay,
		});
		const manager = new PiSessionManager(deps);
		const creation = manager.createSession("Task run", "/tmp/project");
		await vi.waitFor(() => expect(createAgentSession).toHaveBeenCalledTimes(1));

		await manager.dispose();
		releaseCreation();

		await expect(creation).rejects.toThrow(
			"Pi session creation was interrupted by a restart",
		);
		expect(createdSessions[0]?.dispose).toHaveBeenCalledTimes(1);
		expect(await manager.listAliveSessions()).toEqual([]);
	});

	it("reports a non-Pi or missing persisted session as not found", async () => {
		const { deps } = createDeps();
		const manager = new PiSessionManager(deps);

		await expect(manager.inspectSession("legacy-opencode-session")).resolves.toMatchObject(
			{ probeStatus: "not_found", sessionStatus: "unknown" },
		);
	});
});
