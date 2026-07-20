import type {
	OpenCodeMessage,
	OpenCodeTodo,
	Part,
} from "@/types/ipc";

export interface PermissionData {
	id: string;
	permissionType: string;
	pattern?: string | string[];
	sessionId: string;
	messageId: string;
	callId?: string;
	title: string;
	metadata: Record<string, unknown>;
	createdAt: number;
}

export interface QuestionOptionData {
	label: string;
	description?: string;
}

export interface QuestionItemData {
	question: string;
	options: QuestionOptionData[];
	multiple?: boolean;
}

export interface QuestionData {
	id: string;
	sessionId: string;
	questions: QuestionItemData[];
	createdAt: number;
}

export type SessionEvent =
	| { type: "message.updated"; sessionId: string; message: OpenCodeMessage }
	| {
			type: "message.part.updated";
			sessionId: string;
			messageId: string;
			part: Part;
			delta?: string;
	  }
	| { type: "message.removed"; sessionId: string; messageId: string }
	| { type: "todo.updated"; sessionId: string; todos: OpenCodeTodo[] }
	| {
			type: "permission.updated";
			sessionId: string;
			permission: PermissionData;
	  }
	| {
			type: "permission.replied";
			sessionId: string;
			permissionId: string;
			response: string;
	  }
	| { type: "question.asked"; sessionId: string; question: QuestionData }
	| { type: "question.replied"; sessionId: string; requestId: string }
	| { type: "question.rejected"; sessionId: string; requestId: string }
	| { type: "error"; sessionId: string; error: string };

export interface SessionStartPreferences {
	preferredModelName?: string | null;
	preferredModelVariant?: string | null;
	preferredLlmAgent?: string | null;
}

export type SessionProbeStatus =
	| "alive"
	| "not_found"
	| "transient_error";

export type SessionActivityStatus = "idle" | "busy" | "retry" | "unknown";

export interface SessionInspectionResult {
	probeStatus: SessionProbeStatus;
	sessionStatus: SessionActivityStatus;
	messages: OpenCodeMessage[];
	todos: OpenCodeTodo[];
	pendingPermissions: PermissionData[];
	pendingQuestions: QuestionData[];
	childSessions: SessionInspectionResult[];
}

export interface AgentSessionManager {
	dispose(): Promise<void>;
	createSession(title: string, directory: string): Promise<string>;
	abortSession(sessionId: string): Promise<void>;
	sendPrompt(
		sessionId: string,
		prompt: string,
		preferences?: SessionStartPreferences,
	): Promise<void>;
	getMessages(sessionId: string, limit?: number): Promise<OpenCodeMessage[]>;
	getTodos(sessionId: string): Promise<OpenCodeTodo[]>;
	inspectSession(sessionId: string): Promise<SessionInspectionResult>;
	replyToPermission(
		sessionId: string,
		permissionId: string,
		response: "once" | "always" | "reject",
	): Promise<boolean>;
	listPendingPermissions(sessionId: string): Promise<PermissionData[]>;
	listPendingQuestions(sessionId: string): Promise<QuestionData[]>;
	replyToQuestion(
		sessionId: string,
		requestId: string,
		answers: string[][],
	): Promise<void>;
	rejectQuestion(sessionId: string, requestId: string): Promise<void>;
	subscribe(
		sessionId: string,
		subscriberId: string,
		handler: (event: SessionEvent) => void,
	): Promise<void>;
	unsubscribe(sessionId: string, subscriberId: string): Promise<void>;
	resolveSessionDirectory(sessionId: string): Promise<string | null>;
	listAliveSessions(): Promise<
		Array<{
			sessionId: string;
			directory: string | null;
			status: SessionActivityStatus;
		}>
	>;
	getActiveSessionCount(): Promise<{
		totalSessions: number;
		busySessions: number;
		busySessionIds: string[];
	}>;
}
