import { beforeEach, describe, expect, it } from "vitest";

import {
	canTransitionColumn,
	canTransitionStatus,
	getDefaultWorkflowColumns,
	getDefaultStatusForWorkflowColumn,
	getPreferredColumnIdForStatus,
	isStatusAllowedInWorkflowColumn,
	isWorkflowTaskStatus,
	resetWorkflowRuntimeConfigForTests,
	resolveTaskStatusBySignal,
} from "./task-workflow-manager";

describe("task-workflow-manager runtime config", () => {
	beforeEach(() => {
		resetWorkflowRuntimeConfigForTests();
	});

	it("returns hardcoded default workflow columns", () => {
		const columns = getDefaultWorkflowColumns();
		expect(columns[0]).toEqual({
			name: "Deferred",
			systemKey: "deferred",
			color: "#6b7280",
			icon: "clock",
		});
		expect(columns).toHaveLength(7);
		expect(columns.map((c) => c.systemKey)).toEqual([
			"deferred",
			"backlog",
			"ready",
			"in_progress",
			"blocked",
			"review",
			"closed",
		]);
	});

	it("validates status transitions from hardcoded config", () => {
		expect(canTransitionStatus("pending", "running")).toBe(true);
		expect(canTransitionStatus("pending", "done")).toBe(true);
		expect(canTransitionStatus("pending", "generating")).toBe(true);
		expect(canTransitionStatus("running", "done")).toBe(true);
		expect(canTransitionStatus("done", "running")).toBe(true);
		expect(canTransitionStatus("done", "pending")).toBe(true);
		expect(canTransitionStatus("failed", "done")).toBe(false);
		expect(canTransitionStatus("generating", "done")).toBe(true);
	});

	it("validates column transitions from hardcoded config", () => {
		expect(canTransitionColumn("backlog", "ready")).toBe(true);
		expect(canTransitionColumn("ready", "in_progress")).toBe(true);
		expect(canTransitionColumn("in_progress", "review")).toBe(true);
		expect(canTransitionColumn("review", "closed")).toBe(true);
		expect(canTransitionColumn("closed", "backlog")).toBe(true);
		expect(canTransitionColumn("closed", "ready")).toBe(true);
		expect(canTransitionColumn("backlog", "closed")).toBe(false);
	});

	it("maps status to preferred column via board lookup", () => {
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
				{
					id: "c3",
					boardId: "b1",
					name: "In Progress",
					orderIndex: 2,
					createdAt: "",
					updatedAt: "",
					systemKey: "in_progress",
				},
			],
		};

		expect(getPreferredColumnIdForStatus(board, "pending")).toBe("c2");
		expect(getPreferredColumnIdForStatus(board, "running")).toBe("c3");
		expect(getPreferredColumnIdForStatus(board, "unknown_status")).toBeNull();
	});

	it("resolves task status by signal", () => {
		const result = resolveTaskStatusBySignal({
			signalKey: "run_started",
			currentStatus: "pending",
			runStatus: "running",
		});
		expect(result).toBe("running");
	});

	it("resolves user action signals", () => {
		const result = resolveTaskStatusBySignal({
			signalKey: "pause_run",
			currentStatus: "running",
		});
		expect(result).toBe("paused");
	});

	it("returns null for unknown signal", () => {
		const result = resolveTaskStatusBySignal({
			signalKey: "nonexistent_signal",
			currentStatus: "pending",
		});
		expect(result).toBeNull();
	});

	it("checks if status is allowed in workflow column", () => {
		expect(isStatusAllowedInWorkflowColumn("pending", "backlog")).toBe(true);
		expect(isStatusAllowedInWorkflowColumn("running", "in_progress")).toBe(
			true,
		);
		expect(isStatusAllowedInWorkflowColumn("done", "review")).toBe(true);
		expect(isStatusAllowedInWorkflowColumn("running", "backlog")).toBe(false);
		expect(isStatusAllowedInWorkflowColumn("pending", "in_progress")).toBe(
			false,
		);
	});

	it("returns default status for workflow column", () => {
		expect(getDefaultStatusForWorkflowColumn("backlog")).toBe("pending");
		expect(getDefaultStatusForWorkflowColumn("in_progress")).toBe("running");
		expect(getDefaultStatusForWorkflowColumn("review")).toBe("done");
		expect(getDefaultStatusForWorkflowColumn("blocked")).toBe("paused");
	});

	it("preserves current status if allowed in target column", () => {
		expect(getDefaultStatusForWorkflowColumn("in_progress", "running")).toBe(
			"running",
		);
		expect(getDefaultStatusForWorkflowColumn("backlog", "running")).toBe(
			"pending",
		);
	});

	it("recognizes valid workflow task statuses", () => {
		expect(isWorkflowTaskStatus("pending")).toBe(true);
		expect(isWorkflowTaskStatus("running")).toBe(true);
		expect(isWorkflowTaskStatus("done")).toBe(true);
		expect(isWorkflowTaskStatus("generating")).toBe(true);
		expect(isWorkflowTaskStatus("unknown")).toBe(false);
	});
});
