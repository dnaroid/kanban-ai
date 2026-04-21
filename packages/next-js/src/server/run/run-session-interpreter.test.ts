import { describe, expect, it, vi } from "vitest";

import {
	deriveMetaStatus,
	findStoryContent,
	hydrateGenerationOutcomeContent,
	toRunLastExecutionStatus,
} from "@/server/run/run-session-interpreter";
import type { SessionInspectionResult } from "@/server/opencode/session-manager";

describe("run-session-interpreter", () => {
	it("derives completed status from idle session with assistant message", () => {
		const meta = deriveMetaStatus({
			probeStatus: "alive",
			sessionStatus: "idle",
			messages: [
				{
					id: "m1",
					role: "assistant",
					content: "Final answer",
					parts: [],
					timestamp: Date.now(),
				},
			],
			todos: [],
			pendingPermissions: [],
			pendingQuestions: [],
		});

		expect(meta).toMatchObject({ kind: "completed" });
	});

	it("derives completed status from unknown session status with probe alive and assistant message", () => {
		const meta = deriveMetaStatus({
			probeStatus: "alive",
			sessionStatus: "unknown",
			messages: [
				{
					id: "m1",
					role: "assistant",
					content: "Final answer",
					parts: [],
					timestamp: Date.now(),
				},
			],
			todos: [],
			pendingPermissions: [],
			pendingQuestions: [],
		});

		expect(meta).toMatchObject({ kind: "completed" });
	});

	it("maps meta status to run last execution status", () => {
		const status = toRunLastExecutionStatus(
			{ kind: "completed", content: "ok" },
			"session-1",
		);

		expect(status).toMatchObject({
			kind: "completed",
			content: "ok",
			sessionId: "session-1",
		});
	});
});

describe("findStoryContent", () => {
	function makeInspection(
		messages: Array<{ role: "user" | "assistant"; content: string }>,
	): SessionInspectionResult {
		return {
			probeStatus: "alive",
			sessionStatus: "idle",
			messages: messages.map((m, i) => ({
				id: `m${i}`,
				role: m.role,
				content: m.content,
				parts: [],
				timestamp: i,
			})),
			todos: [],
			pendingPermissions: [],
			pendingQuestions: [],
		};
	}

	it("returns empty string when there are no messages", () => {
		expect(findStoryContent(makeInspection([]))).toBe("");
	});

	it("returns empty string when there are only user messages", () => {
		expect(
			findStoryContent(makeInspection([{ role: "user", content: "hello" }])),
		).toBe("");
	});

	it("returns full content when assistant message has no <STORY> tags", () => {
		expect(
			findStoryContent(
				makeInspection([{ role: "assistant", content: "Simple response" }]),
			),
		).toBe("Simple response");
	});

	it("extracts content between <STORY> tags from last assistant message", () => {
		const content = [
			"Let me analyze this task.",
			"",
			'<META>{"type":"feature"}</META>',
			"",
			"<STORY>",
			"## Title",
			"Fix the bug",
			"",
			"## Goal",
			"Make it work",
			"</STORY>",
		].join("\n");

		expect(
			findStoryContent(makeInspection([{ role: "assistant", content }])),
		).toBe("## Title\nFix the bug\n\n## Goal\nMake it work");
	});

	it("extracts story from last assistant message even when earlier ones lack <STORY>", () => {
		const inspection = makeInspection([
			{ role: "assistant", content: "Let me explore the codebase." },
			{ role: "assistant", content: "Still exploring..." },
			{
				role: "assistant",
				content: [
					"I have the answer.",
					"<STORY>",
					"## Title",
					"The real story",
					"</STORY>",
				].join("\n"),
			},
		]);

		expect(findStoryContent(inspection)).toBe("## Title\nThe real story");
	});

	it("skips assistant messages without <STORY> and falls back to the last non-empty one", () => {
		const inspection = makeInspection([
			{ role: "assistant", content: "Thinking..." },
			{ role: "user", content: "continue" },
			{ role: "assistant", content: "Still thinking..." },
		]);

		expect(findStoryContent(inspection)).toBe("Still thinking...");
	});

	it("handles <STORY> tags with different casing", () => {
		const content = "<story>\n## Title\nHello\n</story>";

		expect(
			findStoryContent(makeInspection([{ role: "assistant", content }])),
		).toBe("## Title\nHello");
	});

	it("handles <STORY> tags with leading/trailing whitespace inside", () => {
		const content = "<STORY>  \n  ## Title\nHello  \n  </STORY>";

		expect(
			findStoryContent(makeInspection([{ role: "assistant", content }])),
		).toBe("## Title\nHello");
	});
});

describe("hydrateGenerationOutcomeContent", () => {
	function makeRun(overrides: Record<string, unknown> = {}) {
		return {
			id: "run-1",
			sessionId: "session-1",
			metadata: { kind: "task-description-improve" },
			...overrides,
		} as any;
	}

	it("returns content as-is for non-generation runs", async () => {
		const result = await hydrateGenerationOutcomeContent(
			makeRun({
				metadata: { kind: "task-run" },
			}),
			"some content",
			{
				inspectSession: vi.fn(),
			},
			"task-description-improve",
		);

		expect(result).toBe("some content");
	});

	it("extracts <STORY> directly from non-empty content without calling inspectSession", async () => {
		const inspectSession = vi.fn();
		const content = [
			"Some reasoning text",
			"<STORY>",
			"## Title",
			"Direct story",
			"</STORY>",
		].join("\n");

		const result = await hydrateGenerationOutcomeContent(
			makeRun(),
			content,
			{ inspectSession },
			"task-description-improve",
		);

		expect(result).toBe("## Title\nDirect story");
		expect(inspectSession).not.toHaveBeenCalled();
	});

	it("hydrates from session when content has no <STORY> tags", async () => {
		const inspection: SessionInspectionResult = {
			probeStatus: "alive",
			sessionStatus: "idle",
			messages: [
				{
					id: "m1",
					role: "assistant",
					content: "<STORY>\n## Title\nHydrated story\n</STORY>",
					parts: [],
					timestamp: 1,
				},
			],
			todos: [],
			pendingPermissions: [],
			pendingQuestions: [],
		};

		const result = await hydrateGenerationOutcomeContent(
			makeRun(),
			"Let me analyze this task.",
			{
				inspectSession: vi.fn().mockResolvedValue(inspection),
			},
			"task-description-improve",
		);

		expect(result).toBe("## Title\nHydrated story");
	});

	it("returns original content when session inspection fails", async () => {
		const result = await hydrateGenerationOutcomeContent(
			makeRun(),
			"Some reasoning without story",
			{
				inspectSession: vi.fn().mockRejectedValue(new Error("fail")),
			},
			"task-description-improve",
		);

		expect(result).toBe("Some reasoning without story");
	});

	it("returns empty content when run has no session id", async () => {
		const result = await hydrateGenerationOutcomeContent(
			makeRun({ sessionId: "" }),
			"",
			{ inspectSession: vi.fn() },
			"task-description-improve",
		);

		expect(result).toBe("");
		expect(result).toBe("");
	});
});
