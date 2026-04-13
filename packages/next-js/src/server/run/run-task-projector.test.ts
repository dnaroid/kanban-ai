import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Run } from "@/types/ipc";

const { mockBoardRepo, mockTaskRepo, mockPublishSseEvent, mockWorkflow } =
	vi.hoisted(() => ({
		mockBoardRepo: {
			getById: vi.fn(),
		},
		mockTaskRepo: {
			getById: vi.fn(),
			update: vi.fn(),
		},
		mockPublishSseEvent: vi.fn(),
		mockWorkflow: {
			canTransitionColumn: vi.fn(),
			getPreferredColumnIdForStatus: vi.fn(),
			getWorkflowColumnSystemKey: vi.fn(),
			isStatusAllowedInWorkflowColumn: vi.fn(),
			isWorkflowTaskStatus: vi.fn(),
			resolveTaskStatusBySignal: vi.fn(),
			resolveTaskStatusReasons: vi.fn(),
		},
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

vi.mock("@/server/workflow/task-workflow-manager", () => ({
	canTransitionColumn: mockWorkflow.canTransitionColumn,
	getPreferredColumnIdForStatus: mockWorkflow.getPreferredColumnIdForStatus,
	getWorkflowColumnSystemKey: mockWorkflow.getWorkflowColumnSystemKey,
	isStatusAllowedInWorkflowColumn: mockWorkflow.isStatusAllowedInWorkflowColumn,
	isWorkflowTaskStatus: mockWorkflow.isWorkflowTaskStatus,
	resolveTaskStatusBySignal: mockWorkflow.resolveTaskStatusBySignal,
	resolveTaskStatusReasons: mockWorkflow.resolveTaskStatusReasons,
}));

import { RunTaskProjector } from "@/server/run/run-task-projector";

function buildTask(columnId: string, status: string) {
	const now = new Date().toISOString();
	return {
		id: "task-1",
		projectId: "project-1",
		boardId: "board-1",
		columnId,
		title: "Task",
		description: "Desc",
		descriptionMd: null,
		status,
		blockedReason: null,
		closedReason: null,
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
		sessionId: "",
		status: "running",
		createdAt: now,
		updatedAt: now,
		metadata: { kind },
	};
}

describe("RunTaskProjector column selection on status change", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBoardRepo.getById.mockReturnValue({ id: "board-1", columns: [] });
		mockWorkflow.isWorkflowTaskStatus.mockReturnValue(true);
		mockWorkflow.resolveTaskStatusBySignal.mockReturnValue("pending");
		mockWorkflow.resolveTaskStatusReasons.mockReturnValue({
			blockedReason: null,
			closedReason: null,
		});
		mockWorkflow.canTransitionColumn.mockReturnValue(true);
		mockWorkflow.getPreferredColumnIdForStatus.mockReturnValue("col-ready");
		mockWorkflow.getWorkflowColumnSystemKey.mockImplementation(
			(_board: unknown, columnId: string) => {
				if (columnId === "col-backlog") return "backlog";
				if (columnId === "col-ready") return "ready";
				if (columnId === "col-in-progress") return "in_progress";
				if (columnId === "col-review") return "review";
				return null;
			},
		);
	});

	it("keeps current column when transition to preferred is blocked", () => {
		const task = buildTask("col-backlog", "running");
		mockTaskRepo.getById.mockReturnValue(task);
		mockTaskRepo.update.mockImplementation(
			(_taskId: string, patch: object) => ({
				...task,
				...patch,
			}),
		);
		mockWorkflow.canTransitionColumn.mockReturnValue(false);
		mockWorkflow.isStatusAllowedInWorkflowColumn.mockImplementation(
			(status: string, columnKey: string) =>
				status === "pending" && columnKey === "backlog",
		);

		const projector = new RunTaskProjector();
		projector.projectRunStarted(buildRun());

		expect(mockTaskRepo.update).toHaveBeenCalledWith(
			"task-1",
			expect.objectContaining({ status: "pending", columnId: "col-backlog" }),
		);
		expect(mockWorkflow.canTransitionColumn).toHaveBeenCalledWith(
			"backlog",
			"ready",
		);
	});

	it("moves to preferred column when current column does not allow next status", () => {
		const task = buildTask("col-in-progress", "running");
		mockTaskRepo.getById.mockReturnValue(task);
		mockTaskRepo.update.mockImplementation(
			(_taskId: string, patch: object) => ({
				...task,
				...patch,
			}),
		);
		mockWorkflow.resolveTaskStatusBySignal.mockReturnValue("done");
		mockWorkflow.getPreferredColumnIdForStatus.mockReturnValue("col-review");
		mockWorkflow.isStatusAllowedInWorkflowColumn.mockReturnValue(false);

		const projector = new RunTaskProjector();
		projector.projectRunStarted(buildRun());

		expect(mockWorkflow.canTransitionColumn).toHaveBeenCalledWith(
			"in_progress",
			"review",
		);
		expect(mockTaskRepo.update).toHaveBeenCalledWith(
			"task-1",
			expect.objectContaining({ status: "done", columnId: "col-review" }),
		);
	});
});

describe("RunTaskProjector user-story projection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBoardRepo.getById.mockReturnValue({ id: "board-1", columns: [] });
		mockWorkflow.isWorkflowTaskStatus.mockReturnValue(true);
		mockWorkflow.resolveTaskStatusBySignal.mockReturnValue("pending");
		mockWorkflow.resolveTaskStatusReasons.mockReturnValue({
			blockedReason: null,
			closedReason: null,
		});
		mockWorkflow.canTransitionColumn.mockReturnValue(true);
		mockWorkflow.getPreferredColumnIdForStatus.mockReturnValue("col-ready");
		mockWorkflow.getWorkflowColumnSystemKey.mockImplementation(
			(_board: unknown, columnId: string) => {
				if (columnId === "col-in-progress") return "in_progress";
				if (columnId === "col-ready") return "ready";
				return null;
			},
		);
	});

	it("updates task and publishes task:event for test_ok generation signal", () => {
		const task = buildTask("col-in-progress", "running");
		task.tags = JSON.stringify(["legacy", "agent:old-role"]);
		mockTaskRepo.getById.mockReturnValue(task);
		mockTaskRepo.update.mockImplementation(
			(_taskId: string, patch: Record<string, unknown>) => ({
				...task,
				...patch,
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
		);

		const assistantContent = [
			'<META>{"tags":["new-tag"],"type":"improvement","difficulty":"hard","agentRoleId":"architect"}</META>',
			"<STORY>",
			"## Название",
			"Улучшить обновление карточки",
			"",
			"## User story",
			"Как пользователь, я хочу видеть обновленные данные задачи сразу после генерации.",
			"</STORY>",
		].join("\n");

		const projector = new RunTaskProjector();
		projector.projectRunOutcome(
			buildRun("task-description-improve"),
			"completed",
			"test_ok",
			assistantContent,
		);

		expect(mockTaskRepo.update).toHaveBeenCalledTimes(1);
		const patch = mockTaskRepo.update.mock.calls[0]?.[1] as Record<
			string,
			unknown
		>;
		expect(patch).toMatchObject({
			status: "pending",
			description: expect.stringContaining("## User story"),
			descriptionMd: expect.stringContaining("## User story"),
			title: "Улучшить обновление карточки",
			type: "improvement",
			difficulty: "hard",
		});
		expect(patch.tags).toBe(JSON.stringify(["new-tag", "agent:architect"]));

		expect(mockPublishSseEvent).toHaveBeenCalledWith(
			"task:event",
			expect.objectContaining({
				taskId: "task-1",
				boardId: "board-1",
				projectId: "project-1",
			}),
		);
	});

	it("parses and saves commitMessage from META block", () => {
		const task = buildTask("col-in-progress", "running");
		mockTaskRepo.getById.mockReturnValue(task);
		mockTaskRepo.update.mockImplementation(
			(_taskId: string, patch: Record<string, unknown>) => ({
				...task,
				...patch,
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
		);

		const assistantContent = [
			'<META>{"type":"feature","commitMessage":"feat(core): add user authentication"}</META>',
			"<STORY>",
			"## Название",
			"Add auth",
			"",
			"## Цель",
			"Implement user auth.",
			"</STORY>",
		].join("\n");

		const projector = new RunTaskProjector();
		projector.projectRunOutcome(
			buildRun("task-description-improve"),
			"completed",
			"test_ok",
			assistantContent,
		);

		expect(mockTaskRepo.update).toHaveBeenCalledTimes(1);
		const patch = mockTaskRepo.update.mock.calls[0]?.[1] as Record<
			string,
			unknown
		>;
		expect(patch.commitMessage).toBe("feat(core): add user authentication");
	});

	it("truncates commitMessage to 200 characters", () => {
		const task = buildTask("col-in-progress", "running");
		mockTaskRepo.getById.mockReturnValue(task);
		mockTaskRepo.update.mockImplementation(
			(_taskId: string, patch: Record<string, unknown>) => ({
				...task,
				...patch,
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
		);

		const longMessage = "feat(core): " + "a".repeat(200);
		const assistantContent = [
			`<META>{"type":"feature","commitMessage":"${longMessage}"}</META>`,
			"<STORY>",
			"## Название",
			"Long commit",
			"</STORY>",
		].join("\n");

		const projector = new RunTaskProjector();
		projector.projectRunOutcome(
			buildRun("task-description-improve"),
			"completed",
			"test_ok",
			assistantContent,
		);

		const patch = mockTaskRepo.update.mock.calls[0]?.[1] as Record<
			string,
			unknown
		>;
		expect((patch.commitMessage as string).length).toBeLessThanOrEqual(200);
	});

	it("skips commitMessage when empty in META", () => {
		const task = buildTask("col-in-progress", "running");
		mockTaskRepo.getById.mockReturnValue(task);
		mockTaskRepo.update.mockImplementation(
			(_taskId: string, patch: Record<string, unknown>) => ({
				...task,
				...patch,
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
		);

		const assistantContent = [
			'<META>{"type":"feature","commitMessage":"   "}</META>',
			"<STORY>",
			"## Название",
			"Empty commit msg",
			"</STORY>",
		].join("\n");

		const projector = new RunTaskProjector();
		projector.projectRunOutcome(
			buildRun("task-description-improve"),
			"completed",
			"test_ok",
			assistantContent,
		);

		const patch = mockTaskRepo.update.mock.calls[0]?.[1] as Record<
			string,
			unknown
		>;
		expect(patch.commitMessage).toBeUndefined();
	});
});
