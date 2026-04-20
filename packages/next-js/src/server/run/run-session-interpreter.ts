import type {
	PermissionData,
	QuestionData,
	SessionInspectionResult,
} from "@/server/opencode/session-manager";
import type { RunLastExecutionStatus } from "@/types/ipc";
import type { Run } from "@/types/ipc";

export type SessionMetaStatus =
	| {
			kind: "completed";
			content: string;
	  }
	| { kind: "question"; questions: QuestionData[] }
	| { kind: "permission"; permission: PermissionData }
	| { kind: "running" }
	| { kind: "dead" };

export function deriveMetaStatus(
	inspection: SessionInspectionResult,
): SessionMetaStatus {
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

	if (
		inspection.probeStatus === "alive" &&
		inspection.sessionStatus === "idle"
	) {
		const latestMessage = inspection.messages[inspection.messages.length - 1];
		if (latestMessage?.role !== "user") {
			const content = findStoryContent(inspection);
			return { kind: "completed", content };
		}
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

export function findStoryContent(inspection: SessionInspectionResult): string {
	for (let i = inspection.messages.length - 1; i >= 0; i--) {
		const msg = inspection.messages[i];
		if (msg.role !== "assistant") {
			continue;
		}
		if (msg.content.trim().length > 0) {
			return msg.content.trim();
		}
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
