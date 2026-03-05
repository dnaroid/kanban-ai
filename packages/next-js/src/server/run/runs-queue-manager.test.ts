import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildOpencodeStatusLine } from "@/lib/opencode-status";

type MockRecord = Record<string, unknown>;

const {
	runMap,
	taskMap,
	state,
	mockOpencodeService,
	mockSessionManager,
	mockContextSnapshotRepo,
	mockProjectRepo,
	mockRoleRepo,
	mockRunEventRepo,
	mockTaskLinkRepo,
	mockTaskRepo,
	mockRunRepo,
	mockTaskProjector,
} = vi.hoisted(() => {
	const runs = new Map<string, MockRecord>();
	const tasks = new Map<string, MockRecord>();
	const hoistedState = { sessionCounter: 0 };

	return {
		runMap: runs,
		taskMap: tasks,
		state: hoistedState,
		mockOpencodeService: {
			start: vi.fn(async () => undefined),
		},
		mockSessionManager: {
			createSession: vi.fn(async () => {
				hoistedState.sessionCounter += 1;
				return `session-${hoistedState.sessionCounter}`;
			}),
			subscribe: vi.fn(async () => undefined),
			sendPrompt: vi.fn(async () => undefined),
			getMessages: vi.fn(async () => [] as Array<MockRecord>),
			unsubscribe: vi.fn(async () => undefined),
			abortSession: vi.fn(async () => undefined),
		},
		mockContextSnapshotRepo: {
			create: vi.fn(() => "snapshot-1"),
		},
		mockProjectRepo: {
			getById: vi.fn(() => ({
				id: "project-1",
				name: "Project",
				path: "/tmp/project",
				color: "#111111",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			})),
		},
		mockRoleRepo: {
			list: vi.fn(() => [{ id: "dev", name: "Developer" }]),
			listWithPresets: vi.fn(() => [
				{
					id: "dev",
					name: "Developer",
					preferred_model_name: null,
					preferred_model_variant: null,
					preferred_llm_agent: null,
					preset_json: null,
				},
			]),
			getPresetJson: vi.fn(() => null),
		},
		mockRunEventRepo: {
			create: vi.fn(),
		},
		mockTaskLinkRepo: {
			listByTaskId: vi.fn(() => [] as Array<MockRecord>),
		},
		mockTaskRepo: {
			getById: vi.fn((taskId: string) => tasks.get(taskId) ?? null),
		},
		mockRunRepo: {
			getById: vi.fn((runId: string) => runs.get(runId) ?? null),
			update: vi.fn((runId: string, updates: MockRecord) => {
				const current = runs.get(runId);
				if (!current) {
					throw new Error(`Run not found: ${runId}`);
				}

				const updated = {
					...current,
					...updates,
					updatedAt: new Date().toISOString(),
				};
				runs.set(runId, updated);
				return updated;
			}),
			create: vi.fn((input: MockRecord) => {
				const runId = `generated-run-${runs.size + 1}`;
				const now = new Date().toISOString();
				const run = {
					id: runId,
					taskId: input.taskId,
					sessionId: "",
					status: "queued",
					roleId: input.roleId,
					mode: input.mode,
					metadata: { kind: "task-run" },
					createdAt: now,
					updatedAt: now,
				};
				runs.set(runId, run);
				return run;
			}),
			listByTask: vi.fn((taskId: string) => {
				return [...runs.values()].filter((run) => run.taskId === taskId);
			}),
		},
		mockTaskProjector: {
			projectRunStarted: vi.fn(),
			projectRunOutcome: vi.fn(),
		},
	};
});

vi.mock("@/lib/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

vi.mock("@/server/run/prompts/task", () => ({
	buildTaskPrompt: vi.fn(() => "task prompt"),
}));

vi.mock("@/server/opencode/opencode-service", () => ({
	getOpencodeService: () => mockOpencodeService,
}));

vi.mock("@/server/opencode/session-manager", () => ({
	getOpencodeSessionManager: () => mockSessionManager,
}));

vi.mock("@/server/repositories/context-snapshot", () => ({
	contextSnapshotRepo: mockContextSnapshotRepo,
}));

vi.mock("@/server/repositories/project", () => ({
	projectRepo: mockProjectRepo,
}));

vi.mock("@/server/repositories/role", () => ({
	roleRepo: mockRoleRepo,
}));

vi.mock("@/server/repositories/run-event", () => ({
	runEventRepo: mockRunEventRepo,
}));

vi.mock("@/server/repositories/run", () => ({
	runRepo: mockRunRepo,
}));

vi.mock("@/server/repositories/task-link", () => ({
	taskLinkRepo: mockTaskLinkRepo,
}));

vi.mock("@/server/repositories/task", () => ({
	taskRepo: mockTaskRepo,
}));

vi.mock("@/server/run/run-task-projector", () => ({
	getRunTaskProjector: () => mockTaskProjector,
}));

vi.mock("@/server/run/run-publisher", () => ({
	publishRunUpdate: vi.fn(),
}));

import { RunsQueueManager } from "@/server/run/runs-queue-manager";

function buildTask(
	taskId: string,
	priority: string,
	status = "queued",
	projectId = "project-1",
) {
	const now = new Date().toISOString();
	return {
		id: taskId,
		projectId,
		boardId: "board-1",
		columnId: "column-1",
		title: taskId,
		description: `${taskId} description`,
		descriptionMd: null,
		status,
		blockedReason: null,
		closedReason: null,
		priority,
		difficulty: "medium",
		type: "chore",
		orderInColumn: 0,
		tags: "[]",
		startDate: null,
		dueDate: null,
		estimatePoints: null,
		estimateHours: null,
		assignee: null,
		modelName: null,
		createdAt: now,
		updatedAt: now,
	};
}

function buildRun(
	runId: string,
	taskId: string,
	priorityKind: "generation" | "execution",
	createdAt: string,
) {
	return {
		id: runId,
		taskId,
		sessionId: "",
		status: "queued",
		roleId: "dev",
		mode: "execute",
		metadata:
			priorityKind === "generation"
				? { kind: "task-description-improve" }
				: { kind: "task-run" },
		createdAt,
		updatedAt: createdAt,
	};
}

async function waitForDrain(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("RunsQueueManager scheduling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		runMap.clear();
		taskMap.clear();
		state.sessionCounter = 0;
		process.env.RUNS_DEFAULT_CONCURRENCY = "1";
		process.env.RUNS_PROVIDER_CONCURRENCY = "";
		process.env.RUNS_BLOCKED_RETRY_MS = "10";
		mockSessionManager.getMessages.mockResolvedValue([]);
		mockTaskLinkRepo.listByTaskId.mockReturnValue([]);
	});

	it("starts higher-priority execution run first", async () => {
		taskMap.set("task-low", buildTask("task-low", "low"));
		taskMap.set("task-urgent", buildTask("task-urgent", "urgent"));

		runMap.set(
			"run-low",
			buildRun("run-low", "task-low", "execution", "2026-01-01T00:00:10.000Z"),
		);
		runMap.set(
			"run-urgent",
			buildRun(
				"run-urgent",
				"task-urgent",
				"execution",
				"2026-01-01T00:00:20.000Z",
			),
		);

		const manager = new RunsQueueManager();
		manager.enqueue("run-low", {
			projectPath: "/tmp/project",
			sessionTitle: "low",
			prompt: "prompt",
		});
		manager.enqueue("run-urgent", {
			projectPath: "/tmp/project",
			sessionTitle: "urgent",
			prompt: "prompt",
		});

		await waitForDrain();

		const runningUpdates = mockRunRepo.update.mock.calls.filter(
			([, patch]) =>
				typeof patch === "object" &&
				patch !== null &&
				(patch as Record<string, unknown>).status === "running",
		);
		expect(runningUpdates[0]?.[0]).toBe("run-urgent");
		expect(mockRunRepo.update).toHaveBeenCalledWith(
			"run-urgent",
			expect.objectContaining({ status: "running" }),
		);
	});

	it("forwards session preferences to first prompt, not session.create", async () => {
		taskMap.set("task-1", buildTask("task-1", "normal"));
		runMap.set(
			"run-1",
			buildRun("run-1", "task-1", "execution", "2026-01-01T00:00:10.000Z"),
		);

		const manager = new RunsQueueManager();
		manager.enqueue("run-1", {
			projectPath: "/tmp/project",
			sessionTitle: "task-1",
			prompt: "prompt",
			sessionPreferences: {
				preferredModelName: "zai-coding-plan/glm-4.7",
				preferredModelVariant: "high",
				preferredLlmAgent: "build",
			},
		});

		await waitForDrain();

		expect(mockSessionManager.createSession).toHaveBeenCalledWith(
			"task-1",
			"/tmp/project",
		);
		expect(mockSessionManager.sendPrompt).toHaveBeenCalledWith(
			"session-1",
			"prompt",
			{
				preferredModelName: "zai-coding-plan/glm-4.7",
				preferredModelVariant: "high",
				preferredLlmAgent: "build",
			},
		);
	});

	it("does not start postponed execution runs", async () => {
		taskMap.set("task-postpone", buildTask("task-postpone", "postpone"));
		runMap.set(
			"run-postpone",
			buildRun(
				"run-postpone",
				"task-postpone",
				"execution",
				"2026-01-01T00:00:10.000Z",
			),
		);

		const manager = new RunsQueueManager();
		manager.enqueue("run-postpone", {
			projectPath: "/tmp/project",
			sessionTitle: "postpone",
			prompt: "prompt",
		});

		await waitForDrain();

		expect(mockSessionManager.createSession).not.toHaveBeenCalled();
		expect(runMap.get("run-postpone")?.status).toBe("queued");
	});

	it("skips blocked dependencies and starts dependency-ready run", async () => {
		taskMap.set("task-blocker", buildTask("task-blocker", "normal", "queued"));
		taskMap.set("task-blocked", buildTask("task-blocked", "urgent", "queued"));
		taskMap.set("task-ready", buildTask("task-ready", "low", "queued"));

		mockTaskLinkRepo.listByTaskId.mockReturnValue([
			{
				id: "link-1",
				projectId: "project-1",
				fromTaskId: "task-blocker",
				toTaskId: "task-blocked",
				linkType: "blocks",
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		]);

		runMap.set(
			"run-blocked",
			buildRun(
				"run-blocked",
				"task-blocked",
				"execution",
				"2026-01-01T00:00:10.000Z",
			),
		);
		runMap.set(
			"run-ready",
			buildRun(
				"run-ready",
				"task-ready",
				"execution",
				"2026-01-01T00:00:20.000Z",
			),
		);

		const manager = new RunsQueueManager();
		manager.enqueue("run-blocked", {
			projectPath: "/tmp/project",
			sessionTitle: "blocked",
			prompt: "prompt",
		});
		manager.enqueue("run-ready", {
			projectPath: "/tmp/project",
			sessionTitle: "ready",
			prompt: "prompt",
		});

		await waitForDrain();

		expect(mockRunRepo.update).toHaveBeenCalledWith(
			"run-ready",
			expect.objectContaining({ status: "running" }),
		);
		expect(mockRunRepo.update).not.toHaveBeenCalledWith(
			"run-blocked",
			expect.objectContaining({ status: "running" }),
		);
	});

	it("keeps generated task in workflow and does not auto-enqueue execution by default", async () => {
		taskMap.set(
			"task-generated",
			buildTask("task-generated", "normal", "generating"),
		);
		runMap.set(
			"run-generation",
			buildRun(
				"run-generation",
				"task-generated",
				"generation",
				"2026-01-01T00:00:00.000Z",
			),
		);

		mockSessionManager.getMessages.mockImplementation(async () => [
			{
				id: "msg-1",
				role: "assistant",
				content: buildOpencodeStatusLine("generated"),
			},
		]);

		const manager = new RunsQueueManager();
		manager.enqueue("run-generation", {
			projectPath: "/tmp/project",
			sessionTitle: "generation",
			prompt: "prompt",
		});

		await waitForDrain();
		await waitForDrain();

		expect(mockRunRepo.create).not.toHaveBeenCalledWith(
			expect.objectContaining({
				taskId: "task-generated",
				mode: "execute",
			}),
		);
		expect(mockTaskProjector.projectRunOutcome).toHaveBeenCalledWith(
			expect.objectContaining({ id: "run-generation" }),
			"completed",
			"generated",
			buildOpencodeStatusLine("generated"),
		);
	});

	it("extracts provider/model session preference from preset payload", () => {
		const manager = new RunsQueueManager();
		const withPrivateAccess = manager as unknown as {
			extractSessionPreferencesFromPreset: (presetJson: string | null) =>
				| {
						preferredModelName?: string;
						preferredModelVariant?: string;
						preferredLlmAgent?: string;
				  }
				| undefined;
		};

		expect(
			withPrivateAccess.extractSessionPreferencesFromPreset(
				JSON.stringify({
					provider: "google",
					modelName: "antigravity-gemini-3.1-pro#high",
					agent: "build",
				}),
			),
		).toEqual({
			preferredModelName: "google/antigravity-gemini-3.1-pro",
			preferredModelVariant: "high",
			preferredLlmAgent: "build",
		});
	});

	it("maps QA success marker to test_ok signal", async () => {
		taskMap.set("task-qa-ok", buildTask("task-qa-ok", "normal", "running"));
		runMap.set(
			"run-qa-ok",
			buildRun(
				"run-qa-ok",
				"task-qa-ok",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
		);

		mockSessionManager.getMessages.mockImplementation(async () => [
			{
				id: "msg-qa-ok",
				role: "assistant",
				content: buildOpencodeStatusLine("test_ok"),
			},
		]);

		const manager = new RunsQueueManager();
		manager.enqueue("run-qa-ok", {
			projectPath: "/tmp/project",
			sessionTitle: "qa-ok",
			prompt: "prompt",
		});

		await waitForDrain();
		await waitForDrain();

		expect(mockTaskProjector.projectRunOutcome).toHaveBeenCalledWith(
			expect.objectContaining({ id: "run-qa-ok" }),
			"completed",
			"test_ok",
			buildOpencodeStatusLine("test_ok"),
		);
	});

	it("maps QA failure marker to test_fail signal", async () => {
		taskMap.set("task-qa-fail", buildTask("task-qa-fail", "normal", "running"));
		runMap.set(
			"run-qa-fail",
			buildRun(
				"run-qa-fail",
				"task-qa-fail",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
		);

		mockSessionManager.getMessages.mockImplementation(async () => [
			{
				id: "msg-qa-fail",
				role: "assistant",
				content: buildOpencodeStatusLine("test_fail"),
			},
		]);

		const manager = new RunsQueueManager();
		manager.enqueue("run-qa-fail", {
			projectPath: "/tmp/project",
			sessionTitle: "qa-fail",
			prompt: "prompt",
		});

		await waitForDrain();
		await waitForDrain();

		expect(mockTaskProjector.projectRunOutcome).toHaveBeenCalledWith(
			expect.objectContaining({ id: "run-qa-fail" }),
			"failed",
			"test_fail",
			buildOpencodeStatusLine("test_fail"),
		);
	});

	it("recovers failed run when late done marker arrives after fetch failure", async () => {
		taskMap.set(
			"task-late-done",
			buildTask("task-late-done", "normal", "failed"),
		);
		runMap.set("run-late-done", {
			...buildRun(
				"run-late-done",
				"task-late-done",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
			status: "failed",
			startedAt: new Date(Date.now() - 15_000).toISOString(),
			endedAt: new Date().toISOString(),
			metadata: {
				kind: "task-run",
				errorText: "fetch failed",
			},
		});

		const manager = new RunsQueueManager();
		const withPrivateAccess = manager as unknown as {
			finalizeRunFromSession: (
				runId: string,
				status: "completed" | "failed" | "paused",
				signalKey: string,
				assistantContent: string,
			) => Promise<void>;
		};

		await withPrivateAccess.finalizeRunFromSession(
			"run-late-done",
			"completed",
			"done",
			buildOpencodeStatusLine("done"),
		);

		expect(runMap.get("run-late-done")?.status).toBe("completed");
		expect(mockTaskProjector.projectRunOutcome).toHaveBeenCalledWith(
			expect.objectContaining({ id: "run-late-done", status: "completed" }),
			"completed",
			"done",
			buildOpencodeStatusLine("done"),
		);
	});

	it("does not recover failed run with non-network error on late done marker", async () => {
		taskMap.set(
			"task-late-done-no-recover",
			buildTask("task-late-done-no-recover", "normal", "failed"),
		);
		runMap.set("run-late-done-no-recover", {
			...buildRun(
				"run-late-done-no-recover",
				"task-late-done-no-recover",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
			status: "failed",
			startedAt: new Date(Date.now() - 15_000).toISOString(),
			endedAt: new Date().toISOString(),
			metadata: {
				kind: "task-run",
				errorText: "validation failed",
			},
		});

		const manager = new RunsQueueManager();
		const withPrivateAccess = manager as unknown as {
			finalizeRunFromSession: (
				runId: string,
				status: "completed" | "failed" | "paused",
				signalKey: string,
				assistantContent: string,
			) => Promise<void>;
		};

		await withPrivateAccess.finalizeRunFromSession(
			"run-late-done-no-recover",
			"completed",
			"done",
			buildOpencodeStatusLine("done"),
		);

		expect(runMap.get("run-late-done-no-recover")?.status).toBe("failed");
		expect(mockTaskProjector.projectRunOutcome).not.toHaveBeenCalledWith(
			expect.objectContaining({ id: "run-late-done-no-recover" }),
			"completed",
			"done",
			buildOpencodeStatusLine("done"),
		);
	});
});
