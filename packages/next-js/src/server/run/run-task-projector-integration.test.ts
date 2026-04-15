/**
 * Integration test: uses REAL workflow config + REAL RunTaskProjector.
 * Only repos and SSE are mocked. This tests the full run outcome → status → column flow.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Run } from "@/types/ipc";
import {
	resetWorkflowRuntimeConfigForTests,
	resolveTaskStatusReasons,
	canTransitionColumn,
	getPreferredColumnIdForStatus,
	getWorkflowColumnSystemKey,
	isStatusAllowedInWorkflowColumn,
	isWorkflowTaskStatus,
} from "@/server/workflow/task-workflow-manager";

const { mockBoardRepo, mockTaskRepo, mockPublishSseEvent } = vi.hoisted(() => ({
	mockBoardRepo: {
		getById: vi.fn(),
	},
	mockTaskRepo: {
		getById: vi.fn(),
		update: vi.fn(),
	},
	mockPublishSseEvent: vi.fn(),
}));

vi.mock("@/server/repositories/board", () => ({
	boardRepo: mockBoardRepo,
}));

vi.mock("@/server/repositories/task", () => ({
	taskRepo: mockTaskRepo,
}));

vi.mock("@/server/events/sse-broker", () => ({
	publishSseEvent: mockPublishSseEvent,
}));

// IMPORTANT: Do NOT mock task-workflow-manager — use REAL workflow config
import { RunTaskProjector } from "@/server/run/run-task-projector";

function buildTask(
	columnId: string,
	status: string,
	boardId = "board-1",
	taskId = "task-1",
) {
	const now = new Date().toISOString();
	return {
		id: taskId,
		projectId: "project-1",
		boardId,
		columnId,
		title: "Test Task",
		description: "desc",
		descriptionMd: null,
		status,
		blockedReason: null as string | null,
		closedReason: null as string | null,
		priority: "normal",
		difficulty: "medium",
		type: "feature",
		orderInColumn: 0,
		tags: "[]",
		startDate: null,
		dueDate: null,
		estimatePoints: null,
		estimateHours: null,
		assignee: null,
		modelName: null,
		commitMessage: null,
		createdAt: now,
		updatedAt: now,
	};
}

function buildRun(kind = "task-run"): Run {
	const now = new Date().toISOString();
	return {
		id: "run-1",
		taskId: "task-1",
		sessionId: "session-1",
		status: "running",
		createdAt: now,
		updatedAt: now,
		metadata: { kind },
	};
}

/** Board with all default workflow columns including "blocked" */
function buildBoard() {
	const columns = [
		{
			id: "col-backlog",
			boardId: "board-1",
			name: "Backlog",
			systemKey: "backlog",
			orderIndex: 0,
			color: "#6366f1",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
		{
			id: "col-ready",
			boardId: "board-1",
			name: "Ready",
			systemKey: "ready",
			orderIndex: 1,
			color: "#0ea5e9",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
		{
			id: "col-in-progress",
			boardId: "board-1",
			name: "In Progress",
			systemKey: "in_progress",
			orderIndex: 2,
			color: "#f59e0b",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
		{
			id: "col-blocked",
			boardId: "board-1",
			name: "Blocked",
			systemKey: "blocked",
			orderIndex: 3,
			color: "#ef4444",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
		{
			id: "col-review",
			boardId: "board-1",
			name: "Review / QA",
			systemKey: "review",
			orderIndex: 4,
			color: "#8b5cf6",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
		{
			id: "col-closed",
			boardId: "board-1",
			name: "Closed",
			systemKey: "closed",
			orderIndex: 5,
			color: "#10b981",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
	];
	return {
		id: "board-1",
		projectId: "project-1",
		name: "Test Board",
		columns,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("RunTaskProjector integration: question outcome → Blocked column", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetWorkflowRuntimeConfigForTests();

		// Board always present
		mockBoardRepo.getById.mockReturnValue(buildBoard());

		// Task repo: getById returns task, update echoes back with patch
		mockTaskRepo.update.mockImplementation(
			(_taskId: string, patch: Record<string, unknown>) => ({
				...buildTask("col-in-progress", "running"),
				...patch,
				updatedAt: "2026-01-01T00:00:01.000Z",
			}),
		);
	});

	it("resolves question outcome → status 'question', column 'blocked', blockedReason 'question'", () => {
		// Task is in "running" status, "in_progress" column
		const task = buildTask("col-in-progress", "running");
		mockTaskRepo.getById.mockReturnValue(task);

		const projector = new RunTaskProjector();
		projector.projectRunOutcome(buildRun("task-run"), {
			marker: "question",
			content: "Need user input",
		});

		// Verify taskRepo.update was called
		expect(mockTaskRepo.update).toHaveBeenCalledTimes(1);
		const [taskId, patch] = mockTaskRepo.update.mock.calls[0] as [
			string,
			Record<string, unknown>,
		];
		expect(taskId).toBe("task-1");
		expect(patch.status).toBe("question");
		expect(patch.columnId).toBe("col-blocked");
		expect(patch.blockedReason).toBe("question");
		expect(patch.closedReason).toBeNull();

		// Verify SSE event published
		expect(mockPublishSseEvent).toHaveBeenCalledWith(
			"task:event",
			expect.objectContaining({
				taskId: "task-1",
				boardId: "board-1",
				projectId: "project-1",
			}),
		);
	});

	it("works from 'pending' status in 'ready' column", () => {
		const task = buildTask("col-ready", "pending");
		mockTaskRepo.getById.mockReturnValue(task);

		const projector = new RunTaskProjector();
		projector.projectRunOutcome(buildRun("task-run"), {
			marker: "question",
			content: "User input needed",
		});

		expect(mockTaskRepo.update).toHaveBeenCalledTimes(1);
		const [, patch] = mockTaskRepo.update.mock.calls[0] as [
			string,
			Record<string, unknown>,
		];
		expect(patch.status).toBe("question");
		expect(patch.columnId).toBe("col-blocked");
		expect(patch.blockedReason).toBe("question");
	});

	it("is idempotent when task already in 'question' status", () => {
		const task = buildTask("col-blocked", "question");
		mockTaskRepo.getById.mockReturnValue(task);

		const projector = new RunTaskProjector();
		projector.projectRunOutcome(buildRun("task-run"), {
			marker: "question",
			content: "Another question",
		});

		// Should still update (idempotent — same status, same column)
		expect(mockTaskRepo.update).toHaveBeenCalledTimes(1);
		const [, patch] = mockTaskRepo.update.mock.calls[0] as [
			string,
			Record<string, unknown>,
		];
		expect(patch.status).toBe("question");
		expect(patch.columnId).toBe("col-blocked");
	});

	it("works for generation run with question outcome", () => {
		const task = buildTask("col-backlog", "generating");
		mockTaskRepo.getById.mockReturnValue(task);

		const projector = new RunTaskProjector();
		projector.projectRunOutcome(buildRun("task-description-improve"), {
			marker: "question",
			content: "Need clarification on requirements",
		});

		expect(mockTaskRepo.update).toHaveBeenCalledTimes(1);
		const [, patch] = mockTaskRepo.update.mock.calls[0] as [
			string,
			Record<string, unknown>,
		];
		expect(patch.status).toBe("question");
		expect(patch.columnId).toBe("col-blocked");
		expect(patch.blockedReason).toBe("question");
	});

	it("verifies real resolveTaskStatusReasons for question in blocked column", () => {
		const reasons = resolveTaskStatusReasons("question", "blocked");
		expect(reasons).toEqual({
			blockedReason: "question",
			closedReason: null,
		});
	});

	it("real canTransitionColumn allows in_progress → blocked", () => {
		expect(canTransitionColumn("in_progress", "blocked")).toBe(true);
	});

	it("real isStatusAllowedInWorkflowColumn allows question in blocked", () => {
		expect(isStatusAllowedInWorkflowColumn("question", "blocked")).toBe(true);
	});

	it("real getWorkflowColumnSystemKey returns 'blocked' for col-blocked", () => {
		const board = buildBoard();
		const key = getWorkflowColumnSystemKey(board, "col-blocked");
		expect(key).toBe("blocked");
	});

	it("real getPreferredColumnIdForStatus returns blocked column for question", () => {
		const board = buildBoard();
		const colId = getPreferredColumnIdForStatus(board, "question");
		expect(colId).toBe("col-blocked");
	});

	it("real isWorkflowTaskStatus recognizes standard statuses", () => {
		expect(isWorkflowTaskStatus("pending")).toBe(true);
		expect(isWorkflowTaskStatus("running")).toBe(true);
		expect(isWorkflowTaskStatus("question")).toBe(true);
		expect(isWorkflowTaskStatus("paused")).toBe(true);
		expect(isWorkflowTaskStatus("done")).toBe(true);
		expect(isWorkflowTaskStatus("failed")).toBe(true);
		expect(isWorkflowTaskStatus("generating")).toBe(true);
		expect(isWorkflowTaskStatus("queued")).toBe(false); // NOT a workflow status
	});
});
