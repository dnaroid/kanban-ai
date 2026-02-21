import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
	dbManager: {
		connect: vi.fn(),
	},
}));

import { dbManager } from "@/server/db";
import {
	canTransitionStatus,
	getDefaultWorkflowColumns,
	getPreferredColumnIdForStatus,
	resetWorkflowRuntimeConfigForTests,
} from "./task-workflow-manager";

type StatementResult = {
	all: (...args: unknown[]) => unknown[];
};

type FakeDb = {
	prepare: (sql: string) => StatementResult;
};

function createWorkflowDbMock(options: {
	tablesExist: boolean;
	backlogName: string;
}): FakeDb {
	const statusRows = [
		{
			status: "queued",
			preferredColumnSystemKey: "ready",
			blockedReason: null,
			closedReason: null,
		},
		{
			status: "running",
			preferredColumnSystemKey: "in_progress",
			blockedReason: null,
			closedReason: null,
		},
		{
			status: "question",
			preferredColumnSystemKey: "blocked",
			blockedReason: "question",
			closedReason: null,
		},
		{
			status: "paused",
			preferredColumnSystemKey: "blocked",
			blockedReason: "paused",
			closedReason: null,
		},
		{
			status: "done",
			preferredColumnSystemKey: "review",
			blockedReason: null,
			closedReason: "done",
		},
		{
			status: "failed",
			preferredColumnSystemKey: "blocked",
			blockedReason: "failed",
			closedReason: "failed",
		},
		{
			status: "generating",
			preferredColumnSystemKey: "in_progress",
			blockedReason: null,
			closedReason: null,
		},
	];

	const templateRows = [
		{
			systemKey: "backlog",
			name: options.backlogName,
			color: "#6366f1",
			defaultStatus: "queued",
		},
		{
			systemKey: "ready",
			name: "Ready",
			color: "#0ea5e9",
			defaultStatus: "queued",
		},
		{
			systemKey: "deferred",
			name: "Deferred",
			color: "#6b7280",
			defaultStatus: "queued",
		},
		{
			systemKey: "in_progress",
			name: "In Progress",
			color: "#f59e0b",
			defaultStatus: "running",
		},
		{
			systemKey: "blocked",
			name: "Blocked",
			color: "#ef4444",
			defaultStatus: "paused",
		},
		{
			systemKey: "review",
			name: "Review / QA",
			color: "#8b5cf6",
			defaultStatus: "done",
		},
		{
			systemKey: "closed",
			name: "Closed",
			color: "#10b981",
			defaultStatus: "done",
		},
	];

	const allowedStatusRows = [
		{ systemKey: "backlog", status: "queued" },
		{ systemKey: "ready", status: "queued" },
		{ systemKey: "deferred", status: "queued" },
		{ systemKey: "in_progress", status: "running" },
		{ systemKey: "in_progress", status: "generating" },
		{ systemKey: "blocked", status: "question" },
		{ systemKey: "blocked", status: "paused" },
		{ systemKey: "blocked", status: "failed" },
		{ systemKey: "review", status: "done" },
		{ systemKey: "closed", status: "done" },
		{ systemKey: "closed", status: "failed" },
	];

	const statusTransitionRows = [
		{ fromStatus: "queued", toStatus: "running" },
		{ fromStatus: "running", toStatus: "queued" },
		{ fromStatus: "running", toStatus: "done" },
		{ fromStatus: "question", toStatus: "queued" },
		{ fromStatus: "paused", toStatus: "queued" },
		{ fromStatus: "done", toStatus: "running" },
		{ fromStatus: "failed", toStatus: "queued" },
		{ fromStatus: "generating", toStatus: "queued" },
	];

	const columnTransitionRows = [
		{ fromSystemKey: "backlog", toSystemKey: "ready" },
		{ fromSystemKey: "ready", toSystemKey: "in_progress" },
		{ fromSystemKey: "deferred", toSystemKey: "ready" },
		{ fromSystemKey: "in_progress", toSystemKey: "review" },
		{ fromSystemKey: "blocked", toSystemKey: "in_progress" },
		{ fromSystemKey: "review", toSystemKey: "closed" },
		{ fromSystemKey: "closed", toSystemKey: "backlog" },
	];

	return {
		prepare: (sql: string) => ({
			all: (...args: unknown[]) => {
				if (sql.includes("sqlite_master")) {
					if (!options.tablesExist) {
						return [];
					}

					return (args as string[]).map((name) => ({ name }));
				}

				if (sql.includes("FROM workflow_statuses")) {
					return statusRows;
				}

				if (sql.includes("FROM workflow_column_templates")) {
					return templateRows;
				}

				if (sql.includes("FROM workflow_column_allowed_statuses")) {
					return allowedStatusRows;
				}

				if (sql.includes("FROM workflow_status_transitions")) {
					return statusTransitionRows;
				}

				if (sql.includes("FROM workflow_column_transitions")) {
					return columnTransitionRows;
				}

				return [];
			},
		}),
	};
}

describe("task-workflow-manager runtime config", () => {
	beforeEach(() => {
		vi.mocked(dbManager.connect).mockReset();
		resetWorkflowRuntimeConfigForTests();
	});

	it("loads workflow templates and transitions from database", () => {
		vi.mocked(dbManager.connect).mockReturnValue(
			createWorkflowDbMock({
				tablesExist: true,
				backlogName: "Backlog from DB",
			}) as unknown as ReturnType<typeof dbManager.connect>,
		);

		const columns = getDefaultWorkflowColumns();
		expect(columns[0]).toEqual({
			name: "Backlog from DB",
			systemKey: "backlog",
			color: "#6366f1",
		});

		expect(canTransitionStatus("queued", "running")).toBe(true);
		expect(canTransitionStatus("queued", "done")).toBe(false);

		const board = {
			id: "b1",
			projectId: "p1",
			name: "Board",
			createdAt: "",
			updatedAt: "",
			columns: [
				{
					id: "c1",
					boardId: "b1",
					name: "Backlog",
					orderIndex: 0,
					createdAt: "",
					updatedAt: "",
					systemKey: "backlog",
				},
				{
					id: "c2",
					boardId: "b1",
					name: "Ready",
					orderIndex: 1,
					createdAt: "",
					updatedAt: "",
					systemKey: "ready",
				},
			],
		};

		expect(getPreferredColumnIdForStatus(board, "queued")).toBe("c2");
	});

	it("falls back to built-in workflow when tables are missing", () => {
		vi.mocked(dbManager.connect).mockReturnValue(
			createWorkflowDbMock({
				tablesExist: false,
				backlogName: "Ignored",
			}) as unknown as ReturnType<typeof dbManager.connect>,
		);

		const columns = getDefaultWorkflowColumns();
		expect(columns[0]).toEqual({
			name: "Backlog",
			systemKey: "backlog",
			color: "#6366f1",
		});

		expect(canTransitionStatus("queued", "done")).toBe(true);
	});
});
