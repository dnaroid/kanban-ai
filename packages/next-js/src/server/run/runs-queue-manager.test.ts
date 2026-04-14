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
	mockVcsManager,
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

vi.mock("@/server/events/sse-broker", () => ({
	publishSseEvent: vi.fn(),
}));

vi.mock("@/server/vcs/vcs-manager", () => ({
	getVcsManager: () => mockVcsManager,
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

	it("auto-enqueues generated execution into a provisioned worktree", async () => {
		process.env.RUNS_AUTO_EXECUTE_AFTER_GENERATION = "1";
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
				signalKey: string,
				assistantContent: string,
			) => Promise<void>;
		};

		await withPrivateAccess.finalizeRunFromSession(
			"run-auto-merge",
			"completed",
			"done",
			buildOpencodeStatusLine("done"),
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
				signalKey: string,
				assistantContent: string,
			) => Promise<void>;
		};

		await withPrivateAccess.finalizeRunFromSession(
			"run-auto-merge-fail",
			"completed",
			"done",
			buildOpencodeStatusLine("done"),
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
				signalKey: string,
				assistantContent: string,
			) => Promise<void>;
		};

		await withPrivateAccess.finalizeRunFromSession(
			"run-auto-cleanup-fail",
			"completed",
			"done",
			buildOpencodeStatusLine("done"),
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

describe("RunsQueueManager permission handling", () => {
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
		mockVcsManager.syncRunWorkspace.mockResolvedValue(null);
	});

	async function setupRunningRun(
		runId: string,
		taskId: string,
	): Promise<RunsQueueManager> {
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

		return manager;
	}

	function getLastSessionHandler(): (event: Record<string, unknown>) => void {
		const subscribeCalls = (
			mockSessionManager.subscribe as unknown as {
				mock: { calls: unknown[][] };
			}
		).mock.calls;
		const lastCall = subscribeCalls[subscribeCalls.length - 1];
		return lastCall?.[2] as (event: Record<string, unknown>) => void;
	}

	it("pauses run on permission.updated event", async () => {
		await setupRunningRun("run-perm-1", "task-perm-1");
		const sessionHandler = getLastSessionHandler();
		expect(sessionHandler).toBeDefined();

		await sessionHandler({
			type: "permission.updated",
			sessionId: "session-1",
			permission: {
				id: "perm-1",
				permissionType: "bash",
				pattern: "*.sh",
				sessionId: "session-1",
				messageId: "msg-1",
				title: "Execute shell script",
				metadata: {},
				createdAt: Date.now(),
			},
		});

		await waitForDrain();

		expect(runMap.get("run-perm-1")?.status).toBe("paused");
		expect(mockRunEventRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				runId: "run-perm-1",
				eventType: "permission",
			}),
		);
	});

	it("publishes SSE permission event on permission.updated", async () => {
		const { publishSseEvent } = await import("@/server/events/sse-broker");
		await setupRunningRun("run-perm-2", "task-perm-2");
		const sessionHandler = getLastSessionHandler();

		await sessionHandler({
			type: "permission.updated",
			sessionId: "session-1",
			permission: {
				id: "perm-2",
				permissionType: "edit",
				pattern: ".env",
				sessionId: "session-1",
				messageId: "msg-2",
				title: "Edit .env file",
				metadata: {},
				createdAt: Date.now(),
			},
		});

		await waitForDrain();

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

	it("resumes run on permission.replied with approve response", async () => {
		await setupRunningRun("run-perm-3", "task-perm-3");
		const sessionHandler = getLastSessionHandler();

		await sessionHandler({
			type: "permission.updated",
			sessionId: "session-1",
			permission: {
				id: "perm-3",
				permissionType: "read",
				sessionId: "session-1",
				messageId: "msg-3",
				title: "Read file",
				metadata: {},
				createdAt: Date.now(),
			},
		});
		await waitForDrain();

		expect(runMap.get("run-perm-3")?.status).toBe("paused");

		await sessionHandler({
			type: "permission.replied",
			sessionId: "session-1",
			permissionId: "perm-3",
			response: "once",
		});
		await waitForDrain();

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

	it("fails run on permission.replied with reject response", async () => {
		await setupRunningRun("run-perm-4", "task-perm-4");
		const sessionHandler = getLastSessionHandler();

		await sessionHandler({
			type: "permission.updated",
			sessionId: "session-1",
			permission: {
				id: "perm-4",
				permissionType: "bash",
				sessionId: "session-1",
				messageId: "msg-4",
				title: "Run command",
				metadata: {},
				createdAt: Date.now(),
			},
		});
		await waitForDrain();

		expect(runMap.get("run-perm-4")?.status).toBe("paused");

		await sessionHandler({
			type: "permission.replied",
			sessionId: "session-1",
			permissionId: "perm-4",
			response: "reject",
		});
		await waitForDrain();

		expect(runMap.get("run-perm-4")?.status).toBe("failed");
		expect(mockTaskProjector.projectRunOutcome).toHaveBeenCalledWith(
			expect.objectContaining({ id: "run-perm-4" }),
			"failed",
			"fail",
			expect.stringContaining("perm-4"),
		);
	});

	it("ignores permission.updated for non-running run", async () => {
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
		manager.enqueue("run-perm-5", {
			projectPath: "/tmp/project",
			sessionTitle: "permission test",
			prompt: "test prompt",
		});
		await waitForDrain();

		const sessionHandler = getLastSessionHandler();
		if (!sessionHandler) return;

		await sessionHandler({
			type: "permission.updated",
			sessionId: "session-1",
			permission: {
				id: "perm-5",
				permissionType: "read",
				sessionId: "session-1",
				messageId: "msg-5",
				title: "Read",
				metadata: {},
				createdAt: Date.now(),
			},
		});
		await waitForDrain();

		expect(mockRunRepo.update).not.toHaveBeenCalledWith(
			"run-perm-5",
			expect.objectContaining({ status: "paused" }),
		);
	});

	it("still handles message.updated events after permission handling", async () => {
		await setupRunningRun("run-perm-6", "task-perm-6");
		const sessionHandler = getLastSessionHandler();

		await sessionHandler({
			type: "permission.updated",
			sessionId: "session-1",
			permission: {
				id: "perm-6",
				permissionType: "read",
				sessionId: "session-1",
				messageId: "msg-6",
				title: "Read file",
				metadata: {},
				createdAt: Date.now(),
			},
		});
		await waitForDrain();
		expect(runMap.get("run-perm-6")?.status).toBe("paused");

		await sessionHandler({
			type: "permission.replied",
			sessionId: "session-1",
			permissionId: "perm-6",
			response: "once",
		});
		await waitForDrain();
		expect(runMap.get("run-perm-6")?.status).toBe("running");

		await sessionHandler({
			type: "message.updated",
			sessionId: "session-1",
			message: {
				id: "msg-final",
				role: "assistant",
				content: buildOpencodeStatusLine("done"),
				parts: [],
				timestamp: Date.now(),
			},
		});
		await waitForDrain();

		expect(runMap.get("run-perm-6")?.status).toBe("completed");
	});
});
