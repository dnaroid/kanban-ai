import { describe, expect, it } from "vitest";

import { TaskStateMachine } from "@/server/run/task-state-machine";

function buildBoard() {
	return {
		id: "board-1",
		projectId: "project-1",
		name: "Board",
		createdAt: "",
		updatedAt: "",
		columns: [
			{
				id: "backlog-col",
				boardId: "board-1",
				name: "Backlog",
				orderIndex: 0,
				createdAt: "",
				updatedAt: "",
				systemKey: "backlog",
			},
			{
				id: "ready-col",
				boardId: "board-1",
				name: "Ready",
				orderIndex: 1,
				createdAt: "",
				updatedAt: "",
				systemKey: "ready",
			},
			{
				id: "in-progress-col",
				boardId: "board-1",
				name: "In Progress",
				orderIndex: 2,
				createdAt: "",
				updatedAt: "",
				systemKey: "in_progress",
			},
		],
	};
}

function buildGeneratingTask() {
	return {
		id: "task-1",
		boardId: "board-1",
		status: "generating" as const,
		columnId: "backlog-col",
		tags: "[]",
	};
}

describe("TaskStateMachine generation invariants", () => {
	it("does not move generation task to pending without story content", () => {
		const machine = new TaskStateMachine();

		const result = machine.transition({
			task: buildGeneratingTask(),
			board: buildBoard(),
			trigger: "generate:ok",
			runKind: "task-description-improve",
			outcomeContent: "",
			hasSessionExisted: true,
			isManualStatusGracePeriod: false,
		});

		expect(result).toEqual({
			action: "skip",
			patch: {},
			effects: [],
		});
	});

	it("moves generation task to pending and patches story when content exists", () => {
		const machine = new TaskStateMachine();
		const story = [
			'<META>{"type":"feature","difficulty":"easy"}</META>',
			"<STORY>",
			"## Title",
			"Recovered story",
			"</STORY>",
		].join("\n");

		const result = machine.transition({
			task: buildGeneratingTask(),
			board: buildBoard(),
			trigger: "generate:ok",
			runKind: "task-description-improve",
			outcomeContent: story,
			hasSessionExisted: true,
			isManualStatusGracePeriod: false,
		});

		expect(result.action).toBe("update");
		expect(result.patch).toEqual(
			expect.objectContaining({
				status: "pending",
				columnId: "ready-col",
				title: "Recovered story",
				description: ["## Title", "Recovered story"].join("\n"),
				descriptionMd: ["## Title", "Recovered story"].join("\n"),
				type: "feature",
				difficulty: "easy",
			}),
		);
	});

	it("moves rejected ready task to running in progress on run start", () => {
		const machine = new TaskStateMachine();

		const result = machine.transition({
			task: {
				id: "task-rejected",
				boardId: "board-1",
				status: "rejected",
				columnId: "ready-col",
				tags: "[]",
			},
			board: buildBoard(),
			trigger: "run:start",
			runKind: "task-run",
			outcomeContent: "",
			hasSessionExisted: true,
			isManualStatusGracePeriod: false,
		});

		expect(result).toEqual(
			expect.objectContaining({
				action: "update",
				patch: expect.objectContaining({
					status: "running",
					columnId: "in-progress-col",
				}),
			}),
		);
	});
});
