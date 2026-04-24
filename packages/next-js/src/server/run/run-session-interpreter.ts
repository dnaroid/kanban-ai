import { createLogger } from "@/lib/logger";
import type {
	PermissionData,
	QuestionData,
	SessionInspectionResult,
} from "@/server/opencode/session-manager";
import type { RunLastExecutionStatus } from "@/types/ipc";
import type { Run } from "@/types/ipc";

export type ReportTag = "done" | "fail" | "question" | "test_ok" | "test_fail";

const REPORT_TAG_RE =
	/<REPORT>\s*(done|fail|question|test_ok|test_fail)\s*<\/REPORT>/gi;

const log = createLogger("runs-queue");

export type SessionMetaStatus =
	| {
			kind: "reported";
			report: ReportTag;
			content: string;
	  }
	| {
			kind: "completed";
			content: string;
	  }
	| { kind: "question"; questions: QuestionData[] }
	| { kind: "permission"; permission: PermissionData }
	| { kind: "running" }
	| { kind: "dead" };

export function extractReportTag(text: string): ReportTag | null {
	REPORT_TAG_RE.lastIndex = 0;
	const matches: ReportTag[] = [];
	let match = REPORT_TAG_RE.exec(text);
	while (match !== null) {
		matches.push(match[1].toLowerCase() as ReportTag);
		match = REPORT_TAG_RE.exec(text);
	}
	if (matches.length === 0) return null;
	if (matches.length > 1) {
		log.warn("Multiple REPORT tags found in message; treating as malformed", {
			tagCount: matches.length,
		});
		return null;
	}
	return matches[0];
}

export function stripTrailingReportTag(text: string): string {
	return text
		.replace(
			/\s*<REPORT>\s*(done|fail|question|test_ok|test_fail)\s*<\/REPORT>\s*$/i,
			"",
		)
		.trim();
}

type StorySearchOptions = {
	afterTimestamp?: number;
};

export function deriveMetaStatus(
	run: Run,
	inspection: SessionInspectionResult,
): SessionMetaStatus;
export function deriveMetaStatus(
	inspection: SessionInspectionResult,
): SessionMetaStatus;
export function deriveMetaStatus(
	runOrInspection: Run | SessionInspectionResult,
	inspectionArg?: SessionInspectionResult,
): SessionMetaStatus {
	const run = inspectionArg ? (runOrInspection as Run) : null;
	const inspection =
		inspectionArg ?? (runOrInspection as SessionInspectionResult);
	const runKind =
		typeof run?.metadata?.kind === "string" ? run.metadata.kind : "";
	const isStoryChatRun = runKind === "task-story-chat";
	const isGenerationRun = runKind === "task-description-improve";
	const storyGenerationBoundary = getStoryGenerationBoundaryTimestamp(run);

	const permission = inspection.pendingPermissions[0];
	if (permission) {
		return { kind: "permission", permission };
	}

	const question = inspection.pendingQuestions[0];
	if (question) {
		return { kind: "question", questions: inspection.pendingQuestions };
	}

	if (inspection.probeStatus === "not_found") {
		return { kind: "dead" };
	}

	if (
		inspection.sessionStatus === "busy" ||
		inspection.sessionStatus === "retry"
	) {
		return { kind: "running" };
	}

	if (hasActiveChildSessions(inspection)) {
		return { kind: "running" };
	}

	if (isStoryChatRun) {
		return { kind: "running" };
	}

	if (isGenerationRun) {
		const content = findStrictStoryContent(inspection, {
			afterTimestamp: storyGenerationBoundary ?? undefined,
		});
		if (content) {
			return { kind: "completed", content };
		}

		return { kind: "running" };
	}

	if (
		inspection.probeStatus === "alive" &&
		(inspection.sessionStatus === "idle" ||
			inspection.sessionStatus === "unknown")
	) {
		const latestMessage = inspection.messages[inspection.messages.length - 1];
		if (latestMessage?.role === "assistant") {
			const candidates = buildAssistantTextContent(latestMessage);
			for (const candidate of candidates) {
				const report = extractReportTag(candidate);
				if (report) {
					const content = stripTrailingReportTag(candidate);
					return { kind: "reported", report, content };
				}
			}
		}
	}

	if (
		inspection.probeStatus === "alive" &&
		(inspection.sessionStatus === "idle" ||
			inspection.sessionStatus === "unknown")
	) {
		const latestMessage = inspection.messages[inspection.messages.length - 1];
		if (latestMessage?.role !== "user") {
			const content = findStoryContent(inspection);
			log.warn(
				"Session completed without explicit REPORT tag; falling back to legacy completion heuristic",
				{
					runId: run?.id,
					runKind: run?.metadata?.kind,
				},
			);
			return { kind: "completed", content };
		}
	}

	return { kind: "running" };
}

function hasActiveChildSessions(inspection: SessionInspectionResult): boolean {
	for (const childInspection of inspection.childSessions ?? []) {
		const childMeta = deriveMetaStatus(childInspection);
		if (
			childMeta.kind === "running" ||
			childMeta.kind === "permission" ||
			childMeta.kind === "question"
		) {
			return true;
		}
	}

	return false;
}

export function toRunLastExecutionStatus(
	meta: SessionMetaStatus,
	sessionId: string,
): RunLastExecutionStatus {
	const updatedAt = new Date().toISOString();

	switch (meta.kind) {
		case "reported": {
			const reportedKind =
				meta.report === "done" || meta.report === "test_ok"
					? "completed"
					: meta.report === "fail" || meta.report === "test_fail"
						? "failed"
						: "question";
			return {
				kind: reportedKind,
				...(reportedKind !== "question" ? { content: meta.content } : {}),
				sessionId,
				updatedAt,
			};
		}
		case "completed":
			return {
				kind: "completed",
				content: meta.content,
				sessionId,
				updatedAt,
			};
		case "permission":
			return {
				kind: "permission",
				sessionId,
				permissionId: meta.permission.id,
				updatedAt,
			};
		case "question":
			return {
				kind: "question",
				sessionId,
				questionId: meta.questions[0]?.id,
				updatedAt,
			};
		case "running":
			return {
				kind: "running",
				sessionId,
				updatedAt,
			};
		case "dead":
			return {
				kind: "dead",
				sessionId,
				updatedAt,
			};
	}
}

export async function hydrateGenerationOutcomeContent(
	run: Run,
	content: string,
	sessionManager: {
		inspectSession: (sessionId: string) => Promise<SessionInspectionResult>;
	},
	generationRunKind: string,
): Promise<string> {
	if (run.metadata?.kind !== generationRunKind) {
		return content;
	}

	const sessionId = run.sessionId.trim();
	if (sessionId.length === 0) {
		return content;
	}

	const storyFromCurrentContent = extractStoryTagContent(content);
	if (storyFromCurrentContent) {
		return storyFromCurrentContent;
	}

	try {
		const inspection = await sessionManager.inspectSession(sessionId);
		const hydrated = findStrictStoryContent(inspection, {
			afterTimestamp: getStoryGenerationBoundaryTimestamp(run) ?? undefined,
		});
		if (hydrated) {
			return hydrated;
		}

		log.warn("Generation finalized without strict <STORY> payload", {
			runId: run.id,
			sessionId,
			storyGenerationRequestedAt:
				typeof run.metadata?.storyGenerationRequestedAt === "string"
					? run.metadata.storyGenerationRequestedAt
					: null,
		});
		return content;
	} catch (error) {
		log.warn("Failed to hydrate generation outcome content from session", {
			runId: run.id,
			sessionId,
			error: error instanceof Error ? error.message : String(error),
		});
		return content;
	}
}

const STORY_TAG_RE = /<STORY>([\s\S]*?)<\/STORY>/i;

function extractStoryTagContent(text: string): string | null {
	const match = text.match(STORY_TAG_RE);
	return match?.[1]?.trim() || null;
}

function getStoryGenerationBoundaryTimestamp(run: Run | null): number | null {
	const rawTimestamp = run?.metadata?.storyGenerationRequestedAt;
	if (typeof rawTimestamp !== "string") {
		return null;
	}

	const parsedTimestamp = Date.parse(rawTimestamp);
	return Number.isNaN(parsedTimestamp) ? null : parsedTimestamp;
}

function findLatestAssistantMessage(
	inspection: SessionInspectionResult,
	options: StorySearchOptions = {},
) {
	for (let i = inspection.messages.length - 1; i >= 0; i--) {
		const msg = inspection.messages[i];
		if (msg.role !== "assistant") {
			continue;
		}
		if (
			typeof options.afterTimestamp === "number" &&
			msg.timestamp < options.afterTimestamp
		) {
			continue;
		}
		return msg;
	}

	return null;
}

function buildAssistantTextContent(message: {
	content: string;
	parts: Array<{ type: string; text?: string }>;
}): string[] {
	const candidates: string[] = [];
	const rawContent = message.content.trim();
	if (rawContent.length > 0) {
		candidates.push(rawContent);
	}

	const textOnlyContent = message.parts
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text?.trim() ?? "")
		.filter((part) => part.length > 0)
		.join("\n\n")
		.trim();

	if (textOnlyContent.length > 0 && textOnlyContent !== rawContent) {
		candidates.push(textOnlyContent);
	}

	return candidates;
}

export function findStrictStoryContent(
	inspection: SessionInspectionResult,
	options: StorySearchOptions = {},
): string | null {
	let message = findLatestAssistantMessage(inspection, options);
	while (message) {
		for (const candidate of buildAssistantTextContent(message)) {
			const storyContent = extractStoryTagContent(candidate);
			if (storyContent) {
				return storyContent;
			}
		}

		message = findLatestAssistantMessage(
			{
				...inspection,
				messages: inspection.messages.slice(
					0,
					inspection.messages.indexOf(message),
				),
			},
			options,
		);
	}

	return null;
}

export function findStoryContent(inspection: SessionInspectionResult): string {
	for (let i = inspection.messages.length - 1; i >= 0; i--) {
		const msg = inspection.messages[i];
		if (msg.role !== "assistant") {
			continue;
		}

		const content = msg.content.trim();
		if (content.length === 0) {
			continue;
		}

		const storyContent = extractStoryTagContent(content);
		if (storyContent) {
			return storyContent;
		}

		return content;
	}
	return "";
}

export function isNetworkError(error: unknown): boolean {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";
	const normalizedMessage = message.trim().toLowerCase();
	if (!normalizedMessage) {
		return false;
	}

	return (
		normalizedMessage === "fetch failed" ||
		normalizedMessage.includes("econnrefused") ||
		normalizedMessage.includes("network") ||
		normalizedMessage.includes("etimedout") ||
		normalizedMessage.includes("econnreset") ||
		normalizedMessage.includes("service unavailable")
	);
}
