import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskStatusProjectionServiceDeps } from "@/server/run/task-status-projection-service";
import type { Task, Board, BoardColumn } from "@/server/types";
import type { Run } from "@/types/ipc";

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

function buildTask(
	input: Partial<Task> & Pick<Task, "id" | "title" | "columnId" | "status">,
): Task {
	const now = new Date().toISOString();
	return {
		id: input.id,
		projectId: input.projectId ?? "project-1",
		boardId: input.boardId ?? "board-1",
		columnId: input.columnId,
		title: input.title,
		description: null,
		descriptionMd: null,
		status: input.status,
		blockedReason: null,
		blockedReasonText: null,
		closedReason: null,
		priority: input.priority ?? "normal",
		difficulty: "medium",
		type: "task",
		orderInColumn: input.orderInColumn ?? 0,
		tags: "[]",
		startDate: null,
		dueDate: null,
		estimatePoints: null,
		estimateHours: null,
		assignee: null,
		modelName: null,
		commitMessage: null,
		qaReport: null,
		isGenerated: false,
		wasQaRejected: false,
		createdAt: input.createdAt ?? now,
		updatedAt: input.updatedAt ?? now,
	};
}

function buildRun(
	input: Partial<Run> & Pick<Run, "id" | "taskId" | "status">,
): Run {
	const now = new Date().toISOString();
	return {
		id: input.id,
		taskId: input.taskId,
		sessionId: input.sessionId ?? "",
		roleId: input.roleId ?? "dev",
		mode: input.mode ?? "execute",
		status: input.status,
		startedAt: input.startedAt ?? null,
		endedAt: input.endedAt ?? null,
		createdAt: input.createdAt ?? now,
		updatedAt: input.updatedAt ?? now,
		metadata: input.metadata ?? {},
	};
}

function buildBoard(input: Partial<Board> & { id?: string } = {}): Board {
	const id = input.id ?? "board-1";
	const now = new Date().toISOString();
	const defaultColumns: BoardColumn[] = [
		{
			id: "col-backlog",
			boardId: id,
			name: "Backlog",
			systemKey: "backlog",
			orderIndex: 0,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: "col-ready",
			boardId: id,
			name: "Ready",
			systemKey: "ready",
			orderIndex: 1,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: "col-deferred",
			boardId: id,
			name: "Deferred",
			systemKey: "deferred",
			orderIndex: 2,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: "col-in-progress",
			boardId: id,
			name: "In Progress",
			systemKey: "in_progress",
			orderIndex: 3,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: "col-blocked",
			boardId: id,
			name: "Blocked",
			systemKey: "blocked",
			orderIndex: 4,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: "col-review",
			boardId: id,
			name: "Review",
			systemKey: "review",
			orderIndex: 5,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: "col-closed",
			boardId: id,
			name: "Closed",
			systemKey: "closed",
			orderIndex: 6,
			createdAt: now,
			updatedAt: now,
		},
	];
	return {
		id,
		projectId: input.projectId ?? "project-1",
		name: input.name ?? "Test Board",
		columns: input.columns ?? defaultColumns,
		createdAt: now,
		updatedAt: now,
	};
}

// ---------------------------------------------------------------------------
// Hoisted mock stores and repo stubs
// ---------------------------------------------------------------------------

const {
	mockBoardRepo,
	mockTaskRepo,
	mockRunRepo,
	boardStore,
	tasksByBoardStore,
	runsByStatusStore,
	runsByTaskStore,
	mockGetWorkflowColumnSystemKey,
	mockDeriveMetaStatus,
} = vi.hoisted(() => {
	const boardStore = new Map<string, Board>();
	const tasksByBoardStore = new Map<string, Task[]>();
	const runsByStatusStore = new Map<string, Run[]>();
	const runsByTaskStore = new Map<string, Run[]>();

	const mockBoardRepo = {
		getByProjectId: vi.fn(
			(projectId: string) => boardStore.get(projectId) ?? null,
		),
	};

	const mockTaskRepo = {
		listByBoard: vi.fn(
			(boardId: string) => tasksByBoardStore.get(boardId) ?? [],
		),
	};

	const mockRunRepo = {
		listByStatus: vi.fn(
			(status: string) => runsByStatusStore.get(status) ?? [],
		),
		listByTask: vi.fn((taskId: string) => runsByTaskStore.get(taskId) ?? []),
	};

	const mockGetWorkflowColumnSystemKey = vi.fn();
	const mockDeriveMetaStatus = vi.fn();

	return {
		mockBoardRepo,
		mockTaskRepo,
		mockRunRepo,
		boardStore,
		tasksByBoardStore,
		runsByStatusStore,
		runsByTaskStore,
		mockGetWorkflowColumnSystemKey,
		mockDeriveMetaStatus,
	};
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

vi.mock("@/server/repositories/board", () => ({
	boardRepo: mockBoardRepo,
}));

vi.mock("@/server/repositories/task", () => ({
	taskRepo: mockTaskRepo,
}));

vi.mock("@/server/repositories/run", () => ({
	runRepo: mockRunRepo,
}));

vi.mock("@/server/run/task-state-machine", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/server/run/task-state-machine")>();
	return {
		...actual,
		getWorkflowColumnSystemKey:
			mockGetWorkflowColumnSystemKey.mockImplementation(
				actual.getWorkflowColumnSystemKey,
			),
	};
});

vi.mock("@/server/run/run-session-interpreter", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/server/run/run-session-interpreter")
		>();
	return {
		...actual,
		deriveMetaStatus: mockDeriveMetaStatus,
	};
});

// ---------------------------------------------------------------------------
// Import the system under test (after mocks are registered)
// ---------------------------------------------------------------------------

import { TaskStatusProjectionService } from "@/server/run/task-status-projection-service";

// ---------------------------------------------------------------------------
// Deps factory helper
// ---------------------------------------------------------------------------

function buildDeps(
	overrides: Partial<TaskStatusProjectionServiceDeps> = {},
): TaskStatusProjectionServiceDeps {
	return {
		sessionManager: {
			inspectSession: vi.fn(),
		},
		runFinalizer: {
			staleRunFallbackMarker: vi.fn(() => "done" as const),
			hydrateOutcomeContent: vi.fn(
				async (_run: Run, content: string) => content,
			),
			resolveTriggerFromOutcome: vi.fn(() => "run:done" as const),
		},
		runReconciliationService: {
			reconcileStaleRun: vi.fn(),
		},
		applyTaskTransition: vi.fn(),
		isGenerationRun: vi.fn(() => false),
		isStoryChatRun: vi.fn(() => false),
		staleRunThresholdMs: 30 * 60 * 1000,
		manualStatusGraceMs: 60 * 1000,
		isNetworkError: vi.fn(() => false),
		getRunErrorText: vi.fn(() => ""),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Helper to create a date string N ms ago
// ---------------------------------------------------------------------------

function msAgo(ms: number): string {
	return new Date(Date.now() - ms).toISOString();
}

// ===================================================================
// Tests
// ===================================================================

describe("TaskStatusProjectionService", () => {
	beforeEach(() => {
		boardStore.clear();
		tasksByBoardStore.clear();
		runsByStatusStore.clear();
		runsByTaskStore.clear();
		vi.restoreAllMocks();

		mockGetWorkflowColumnSystemKey.mockClear();
		mockDeriveMetaStatus.mockReset();
	});

	// ----------------------------------------------------------------
	// getPollableBoardContext
	// ----------------------------------------------------------------

	describe("getPollableBoardContext", () => {
		it("returns null if board not found", () => {
			const service = new TaskStatusProjectionService(buildDeps());
			const result = service.getPollableBoardContext("missing-project");
			expect(result).toBeNull();
		});

		it("excludes deferred and closed columns from taskIds", () => {
			const board = buildBoard({ id: "board-1", projectId: "project-1" });
			boardStore.set("project-1", board);

			const tasks = [
				buildTask({
					id: "t-ready",
					columnId: "col-ready",
					status: "pending",
					title: "Ready task",
				}),
				buildTask({
					id: "t-deferred",
					columnId: "col-deferred",
					status: "pending",
					title: "Deferred task",
				}),
				buildTask({
					id: "t-closed",
					columnId: "col-closed",
					status: "done",
					title: "Closed task",
				}),
			];
			tasksByBoardStore.set("board-1", tasks);

			const service = new TaskStatusProjectionService(buildDeps());
			const ctx = service.getPollableBoardContext("project-1");

			expect(ctx).not.toBeNull();
			expect(ctx!.taskIds.has("t-ready")).toBe(true);
			expect(ctx!.taskIds.has("t-deferred")).toBe(false);
			expect(ctx!.taskIds.has("t-closed")).toBe(false);
		});

		it("correctly builds allTaskIds (all tasks) and taskIds (filtered tasks)", () => {
			const board = buildBoard({ id: "board-1", projectId: "project-1" });
			boardStore.set("project-1", board);

			const tasks = [
				buildTask({
					id: "t-backlog",
					columnId: "col-backlog",
					status: "pending",
					title: "Backlog task",
				}),
				buildTask({
					id: "t-ready",
					columnId: "col-ready",
					status: "pending",
					title: "Ready task",
				}),
				buildTask({
					id: "t-deferred",
					columnId: "col-deferred",
					status: "pending",
					title: "Deferred task",
				}),
				buildTask({
					id: "t-closed",
					columnId: "col-closed",
					status: "done",
					title: "Closed task",
				}),
			];
			tasksByBoardStore.set("board-1", tasks);

			const service = new TaskStatusProjectionService(buildDeps());
			const ctx = service.getPollableBoardContext("project-1");

			expect(ctx).not.toBeNull();
			expect(ctx!.allTaskIds).toEqual(
				new Set(["t-backlog", "t-ready", "t-deferred", "t-closed"]),
			);
			expect(ctx!.taskIds).toEqual(new Set(["t-backlog", "t-ready"]));
		});
	});

	// ----------------------------------------------------------------
	// listRecoverableRunsForProject
	// ----------------------------------------------------------------

	describe("listRecoverableRunsForProject", () => {
		it("returns only failed runs with sessionId and errorText == 'fetch failed'", () => {
			const matching = buildRun({
				id: "run-ok",
				taskId: "task-1",
				status: "failed",
				sessionId: "sess-1",
			});
			const noSession = buildRun({
				id: "run-no-session",
				taskId: "task-1",
				status: "failed",
				sessionId: "",
			});
			const wrongError = buildRun({
				id: "run-wrong-error",
				taskId: "task-1",
				status: "failed",
				sessionId: "sess-2",
			});
			runsByStatusStore.set("failed", [matching, noSession, wrongError]);

			const deps = buildDeps({
				getRunErrorText: vi.fn((run: Run) => {
					if (run.id === "run-ok") return "fetch failed";
					if (run.id === "run-wrong-error") return "timeout";
					return "";
				}),
			});

			const service = new TaskStatusProjectionService(deps);
			const taskIds = new Set(["task-1"]);
			const result = service.listRecoverableRunsForProject(taskIds);

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("run-ok");
		});

		it("does not include runs for other taskIds", () => {
			const run = buildRun({
				id: "run-other",
				taskId: "task-other",
				status: "failed",
				sessionId: "sess-x",
			});
			runsByStatusStore.set("failed", [run]);

			const deps = buildDeps({
				getRunErrorText: vi.fn(() => "fetch failed"),
			});

			const service = new TaskStatusProjectionService(deps);
			const taskIds = new Set(["task-1"]);
			const result = service.listRecoverableRunsForProject(taskIds);

			expect(result).toHaveLength(0);
		});

		it("does not include runs without sessionId", () => {
			const run = buildRun({
				id: "run-empty-session",
				taskId: "task-1",
				status: "failed",
				sessionId: "   ",
			});
			runsByStatusStore.set("failed", [run]);

			const deps = buildDeps({
				getRunErrorText: vi.fn(() => "fetch failed"),
			});

			const service = new TaskStatusProjectionService(deps);
			const taskIds = new Set(["task-1"]);
			const result = service.listRecoverableRunsForProject(taskIds);

			expect(result).toHaveLength(0);
		});
	});

	// ----------------------------------------------------------------
	// reconcileTaskWithActiveRuns
	// ----------------------------------------------------------------

	describe("reconcileTaskWithActiveRuns", () => {
		it("active running non-generation run calls applyTaskTransition with trigger 'run:start'", () => {
			const applyTaskTransition = vi.fn();
			const run = buildRun({
				id: "run-1",
				taskId: "task-1",
				status: "running",
			});
			const task = buildTask({
				id: "task-1",
				columnId: "col-ready",
				status: "pending",
				title: "Task",
			});

			const deps = buildDeps({
				applyTaskTransition,
				isGenerationRun: vi.fn(() => false),
			});
			const service = new TaskStatusProjectionService(deps);
			service.reconcileTaskWithActiveRuns(task, [run]);

			expect(applyTaskTransition).toHaveBeenCalledWith(run, "run:start", "");
		});

		it("active running generation run calls applyTaskTransition with trigger 'generate:start'", () => {
			const applyTaskTransition = vi.fn();
			const run = buildRun({
				id: "run-gen",
				taskId: "task-1",
				status: "running",
			});
			const task = buildTask({
				id: "task-1",
				columnId: "col-backlog",
				status: "pending",
				title: "Gen task",
			});

			const deps = buildDeps({
				applyTaskTransition,
				isGenerationRun: vi.fn(() => true),
			});
			const service = new TaskStatusProjectionService(deps);
			service.reconcileTaskWithActiveRuns(task, [run]);

			expect(applyTaskTransition).toHaveBeenCalledWith(
				run,
				"generate:start",
				"",
			);
		});

		it("paused run calls applyTaskTransition with 'run:question'", () => {
			const applyTaskTransition = vi.fn();
			const run = buildRun({
				id: "run-paused",
				taskId: "task-1",
				status: "paused",
			});
			const task = buildTask({
				id: "task-1",
				columnId: "col-in-progress",
				status: "running",
				title: "Task",
			});

			const service = new TaskStatusProjectionService(
				buildDeps({ applyTaskTransition }),
			);
			service.reconcileTaskWithActiveRuns(task, [run]);

			expect(applyTaskTransition).toHaveBeenCalledWith(
				run,
				"run:question",
				"Run paused awaiting input",
			);
		});

		it("does NOT call transition if task already in correct status", () => {
			const applyTaskTransition = vi.fn();
			const run = buildRun({
				id: "run-1",
				taskId: "task-1",
				status: "running",
			});

			const taskRunning = buildTask({
				id: "task-1",
				columnId: "col-in-progress",
				status: "running",
				title: "Running task",
			});

			const deps = buildDeps({
				applyTaskTransition,
				isGenerationRun: vi.fn(() => false),
			});
			const service = new TaskStatusProjectionService(deps);
			service.reconcileTaskWithActiveRuns(taskRunning, [run]);

			expect(applyTaskTransition).not.toHaveBeenCalled();
		});

		it("does NOT call transition for paused run if task already in 'question' status", () => {
			const applyTaskTransition = vi.fn();
			const run = buildRun({
				id: "run-paused",
				taskId: "task-1",
				status: "paused",
			});
			const task = buildTask({
				id: "task-1",
				columnId: "col-blocked",
				status: "question",
				title: "Question task",
			});

			const service = new TaskStatusProjectionService(
				buildDeps({ applyTaskTransition }),
			);
			service.reconcileTaskWithActiveRuns(task, [run]);

			expect(applyTaskTransition).not.toHaveBeenCalled();
		});
	});

	// ----------------------------------------------------------------
	// isRunStale
	// ----------------------------------------------------------------

	describe("isRunStale", () => {
		it("returns false for non-running status", () => {
			const service = new TaskStatusProjectionService(
				buildDeps({ staleRunThresholdMs: 30 * 60 * 1000 }),
			);
			const run = buildRun({
				id: "run-1",
				taskId: "task-1",
				status: "completed",
			});
			expect(service.isRunStale(run)).toBe(false);
		});

		it("returns false for fresh running run (within threshold)", () => {
			const service = new TaskStatusProjectionService(
				buildDeps({ staleRunThresholdMs: 30 * 60 * 1000 }),
			);
			const run = buildRun({
				id: "run-1",
				taskId: "task-1",
				status: "running",
				startedAt: msAgo(5 * 60 * 1000),
			});
			expect(service.isRunStale(run)).toBe(false);
		});

		it("returns true for stale running run (past threshold)", () => {
			const service = new TaskStatusProjectionService(
				buildDeps({ staleRunThresholdMs: 30 * 60 * 1000 }),
			);
			const run = buildRun({
				id: "run-1",
				taskId: "task-1",
				status: "running",
				startedAt: msAgo(60 * 60 * 1000),
			});
			expect(service.isRunStale(run)).toBe(true);
		});
	});

	// ----------------------------------------------------------------
	// reconcileTaskStatuses
	// ----------------------------------------------------------------

	describe("reconcileTaskStatuses", () => {
		const board = buildBoard({ id: "board-1", projectId: "project-1" });

		it("skips task if updatedAt is within manualStatusGraceMs", async () => {
			const applyTaskTransition = vi.fn();
			const task = buildTask({
				id: "task-1",
				columnId: "col-ready",
				status: "pending",
				title: "Recent task",
				updatedAt: msAgo(30 * 1000), // 30s ago, well within 60s grace
			});

			const service = new TaskStatusProjectionService(
				buildDeps({
					applyTaskTransition,
					manualStatusGraceMs: 60 * 1000,
				}),
			);

			await service.reconcileTaskStatuses("project-1", board, [task]);
			expect(applyTaskTransition).not.toHaveBeenCalled();
		});

		it("calls reconcileTaskWithActiveRuns when non-stale active run exists", async () => {
			const applyTaskTransition = vi.fn();
			const task = buildTask({
				id: "task-1",
				columnId: "col-ready",
				status: "pending",
				title: "Task",
				updatedAt: msAgo(5 * 60 * 1000),
			});

			const activeRun = buildRun({
				id: "run-active",
				taskId: "task-1",
				status: "running",
				startedAt: msAgo(5 * 60 * 1000),
			});
			runsByTaskStore.set("task-1", [activeRun]);

			const deps = buildDeps({
				applyTaskTransition,
				isGenerationRun: vi.fn(() => false),
				staleRunThresholdMs: 30 * 60 * 1000,
			});
			const service = new TaskStatusProjectionService(deps);

			await service.reconcileTaskStatuses("project-1", board, [task]);

			expect(applyTaskTransition).toHaveBeenCalledWith(
				activeRun,
				"run:start",
				"",
			);
		});

		it("calls reconcileStaleRun when only stale active runs exist", async () => {
			const reconcileStaleRun = vi.fn();
			const task = buildTask({
				id: "task-1",
				columnId: "col-in-progress",
				status: "running",
				title: "Task",
				updatedAt: msAgo(5 * 60 * 1000),
			});

			const staleRun = buildRun({
				id: "run-stale",
				taskId: "task-1",
				status: "running",
				startedAt: msAgo(60 * 60 * 1000),
			});
			runsByTaskStore.set("task-1", [staleRun]);

			const deps = buildDeps({
				runReconciliationService: { reconcileStaleRun },
				staleRunThresholdMs: 30 * 60 * 1000,
			});
			const service = new TaskStatusProjectionService(deps);

			await service.reconcileTaskStatuses("project-1", board, [task]);

			expect(reconcileStaleRun).toHaveBeenCalledWith(
				staleRun,
				"project-1",
				"task-1",
			);
		});

		it("completed run with terminal session inspection calls applyTaskTransition with correct trigger", async () => {
			const applyTaskTransition = vi.fn();
			const task = buildTask({
				id: "task-1",
				columnId: "col-in-progress",
				status: "running",
				title: "Task",
				updatedAt: msAgo(5 * 60 * 1000),
			});

			const completedRun = buildRun({
				id: "run-done",
				taskId: "task-1",
				status: "completed",
				sessionId: "sess-1",
			});
			runsByTaskStore.set("task-1", [completedRun]);

			mockDeriveMetaStatus.mockReturnValue({
				kind: "completed",
				marker: "done",
				content: "Task finished successfully",
			});

			const hydrateOutcomeContent = vi.fn(async (_r: Run, c: string) => c);
			const resolveTriggerFromOutcome = vi.fn(() => "run:done" as const);

			const deps = buildDeps({
				applyTaskTransition,
				runFinalizer: {
					staleRunFallbackMarker: vi.fn(),
					hydrateOutcomeContent,
					resolveTriggerFromOutcome,
				},
			});
			const service = new TaskStatusProjectionService(deps);

			await service.reconcileTaskStatuses("project-1", board, [task]);

			expect(hydrateOutcomeContent).toHaveBeenCalledWith(
				completedRun,
				"Task finished successfully",
			);
			expect(resolveTriggerFromOutcome).toHaveBeenCalledWith(
				completedRun,
				"completed",
				{ marker: "done", content: "Task finished successfully" },
			);
			expect(applyTaskTransition).toHaveBeenCalledWith(
				completedRun,
				"run:done",
				"Task finished successfully",
			);
		});

		it("completed run with non-terminal session inspection falls back to staleRunFallbackMarker", async () => {
			const applyTaskTransition = vi.fn();
			const task = buildTask({
				id: "task-1",
				columnId: "col-in-progress",
				status: "running",
				title: "Task",
				updatedAt: msAgo(5 * 60 * 1000),
			});

			const completedRun = buildRun({
				id: "run-still-running",
				taskId: "task-1",
				status: "completed",
				sessionId: "sess-1",
			});
			runsByTaskStore.set("task-1", [completedRun]);

			// Non-terminal: kind is "running", not "completed" or "failed"
			mockDeriveMetaStatus.mockReturnValue({ kind: "running" });

			const staleRunFallbackMarker = vi.fn(() => "timeout" as const);
			const resolveTriggerFromOutcome = vi.fn(() => "run:fail" as const);

			const deps = buildDeps({
				applyTaskTransition,
				runFinalizer: {
					staleRunFallbackMarker,
					hydrateOutcomeContent: vi.fn(async (_r: Run, c: string) => c),
					resolveTriggerFromOutcome,
				},
			});
			const service = new TaskStatusProjectionService(deps);

			await service.reconcileTaskStatuses("project-1", board, [task]);

			expect(staleRunFallbackMarker).toHaveBeenCalledWith(completedRun);
			expect(applyTaskTransition).toHaveBeenCalledWith(
				completedRun,
				"run:fail",
				"",
			);
		});

		it("failed run with recoverable network error and terminal inspection transitions from session-derived outcome", async () => {
			const applyTaskTransition = vi.fn();
			const task = buildTask({
				id: "task-1",
				columnId: "col-in-progress",
				status: "running",
				title: "Task",
				updatedAt: msAgo(5 * 60 * 1000),
			});

			const failedRun = buildRun({
				id: "run-fail",
				taskId: "task-1",
				status: "failed",
				sessionId: "sess-1",
			});
			runsByTaskStore.set("task-1", [failedRun]);

			mockDeriveMetaStatus.mockReturnValue({
				kind: "completed",
				marker: "done",
				content: "Actually succeeded",
			});

			const resolveTriggerFromOutcome = vi.fn(() => "run:done" as const);

			const deps = buildDeps({
				applyTaskTransition,
				isNetworkError: vi.fn(() => true),
				getRunErrorText: vi.fn(() => "fetch failed"),
				runFinalizer: {
					staleRunFallbackMarker: vi.fn(),
					hydrateOutcomeContent: vi.fn(async (_r: Run, c: string) => c),
					resolveTriggerFromOutcome,
				},
			});
			const service = new TaskStatusProjectionService(deps);

			await service.reconcileTaskStatuses("project-1", board, [task]);

			expect(resolveTriggerFromOutcome).toHaveBeenCalledWith(
				failedRun,
				"failed",
				{ marker: "done", content: "Actually succeeded" },
			);
			expect(applyTaskTransition).toHaveBeenCalledWith(
				failedRun,
				"run:done",
				"Actually succeeded",
			);
		});

		it("failed run with recoverable network error and non-terminal inspection skips projection", async () => {
			const applyTaskTransition = vi.fn();
			const task = buildTask({
				id: "task-1",
				columnId: "col-in-progress",
				status: "running",
				title: "Task",
				updatedAt: msAgo(5 * 60 * 1000),
			});

			const failedRun = buildRun({
				id: "run-fail",
				taskId: "task-1",
				status: "failed",
				sessionId: "sess-1",
			});
			runsByTaskStore.set("task-1", [failedRun]);

			// Non-terminal: session is still running
			mockDeriveMetaStatus.mockReturnValue({ kind: "running" });

			const deps = buildDeps({
				applyTaskTransition,
				isNetworkError: vi.fn(() => true),
				getRunErrorText: vi.fn(() => "fetch failed"),
				runFinalizer: {
					staleRunFallbackMarker: vi.fn(),
					hydrateOutcomeContent: vi.fn(),
					resolveTriggerFromOutcome: vi.fn(),
				},
			});
			const service = new TaskStatusProjectionService(deps);

			await service.reconcileTaskStatuses("project-1", board, [task]);

			expect(applyTaskTransition).not.toHaveBeenCalled();
		});

		it("failed run without recoverable error uses marker 'fail'", async () => {
			const applyTaskTransition = vi.fn();
			const task = buildTask({
				id: "task-1",
				columnId: "col-in-progress",
				status: "running",
				title: "Task",
				updatedAt: msAgo(5 * 60 * 1000),
			});

			const failedRun = buildRun({
				id: "run-fail",
				taskId: "task-1",
				status: "failed",
				sessionId: "sess-1",
			});
			runsByTaskStore.set("task-1", [failedRun]);

			const resolveTriggerFromOutcome = vi.fn(() => "run:fail" as const);

			const deps = buildDeps({
				applyTaskTransition,
				isNetworkError: vi.fn(() => false),
				getRunErrorText: vi.fn(() => "internal error"),
				runFinalizer: {
					staleRunFallbackMarker: vi.fn(),
					hydrateOutcomeContent: vi.fn(),
					resolveTriggerFromOutcome,
				},
			});
			const service = new TaskStatusProjectionService(deps);

			await service.reconcileTaskStatuses("project-1", board, [task]);

			expect(resolveTriggerFromOutcome).toHaveBeenCalledWith(
				failedRun,
				"failed",
				{ marker: "fail", content: "" },
			);
			expect(applyTaskTransition).toHaveBeenCalledWith(
				failedRun,
				"run:fail",
				"",
			);
		});

		it("does not call transition when resolveTriggerFromOutcome returns null", async () => {
			const applyTaskTransition = vi.fn();
			const task = buildTask({
				id: "task-1",
				columnId: "col-in-progress",
				status: "running",
				title: "Task",
				updatedAt: msAgo(5 * 60 * 1000),
			});

			const completedRun = buildRun({
				id: "run-done",
				taskId: "task-1",
				status: "completed",
				sessionId: "sess-1",
			});
			runsByTaskStore.set("task-1", [completedRun]);

			mockDeriveMetaStatus.mockReturnValue({
				kind: "completed",
				marker: "done",
				content: "Done content",
			});

			const deps = buildDeps({
				applyTaskTransition,
				runFinalizer: {
					staleRunFallbackMarker: vi.fn(),
					hydrateOutcomeContent: vi.fn(async (_r: Run, c: string) => c),
					resolveTriggerFromOutcome: vi.fn(() => null),
				},
			});
			const service = new TaskStatusProjectionService(deps);

			await service.reconcileTaskStatuses("project-1", board, [task]);

			expect(applyTaskTransition).not.toHaveBeenCalled();
		});

		it("skips task when no runs exist", async () => {
			const applyTaskTransition = vi.fn();
			const task = buildTask({
				id: "task-1",
				columnId: "col-ready",
				status: "pending",
				title: "No-run task",
				updatedAt: msAgo(5 * 60 * 1000),
			});

			runsByTaskStore.set("task-1", []);

			const service = new TaskStatusProjectionService(
				buildDeps({ applyTaskTransition }),
			);

			await service.reconcileTaskStatuses("project-1", board, [task]);
			expect(applyTaskTransition).not.toHaveBeenCalled();
		});

		it("completed run without sessionId falls back to staleRunFallbackMarker", async () => {
			const applyTaskTransition = vi.fn();
			const task = buildTask({
				id: "task-1",
				columnId: "col-in-progress",
				status: "running",
				title: "Task",
				updatedAt: msAgo(5 * 60 * 1000),
			});

			const completedRun = buildRun({
				id: "run-no-session",
				taskId: "task-1",
				status: "completed",
				sessionId: "",
			});
			runsByTaskStore.set("task-1", [completedRun]);

			const staleRunFallbackMarker = vi.fn(() => "done" as const);
			const resolveTriggerFromOutcome = vi.fn(() => "run:done" as const);

			const deps = buildDeps({
				applyTaskTransition,
				runFinalizer: {
					staleRunFallbackMarker,
					hydrateOutcomeContent: vi.fn(async (_r: Run, c: string) => c),
					resolveTriggerFromOutcome,
				},
			});
			const service = new TaskStatusProjectionService(deps);

			await service.reconcileTaskStatuses("project-1", board, [task]);

			// No session inspection was attempted; fallback marker is used
			expect(mockDeriveMetaStatus).not.toHaveBeenCalled();
			expect(staleRunFallbackMarker).toHaveBeenCalledWith(completedRun);
			expect(applyTaskTransition).toHaveBeenCalledWith(
				completedRun,
				"run:done",
				"",
			);
		});
	});
});
