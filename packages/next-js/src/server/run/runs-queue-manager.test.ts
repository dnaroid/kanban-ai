import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
	PermissionData,
	SessionInspectionResult,
} from "@/server/opencode/session-manager";
import type {
	TaskTransitionInput,
	TaskTransitionTrigger,
} from "@/server/run/task-state-machine";
import type { RunOutcome } from "@/server/run/run-finalizer";

type MockRecord = Record<string, unknown>;
type MockRunOutcome = RunOutcome;

const {
	runMap,
	runEventMap,
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
	mockBoardRepo,
	mockRunRepo,
	mockStateMachine,
	mockVcsManager,
} = vi.hoisted(() => {
	const runs = new Map<string, MockRecord>();
	const runEvents = new Map<string, MockRecord[]>();
	const tasks = new Map<string, MockRecord>();
	const hoistedState = { sessionCounter: 0 };

	return {
		runMap: runs,
		runEventMap: runEvents,
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
			sendPrompt: vi.fn(async () => undefined),
			inspectSession: vi.fn<
				(sessionId: string) => Promise<SessionInspectionResult>
			>(async () => ({
				probeStatus: "alive",
				sessionStatus: "busy",
				messages: [],
				todos: [],
				pendingPermissions: [],
				pendingQuestions: [],
			})),
			getMessages: vi.fn(
				async (_sessionId?: string, _limit?: number) => [] as Array<MockRecord>,
			),
			listPendingPermissions: vi.fn<
				(sessionId?: string) => Promise<PermissionData[]>
			>(async (_sessionId?: string) => []),
			listPendingQuestions: vi.fn(async (_sessionId?: string) => []),
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
			create: vi.fn((input: MockRecord) => {
				const runId = input.runId;
				if (typeof runId !== "string") {
					return input;
				}

				const current = runEvents.get(runId) ?? [];
				current.push(input);
				runEvents.set(runId, current);
				return input;
			}),
			listByRun: vi.fn((runId: string) => runEvents.get(runId) ?? []),
		},
		mockTaskLinkRepo: {
			listByTaskId: vi.fn(() => [] as Array<MockRecord>),
		},
		mockTaskRepo: {
			getById: vi.fn((taskId: string) => tasks.get(taskId) ?? null),
			listByBoard: vi.fn((boardId: string) => {
				return [...tasks.values()].filter((task) => task.boardId === boardId);
			}),
			update: vi.fn((taskId: string, updates: MockRecord) => {
				const current = tasks.get(taskId);
				if (!current) {
					throw new Error(`Task not found: ${taskId}`);
				}

				const updated = {
					...current,
					...updates,
					updatedAt: new Date().toISOString(),
				};
				tasks.set(taskId, updated);
				return updated;
			}),
		},
		mockBoardRepo: {
			getById: vi.fn((boardId: string) => ({
				id: boardId,
				projectId: "project-1",
				name: "Board",
				columns: [
					{ id: "column-1", name: "In Progress", systemKey: "in_progress" },
					{ id: "blocked-col", name: "Blocked", systemKey: "blocked" },
					{ id: "review-col", name: "Review", systemKey: "review" },
					{ id: "closed-col", name: "Closed", systemKey: "closed" },
					{ id: "deferred-col", name: "Deferred", systemKey: "deferred" },
				],
			})),
			getByProjectId: vi.fn((projectId: string) => ({
				id: "board-1",
				projectId,
				name: "Board",
				columns: [
					{ id: "column-1", name: "In Progress", systemKey: "in_progress" },
					{ id: "blocked-col", name: "Blocked", systemKey: "blocked" },
					{ id: "review-col", name: "Review", systemKey: "review" },
					{ id: "closed-col", name: "Closed", systemKey: "closed" },
					{ id: "deferred-col", name: "Deferred", systemKey: "deferred" },
				],
			})),
		},
		mockRunRepo: {
			getById: vi.fn((runId: string) => runs.get(runId) ?? null),
			listByStatus: vi.fn((status: string) => {
				return [...runs.values()].filter((run) => run.status === status);
			}),
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
		mockStateMachine: {
			transition: vi.fn().mockReturnValue({
				action: "skip",
				patch: {},
				effects: [],
			}),
		},
		mockVcsManager: {
			provisionRunWorkspace: vi.fn(async () => ({
				repoRoot: "/tmp/project",
				worktreePath: "/tmp/project.worktrees/task-generated-run",
				branchName: "task/task-generated-run",
				baseBranch: "main",
				baseCommit: "abc123",
				headCommit: "abc123",
				hasChanges: false,
				workspaceStatus: "ready",
				mergeStatus: "pending",
				cleanupStatus: "pending",
			})),
			mergeRunWorkspace: vi.fn<(run: MockRecord) => Promise<MockRecord>>(
				async (run: MockRecord) => ({
					...(run.metadata as { vcs: Record<string, unknown> }).vcs,
					workspaceStatus: "merged",
					mergeStatus: "merged",
					mergedBy: "automatic",
					mergedAt: new Date().toISOString(),
					mergedCommit: "def456",
					cleanupStatus: "pending",
				}),
			),
			cleanupRunWorkspace: vi.fn<(vcs: MockRecord) => Promise<MockRecord>>(
				async (vcs: MockRecord) => ({
					...vcs,
					workspaceStatus: "cleaned",
					cleanupStatus: "cleaned",
					cleanedAt: new Date().toISOString(),
				}),
			),
			syncRunWorkspace: vi.fn<(run?: MockRecord) => Promise<MockRecord | null>>(
				async (_run?: MockRecord) => null,
			),
			syncVcsMetadata: vi.fn<(vcs: MockRecord) => Promise<MockRecord>>(
				async (vcs: MockRecord) => vcs,
			),
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

vi.mock("@/server/opencode/session-store", () => ({
	ensureSessionLive: vi.fn(async () => undefined),
	subscribeSessionEvents: vi.fn(async () => undefined),
	unsubscribeSessionEvents: vi.fn(async () => undefined),
}));

vi.mock("@/server/opencode/session-tracker", () => ({
	getOpencodeSessionTracker: () => ({
		subscribe: vi.fn(async () => undefined),
		unsubscribe: vi.fn(async () => undefined),
		ensureTracking: vi.fn(async () => undefined),
	}),
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

vi.mock("@/server/repositories/board", () => ({
	boardRepo: mockBoardRepo,
}));

vi.mock("@/server/run/task-state-machine", async () => {
	const mod = await vi.importActual<
		typeof import("@/server/run/task-state-machine")
	>("@/server/run/task-state-machine");
	return {
		...mod,
		getTaskStateMachine: () => mockStateMachine,
	};
});

vi.mock("@/server/run/run-publisher", () => ({
	publishRunUpdate: vi.fn(),
}));

vi.mock("@/server/events/sse-broker", () => ({
	publishSseEvent: vi.fn(),
}));

vi.mock("@/server/vcs/vcs-manager", () => ({
	getVcsManager: () => mockVcsManager,
}));

import {
	RunsQueueManager,
	isNetworkError,
} from "@/server/run/runs-queue-manager";
import { publishSseEvent } from "@/server/events/sse-broker";

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
		wasQaRejected: false,
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

function buildInspection(options?: {
	content?: string;
	messages?: SessionInspectionResult["messages"];
	pendingPermissions?: SessionInspectionResult["pendingPermissions"];
	pendingQuestions?: SessionInspectionResult["pendingQuestions"];
	probeStatus?: SessionInspectionResult["probeStatus"];
	sessionStatus?: SessionInspectionResult["sessionStatus"];
}): SessionInspectionResult {
	const content = options?.content ?? "";
	const messages: SessionInspectionResult["messages"] =
		options?.messages ??
		(content
			? [
					{
						id: "msg-1",
						role: "assistant",
						content,
						parts: [],
						timestamp: Date.now(),
					},
				]
			: []);
	return {
		probeStatus: options?.probeStatus ?? "alive",
		sessionStatus: options?.sessionStatus ?? "busy",
		messages,
		todos: [],
		pendingPermissions: options?.pendingPermissions ?? [],
		pendingQuestions: options?.pendingQuestions ?? [],
	};
}

function expectTransitionCall(
	trigger: TaskTransitionTrigger,
	matcher: Partial<TaskTransitionInput> = {},
): void {
	expect(mockStateMachine.transition).toHaveBeenCalledWith(
		expect.objectContaining({
			trigger,
			...matcher,
		}),
	);
}

async function waitForDrain(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
}

function withPrivateAccess(manager: RunsQueueManager): {
	pollProjectRuns: (projectId: string) => Promise<void>;
	activeRunSessions: Map<string, string>;
} {
	return manager as unknown as {
		pollProjectRuns: (projectId: string) => Promise<void>;
		activeRunSessions: Map<string, string>;
	};
}

describe("RunsQueueManager scheduling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		runMap.clear();
		runEventMap.clear();
		taskMap.clear();
		state.sessionCounter = 0;
		process.env.RUNS_DEFAULT_CONCURRENCY = "1";
		process.env.RUNS_AUTO_EXECUTE_AFTER_GENERATION = "";
		process.env.RUNS_PROVIDER_CONCURRENCY = "";
		process.env.RUNS_BLOCKED_RETRY_MS = "10";
		process.env.RUNS_WORKTREE_ENABLED = "";
		mockSessionManager.getMessages.mockResolvedValue([]);
		mockSessionManager.inspectSession.mockResolvedValue(buildInspection());
		mockSessionManager.listPendingPermissions.mockResolvedValue([]);
		mockSessionManager.listPendingQuestions.mockResolvedValue([]);
		mockTaskLinkRepo.listByTaskId.mockReturnValue([]);
		mockVcsManager.syncRunWorkspace.mockResolvedValue(null);
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

	it("marks an execution task as started immediately when enqueued", () => {
		taskMap.set(
			"task-immediate",
			buildTask("task-immediate", "normal", "pending"),
		);
		runMap.set(
			"run-immediate",
			buildRun(
				"run-immediate",
				"task-immediate",
				"execution",
				"2026-01-01T00:00:10.000Z",
			),
		);

		const manager = new RunsQueueManager();
		manager.enqueue("run-immediate", {
			projectPath: "/tmp/project",
			sessionTitle: "task-immediate",
			prompt: "prompt",
		});

		expectTransitionCall("run:start", {
			task: expect.objectContaining({ id: "task-immediate" }),
		});
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

		mockSessionManager.inspectSession.mockResolvedValue(
			buildInspection({ sessionStatus: "idle" }),
		);

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
		expectTransitionCall("generate:ok", { outcomeContent: "" });
	});

	it("auto-enqueues generated execution into a provisioned worktree", async () => {
		process.env.RUNS_AUTO_EXECUTE_AFTER_GENERATION = "1";
		process.env.RUNS_WORKTREE_ENABLED = "true";
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

		mockSessionManager.inspectSession.mockResolvedValue(
			buildInspection({ sessionStatus: "idle" }),
		);
		mockVcsManager.provisionRunWorkspace.mockResolvedValueOnce({
			repoRoot: "/tmp/project",
			worktreePath: "/tmp/project.worktrees/generated-exec",
			branchName: "task/task-generated-generated-exec",
			baseBranch: "main",
			baseCommit: "abc123",
			headCommit: "abc123",
			hasChanges: false,
			workspaceStatus: "ready",
			mergeStatus: "pending",
			cleanupStatus: "pending",
		});

		const manager = new RunsQueueManager();
		manager.enqueue("run-generation", {
			projectPath: "/tmp/project",
			sessionTitle: "generation",
			prompt: "prompt",
		});

		await waitForDrain();
		await waitForDrain();
		await waitForDrain();
		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(mockVcsManager.provisionRunWorkspace).toHaveBeenCalledWith(
			expect.objectContaining({
				projectPath: "/tmp/project",
				taskId: "task-generated",
			}),
		);
		expect(mockSessionManager.createSession).toHaveBeenLastCalledWith(
			"task-generated",
			"/tmp/project.worktrees/generated-exec",
		);
	});

	it("refreshes VCS state when cancelling a run", async () => {
		runMap.set("run-cancel", {
			...buildRun(
				"run-cancel",
				"task-cancel",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
			status: "running",
			metadata: {
				kind: "task-run",
				vcs: {
					repoRoot: "/tmp/project",
					worktreePath: "/tmp/project.worktrees/run-cancel",
					branchName: "task/run-cancel",
					baseBranch: "main",
					baseCommit: "abc123",
					workspaceStatus: "ready",
					mergeStatus: "pending",
					cleanupStatus: "pending",
				},
			},
		});
		taskMap.set("task-cancel", buildTask("task-cancel", "normal", "running"));
		mockVcsManager.syncRunWorkspace.mockResolvedValueOnce({
			repoRoot: "/tmp/project",
			worktreePath: "/tmp/project.worktrees/run-cancel",
			branchName: "task/run-cancel",
			baseBranch: "main",
			baseCommit: "abc123",
			headCommit: "abc123",
			hasChanges: true,
			workspaceStatus: "dirty",
			mergeStatus: "pending",
			cleanupStatus: "pending",
		});

		const manager = new RunsQueueManager();
		await manager.cancel("run-cancel");

		expect(runMap.get("run-cancel")).toEqual(
			expect.objectContaining({
				status: "cancelled",
				metadata: expect.objectContaining({
					vcs: expect.objectContaining({
						workspaceStatus: "dirty",
					}),
				}),
			}),
		);
	});

	it("automatically merges and cleans a completed execution run", async () => {
		const vcs = {
			repoRoot: "/tmp/project",
			worktreePath: "/tmp/project.worktrees/run-auto-merge",
			branchName: "task/run-auto-merge",
			baseBranch: "main",
			baseCommit: "abc123",
			workspaceStatus: "ready",
			mergeStatus: "pending",
			cleanupStatus: "pending",
		};
		taskMap.set(
			"task-auto-merge",
			buildTask("task-auto-merge", "normal", "running"),
		);
		runMap.set("run-auto-merge", {
			...buildRun(
				"run-auto-merge",
				"task-auto-merge",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
			status: "running",
			startedAt: new Date(Date.now() - 15_000).toISOString(),
			metadata: {
				kind: "task-run",
				vcs,
			},
		});
		mockVcsManager.mergeRunWorkspace.mockResolvedValueOnce({
			...vcs,
			workspaceStatus: "merged",
			mergeStatus: "merged",
			mergedBy: "automatic",
			mergedAt: "2026-01-01T00:01:00.000Z",
			mergedCommit: "def456",
			cleanupStatus: "pending",
		});
		mockVcsManager.cleanupRunWorkspace.mockResolvedValueOnce({
			...vcs,
			workspaceStatus: "cleaned",
			mergeStatus: "merged",
			mergedBy: "automatic",
			mergedAt: "2026-01-01T00:01:00.000Z",
			mergedCommit: "def456",
			cleanupStatus: "cleaned",
			cleanedAt: "2026-01-01T00:02:00.000Z",
		});

		const manager = new RunsQueueManager();
		const withPrivateAccess = manager as unknown as {
			finalizeRunFromSession: (
				runId: string,
				status: "completed" | "failed" | "paused",
				outcome: MockRunOutcome,
			) => Promise<void>;
		};

		await withPrivateAccess.finalizeRunFromSession(
			"run-auto-merge",
			"completed",
			{
				kind: "completed",
				content: "Done",
			},
		);

		expect(mockVcsManager.mergeRunWorkspace).toHaveBeenCalledWith(
			expect.objectContaining({ id: "run-auto-merge" }),
			"automatic",
		);
		expect(mockVcsManager.cleanupRunWorkspace).toHaveBeenCalled();
		expect(runMap.get("run-auto-merge")).toEqual(
			expect.objectContaining({
				status: "completed",
				metadata: expect.objectContaining({
					vcs: expect.objectContaining({
						mergeStatus: "merged",
						mergedBy: "automatic",
						cleanupStatus: "cleaned",
					}),
				}),
			}),
		);
	});

	it("preserves manual merge retry state when automatic merge fails", async () => {
		const vcs = {
			repoRoot: "/tmp/project",
			worktreePath: "/tmp/project.worktrees/run-auto-merge-fail",
			branchName: "task/run-auto-merge-fail",
			baseBranch: "main",
			baseCommit: "abc123",
			workspaceStatus: "ready",
			mergeStatus: "pending",
			cleanupStatus: "pending",
		};
		taskMap.set(
			"task-auto-merge-fail",
			buildTask("task-auto-merge-fail", "normal", "running"),
		);
		runMap.set("run-auto-merge-fail", {
			...buildRun(
				"run-auto-merge-fail",
				"task-auto-merge-fail",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
			status: "running",
			startedAt: new Date(Date.now() - 15_000).toISOString(),
			metadata: {
				kind: "task-run",
				vcs,
			},
		});
		mockVcsManager.syncRunWorkspace.mockImplementation(
			async (run?: MockRecord) => {
				if (!run) {
					return null;
				}
				const metadata = run.metadata as
					| { vcs?: Record<string, unknown> }
					| undefined;
				return metadata?.vcs ?? null;
			},
		);
		mockVcsManager.mergeRunWorkspace.mockRejectedValueOnce(
			new Error("Base project worktree has uncommitted changes."),
		);

		const manager = new RunsQueueManager();
		const withPrivateAccess = manager as unknown as {
			finalizeRunFromSession: (
				runId: string,
				status: "completed" | "failed" | "paused",
				outcome: MockRunOutcome,
			) => Promise<void>;
		};

		await withPrivateAccess.finalizeRunFromSession(
			"run-auto-merge-fail",
			"completed",
			{
				kind: "completed",
				content: "Done",
			},
		);

		expect(mockVcsManager.cleanupRunWorkspace).not.toHaveBeenCalled();
		expect(runMap.get("run-auto-merge-fail")).toEqual(
			expect.objectContaining({
				status: "completed",
				metadata: expect.objectContaining({
					vcs: expect.objectContaining({
						mergeStatus: "pending",
						cleanupStatus: "pending",
						lastMergeError: "Base project worktree has uncommitted changes.",
					}),
				}),
			}),
		);
	});

	it("persists synced workspace state when cleanup fails after auto-merge", async () => {
		const vcs = {
			repoRoot: "/tmp/project",
			worktreePath: "/tmp/project.worktrees/run-auto-cleanup-fail",
			branchName: "task/run-auto-cleanup-fail",
			baseBranch: "main",
			baseCommit: "abc123",
			workspaceStatus: "ready",
			mergeStatus: "pending",
			cleanupStatus: "pending",
		};
		taskMap.set(
			"task-auto-cleanup-fail",
			buildTask("task-auto-cleanup-fail", "normal", "running"),
		);
		runMap.set("run-auto-cleanup-fail", {
			...buildRun(
				"run-auto-cleanup-fail",
				"task-auto-cleanup-fail",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
			status: "running",
			startedAt: new Date(Date.now() - 15_000).toISOString(),
			metadata: {
				kind: "task-run",
				vcs,
			},
		});
		mockVcsManager.mergeRunWorkspace.mockResolvedValueOnce({
			...vcs,
			workspaceStatus: "merged",
			mergeStatus: "merged",
			mergedBy: "automatic",
			mergedAt: "2026-01-01T00:01:00.000Z",
			mergedCommit: "def456",
			cleanupStatus: "pending",
		});
		mockVcsManager.cleanupRunWorkspace.mockRejectedValueOnce(
			new Error("branch delete failed"),
		);
		mockVcsManager.syncVcsMetadata.mockResolvedValueOnce({
			...vcs,
			workspaceStatus: "missing",
			mergeStatus: "merged",
			mergedBy: "automatic",
			mergedAt: "2026-01-01T00:01:00.000Z",
			mergedCommit: "def456",
			cleanupStatus: "pending",
		});

		const manager = new RunsQueueManager();
		const withPrivateAccess = manager as unknown as {
			finalizeRunFromSession: (
				runId: string,
				status: "completed" | "failed" | "paused",
				outcome: MockRunOutcome,
			) => Promise<void>;
		};

		await withPrivateAccess.finalizeRunFromSession(
			"run-auto-cleanup-fail",
			"completed",
			{
				kind: "completed",
				content: "Done",
			},
		);

		expect(mockVcsManager.syncVcsMetadata).toHaveBeenCalled();
		expect(runMap.get("run-auto-cleanup-fail")).toEqual(
			expect.objectContaining({
				status: "completed",
				metadata: expect.objectContaining({
					vcs: expect.objectContaining({
						mergeStatus: "merged",
						workspaceStatus: "missing",
						cleanupStatus: "failed",
						lastCleanupError: "branch delete failed",
					}),
				}),
			}),
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

	it("maps completion to run:done signal for non-generation runs", async () => {
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

		mockSessionManager.inspectSession.mockResolvedValue(
			buildInspection({ sessionStatus: "idle" }),
		);

		const manager = new RunsQueueManager();
		manager.enqueue("run-qa-ok", {
			projectPath: "/tmp/project",
			sessionTitle: "qa-ok",
			prompt: "prompt",
		});

		await waitForDrain();
		await waitForDrain();

		expectTransitionCall("run:done", { outcomeContent: "" });
	});

	it("maps failed outcome to run:fail signal for non-generation runs", async () => {
		taskMap.set("task-qa-fail", buildTask("task-qa-fail", "normal", "running"));
		runMap.set("run-qa-fail", {
			...buildRun(
				"run-qa-fail",
				"task-qa-fail",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
			status: "running",
			startedAt: new Date(Date.now() - 15_000).toISOString(),
		});

		const manager = new RunsQueueManager();
		const access = manager as unknown as {
			finalizeRunFromSession: (
				runId: string,
				status: "completed" | "failed" | "paused",
				outcome: MockRunOutcome,
			) => Promise<void>;
		};
		await access.finalizeRunFromSession("run-qa-fail", "failed", {
			kind: "failed",
			content: "",
		});

		expectTransitionCall("run:fail", { outcomeContent: "" });
	});

	it("keeps run active when executeRun hits fetch failed after session creation", async () => {
		taskMap.set("task-fetch-failed", buildTask("task-fetch-failed", "normal"));
		runMap.set(
			"run-fetch-failed",
			buildRun(
				"run-fetch-failed",
				"task-fetch-failed",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
		);
		mockSessionManager.sendPrompt.mockRejectedValueOnce(
			new Error("fetch failed"),
		);

		const manager = new RunsQueueManager();
		manager.enqueue("run-fetch-failed", {
			projectPath: "/tmp/project",
			sessionTitle: "task-fetch-failed",
			prompt: "prompt",
		});

		await waitForDrain();
		await waitForDrain();

		expect(runMap.get("run-fetch-failed")).toEqual(
			expect.objectContaining({
				status: "running",
				errorText: "fetch failed",
			}),
		);
		expect(mockStateMachine.transition).not.toHaveBeenCalledWith(
			expect.objectContaining({ trigger: "run:fail" }),
		);
	});

	it("projects task failure when executeRun hits a real error", async () => {
		taskMap.set("task-real-error", buildTask("task-real-error", "normal"));
		runMap.set(
			"run-real-error",
			buildRun(
				"run-real-error",
				"task-real-error",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
		);
		mockSessionManager.sendPrompt.mockRejectedValueOnce(
			new Error("Something broke"),
		);

		const manager = new RunsQueueManager();
		manager.enqueue("run-real-error", {
			projectPath: "/tmp/project",
			sessionTitle: "task-real-error",
			prompt: "prompt",
		});

		await waitForDrain();
		await waitForDrain();

		expect(runMap.get("run-real-error")).toEqual(
			expect.objectContaining({
				status: "failed",
				errorText: "Something broke",
			}),
		);
		expectTransitionCall("run:fail", { outcomeContent: "Something broke" });
	});

	it("recovers failed run when late completion arrives after fetch failure", async () => {
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
				outcome: MockRunOutcome,
			) => Promise<void>;
		};

		await withPrivateAccess.finalizeRunFromSession(
			"run-late-done",
			"completed",
			{
				kind: "completed",
				content: "Done",
			},
		);

		expect(runMap.get("run-late-done")?.status).toBe("completed");
		expectTransitionCall("run:done", {
			outcomeContent: "Done",
		});
	});

	it("does not recover failed run with non-network error on late completion", async () => {
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
				outcome: MockRunOutcome,
			) => Promise<void>;
		};

		await withPrivateAccess.finalizeRunFromSession(
			"run-late-done-no-recover",
			"completed",
			{
				kind: "completed",
				content: "Done",
			},
		);

		expect(runMap.get("run-late-done-no-recover")?.status).toBe("failed");
		expect(mockStateMachine.transition).not.toHaveBeenCalledWith(
			expect.objectContaining({
				trigger: "run:done",
				outcomeContent: "Done",
			}),
		);
	});

	it("recovers fetch-failed run during project polling", async () => {
		taskMap.set(
			"task-orphaned-fetch-failed",
			buildTask("task-orphaned-fetch-failed", "normal", "failed"),
		);
		runMap.set("run-orphaned-fetch-failed", {
			...buildRun(
				"run-orphaned-fetch-failed",
				"task-orphaned-fetch-failed",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
			status: "failed",
			sessionId: "session-orphaned-fetch-failed",
			startedAt: new Date(Date.now() - 15_000).toISOString(),
			endedAt: new Date().toISOString(),
			metadata: {
				kind: "task-run",
				errorText: "fetch failed",
			},
		});
		mockSessionManager.inspectSession.mockResolvedValue(
			buildInspection({ sessionStatus: "idle" }),
		);

		const manager = new RunsQueueManager();
		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(mockSessionManager.inspectSession).toHaveBeenCalledWith(
			"session-orphaned-fetch-failed",
		);
		expect(runMap.get("run-orphaned-fetch-failed")?.status).toBe("completed");
		expectTransitionCall("run:done", { outcomeContent: "" });
	});

	it("does not project task failure from recoverable failed run when session is still running", async () => {
		taskMap.set(
			"task-recoverable-running",
			buildTask("task-recoverable-running", "normal", "running"),
		);
		runMap.set("run-recoverable-running", {
			...buildRun(
				"run-recoverable-running",
				"task-recoverable-running",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
			status: "failed",
			sessionId: "session-recoverable-running",
			metadata: {
				kind: "task-run",
				errorText: "fetch failed",
			},
		});
		mockSessionManager.inspectSession.mockResolvedValueOnce(buildInspection());

		const manager = new RunsQueueManager();
		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(mockStateMachine.transition).not.toHaveBeenCalledWith(
			expect.objectContaining({ trigger: "run:fail" }),
		);
	});

	it("force-finalizes stale generation runs during project polling", async () => {
		taskMap.set(
			"task-stale-generation",
			buildTask("task-stale-generation", "normal", "generating"),
		);
		runMap.set("run-stale-generation", {
			...buildRun(
				"run-stale-generation",
				"task-stale-generation",
				"generation",
				"2026-01-01T00:00:00.000Z",
			),
			status: "running",
			sessionId: "session-stale-generation",
			startedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
		});
		mockSessionManager.inspectSession.mockResolvedValue(buildInspection());

		const manager = new RunsQueueManager();
		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(runMap.get("run-stale-generation")?.status).toBe("completed");
		expectTransitionCall("generate:ok", { outcomeContent: "" });
	});

	it("does not finalize stale runs when polling inspection is transiently unavailable", async () => {
		taskMap.set(
			"task-stale-transient",
			buildTask("task-stale-transient", "normal", "generating"),
		);
		runMap.set("run-stale-transient", {
			...buildRun(
				"run-stale-transient",
				"task-stale-transient",
				"generation",
				"2026-01-01T00:00:00.000Z",
			),
			status: "running",
			sessionId: "session-stale-transient",
			startedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
		});
		mockSessionManager.inspectSession.mockResolvedValue(
			buildInspection({ probeStatus: "transient_error" }),
		);

		const manager = new RunsQueueManager();
		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(runMap.get("run-stale-transient")?.status).toBe("running");
		expect(mockStateMachine.transition).not.toHaveBeenCalledWith(
			expect.objectContaining({ trigger: "generate:ok" }),
		);
	});

	it("fails a running run when polling probe reports not_found in markerless mode", async () => {
		taskMap.set("task-not-found-1", buildTask("task-not-found-1", "normal"));
		runMap.set(
			"run-not-found-1",
			buildRun(
				"run-not-found-1",
				"task-not-found-1",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
		);

		const manager = new RunsQueueManager();
		manager.enqueue("run-not-found-1", {
			projectPath: "/tmp/project",
			sessionTitle: "not found test",
			prompt: "test prompt",
		});
		await waitForDrain();

		mockSessionManager.inspectSession.mockResolvedValueOnce(
			buildInspection({ probeStatus: "not_found" }),
		);

		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(runMap.get("run-not-found-1")?.status).toBe("failed");
		expectTransitionCall("run:fail", {
			outcomeContent: "Session not found",
		});
	});

	it("fails stale runs when polling probe reports not_found in markerless mode", async () => {
		taskMap.set(
			"task-stale-not-found",
			buildTask("task-stale-not-found", "normal", "running"),
		);
		runMap.set("run-stale-not-found", {
			...buildRun(
				"run-stale-not-found",
				"task-stale-not-found",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
			status: "running",
			sessionId: "session-stale-not-found",
			startedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
		});
		mockSessionManager.inspectSession.mockResolvedValueOnce(
			buildInspection({ probeStatus: "not_found" }),
		);

		const manager = new RunsQueueManager();
		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(runMap.get("run-stale-not-found")?.status).toBe("failed");
		expectTransitionCall("run:fail", {
			outcomeContent: "Session not found",
		});
	});

	it("preserves generated marker when polling settled generation runs", async () => {
		taskMap.set("task-settled-generation", {
			...buildTask("task-settled-generation", "normal", "generating"),
			updatedAt: new Date(Date.now() - 60_000).toISOString(),
		});
		runMap.set("run-settled-generation", {
			...buildRun(
				"run-settled-generation",
				"task-settled-generation",
				"generation",
				"2026-01-01T00:00:00.000Z",
			),
			status: "completed",
			sessionId: "session-settled-generation",
			startedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
			finishedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
		});
		mockSessionManager.inspectSession.mockResolvedValue(buildInspection());

		const manager = new RunsQueueManager();
		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expectTransitionCall("generate:ok", { outcomeContent: "" });
	});

	it("hydrates story content when polling a settled generation run", async () => {
		taskMap.set("task-settled-generation-story", {
			...buildTask("task-settled-generation-story", "normal", "generating"),
			updatedAt: new Date(Date.now() - 60_000).toISOString(),
		});
		runMap.set("run-settled-generation-story", {
			...buildRun(
				"run-settled-generation-story",
				"task-settled-generation-story",
				"generation",
				"2026-01-01T00:00:00.000Z",
			),
			status: "completed",
			sessionId: "session-settled-generation-story",
			startedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
			finishedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
		});
		mockSessionManager.inspectSession.mockResolvedValue(
			buildInspection({
				sessionStatus: "idle",
				messages: [
					{
						id: "msg-1",
						role: "assistant",
						content: [
							'<META>{"type":"improvement"}</META>',
							"<STORY>",
							"## Title",
							"Clean up CLI output",
							"</STORY>",
						].join("\n"),
						parts: [],
						timestamp: Date.now(),
					},
				],
			}),
		);

		const manager = new RunsQueueManager();
		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expectTransitionCall("generate:ok", {
			outcomeContent: [
				'<META>{"type":"improvement"}</META>',
				"<STORY>",
				"## Title",
				"Clean up CLI output",
				"</STORY>",
			].join("\n"),
		});
	});

	it("uses the last assistant message as story content for generation runs", async () => {
		taskMap.set(
			"task-story-content",
			buildTask("task-story-content", "normal", "generating"),
		);
		runMap.set(
			"run-story-content",
			buildRun(
				"run-story-content",
				"task-story-content",
				"generation",
				"2026-01-01T00:00:00.000Z",
			),
		);

		mockSessionManager.inspectSession.mockResolvedValue(
			buildInspection({
				sessionStatus: "idle",
				messages: [
					{
						id: "msg-1",
						role: "assistant",
						content:
							"Now let me verify one detail — the board screen mapping to projects icon",
						parts: [],
						timestamp: Date.now(),
					},
					{
						id: "msg-2",
						role: "assistant",
						content: [
							'<META>{"type":"bug"}</META>',
							"<STORY>",
							"## Title",
							"Highlight icon",
							"</STORY>",
						].join("\n"),
						parts: [],
						timestamp: Date.now() + 1,
					},
				],
			}),
		);

		const manager = new RunsQueueManager();
		manager.enqueue("run-story-content", {
			projectPath: "/tmp/project",
			sessionTitle: "generation",
			prompt: "prompt",
		});

		await waitForDrain();
		await waitForDrain();

		expectTransitionCall("generate:ok", {
			outcomeContent: [
				'<META>{"type":"bug"}</META>',
				"<STORY>",
				"## Title",
				"Highlight icon",
				"</STORY>",
			].join("\n"),
		});
	});

	it("extracts story content from settled generation run messages during polling", async () => {
		taskMap.set("task-prefixed-marker", {
			...buildTask("task-prefixed-marker", "normal", "generating"),
			updatedAt: new Date(Date.now() - 60_000).toISOString(),
		});
		runMap.set("run-settled-prefixed-marker", {
			...buildRun(
				"run-settled-prefixed-marker",
				"task-prefixed-marker",
				"generation",
				"2026-01-01T00:00:00.000Z",
			),
			status: "completed",
			sessionId: "session-settled-prefixed-marker",
			startedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
			finishedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
		});

		mockSessionManager.inspectSession.mockResolvedValue(
			buildInspection({
				sessionStatus: "idle",
				messages: [
					{
						id: "msg-prefixed",
						role: "assistant",
						content: [
							'<META>{"type":"feature"}</META>',
							"<STORY>",
							"## Title",
							"Prefixed marker story",
							"</STORY>",
						].join("\n"),
						parts: [],
						timestamp: Date.now(),
					},
				],
			}),
		);

		const manager = new RunsQueueManager();
		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expectTransitionCall("generate:ok", {
			outcomeContent: [
				'<META>{"type":"feature"}</META>',
				"<STORY>",
				"## Title",
				"Prefixed marker story",
				"</STORY>",
			].join("\n"),
		});
	});

	it("extracts content from the last assistant message for generation run completion", async () => {
		taskMap.set(
			"task-marker-anchor",
			buildTask("task-marker-anchor", "normal", "generating"),
		);
		runMap.set(
			"run-marker-anchor",
			buildRun(
				"run-marker-anchor",
				"task-marker-anchor",
				"generation",
				"2026-01-01T00:00:00.000Z",
			),
		);

		const messages: SessionInspectionResult["messages"] = [
			{
				id: "msg-story",
				role: "assistant",
				content: [
					'<META>{"type":"feature"}</META>',
					"<STORY>",
					"## Title",
					"Correct content",
					"</STORY>",
				].join("\n"),
				parts: [],
				timestamp: Date.now(),
			},
		];

		mockSessionManager.inspectSession.mockResolvedValue({
			...buildInspection({ sessionStatus: "idle", messages }),
		});

		const manager = new RunsQueueManager();
		manager.enqueue("run-marker-anchor", {
			projectPath: "/tmp/project",
			sessionTitle: "generation",
			prompt: "prompt",
		});

		await waitForDrain();
		await waitForDrain();

		expectTransitionCall("generate:ok", {
			outcomeContent: [
				'<META>{"type":"feature"}</META>',
				"<STORY>",
				"## Title",
				"Correct content",
				"</STORY>",
			].join("\n"),
		});
	});

	it("detects infrastructure network errors case-insensitively", () => {
		expect(isNetworkError(new Error("fetch failed"))).toBe(true);
		expect(isNetworkError(new Error("ECONNREFUSED connecting upstream"))).toBe(
			true,
		);
		expect(isNetworkError(new Error("Something broke"))).toBe(false);
	});
});

describe("RunsQueueManager permission handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		runMap.clear();
		runEventMap.clear();
		taskMap.clear();
		state.sessionCounter = 0;
		process.env.RUNS_DEFAULT_CONCURRENCY = "1";
		process.env.RUNS_PROVIDER_CONCURRENCY = "";
		process.env.RUNS_BLOCKED_RETRY_MS = "10";
		process.env.RUNS_WORKTREE_ENABLED = "";
		mockSessionManager.getMessages.mockResolvedValue([]);
		mockSessionManager.inspectSession.mockResolvedValue(buildInspection());
		mockSessionManager.listPendingPermissions.mockResolvedValue([]);
		mockSessionManager.listPendingQuestions.mockResolvedValue([]);
		mockTaskLinkRepo.listByTaskId.mockReturnValue([]);
		mockVcsManager.syncRunWorkspace.mockResolvedValue(null);
	});

	async function setupRunningRun(
		runId: string,
		taskId: string,
	): Promise<{ manager: RunsQueueManager; sessionId: string }> {
		taskMap.set(taskId, buildTask(taskId, "normal"));
		const run = buildRun(
			runId,
			taskId,
			"execution",
			"2026-01-01T00:00:00.000Z",
		);
		runMap.set(runId, run);

		const manager = new RunsQueueManager();
		manager.enqueue(runId, {
			projectPath: "/tmp/project",
			sessionTitle: "permission test",
			prompt: "test prompt",
		});
		await waitForDrain();

		const sessionId = withPrivateAccess(manager).activeRunSessions.get(runId);
		expect(sessionId).toBeTruthy();

		return { manager, sessionId: sessionId ?? "" };
	}

	it("pauses run when pending permission is found during project polling", async () => {
		const { manager, sessionId } = await setupRunningRun(
			"run-perm-1",
			"task-perm-1",
		);
		mockSessionManager.inspectSession.mockResolvedValueOnce(
			buildInspection({
				pendingPermissions: [
					{
						id: "perm-1",
						permissionType: "bash",
						pattern: "*.sh",
						sessionId,
						messageId: "msg-1",
						title: "Execute shell script",
						metadata: {},
						createdAt: Date.now(),
					},
				],
			}),
		);

		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(runMap.get("run-perm-1")?.status).toBe("paused");
		expect(mockRunEventRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				runId: "run-perm-1",
				eventType: "permission",
			}),
		);
	});

	it("does not mark a resumed session completed when idle after a newer user message", async () => {
		const { manager } = await setupRunningRun("run-resume-1", "task-resume-1");
		mockSessionManager.inspectSession.mockResolvedValueOnce(
			buildInspection({
				sessionStatus: "idle",
				messages: [
					{
						id: "msg-assistant-done",
						role: "assistant",
						content: "Done",
						parts: [],
						timestamp: Date.now(),
					},
					{
						id: "msg-user-resume",
						role: "user",
						content: "Please continue and fix QA issues",
						parts: [],
						timestamp: Date.now() + 1,
					},
				],
			}),
		);

		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(runMap.get("run-resume-1")?.status).toBe("running");
		expect(mockStateMachine.transition).not.toHaveBeenCalledWith(
			expect.objectContaining({ trigger: "run:done" }),
		);
	});

	it("publishes SSE permission event when permission is detected during project polling", async () => {
		const { publishSseEvent } = await import("@/server/events/sse-broker");
		const { manager, sessionId } = await setupRunningRun(
			"run-perm-2",
			"task-perm-2",
		);
		mockSessionManager.inspectSession.mockResolvedValueOnce(
			buildInspection({
				pendingPermissions: [
					{
						id: "perm-2",
						permissionType: "edit",
						pattern: ".env",
						sessionId,
						messageId: "msg-2",
						title: "Edit .env file",
						metadata: {},
						createdAt: Date.now(),
					},
				],
			}),
		);

		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(publishSseEvent).toHaveBeenCalledWith(
			"run:permission",
			expect.objectContaining({
				runId: "run-perm-2",
				permissionId: "perm-2",
				permissionType: "edit",
				title: "Edit .env file",
			}),
		);
	});

	it("resumes run when permission is no longer pending during project polling", async () => {
		const { manager, sessionId } = await setupRunningRun(
			"run-perm-3",
			"task-perm-3",
		);
		mockSessionManager.inspectSession.mockResolvedValueOnce(
			buildInspection({
				pendingPermissions: [
					{
						id: "perm-3",
						permissionType: "read",
						sessionId,
						messageId: "msg-3",
						title: "Read file",
						metadata: {},
						createdAt: Date.now(),
					},
				],
			}),
		);
		mockSessionManager.listPendingPermissions.mockResolvedValueOnce([]);

		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(runMap.get("run-perm-3")?.status).toBe("paused");

		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(runMap.get("run-perm-3")?.status).toBe("running");
		expect(mockRunEventRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				runId: "run-perm-3",
				eventType: "permission",
				payload: expect.objectContaining({
					status: "approved",
					permissionId: "perm-3",
				}),
			}),
		);
	});

	it("fails run after permission is rejected and polling sees a failure marker", async () => {
		const { manager, sessionId } = await setupRunningRun(
			"run-perm-4",
			"task-perm-4",
		);
		const isolatedSessionId = `${sessionId}-perm-4`;
		withPrivateAccess(manager).activeRunSessions.set(
			"run-perm-4",
			isolatedSessionId,
		);
		mockRunRepo.update("run-perm-4", { sessionId: isolatedSessionId });
		let pendingPermissionsState: PermissionData[] = [
			{
				id: "perm-4",
				permissionType: "bash",
				sessionId: isolatedSessionId,
				messageId: "msg-4",
				title: "Run command",
				metadata: {},
				createdAt: Date.now(),
			},
		];
		mockSessionManager.inspectSession.mockResolvedValueOnce(
			buildInspection({
				pendingPermissions: [
					{
						id: "perm-4",
						permissionType: "bash",
						sessionId: isolatedSessionId,
						messageId: "msg-4",
						title: "Run command",
						metadata: {},
						createdAt: Date.now(),
					},
				],
			}),
		);
		mockSessionManager.listPendingPermissions.mockImplementation(
			async (currentSessionId?: string): Promise<PermissionData[]> => {
				return currentSessionId === isolatedSessionId
					? pendingPermissionsState
					: [];
			},
		);

		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(runMap.get("run-perm-4")?.status).toBe("paused");

		pendingPermissionsState = [];
		await withPrivateAccess(manager).pollProjectRuns("project-1");
		expect(runMap.get("run-perm-4")?.status).toBe("running");

		mockSessionManager.inspectSession.mockImplementation(
			async (currentSessionId?: string) => {
				return currentSessionId === isolatedSessionId
					? buildInspection({ probeStatus: "not_found" })
					: buildInspection();
			},
		);

		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(runMap.get("run-perm-4")?.status).toBe("failed");
		expectTransitionCall("run:fail", { outcomeContent: "Session not found" });
	});

	it("ignores pending permission for a non-running run during project polling", async () => {
		taskMap.set("task-perm-5", buildTask("task-perm-5", "normal"));
		const run = buildRun(
			"run-perm-5",
			"task-perm-5",
			"execution",
			"2026-01-01T00:00:00.000Z",
		);
		run.status = "completed";
		runMap.set("run-perm-5", run);

		const manager = new RunsQueueManager();
		const privateAccess = withPrivateAccess(manager);
		privateAccess.activeRunSessions.set("run-perm-5", "session-1");
		mockSessionManager.listPendingPermissions.mockResolvedValueOnce([
			{
				id: "perm-5",
				permissionType: "read",
				sessionId: "session-1",
				messageId: "msg-5",
				title: "Read",
				metadata: {},
				createdAt: Date.now(),
			},
		]);

		await privateAccess.pollProjectRuns("project-1");

		expect(mockRunRepo.update).not.toHaveBeenCalledWith(
			"run-perm-5",
			expect.objectContaining({ status: "paused" }),
		);
	});

	it("still detects completion after permission is resolved during project polling", async () => {
		const { manager, sessionId } = await setupRunningRun(
			"run-perm-6",
			"task-perm-6",
		);
		const isolatedSessionId = `${sessionId}-perm-6`;
		withPrivateAccess(manager).activeRunSessions.set(
			"run-perm-6",
			isolatedSessionId,
		);
		mockRunRepo.update("run-perm-6", { sessionId: isolatedSessionId });
		let pendingPermissionsState: PermissionData[] = [
			{
				id: "perm-6",
				permissionType: "read",
				sessionId: isolatedSessionId,
				messageId: "msg-6",
				title: "Read file",
				metadata: {},
				createdAt: Date.now(),
			},
		];
		mockSessionManager.inspectSession.mockResolvedValueOnce(
			buildInspection({
				pendingPermissions: [
					{
						id: "perm-6",
						permissionType: "read",
						sessionId: isolatedSessionId,
						messageId: "msg-6",
						title: "Read file",
						metadata: {},
						createdAt: Date.now(),
					},
				],
			}),
		);
		mockSessionManager.listPendingPermissions.mockImplementation(
			async (currentSessionId?: string): Promise<PermissionData[]> => {
				return currentSessionId === isolatedSessionId
					? pendingPermissionsState
					: [];
			},
		);

		await withPrivateAccess(manager).pollProjectRuns("project-1");
		expect(runMap.get("run-perm-6")?.status).toBe("paused");

		pendingPermissionsState = [];
		await withPrivateAccess(manager).pollProjectRuns("project-1");
		expect(runMap.get("run-perm-6")?.status).toBe("running");

		mockSessionManager.inspectSession.mockImplementation(
			async (currentSessionId?: string) => {
				return currentSessionId === isolatedSessionId
					? buildInspection({
							content: "Done",
							sessionStatus: "idle",
						})
					: buildInspection();
			},
		);

		await withPrivateAccess(manager).pollProjectRuns("project-1");

		expect(runMap.get("run-perm-6")?.status).toBe("completed");
	});

	it("prefers a live running run over a paused sibling during project polling", async () => {
		taskMap.set("task-multi-active", {
			...buildTask("task-multi-active", "normal", "question"),
			updatedAt: new Date(Date.now() - 60_000).toISOString(),
		});
		runMap.set("run-multi-running", {
			...buildRun(
				"run-multi-running",
				"task-multi-active",
				"execution",
				"2026-01-01T00:00:00.000Z",
			),
			status: "running",
			startedAt: new Date().toISOString(),
		});
		runMap.set("run-multi-paused", {
			...buildRun(
				"run-multi-paused",
				"task-multi-active",
				"execution",
				"2026-01-01T00:00:01.000Z",
			),
			status: "paused",
			sessionId: "session-paused",
		});
		mockRunEventRepo.create({
			runId: "run-multi-paused",
			eventType: "permission",
			payload: {
				status: "paused",
				permissionId: "perm-multi",
			},
		});

		mockSessionManager.inspectSession.mockImplementation(async (sessionId) => {
			if (sessionId === "session-paused") {
				return buildInspection({
					pendingPermissions: [
						{
							id: "perm-multi",
							permissionType: "read",
							sessionId,
							messageId: "msg-multi",
							title: "Read file",
							metadata: {},
							createdAt: Date.now(),
						},
					],
				});
			}

			return buildInspection();
		});

		const manager = new RunsQueueManager();
		await manager.pollProjectRuns("project-1");

		expectTransitionCall("run:start", {
			task: expect.objectContaining({ id: "task-multi-active" }),
		});
		expect(mockStateMachine.transition).not.toHaveBeenCalledWith(
			expect.objectContaining({ trigger: "run:question" }),
		);
	});

	it("reuses the previous rejected-task session for post-merge auto-start", async () => {
		mockBoardRepo.getById.mockReturnValue({
			id: "board-1",
			projectId: "project-1",
			name: "Board",
			columns: [
				{ id: "ready-col", name: "Ready", systemKey: "ready" },
				{ id: "column-1", name: "In Progress", systemKey: "in_progress" },
			],
		});

		taskMap.set("merged-task", {
			...buildTask("merged-task", "normal", "done"),
			boardId: "board-1",
			columnId: "closed-col",
		});
		taskMap.set("rejected-task", {
			...buildTask("rejected-task", "normal", "rejected"),
			boardId: "board-1",
			columnId: "ready-col",
			qaReport: "Fix the QA findings",
		});
		runMap.set("run-completed", {
			...buildRun(
				"run-completed",
				"rejected-task",
				"execution",
				new Date().toISOString(),
			),
			status: "completed",
			sessionId: "session-existing",
		});

		const manager = new RunsQueueManager();
		await manager.startNextReadyTaskAfterMerge("merged-task");

		expect(mockSessionManager.sendPrompt).toHaveBeenCalledWith(
			"session-existing",
			expect.stringContaining("Fix the QA findings"),
		);
		expect(mockRunRepo.create).not.toHaveBeenCalled();
		expect(taskMap.get("rejected-task")).toEqual(
			expect.objectContaining({
				status: "running",
				columnId: "column-1",
				qaReport: null,
			}),
		);
		expect(runMap.get("run-completed")).toEqual(
			expect.objectContaining({
				status: "running",
				metadata: expect.objectContaining({
					lastExecutionStatus: expect.objectContaining({
						kind: "running",
						sessionId: "session-existing",
					}),
				}),
			}),
		);
	});

	it("moves a freshly queued next task to in_progress immediately", async () => {
		mockBoardRepo.getById.mockReturnValue({
			id: "board-1",
			projectId: "project-1",
			name: "Board",
			columns: [
				{ id: "ready-col", name: "Ready", systemKey: "ready" },
				{ id: "column-1", name: "In Progress", systemKey: "in_progress" },
			],
		});

		taskMap.set("merged-task", {
			...buildTask("merged-task", "normal", "done"),
			boardId: "board-1",
			columnId: "closed-col",
		});
		taskMap.set("running-task", {
			...buildTask("running-task", "normal", "running"),
			boardId: "board-1",
			columnId: "column-1",
		});
		taskMap.set("next-ready-task", {
			...buildTask("next-ready-task", "urgent", "pending"),
			boardId: "board-1",
			columnId: "ready-col",
			orderInColumn: 0,
		});

		const manager = new RunsQueueManager();
		await (
			manager as unknown as {
				enqueueExecutionForNextTask: (taskId: string) => Promise<void>;
			}
		).enqueueExecutionForNextTask("next-ready-task");

		expect(taskMap.get("next-ready-task")).toEqual(
			expect.objectContaining({
				status: "running",
				columnId: "column-1",
				orderInColumn: 1,
			}),
		);
		expect(publishSseEvent).toHaveBeenCalledWith(
			"task:event",
			expect.objectContaining({
				taskId: "next-ready-task",
				eventType: "task:updated",
				boardId: "board-1",
				projectId: "project-1",
			}),
		);
	});
});
