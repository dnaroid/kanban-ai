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
			orderIndex: 0,
			preferredColumnSystemKey: "ready",
			blockedReason: null,
			closedReason: null,
			color: "#f59e0b",
			icon: "clock",
		},
		{
			status: "running",
			orderIndex: 1,
			preferredColumnSystemKey: "in_progress",
			blockedReason: null,
			closedReason: null,
			color: "#3b82f6",
			icon: "play",
		},
		{
			status: "question",
			orderIndex: 2,
			preferredColumnSystemKey: "blocked",
			blockedReason: "question",
			closedReason: null,
			color: "#f97316",
			icon: "help-circle",
		},
		{
			status: "paused",
			orderIndex: 3,
			preferredColumnSystemKey: "blocked",
			blockedReason: "paused",
			closedReason: null,
			color: "#eab308",
			icon: "pause",
		},
		{
			status: "done",
			orderIndex: 4,
			preferredColumnSystemKey: "review",
			blockedReason: null,
			closedReason: "done",
			color: "#10b981",
			icon: "check-circle",
		},
		{
			status: "failed",
			orderIndex: 5,
			preferredColumnSystemKey: "blocked",
			blockedReason: "failed",
			closedReason: "failed",
			color: "#ef4444",
			icon: "x-circle",
		},
		{
			status: "generating",
			orderIndex: 6,
			preferredColumnSystemKey: "in_progress",
			blockedReason: null,
			closedReason: null,
			color: "#8b5cf6",
			icon: "sparkles",
		},
	];

	const templateRows = [
		{
			systemKey: "backlog",
			name: options.backlogName,
			color: "#6366f1",
			icon: "list",
			orderIndex: 0,
			defaultStatus: "queued",
		},
		{
			systemKey: "ready",
			name: "Ready",
			color: "#0ea5e9",
			icon: "check-circle",
			orderIndex: 1,
			defaultStatus: "queued",
		},
		{
			systemKey: "deferred",
			name: "Deferred",
			color: "#6b7280",
			icon: "clock",
			orderIndex: 2,
			defaultStatus: "queued",
		},
		{
			systemKey: "in_progress",
			name: "In Progress",
			color: "#f59e0b",
			icon: "play",
			orderIndex: 3,
			defaultStatus: "running",
		},
		{
			systemKey: "blocked",
			name: "Blocked",
			color: "#ef4444",
			icon: "shield-alert",
			orderIndex: 4,
			defaultStatus: "paused",
		},
		{
			systemKey: "review",
			name: "Review / QA",
			color: "#8b5cf6",
			icon: "eye",
			orderIndex: 5,
			defaultStatus: "done",
		},
		{
			systemKey: "closed",
			name: "Closed",
			color: "#10b981",
			icon: "archive",
			orderIndex: 6,
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
			icon: "list",
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
			icon: "list",
		});

		expect(canTransitionStatus("queued", "done")).toBe(true);
	});
});
