import { describe, expect, it } from "vitest";
import type { Run } from "@shared/types/ipc.ts";
import { selectRunId } from "./TaskDrawerRuns";

function buildRun(overrides: Partial<Run>): Run {
	return {
		id: "0f2d9e6e-b89a-4e31-a293-1f2e20f1b72a",
		taskId: "8f4bbf12-7f64-4e6d-ae99-a7b3cd8c2d91",
		roleId: "default",
		mode: "execute",
		kind: "task-run",
		status: "queued",
		startedAt: undefined,
		finishedAt: undefined,
		errorText: "",
		budget: {},
		contextSnapshotId: "4ff3e563-8a90-4f27-a3e7-4e21f45c99b2",
		sessionId: undefined,
		aiTokensIn: 0,
		aiTokensOut: 0,
		aiCostUsd: 0,
		createdAt: "2026-02-14T10:00:00.000Z",
		updatedAt: "2026-02-14T10:00:00.000Z",
		...overrides,
	};
}

describe("selectRunId", () => {
	it("returns null when no runs are present", () => {
		expect(selectRunId([], null)).toBeNull();
	});

	it("keeps previous selection when that run still exists", () => {
		const runA = buildRun({
			id: "a4ca443a-f5d6-4135-adca-8fce4f2f7f0c",
			status: "failed",
			createdAt: "2026-02-14T09:00:00.000Z",
		});
		const runB = buildRun({
			id: "3b7f86c0-b617-4d82-a259-c4f37ab8b87d",
			status: "succeeded",
			createdAt: "2026-02-14T11:00:00.000Z",
		});

		expect(selectRunId([runA, runB], runA.id)).toBe(runA.id);
	});

	it("falls back to active run when previous selection is stale", () => {
		const queuedRun = buildRun({
			id: "8bc08d79-3929-4f17-9a28-57d6caa3cb9e",
			status: "queued",
			createdAt: "2026-02-14T08:00:00.000Z",
		});
		const latestSucceeded = buildRun({
			id: "f375c062-a532-4804-8e96-fcd9b35f8058",
			status: "succeeded",
			createdAt: "2026-02-14T12:00:00.000Z",
		});

		expect(selectRunId([latestSucceeded, queuedRun], "missing-id")).toBe(
			queuedRun.id,
		);
	});

	it("selects newest run when no active run exists", () => {
		const olderRun = buildRun({
			id: "4de0e91e-d4ef-4d3a-ae9f-635ca64e8e31",
			status: "failed",
			createdAt: "2026-02-14T07:00:00.000Z",
		});
		const newestRun = buildRun({
			id: "947a868f-7f52-4ffd-8c8c-cb8d85d81f37",
			status: "succeeded",
			createdAt: "2026-02-14T13:00:00.000Z",
		});

		expect(selectRunId([olderRun, newestRun], "missing-id")).toBe(newestRun.id);
	});
});
