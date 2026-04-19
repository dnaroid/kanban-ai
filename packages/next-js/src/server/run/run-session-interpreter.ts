import { extractOpencodeStatus } from "@/lib/opencode-status";
import type {
	PermissionData,
	QuestionData,
	SessionInspectionResult,
} from "@/server/opencode/session-manager";
import type { RunLastExecutionStatus } from "@/types/ipc";
import type { Run } from "@/types/ipc";

export type RunOutcomeMarker =
	| "done"
	| "generated"
	| "fail"
	| "test_ok"
	| "test_fail"
	| "dead"
	| "question"
	| "resumed"
	| "cancelled"
	| "timeout";

export type SessionMetaStatus =
	| {
			kind: "completed";
			marker: "done" | "generated" | "test_ok";
			content: string;
	  }
	| { kind: "failed"; marker: "fail" | "test_fail"; content: string }
	| { kind: "question"; questions: QuestionData[] }
	| { kind: "permission"; permission: PermissionData }
	| { kind: "running" }
	| { kind: "dead" };

export function deriveMetaStatus(
	inspection: SessionInspectionResult,
): SessionMetaStatus {
	if (inspection.completionMarker) {
		const marker = inspection.completionMarker.signalKey as RunOutcomeMarker;
		const content = findStoryContent(inspection);
		if (marker === "done" || marker === "generated" || marker === "test_ok") {
			return { kind: "completed", marker, content };
		}
		if (marker === "fail" || marker === "test_fail") {
			return { kind: "failed", marker, content };
		}
		if (marker === "question") {
			if (inspection.pendingQuestions.length > 0) {
				return { kind: "question", questions: inspection.pendingQuestions };
			}
			return { kind: "running" };
		}
	}

	if (
		inspection.probeStatus === "not_found" ||
		inspection.probeStatus === "transient_error"
	) {
		return { kind: "running" };
	}

	const permission = inspection.pendingPermissions[0];
	if (permission) {
		return { kind: "permission", permission };
	}

	const question = inspection.pendingQuestions[0];
	if (question) {
		return { kind: "question", questions: inspection.pendingQuestions };
	}

	if (inspection.sessionStatus === "idle") {
		const latestMessage = inspection.messages[inspection.messages.length - 1];
		if (latestMessage?.role === "user") {
			return { kind: "running" };
		}

		const content = findStoryContent(inspection);
		return { kind: "completed", marker: "done", content };
	}

	return { kind: "running" };
}

export function toRunLastExecutionStatus(
	meta: SessionMetaStatus,
	sessionId: string,
): RunLastExecutionStatus {
	const updatedAt = new Date().toISOString();

	switch (meta.kind) {
		case "completed":
		case "failed":
			return {
				kind: meta.kind,
				marker: meta.marker,
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
	if (content.trim().length > 0 || run.metadata?.kind !== generationRunKind) {
		return content;
	}

	const sessionId = run.sessionId.trim();
	if (sessionId.length === 0) {
		return content;
	}

	try {
		const inspection = await sessionManager.inspectSession(sessionId);
		const hydrated = findStoryContent(inspection);
		return hydrated.trim().length > 0 ? hydrated : content;
	} catch {
		return content;
	}
}

export function findCompletionContent(
	inspection: SessionInspectionResult,
): string {
	for (let i = inspection.messages.length - 1; i >= 0; i--) {
		const msg = inspection.messages[i];
		if (msg.role === "assistant") {
			return msg.content;
		}
	}
	return "";
}

export function stripOpencodeStatusLine(content: string): string {
	const status = extractOpencodeStatus(content);
	if (!status) {
		return content.trim();
	}

	return content
		.split(/\r?\n/)
		.filter((_, index) => index !== status.statusLineIndex)
		.join("\n")
		.trim();
}

export function findStoryContent(inspection: SessionInspectionResult): string {
	const markerContent = inspection.completionMarker?.messageContent;
	if (typeof markerContent === "string" && markerContent.trim().length > 0) {
		return stripOpencodeStatusLine(markerContent);
	}

	for (let i = inspection.messages.length - 1; i >= 0; i--) {
		const msg = inspection.messages[i];
		if (msg.role !== "assistant") {
			continue;
		}
		const status = extractOpencodeStatus(msg.content);
		if (status) {
			const cleaned = stripOpencodeStatusLine(msg.content);
			if (cleaned.length > 0) {
				return cleaned;
			}
			continue;
		}
		if (msg.content.trim().length > 0) {
			return msg.content.trim();
		}
	}
	return stripOpencodeStatusLine(findCompletionContent(inspection));
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
