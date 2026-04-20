import { describe, expect, it, vi } from "vitest";

import { PostRunWorkflowService } from "@/server/run/post-run-workflow-service";
import type { Task } from "@/server/types";

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
		dueDate: null,
		assignee: null,
		modelName: null,
		commitMessage: null,
		qaReport: null,
		isGenerated: false,
		wasQaRejected: false,
		createdAt: now,
		updatedAt: now,
	};
}

describe("post-run-workflow-service", () => {
	it("picks dependency-ready highest-priority task from ready column", () => {
		const service = new PostRunWorkflowService({
			mergeRunWorkspace: vi.fn(),
			cleanupRunWorkspace: vi.fn(),
			syncVcsMetadata: vi.fn(),
			syncRunWorkspace: vi.fn(),
			updateRun: vi.fn(),
			createRunStatusEvent: vi.fn(),
			getTaskById: vi.fn(),
			getBoardById: vi.fn(() => ({
				id: "board-1",
				projectId: "project-1",
				name: "Board",
				columns: [
					{
						id: "ready-col",
						boardId: "board-1",
						name: "Ready",
						systemKey: "ready",
						orderIndex: 0,
						createdAt: "",
						updatedAt: "",
					},
				],
				createdAt: "",
				updatedAt: "",
			})),
			listTasksByBoard: vi.fn(() => [
				buildTask({
					id: "t1",
					columnId: "ready-col",
					priority: "low",
					status: "pending",
					orderInColumn: 0,
					title: "Low",
				}),
				buildTask({
					id: "t2",
					columnId: "ready-col",
					priority: "urgent",
					status: "pending",
					orderInColumn: 1,
					title: "Urgent",
				}),
			]),
			listRunsByTask: vi.fn(() => []),
			isGenerationRun: vi.fn(() => false),
			areDependenciesResolved: vi.fn((taskId: string) => taskId === "t2"),
			resumeRejectedTaskRun: vi.fn(async () => false),
			enqueueExecutionForNextTask: vi.fn(async () => undefined),
		});

		const nextTask = service.pickNextReadyTask("board-1");
		expect(nextTask?.id).toBe("t2");
	});

	it("starts next ready task by enqueuing execution", async () => {
		const enqueueExecutionForNextTask = vi.fn(async () => undefined);
		const service = new PostRunWorkflowService({
			mergeRunWorkspace: vi.fn(),
			cleanupRunWorkspace: vi.fn(),
			syncVcsMetadata: vi.fn(),
			syncRunWorkspace: vi.fn(),
			updateRun: vi.fn(),
			createRunStatusEvent: vi.fn(),
			getTaskById: vi.fn((taskId: string) =>
				taskId === "merged"
					? buildTask({
							id: "merged",
							boardId: "board-1",
							columnId: "closed-col",
							status: "done",
							title: "Merged",
						})
					: null,
			),
			getBoardById: vi.fn(() => ({
				id: "board-1",
				projectId: "project-1",
				name: "Board",
				columns: [
					{
						id: "ready-col",
						boardId: "board-1",
						name: "Ready",
						systemKey: "ready",
						orderIndex: 0,
						createdAt: "",
						updatedAt: "",
					},
				],
				createdAt: "",
				updatedAt: "",
			})),
			listTasksByBoard: vi.fn(() => [
				buildTask({
					id: "next",
					boardId: "board-1",
					columnId: "ready-col",
					priority: "normal",
					status: "pending",
					orderInColumn: 0,
					title: "Next",
				}),
			]),
			listRunsByTask: vi.fn(() => []),
			isGenerationRun: vi.fn(() => false),
			areDependenciesResolved: vi.fn(() => true),
			resumeRejectedTaskRun: vi.fn(async () => false),
			enqueueExecutionForNextTask,
		});

		await service.startNextReadyTaskAfterMerge("merged");
		expect(enqueueExecutionForNextTask).toHaveBeenCalledWith("next");
	});
});
