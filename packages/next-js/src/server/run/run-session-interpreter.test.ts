import { describe, expect, it, vi } from "vitest";

import {
	deriveMetaStatus,
	extractReportTag,
	findLastAssistantReport,
	findStoryContent,
	findStrictStoryContent,
	hydrateGenerationOutcomeContent,
	stripTrailingReportTag,
	toRunLastExecutionStatus,
} from "@/server/run/run-session-interpreter";
import type { SessionInspectionResult } from "@/server/opencode/session-manager";
import type { Run } from "@/types/ipc";

function makeRun(overrides: Partial<Run> = {}): Run {
	const now = new Date().toISOString();
	return {
		id: "run-1",
		taskId: "task-1",
		sessionId: "session-1",
		roleId: "dev",
		mode: "execute",
		status: "running",
		createdAt: now,
		updatedAt: now,
		metadata: { kind: "task-run" },
		...overrides,
	};
}

function makeInspection(
	messages: Array<{
		role: "user" | "assistant";
		content: string;
		timestamp?: number;
		parts?: Array<{ type: "text" | "reasoning"; text: string }>;
	}>,
	status: SessionInspectionResult["sessionStatus"] = "idle",
): SessionInspectionResult {
	return {
		probeStatus: "alive",
		sessionStatus: status,
		messages: messages.map((m, i) => ({
			id: `m${i}`,
			role: m.role,
			content: m.content,
			parts: m.parts ?? [],
			timestamp: m.timestamp ?? i,
		})),
		todos: [],
		pendingPermissions: [],
		pendingQuestions: [],
		childSessions: [],
	};
}

describe("run-session-interpreter", () => {
	it("derives completed status for regular idle session with assistant message", () => {
		const meta = deriveMetaStatus(
			makeRun(),
			makeInspection([
				{
					role: "assistant",
					content: "Final answer",
					timestamp: Date.now(),
				},
			]),
		);

		expect(meta).toMatchObject({ kind: "completed" });
	});

	it("keeps story-chat runs running when session becomes idle", () => {
		const meta = deriveMetaStatus(
			makeRun({ metadata: { kind: "task-story-chat" } }),
			makeInspection([
				{
					role: "assistant",
					content: "Let me refine the story.",
					timestamp: Date.now(),
				},
			]),
		);

		expect(meta).toEqual({ kind: "running" });
	});

	it("keeps generation runs running when only pre-boundary assistant messages exist", () => {
		const meta = deriveMetaStatus(
			makeRun({
				metadata: {
					kind: "task-description-improve",
					storyGenerationRequestedAt: new Date(100).toISOString(),
				},
			}),
			makeInspection([
				{
					role: "assistant",
					content: "<STORY>Old story</STORY>",
					timestamp: 50,
				},
			]),
		);

		expect(meta).toEqual({ kind: "running" });
	});

	it("keeps generation runs running when post-boundary assistant message lacks <STORY>", () => {
		const meta = deriveMetaStatus(
			makeRun({
				metadata: {
					kind: "task-description-improve",
					storyGenerationRequestedAt: new Date(100).toISOString(),
				},
			}),
			makeInspection([
				{
					role: "assistant",
					content: "Still drafting",
					timestamp: 150,
				},
			]),
		);

		expect(meta).toEqual({ kind: "running" });
	});

	it("uses REPORT even when session is busy", () => {
		const meta = deriveMetaStatus(
			makeRun(),
			makeInspection(
				[
					{
						role: "assistant",
						content: "Work complete\n<REPORT>done</REPORT>",
					},
				],
				"busy",
			),
		);

		expect(meta).toEqual({
			kind: "reported",
			report: "done",
			content: "Work complete",
		});
	});

	it("uses REPORT even when probe status is not_found", () => {
		const inspection = makeInspection([
			{
				role: "assistant",
				content: "Final output\n<REPORT>test_ok</REPORT>",
			},
		]);
		inspection.probeStatus = "not_found";

		const meta = deriveMetaStatus(makeRun(), inspection);

		expect(meta).toEqual({
			kind: "reported",
			report: "test_ok",
			content: "Final output",
		});
	});

	it("uses REPORT even when session status is retry", () => {
		const meta = deriveMetaStatus(
			makeRun(),
			makeInspection(
				[
					{
						role: "assistant",
						content: "Will retry\n<REPORT>fail</REPORT>",
					},
				],
				"retry",
			),
		);

		expect(meta).toEqual({
			kind: "reported",
			report: "fail",
			content: "Will retry",
		});
	});

	it("prefers pending permission over REPORT", () => {
		const inspection = makeInspection(
			[{ role: "assistant", content: "Done\n<REPORT>done</REPORT>" }],
			"busy",
		);
		inspection.pendingPermissions = [
			{
				id: "perm-1",
				permissionType: "file_write",
				sessionId: "session-1",
				messageId: "msg-0",
				title: "Allow write?",
				metadata: {},
				createdAt: Date.now(),
			},
		];

		const meta = deriveMetaStatus(makeRun(), inspection);

		expect(meta).toEqual({
			kind: "permission",
			permission: inspection.pendingPermissions[0],
		});
	});

	it("prefers pending question over REPORT", () => {
		const inspection = makeInspection(
			[{ role: "assistant", content: "Need info\n<REPORT>question</REPORT>" }],
			"busy",
		);
		inspection.pendingQuestions = [
			{
				id: "q-1",
				sessionId: "session-1",
				questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
				createdAt: Date.now(),
			},
		];

		const meta = deriveMetaStatus(makeRun(), inspection);

		expect(meta).toEqual({
			kind: "question",
			questions: inspection.pendingQuestions,
		});
	});

	it("prefers active child session over parent REPORT", () => {
		const inspection = makeInspection(
			[{ role: "assistant", content: "Parent done\n<REPORT>done</REPORT>" }],
			"busy",
		);
		inspection.childSessions = [makeInspection([], "busy")];

		const meta = deriveMetaStatus(makeRun(), inspection);

		expect(meta).toEqual({ kind: "running" });
	});

	it("keeps parent running when child session is active even if probe is not_found", () => {
		const inspection = makeInspection([]);
		inspection.probeStatus = "not_found";
		inspection.childSessions = [makeInspection([], "busy")];

		const meta = deriveMetaStatus(makeRun(), inspection);

		expect(meta).toEqual({ kind: "running" });
	});

	it("derives completed status for generation runs only from strict post-boundary <STORY>", () => {
		const meta = deriveMetaStatus(
			makeRun({
				metadata: {
					kind: "task-description-improve",
					storyGenerationRequestedAt: new Date(100).toISOString(),
				},
			}),
			makeInspection([
				{
					role: "assistant",
					content: "reasoning\n<STORY>\n## Title\nFresh story\n</STORY>",
					timestamp: 150,
				},
			]),
		);

		expect(meta).toEqual({
			kind: "completed",
			content: "## Title\nFresh story",
		});
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

describe("findStrictStoryContent", () => {
	it("returns null when assistant output has no <STORY>", () => {
		expect(
			findStrictStoryContent(
				makeInspection([{ role: "assistant", content: "Reasoning only" }]),
			),
		).toBeNull();
	});

	it("extracts story from text parts without leaking reasoning parts", () => {
		expect(
			findStrictStoryContent(
				makeInspection([
					{
						role: "assistant",
						content: "I should think first",
						timestamp: 150,
						parts: [
							{ type: "reasoning", text: "I should think first" },
							{
								type: "text",
								text: "<STORY>\n## Title\nFrom text parts\n</STORY>",
							},
						],
					},
				]),
			),
		).toBe("## Title\nFrom text parts");
	});
});

describe("hydrateGenerationOutcomeContent", () => {
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
			makeRun({ metadata: { kind: "task-description-improve" } }),
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
			childSessions: [],
		};

		const result = await hydrateGenerationOutcomeContent(
			makeRun({ metadata: { kind: "task-description-improve" } }),
			"Let me analyze this task.",
			{
				inspectSession: vi.fn().mockResolvedValue(inspection),
			},
			"task-description-improve",
		);

		expect(result).toBe("## Title\nHydrated story");
	});

	it("returns original content when hydrated session has no strict post-boundary <STORY>", async () => {
		const result = await hydrateGenerationOutcomeContent(
			makeRun({
				metadata: {
					kind: "task-description-improve",
					storyGenerationRequestedAt: new Date(100).toISOString(),
				},
			}),
			"Some reasoning without story",
			{
				inspectSession: vi.fn().mockResolvedValue(
					makeInspection([
						{
							role: "assistant",
							content: "<STORY>Old story</STORY>",
							timestamp: 50,
						},
						{
							role: "assistant",
							content: "Still drafting",
							timestamp: 150,
						},
					]),
				),
			},
			"task-description-improve",
		);

		expect(result).toBe("Some reasoning without story");
	});

	it("returns original content when session inspection fails", async () => {
		const result = await hydrateGenerationOutcomeContent(
			makeRun({ metadata: { kind: "task-description-improve" } }),
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
			makeRun({
				sessionId: "",
				metadata: { kind: "task-description-improve" },
			}),
			"",
			{ inspectSession: vi.fn() },
			"task-description-improve",
		);

		expect(result).toBe("");
		expect(result).toBe("");
	});
});

describe("extractReportTag", () => {
	it("extracts done from valid REPORT tag", () => {
		expect(extractReportTag("<REPORT>done</REPORT>")).toBe("done");
	});

	it("extracts fail from REPORT tag with preceding content", () => {
		expect(extractReportTag("Some summary\n<REPORT>fail</REPORT>")).toBe(
			"fail",
		);
	});

	it("extracts question with whitespace inside tag", () => {
		expect(extractReportTag("<REPORT> question </REPORT>")).toBe("question");
	});

	it("extracts test_ok from REPORT tag", () => {
		expect(extractReportTag("<REPORT>test_ok</REPORT>")).toBe("test_ok");
	});

	it("extracts test_fail from REPORT tag", () => {
		expect(extractReportTag("<REPORT>test_fail</REPORT>")).toBe("test_fail");
	});

	it("returns null when no REPORT tag is present", () => {
		expect(extractReportTag("Just regular text")).toBeNull();
	});

	it("returns null when multiple REPORT tags found (malformed)", () => {
		expect(
			extractReportTag("<REPORT>done</REPORT> some text <REPORT>fail</REPORT>"),
		).toBeNull();
	});
});

describe("stripTrailingReportTag", () => {
	it("removes trailing REPORT tag and trims", () => {
		expect(stripTrailingReportTag("summary\n<REPORT>done</REPORT>")).toBe(
			"summary",
		);
	});

	it("preserves QA REPORT content while removing REPORT tag", () => {
		const input =
			"<QA REPORT>\n## Recommendation\nPASS\n</QA REPORT>\n<REPORT>test_ok</REPORT>";
		const result = stripTrailingReportTag(input);
		expect(result).toBe("<QA REPORT>\n## Recommendation\nPASS\n</QA REPORT>");
	});
});

describe("findLastAssistantReport", () => {
	it("finds REPORT from the most recent assistant message", () => {
		const inspection = makeInspection([
			{ role: "assistant", content: "First\n<REPORT>fail</REPORT>" },
			{ role: "user", content: "continue" },
			{ role: "assistant", content: "Second\n<REPORT>done</REPORT>" },
		]);

		expect(findLastAssistantReport(inspection)).toEqual({
			report: "done",
			content: "Second",
		});
	});

	it("returns null when no assistant REPORT exists", () => {
		expect(
			findLastAssistantReport(
				makeInspection([
					{ role: "assistant", content: "No report" },
					{ role: "user", content: "Thanks" },
				]),
			),
		).toBeNull();
	});
});
