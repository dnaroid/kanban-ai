import { describe, expect, it } from "vitest";

import {
	adaptTriggerForQa,
	isQaRunKind,
	parseQaReportContent,
	TaskStateMachine,
} from "@/server/run/task-state-machine";
import type { TaskTransitionInput } from "@/server/run/task-state-machine";
import type { TaskStatus } from "@/types/kanban";

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
			{
				id: "blocked-col",
				boardId: "board-1",
				name: "Blocked",
				orderIndex: 3,
				createdAt: "",
				updatedAt: "",
				systemKey: "blocked",
			},
			{
				id: "review-col",
				boardId: "board-1",
				name: "Review",
				orderIndex: 4,
				createdAt: "",
				updatedAt: "",
				systemKey: "review",
			},
			{
				id: "closed-col",
				boardId: "board-1",
				name: "Closed",
				orderIndex: 5,
				createdAt: "",
				updatedAt: "",
				systemKey: "closed",
			},
		],
	};
}

function buildTask(task: Partial<TaskTransitionInput["task"]> = {}) {
	return {
		id: "task-1",
		boardId: "board-1",
		status: "done" as TaskStatus,
		columnId: "review-col",
		tags: "[]",
		...task,
	};
}

function buildTransitionInput(
	input: Partial<TaskTransitionInput> & {
		task?: Partial<TaskTransitionInput["task"]>;
	} = {},
): TaskTransitionInput {
	return {
		task: buildTask(input.task),
		board: input.board ?? buildBoard(),
		trigger: input.trigger ?? "qa:start",
		runKind: input.runKind ?? "task-run",
		outcomeContent: input.outcomeContent ?? "",
		hasSessionExisted: input.hasSessionExisted ?? true,
		isManualStatusGracePeriod: input.isManualStatusGracePeriod ?? false,
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

describe("TaskStateMachine QA transitions", () => {
	it("qa:start transitions done/review to testing/in_progress", () => {
		const machine = new TaskStateMachine();

		const result = machine.transition(
			buildTransitionInput({
				trigger: "qa:start",
				task: { status: "done", columnId: "review-col" },
			}),
		);

		expect(result).toEqual(
			expect.objectContaining({
				action: "update",
				patch: expect.objectContaining({
					status: "testing",
					columnId: "in-progress-col",
				}),
			}),
		);
	});

	it("qa:start skips from non-review state", () => {
		const machine = new TaskStateMachine();

		const result = machine.transition(
			buildTransitionInput({
				trigger: "qa:start",
				task: { status: "done", columnId: "ready-col" },
			}),
		);

		expect(result).toEqual({ action: "skip", patch: {}, effects: [] });
	});

	it("qa:start skips when status is not done", () => {
		const machine = new TaskStateMachine();

		const result = machine.transition(
			buildTransitionInput({
				trigger: "qa:start",
				task: { status: "running", columnId: "review-col" },
			}),
		);

		expect(result).toEqual({ action: "skip", patch: {}, effects: [] });
	});

	it("qa:pass transitions testing/in_progress to done/closed", () => {
		const machine = new TaskStateMachine();

		const result = machine.transition(
			buildTransitionInput({
				trigger: "qa:pass",
				task: { status: "testing", columnId: "in-progress-col" },
			}),
		);

		expect(result).toEqual(
			expect.objectContaining({
				action: "update",
				patch: expect.objectContaining({
					status: "done",
					columnId: "closed-col",
					qaReport: null,
					wasQaRejected: false,
				}),
			}),
		);
	});

	it("qa:pass skips from non-testing state", () => {
		const machine = new TaskStateMachine();

		const result = machine.transition(
			buildTransitionInput({
				trigger: "qa:pass",
				task: { status: "done", columnId: "review-col" },
			}),
		);

		expect(result).toEqual({ action: "skip", patch: {}, effects: [] });
	});

	it("qa:fail transitions testing/in_progress to qa_failed/blocked", () => {
		const machine = new TaskStateMachine();
		const qaOutput = "<QA REPORT>Regression in filter state</QA REPORT>";

		const result = machine.transition(
			buildTransitionInput({
				trigger: "qa:fail",
				task: { status: "testing", columnId: "in-progress-col" },
				outcomeContent: qaOutput,
			}),
		);

		expect(result).toEqual(
			expect.objectContaining({
				action: "update",
				patch: expect.objectContaining({
					status: "qa_failed",
					columnId: "blocked-col",
					qaReport: qaOutput,
					wasQaRejected: true,
				}),
			}),
		);
	});

	it("qa:fail skips from non-testing state", () => {
		const machine = new TaskStateMachine();

		const result = machine.transition(
			buildTransitionInput({
				trigger: "qa:fail",
				task: { status: "done", columnId: "review-col" },
			}),
		);

		expect(result).toEqual({ action: "skip", patch: {}, effects: [] });
	});

	it("qa:fix transitions qa_failed/blocked to running/in_progress and clears qaReport", () => {
		const machine = new TaskStateMachine();

		const result = machine.transition(
			buildTransitionInput({
				trigger: "qa:fix",
				task: { status: "qa_failed", columnId: "blocked-col" },
			}),
		);

		expect(result).toEqual(
			expect.objectContaining({
				action: "update",
				patch: expect.objectContaining({
					status: "running",
					columnId: "in-progress-col",
					qaReport: null,
				}),
			}),
		);
	});

	it("qa:fix skips from non-qa_failed state", () => {
		const machine = new TaskStateMachine();

		const result = machine.transition(
			buildTransitionInput({
				trigger: "qa:fix",
				task: { status: "testing", columnId: "in-progress-col" },
			}),
		);

		expect(result).toEqual({ action: "skip", patch: {}, effects: [] });
	});

	it("qa:cancelled transitions testing/in_progress to done/review", () => {
		const machine = new TaskStateMachine();

		const result = machine.transition(
			buildTransitionInput({
				trigger: "qa:cancelled",
				task: { status: "testing", columnId: "in-progress-col" },
			}),
		);

		expect(result).toEqual(
			expect.objectContaining({
				action: "update",
				patch: expect.objectContaining({
					status: "done",
					columnId: "review-col",
				}),
			}),
		);
	});

	it("qa:cancelled skips from non-testing state", () => {
		const machine = new TaskStateMachine();

		const result = machine.transition(
			buildTransitionInput({
				trigger: "qa:cancelled",
				task: { status: "done", columnId: "review-col" },
			}),
		);

		expect(result).toEqual({ action: "skip", patch: {}, effects: [] });
	});
});

describe("QA helper functions", () => {
	describe("isQaRunKind", () => {
		it("returns true for task-qa-testing", () => {
			expect(isQaRunKind("task-qa-testing")).toBe(true);
		});

		it("returns false for task-run", () => {
			expect(isQaRunKind("task-run")).toBe(false);
		});

		it("returns false for null", () => {
			expect(isQaRunKind(null)).toBe(false);
		});
	});

	describe("adaptTriggerForQa", () => {
		it("maps run:start to qa:start for QA runs", () => {
			expect(adaptTriggerForQa("run:start", "task-qa-testing")).toBe(
				"qa:start",
			);
		});

		it("maps run:done to qa:pass for QA runs", () => {
			expect(adaptTriggerForQa("run:done", "task-qa-testing")).toBe("qa:pass");
		});

		it("maps run:fail to qa:fail for QA runs", () => {
			expect(adaptTriggerForQa("run:fail", "task-qa-testing")).toBe("qa:fail");
		});

		it("maps run:cancelled to qa:cancelled for QA runs", () => {
			expect(adaptTriggerForQa("run:cancelled", "task-qa-testing")).toBe(
				"qa:cancelled",
			);
		});

		it("maps run:question to qa:fail for QA runs", () => {
			expect(adaptTriggerForQa("run:question", "task-qa-testing")).toBe(
				"qa:fail",
			);
		});

		it("maps run:dead to qa:fail for QA runs", () => {
			expect(adaptTriggerForQa("run:dead", "task-qa-testing")).toBe("qa:fail");
		});

		it("returns original trigger for non-QA runs", () => {
			expect(adaptTriggerForQa("run:start", "task-run")).toBe("run:start");
		});
	});

	describe("parseQaReportContent", () => {
		it("extracts content from QA REPORT tags", () => {
			expect(parseQaReportContent("<QA REPORT>Report body</QA REPORT>")).toBe(
				"Report body",
			);
		});

		it("returns trimmed content if no tags", () => {
			expect(parseQaReportContent("  plain report body  ")).toBe(
				"plain report body",
			);
		});

		it("handles multi-line content", () => {
			expect(
				parseQaReportContent(
					"<QA REPORT>\n- step one\n- step two\n</QA REPORT>",
				),
			).toBe("- step one\n- step two");
		});

		it("handles case-insensitive tags", () => {
			expect(
				parseQaReportContent("<qa report>Case insensitive</QA REPORT>"),
			).toBe("Case insensitive");
		});
	});
});
