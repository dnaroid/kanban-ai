import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Run } from "@/types/ipc";
import type { Task } from "@/server/types";

const {
	mockTaskRepo,
	mockRunRepo,
	mockProjectRepo,
	mockRoleRepo,
	mockBoardRepo,
	mockContextSnapshotRepo,
	mockRunEventRepo,
	mockArtifactRepo,
	mockPublishRunUpdate,
	mockPublishSseEvent,
	mockBuildTaskPrompt,
	mockBuildOpencodeStatusLine,
} = vi.hoisted(() => ({
	mockTaskRepo: {
		getById: vi.fn(),
		listByBoard: vi.fn(),
		update: vi.fn(),
	},
	mockRunRepo: {
		listByTask: vi.fn(),
		listAllByTask: vi.fn(),
		create: vi.fn(),
		delete: vi.fn(),
		update: vi.fn(),
	},
	mockProjectRepo: {
		getById: vi.fn(),
	},
	mockRoleRepo: {
		list: vi.fn(),
		listWithPresets: vi.fn(),
		getPresetJson: vi.fn(),
	},
	mockBoardRepo: {
		getById: vi.fn(),
		getByProjectId: vi.fn(),
	},
	mockContextSnapshotRepo: {
		create: vi.fn(),
	},
	mockRunEventRepo: {
		create: vi.fn(),
		deleteByRun: vi.fn(),
	},
	mockArtifactRepo: {
		deleteByRun: vi.fn(),
	},
	mockPublishRunUpdate: vi.fn(),
	mockPublishSseEvent: vi.fn(),
	mockBuildTaskPrompt: vi.fn(() => "test-prompt"),
	mockBuildOpencodeStatusLine: vi.fn((status: string) => `[STATUS:${status}]`),
}));

vi.mock("@/lib/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

vi.mock("@/server/repositories/task", () => ({
	taskRepo: mockTaskRepo,
}));

vi.mock("@/server/repositories/run", () => ({
	runRepo: mockRunRepo,
}));

vi.mock("@/server/repositories/project", () => ({
	projectRepo: mockProjectRepo,
}));

vi.mock("@/server/repositories/role", () => ({
	roleRepo: mockRoleRepo,
}));

vi.mock("@/server/repositories/board", () => ({
	boardRepo: mockBoardRepo,
}));

vi.mock("@/server/repositories/context-snapshot", () => ({
	contextSnapshotRepo: mockContextSnapshotRepo,
}));

vi.mock("@/server/repositories/run-event", () => ({
	runEventRepo: mockRunEventRepo,
}));

vi.mock("@/server/repositories/artifact", () => ({
	artifactRepo: mockArtifactRepo,
}));

vi.mock("@/server/run/run-publisher", () => ({
	publishRunUpdate: mockPublishRunUpdate,
}));

vi.mock("@/server/events/sse-broker", () => ({
	publishSseEvent: mockPublishSseEvent,
}));

vi.mock("@/server/run/prompts/task", () => ({
	buildTaskPrompt: mockBuildTaskPrompt,
}));

vi.mock("@/lib/opencode-status", () => ({
	buildOpencodeStatusLine: mockBuildOpencodeStatusLine,
}));

vi.mock("@/server/run/task-state-machine", async () => {
	const actual = await vi.importActual<
		typeof import("@/server/run/task-state-machine")
	>("@/server/run/task-state-machine");
	return {
		...actual,
	};
});

import { ExecutionBootstrapService } from "@/server/run/execution-bootstrap-service";

// --- Helpers ---

const NOW = new Date().toISOString();

function buildTask(overrides: Partial<Task> = {}): Task {
	return {
		id: overrides.id ?? "task-1",
		projectId: overrides.projectId ?? "project-1",
		boardId: overrides.boardId ?? "board-1",
		columnId: overrides.columnId ?? "column-1",
		title: overrides.title ?? "Test task",
		description: overrides.description ?? null,
		descriptionMd: overrides.descriptionMd ?? null,
		status: overrides.status ?? "pending",
		blockedReason: overrides.blockedReason ?? null,
		blockedReasonText: overrides.blockedReasonText ?? null,
		closedReason: overrides.closedReason ?? null,
		priority: overrides.priority ?? "normal",
		difficulty: overrides.difficulty ?? "medium",
		type: overrides.type ?? "task",
		orderInColumn: overrides.orderInColumn ?? 0,
		tags: overrides.tags ?? "[]",
		startDate: overrides.startDate ?? null,
		dueDate: overrides.dueDate ?? null,
		estimatePoints: overrides.estimatePoints ?? null,
		estimateHours: overrides.estimateHours ?? null,
		assignee: overrides.assignee ?? null,
		modelName: overrides.modelName ?? null,
		commitMessage: overrides.commitMessage ?? null,
		qaReport: overrides.qaReport ?? null,
		isGenerated: overrides.isGenerated ?? false,
		createdAt: overrides.createdAt ?? NOW,
		updatedAt: overrides.updatedAt ?? NOW,
	};
}

function buildRun(overrides: Partial<Run> = {}): Run {
	return {
		id: overrides.id ?? "run-1",
		taskId: overrides.taskId ?? "task-1",
		sessionId: overrides.sessionId ?? "",
		roleId: overrides.roleId ?? "dev",
		mode: overrides.mode ?? "execute",
		status: overrides.status ?? "queued",
		startedAt: overrides.startedAt ?? null,
		endedAt: overrides.endedAt ?? null,
		createdAt: overrides.createdAt ?? NOW,
		updatedAt: overrides.updatedAt ?? NOW,
		metadata: overrides.metadata ?? { kind: "task-run" },
	};
}

function buildBoard() {
	return {
		id: "board-1",
		projectId: "project-1",
		name: "Board",
		columns: [
			{
				id: "col-todo",
				boardId: "board-1",
				name: "Todo",
				systemKey: "todo",
				orderIndex: 0,
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: "col-ready",
				boardId: "board-1",
				name: "Ready",
				systemKey: "ready",
				orderIndex: 1,
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: "col-progress",
				boardId: "board-1",
				name: "In Progress",
				systemKey: "in_progress",
				orderIndex: 2,
				createdAt: NOW,
				updatedAt: NOW,
			},
		],
		createdAt: NOW,
		updatedAt: NOW,
	};
}

function buildProject() {
	return {
		id: "project-1",
		name: "Kanban",
		path: "/tmp/kanban",
		color: "#111111",
		createdAt: NOW,
		updatedAt: NOW,
		lastActivityAt: null,
		orderIndex: 0,
	};
}

const defaultRoles = [
	{ id: "dev", name: "Developer", preset_json: "{}" },
	{ id: "qa", name: "QA Engineer", preset_json: "{}" },
];

const defaultRolesList = [
	{ id: "dev", name: "Developer" },
	{ id: "qa", name: "QA Engineer" },
];

function createService(
	deps: {
		worktreeEnabled?: boolean;
		enqueue?: ReturnType<typeof vi.fn>;
		provisionRunWorkspace?: ReturnType<typeof vi.fn>;
		sendPrompt?: ReturnType<typeof vi.fn>;
	} = {},
) {
	const enqueue = deps.enqueue ?? vi.fn();
	const provisionRunWorkspace = deps.provisionRunWorkspace ?? vi.fn();
	const sendPrompt = deps.sendPrompt ?? vi.fn();

	const service = new ExecutionBootstrapService({
		worktreeEnabled: deps.worktreeEnabled ?? false,
		enqueue,
		provisionRunWorkspace,
		sendPrompt,
	});

	return { service, enqueue, provisionRunWorkspace, sendPrompt };
}

function setupHappyPathMocks(taskOverrides: Partial<Task> = {}) {
	const task = buildTask(taskOverrides);
	mockTaskRepo.getById.mockReturnValue(task);
	mockTaskRepo.listByBoard.mockReturnValue([]);
	mockTaskRepo.update.mockImplementation(
		(_id: string, updates: Record<string, unknown>) => ({
			...task,
			...updates,
		}),
	);
	mockRunRepo.listByTask.mockReturnValue([]);
	mockRunRepo.listAllByTask.mockReturnValue([]);
	const createdRun = buildRun({ id: "run-new", taskId: task.id });
	mockRunRepo.create.mockReturnValue(createdRun);
	mockRunRepo.update.mockImplementation(
		(runId: string, patch: Record<string, unknown>) => ({
			...createdRun,
			id: runId,
			...patch,
		}),
	);
	mockProjectRepo.getById.mockReturnValue(buildProject());
	mockRoleRepo.list.mockReturnValue(defaultRolesList);
	mockRoleRepo.listWithPresets.mockReturnValue(defaultRoles);
	mockRoleRepo.getPresetJson.mockReturnValue(null);
	mockContextSnapshotRepo.create.mockReturnValue("snapshot-1");
	mockBoardRepo.getById.mockReturnValue(buildBoard());
	mockBoardRepo.getByProjectId.mockReturnValue(buildBoard());
	return { task, createdRun };
}

// --- Tests ---

describe("ExecutionBootstrapService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ============================
	// enqueueExecutionForGeneratedTask
	// ============================
	describe("enqueueExecutionForGeneratedTask", () => {
		it("returns early when task is not found", async () => {
			mockTaskRepo.getById.mockReturnValue(null);
			const { service, enqueue } = createService();

			await service.enqueueExecutionForGeneratedTask("missing-task");

			expect(mockRunRepo.create).not.toHaveBeenCalled();
			expect(enqueue).not.toHaveBeenCalled();
		});

		it("returns early for postponed task", async () => {
			mockTaskRepo.getById.mockReturnValue(
				buildTask({ id: "task-postponed", priority: "postpone" }),
			);
			const { service, enqueue } = createService();

			await service.enqueueExecutionForGeneratedTask("task-postponed");

			expect(mockRunRepo.create).not.toHaveBeenCalled();
			expect(enqueue).not.toHaveBeenCalled();
		});

		it("returns early when an active execution run already exists", async () => {
			mockTaskRepo.getById.mockReturnValue(buildTask());
			mockRunRepo.listByTask.mockReturnValue([
				buildRun({ id: "run-active", status: "running" }),
			]);
			const { service, enqueue } = createService();

			await service.enqueueExecutionForGeneratedTask("task-1");

			expect(mockRunRepo.create).not.toHaveBeenCalled();
			expect(enqueue).not.toHaveBeenCalled();
		});

		it("returns early when project is missing", async () => {
			mockTaskRepo.getById.mockReturnValue(buildTask());
			mockRunRepo.listByTask.mockReturnValue([]);
			mockRunRepo.listAllByTask.mockReturnValue([]);
			mockProjectRepo.getById.mockReturnValue(null);
			const { service, enqueue } = createService();

			await service.enqueueExecutionForGeneratedTask("task-1");

			expect(mockRunRepo.create).not.toHaveBeenCalled();
			expect(enqueue).not.toHaveBeenCalled();
		});

		it("returns early when no roles are configured", async () => {
			mockTaskRepo.getById.mockReturnValue(buildTask());
			mockRunRepo.listByTask.mockReturnValue([]);
			mockRunRepo.listAllByTask.mockReturnValue([]);
			mockProjectRepo.getById.mockReturnValue(buildProject());
			mockRoleRepo.list.mockReturnValue([]);
			mockRoleRepo.listWithPresets.mockReturnValue([]);
			const { service, enqueue } = createService();

			await service.enqueueExecutionForGeneratedTask("task-1");

			expect(mockRunRepo.create).not.toHaveBeenCalled();
			expect(enqueue).not.toHaveBeenCalled();
		});

		it("happy path: creates snapshot, run, events, publishes, and enqueues", async () => {
			const { task, createdRun } = setupHappyPathMocks();
			const { service, enqueue } = createService();

			await service.enqueueExecutionForGeneratedTask("task-1");

			// Context snapshot created
			expect(mockContextSnapshotRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					taskId: task.id,
					kind: "run-start",
				}),
			);

			// Run created
			expect(mockRunRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					taskId: task.id,
					roleId: "dev",
					mode: "execute",
					kind: "task-run",
					contextSnapshotId: "snapshot-1",
				}),
			);

			// Status event created
			expect(mockRunEventRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					runId: createdRun.id,
					eventType: "status",
					payload: expect.objectContaining({
						status: "queued",
					}),
				}),
			);

			// Run update published
			expect(mockPublishRunUpdate).toHaveBeenCalledWith(createdRun);

			// Enqueue called with prompt and session preferences
			expect(enqueue).toHaveBeenCalledWith(
				createdRun.id,
				expect.objectContaining({
					projectPath: "/tmp/kanban",
					projectId: "project-1",
					prompt: "test-prompt",
					sessionTitle: task.title.slice(0, 120),
				}),
			);

			// buildTaskPrompt was called with task and project info
			expect(mockBuildTaskPrompt).toHaveBeenCalledWith(
				{ title: task.title, description: task.description },
				{ id: "project-1", path: "/tmp/kanban" },
				expect.objectContaining({ id: "dev", name: "Developer" }),
			);
		});
	});

	// ============================
	// enqueueExecutionForNextTask
	// ============================
	describe("enqueueExecutionForNextTask", () => {
		it("returns early when task is not found", async () => {
			mockTaskRepo.getById.mockReturnValue(null);
			const { service, enqueue } = createService();

			await service.enqueueExecutionForNextTask("missing-task");

			expect(mockRunRepo.create).not.toHaveBeenCalled();
			expect(enqueue).not.toHaveBeenCalled();
		});

		it("returns early for postponed task", async () => {
			mockTaskRepo.getById.mockReturnValue(
				buildTask({ id: "task-postponed", priority: "postpone" }),
			);
			const { service, enqueue } = createService();

			await service.enqueueExecutionForNextTask("task-postponed");

			expect(mockRunRepo.create).not.toHaveBeenCalled();
			expect(enqueue).not.toHaveBeenCalled();
		});

		it("returns early when an active execution run already exists", async () => {
			mockTaskRepo.getById.mockReturnValue(buildTask());
			mockRunRepo.listByTask.mockReturnValue([
				buildRun({ id: "run-active", status: "running" }),
			]);
			const { service, enqueue } = createService();

			await service.enqueueExecutionForNextTask("task-1");

			expect(mockRunRepo.create).not.toHaveBeenCalled();
			expect(enqueue).not.toHaveBeenCalled();
		});

		it("returns early when project is missing", async () => {
			mockTaskRepo.getById.mockReturnValue(buildTask());
			mockRunRepo.listByTask.mockReturnValue([]);
			mockRunRepo.listAllByTask.mockReturnValue([]);
			mockProjectRepo.getById.mockReturnValue(null);
			const { service, enqueue } = createService();

			await service.enqueueExecutionForNextTask("task-1");

			expect(mockRunRepo.create).not.toHaveBeenCalled();
			expect(enqueue).not.toHaveBeenCalled();
		});

		it("returns early when no roles are configured", async () => {
			mockTaskRepo.getById.mockReturnValue(buildTask());
			mockRunRepo.listByTask.mockReturnValue([]);
			mockRunRepo.listAllByTask.mockReturnValue([]);
			mockProjectRepo.getById.mockReturnValue(buildProject());
			mockRoleRepo.list.mockReturnValue([]);
			mockRoleRepo.listWithPresets.mockReturnValue([]);
			const { service, enqueue } = createService();

			await service.enqueueExecutionForNextTask("task-1");

			expect(mockRunRepo.create).not.toHaveBeenCalled();
			expect(enqueue).not.toHaveBeenCalled();
		});

		it("happy path: transitions task, creates snapshot with auto-start summary, and enqueues", async () => {
			const { task, createdRun } = setupHappyPathMocks();
			const { service, enqueue } = createService();

			await service.enqueueExecutionForNextTask("task-1");

			// Snapshot contains auto-start summary
			expect(mockContextSnapshotRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					taskId: task.id,
					kind: "run-start",
					summary: expect.stringContaining("Auto-started after merge"),
				}),
			);

			// Snapshot payload has auto-start-after-merge reason
			const snapshotCall = mockContextSnapshotRepo.create.mock.calls[0][0] as {
				payload: { reason: string };
			};
			expect(snapshotCall.payload.reason).toBe("auto-start-after-merge");

			// Run event created
			expect(mockRunEventRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					runId: createdRun.id,
					eventType: "status",
				}),
			);

			// Task transitioned to in_progress
			expect(mockTaskRepo.update).toHaveBeenCalledWith(
				task.id,
				expect.objectContaining({ status: "running" }),
			);

			// Enqueue called
			expect(enqueue).toHaveBeenCalledWith(
				createdRun.id,
				expect.objectContaining({
					projectPath: "/tmp/kanban",
					projectId: "project-1",
					prompt: "test-prompt",
				}),
			);
		});
	});

	// ============================
	// transitionTaskToInProgress
	// ============================
	describe("transitionTaskToInProgress", () => {
		it("updates status, columnId, and orderInColumn when board has in_progress column", () => {
			const task = buildTask({ id: "task-1", boardId: "board-1" });
			const board = buildBoard();
			mockBoardRepo.getById.mockReturnValue(board);
			mockTaskRepo.listByBoard.mockReturnValue([]);

			const { service } = createService();
			service.transitionTaskToInProgress(task);

			expect(mockTaskRepo.update).toHaveBeenCalledWith("task-1", {
				status: "running",
				columnId: "col-progress",
				orderInColumn: 0,
			});
		});

		it("only updates status when board has no in_progress column", () => {
			const task = buildTask({ id: "task-2", boardId: "board-2" });
			const board = {
				...buildBoard(),
				id: "board-2",
				columns: [
					{
						id: "col-todo",
						boardId: "board-2",
						name: "Todo",
						systemKey: "todo",
						orderIndex: 0,
						createdAt: NOW,
						updatedAt: NOW,
					},
				],
			};
			mockBoardRepo.getById.mockReturnValue(board);

			const { service } = createService();
			service.transitionTaskToInProgress(task);

			expect(mockTaskRepo.update).toHaveBeenCalledWith("task-2", {
				status: "running",
			});
		});

		it("publishes SSE event", () => {
			const task = buildTask({
				id: "task-3",
				boardId: "board-3",
				projectId: "project-1",
			});
			mockBoardRepo.getById.mockReturnValue(null);
			mockBoardRepo.getByProjectId.mockReturnValue(null);

			const { service } = createService();
			service.transitionTaskToInProgress(task);

			expect(mockPublishSseEvent).toHaveBeenCalledWith(
				"task:event",
				expect.objectContaining({
					taskId: "task-3",
					boardId: "board-3",
					projectId: "project-1",
					eventType: "task:updated",
				}),
			);
		});
	});

	// ============================
	// resumeRejectedTaskRun
	// ============================
	describe("resumeRejectedTaskRun", () => {
		it("returns false if task is not rejected", async () => {
			const task = buildTask({ status: "pending" });
			const { service, sendPrompt } = createService();

			const result = await service.resumeRejectedTaskRun(task);

			expect(result).toBe(false);
			expect(sendPrompt).not.toHaveBeenCalled();
		});

		it("returns false if task is rejected but has no qaReport", async () => {
			const task = buildTask({ status: "rejected", qaReport: null });
			const { service, sendPrompt } = createService();

			const result = await service.resumeRejectedTaskRun(task);

			expect(result).toBe(false);
			expect(sendPrompt).not.toHaveBeenCalled();
		});

		it("returns false if no completed execution run with sessionId", async () => {
			const task = buildTask({
				status: "rejected",
				qaReport: "Fix bugs",
			});
			mockRunRepo.listAllByTask.mockReturnValue([]);
			mockRunRepo.listByTask.mockReturnValue([]);

			const { service, sendPrompt } = createService();
			const result = await service.resumeRejectedTaskRun(task);

			expect(result).toBe(false);
			expect(sendPrompt).not.toHaveBeenCalled();
		});

		it("returns false if board not found", async () => {
			const task = buildTask({
				id: "task-r",
				status: "rejected",
				qaReport: "Fix bugs",
			});
			const completedRun = buildRun({
				id: "run-completed",
				taskId: "task-r",
				status: "completed",
				sessionId: "session-1",
				metadata: { kind: "task-run" },
			});
			mockRunRepo.listAllByTask.mockReturnValue([completedRun]);
			mockRunRepo.listByTask.mockReturnValue([completedRun]);
			mockBoardRepo.getById.mockReturnValue(null);
			mockBoardRepo.getByProjectId.mockReturnValue(null);

			const { service, sendPrompt } = createService();
			const result = await service.resumeRejectedTaskRun(task);

			expect(result).toBe(false);
			expect(sendPrompt).not.toHaveBeenCalled();
		});

		it("happy path: sends prompt, updates run and task, creates events, returns true", async () => {
			const task = buildTask({
				id: "task-rej",
				boardId: "board-1",
				projectId: "project-1",
				status: "rejected",
				qaReport: "Fix all failing checks",
			});
			const completedRun = buildRun({
				id: "run-done",
				taskId: "task-rej",
				status: "completed",
				sessionId: "session-done",
				metadata: { kind: "task-run" },
			});
			const resumedRun = buildRun({
				id: "run-done",
				taskId: "task-rej",
				status: "running",
				sessionId: "session-done",
			});

			mockRunRepo.listAllByTask.mockReturnValue([completedRun]);
			mockRunRepo.listByTask.mockReturnValue([completedRun]);
			mockBoardRepo.getById.mockReturnValue(buildBoard());
			mockTaskRepo.listByBoard.mockReturnValue([]);
			mockRunRepo.update.mockReturnValue(resumedRun);
			mockTaskRepo.update.mockReturnValue({
				...task,
				status: "running",
				qaReport: null,
			});

			const { service, sendPrompt } = createService();
			const result = await service.resumeRejectedTaskRun(task);

			expect(result).toBe(true);

			// sendPrompt called with qaReport in message
			expect(sendPrompt).toHaveBeenCalledWith(
				"session-done",
				expect.stringContaining("Fix all failing checks"),
			);

			// Run updated to running
			expect(mockRunRepo.update).toHaveBeenCalledWith(
				"run-done",
				expect.objectContaining({
					status: "running",
					finishedAt: null,
					errorText: "",
				}),
			);

			// Task updated to running with qaReport null
			expect(mockTaskRepo.update).toHaveBeenCalledWith(
				"task-rej",
				expect.objectContaining({
					status: "running",
					qaReport: null,
				}),
			);

			// Run event created
			expect(mockRunEventRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					runId: "run-done",
					eventType: "status",
					payload: expect.objectContaining({
						status: "running",
						message: "Execution run resumed after QA rejection",
					}),
				}),
			);

			// publishRunUpdate called
			expect(mockPublishRunUpdate).toHaveBeenCalledWith(resumedRun);

			// publishSseEvent called
			expect(mockPublishSseEvent).toHaveBeenCalledWith(
				"task:event",
				expect.objectContaining({
					taskId: "task-rej",
					eventType: "task:updated",
				}),
			);
		});
	});

	// ============================
	// prepareTaskRunForTask
	// ============================
	describe("prepareTaskRunForTask", () => {
		it("creates new run when no current run exists", () => {
			mockRunRepo.listAllByTask.mockReturnValue([]);
			mockRunRepo.listByTask.mockReturnValue([]);
			const newRun = buildRun({ id: "run-fresh" });
			mockRunRepo.create.mockReturnValue(newRun);

			const { service } = createService();
			const result = service.prepareTaskRunForTask({
				taskId: "task-1",
				roleId: "dev",
				mode: "execute",
				kind: "task-run",
				contextSnapshotId: "snap-1",
			});

			expect(result).toBe(newRun);
			expect(mockRunRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					taskId: "task-1",
					roleId: "dev",
					mode: "execute",
					kind: "task-run",
					contextSnapshotId: "snap-1",
					metadata: {},
				}),
			);
		});

		it("resets existing run when one already exists", () => {
			const existingRun = buildRun({ id: "run-existing", status: "completed" });
			const resetRun = buildRun({ id: "run-existing", status: "queued" });
			mockRunRepo.listAllByTask.mockReturnValue([existingRun]);
			mockRunRepo.listByTask.mockReturnValue([existingRun]);
			mockRunRepo.update.mockReturnValue(resetRun);

			const { service } = createService();
			const result = service.prepareTaskRunForTask({
				taskId: "task-1",
				roleId: "dev",
				mode: "execute",
				kind: "task-run",
				contextSnapshotId: "snap-1",
			});

			expect(result).toBe(resetRun);
			expect(mockRunRepo.update).toHaveBeenCalledWith(
				"run-existing",
				expect.objectContaining({
					status: "queued",
					sessionId: "",
					errorText: "",
					mode: "execute",
					roleId: "dev",
				}),
			);
			// No create call since we're resetting
			expect(mockRunRepo.create).not.toHaveBeenCalled();
		});

		it("deletes extra runs beyond the first", () => {
			const run1 = buildRun({ id: "run-1" });
			const run2 = buildRun({ id: "run-2" });
			const run3 = buildRun({ id: "run-3" });
			mockRunRepo.listAllByTask.mockReturnValue([run1, run2, run3]);
			mockRunRepo.listByTask.mockReturnValue([run1]);
			const resetRun = buildRun({ id: "run-1", status: "queued" });
			mockRunRepo.update.mockReturnValue(resetRun);

			const { service } = createService();
			service.prepareTaskRunForTask({
				taskId: "task-1",
				roleId: "dev",
				mode: "execute",
				kind: "task-run",
				contextSnapshotId: "snap-1",
			});

			// Extra runs should be deleted
			expect(mockRunRepo.delete).toHaveBeenCalledWith("run-2");
			expect(mockRunRepo.delete).toHaveBeenCalledWith("run-3");
		});
	});

	// ============================
	// parseTaskTags
	// ============================
	describe("parseTaskTags", () => {
		it("parses valid JSON array of strings", () => {
			const { service } = createService();
			const result = service.parseTaskTags('["foo", "bar", "baz"]');
			expect(result).toEqual(["foo", "bar", "baz"]);
		});

		it("returns empty array for invalid JSON", () => {
			const { service } = createService();
			const result = service.parseTaskTags("not-json");
			expect(result).toEqual([]);
		});

		it("returns empty array for empty string", () => {
			const { service } = createService();
			const result = service.parseTaskTags("");
			expect(result).toEqual([]);
		});

		it("returns empty array for non-array JSON", () => {
			const { service } = createService();
			const result = service.parseTaskTags('{"key": "value"}');
			expect(result).toEqual([]);
		});

		it("filters out non-string values from parsed array", () => {
			const { service } = createService();
			const result = service.parseTaskTags(
				'["valid", 123, true, null, "also-valid"]',
			);
			expect(result).toEqual(["valid", "also-valid"]);
		});

		it("trims whitespace from tag values", () => {
			const { service } = createService();
			const result = service.parseTaskTags('["  spaced  ", " normal"]');
			expect(result).toEqual(["spaced", "normal"]);
		});
	});

	// ============================
	// resolveAssignedRoleIdFromTags
	// ============================
	describe("resolveAssignedRoleIdFromTags", () => {
		it("returns role id for agent:dev tag", () => {
			mockRoleRepo.list.mockReturnValue(defaultRolesList);
			const { service } = createService();
			const result = service.resolveAssignedRoleIdFromTags(["agent:dev"]);
			expect(result).toBe("dev");
		});

		it("returns null when no agent tag is present", () => {
			mockRoleRepo.list.mockReturnValue(defaultRolesList);
			const { service } = createService();
			const result = service.resolveAssignedRoleIdFromTags([
				"feature",
				"urgent",
			]);
			expect(result).toBe(null);
		});

		it("returns null for agent tag with unknown role", () => {
			mockRoleRepo.list.mockReturnValue(defaultRolesList);
			const { service } = createService();
			const result = service.resolveAssignedRoleIdFromTags(["agent:unknown"]);
			expect(result).toBe(null);
		});

		it("is case-insensitive for agent: prefix", () => {
			mockRoleRepo.list.mockReturnValue(defaultRolesList);
			const { service } = createService();
			const result = service.resolveAssignedRoleIdFromTags(["Agent:dev"]);
			expect(result).toBe("dev");
		});
	});

	// ============================
	// parseRolePreset
	// ============================
	describe("parseRolePreset", () => {
		it("returns null for null input", () => {
			const { service } = createService();
			const result = service.parseRolePreset(null);
			expect(result).toBe(null);
		});

		it("parses valid JSON and applies defaults", () => {
			const { service } = createService();
			const result = service.parseRolePreset(
				JSON.stringify({
					systemPrompt: "You are a dev agent",
					skills: ["coding", "testing"],
				}),
			);
			expect(result).toEqual({
				version: "1.0",
				provider: "",
				modelName: "",
				skills: ["coding", "testing"],
				systemPrompt: "You are a dev agent",
				mustDo: [],
				outputContract: [],
			});
		});

		it("returns null for invalid JSON", () => {
			const { service } = createService();
			const result = service.parseRolePreset("{bad json");
			expect(result).toBe(null);
		});

		it("handles empty JSON object with full defaults", () => {
			const { service } = createService();
			const result = service.parseRolePreset("{}");
			expect(result).toEqual({
				version: "1.0",
				provider: "",
				modelName: "",
				skills: [],
				systemPrompt: "",
				mustDo: [],
				outputContract: [],
			});
		});

		it("filters non-string values from skills array", () => {
			const { service } = createService();
			const result = service.parseRolePreset(
				JSON.stringify({ skills: ["valid", 42, null, "also-valid"] }),
			);
			expect(result?.skills).toEqual(["valid", "also-valid"]);
		});
	});

	// ============================
	// toSessionPreferences
	// ============================
	describe("toSessionPreferences", () => {
		it("returns undefined for null role", () => {
			const { service } = createService();
			const result = service.toSessionPreferences(null);
			expect(result).toBeUndefined();
		});

		it("returns correct preferences when role has preferred_model_name", () => {
			const { service } = createService();
			const result = service.toSessionPreferences({
				preferred_model_name: "gpt-5",
				preferred_model_variant: "fast",
				preferred_llm_agent: "code-agent",
			});
			expect(result).toEqual({
				preferredModelName: "gpt-5",
				preferredModelVariant: "fast",
				preferredLlmAgent: "code-agent",
			});
		});

		it("returns undefined when everything is empty/null", () => {
			const { service } = createService();
			const result = service.toSessionPreferences({
				preferred_model_name: null,
				preferred_model_variant: null,
				preferred_llm_agent: null,
			});
			expect(result).toBeUndefined();
		});

		it("returns undefined for empty object", () => {
			const { service } = createService();
			const result = service.toSessionPreferences({});
			expect(result).toBeUndefined();
		});

		it("ignores whitespace-only model name", () => {
			const { service } = createService();
			const result = service.toSessionPreferences({
				preferred_model_name: "   ",
			});
			expect(result).toBeUndefined();
		});

		it("extracts model name and agent from presetJson when role has no preferred_model_name", () => {
			const { service } = createService();
			const result = service.toSessionPreferences(
				{ preferred_model_name: null },
				JSON.stringify({ modelName: "claude-5", llmAgent: "dev-agent" }),
			);
			expect(result).toEqual({
				preferredModelName: "claude-5",
				preferredModelVariant: undefined,
				preferredLlmAgent: "dev-agent",
			});
		});
	});
});
