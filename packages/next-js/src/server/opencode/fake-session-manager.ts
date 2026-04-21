import { randomUUID } from "crypto";
import type { OpenCodeMessage, OpenCodeTodo } from "@/types/ipc";
import type {
	PermissionData,
	QuestionData,
	QuestionItemData,
	QuestionOptionData,
	SessionActivityStatus,
	SessionEvent,
	SessionInspectionResult,
	SessionProbeStatus,
	SessionStartPreferences,
} from "./session-manager";

type FakeScenario = "happy-path" | "pause-resume" | "failure";

interface FakeSessionState {
	sessionId: string;
	title: string;
	directory: string;
	phase:
		| "idle"
		| "queued"
		| "running"
		| "paused"
		| "completed"
		| "failed"
		| "aborted";
	messages: OpenCodeMessage[];
	todos: OpenCodeTodo[];
	pendingPermissions: PermissionData[];
	pendingQuestions: QuestionData[];
	permissionReplies: Array<{
		permissionId: string;
		response: "once" | "always" | "reject";
		timestamp: number;
	}>;
	questionReplies: Array<{
		requestId: string;
		answers: string[][];
		timestamp: number;
	}>;
	questionRejections: Array<{
		requestId: string;
		timestamp: number;
	}>;
	lastPrompt: string | null;
	prefs?: SessionStartPreferences;
	progressStep: number;
	scenario: FakeScenario;
	questionIssued: boolean;
	resumedFromQuestion: boolean;
	absent: boolean;
}

interface FakeSessionStore {
	sessionCounter: number;
	scenario: FakeScenario;
	sessions: Map<string, FakeSessionState>;
}

declare global {
	var __fakeOpencodeSessionStore: FakeSessionStore | undefined;
}

function getFakeSessionStore(): FakeSessionStore {
	if (!globalThis.__fakeOpencodeSessionStore) {
		globalThis.__fakeOpencodeSessionStore = {
			sessionCounter: 0,
			scenario: parseScenario(process.env.AI_RUNTIME_FAKE_SCENARIO),
			sessions: new Map<string, FakeSessionState>(),
		};
	}

	return globalThis.__fakeOpencodeSessionStore;
}

export interface FakeSessionManagerConfig {
	scenario?: FakeScenario;
}

function parseScenario(value: string | undefined): FakeScenario {
	if (value === "pause-resume" || value === "failure") {
		return value;
	}
	return "happy-path";
}

export class FakeOpencodeSessionManager {
	private readonly store = getFakeSessionStore();

	public constructor(config?: FakeSessionManagerConfig) {
		if (config?.scenario) {
			this.store.scenario = config.scenario;
		}
	}

	public async createSession(
		title: string,
		directory: string,
	): Promise<string> {
		this.store.sessionCounter += 1;
		const sessionId = `fake-session-${this.store.sessionCounter}`;
		this.store.sessions.set(sessionId, {
			sessionId,
			title,
			directory,
			phase: "idle",
			messages: [],
			todos: [],
			pendingPermissions: [],
			pendingQuestions: [],
			permissionReplies: [],
			questionReplies: [],
			questionRejections: [],
			lastPrompt: null,
			progressStep: 0,
			scenario: this.store.scenario,
			questionIssued: false,
			resumedFromQuestion: false,
			absent: false,
		});
		return sessionId;
	}

	public async sendPrompt(
		sessionId: string,
		prompt: string,
		preferences?: SessionStartPreferences,
	): Promise<void> {
		const session = this.getSessionOrThrow(sessionId);
		session.lastPrompt = prompt;
		session.prefs = preferences;
		session.progressStep = 0;
		session.questionIssued = false;
		session.resumedFromQuestion = false;
		session.pendingQuestions = [];
		session.pendingPermissions = [];
		session.phase = "queued";

		session.messages.push(this.buildUserMessage(prompt, preferences));
	}

	public async abortSession(sessionId: string): Promise<void> {
		const session = this.getSessionOrThrow(sessionId);
		session.phase = "aborted";
		session.pendingPermissions = [];
		session.pendingQuestions = [];
	}

	public async inspectSession(
		sessionId: string,
	): Promise<SessionInspectionResult> {
		const session = this.store.sessions.get(sessionId);
		if (!session || session.absent) {
			return {
				probeStatus: "not_found",
				sessionStatus: "unknown",
				messages: [],
				todos: [],
				pendingPermissions: [],
				pendingQuestions: [],
			};
		}

		this.advanceScenario(session);

		return {
			probeStatus: this.computeProbeStatus(session),
			sessionStatus: this.computeSessionStatus(session),
			messages: [...session.messages],
			todos: [...session.todos],
			pendingPermissions: [...session.pendingPermissions],
			pendingQuestions: [...session.pendingQuestions],
		};
	}

	public async getMessages(
		sessionId: string,
		limit?: number,
	): Promise<OpenCodeMessage[]> {
		const session = this.getSessionOrThrow(sessionId);
		if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
			return session.messages.slice(-Math.floor(limit));
		}
		return [...session.messages];
	}

	public async getTodos(sessionId: string): Promise<OpenCodeTodo[]> {
		const session = this.getSessionOrThrow(sessionId);
		return [...session.todos];
	}

	public async replyToPermission(
		sessionId: string,
		permissionId: string,
		response: "once" | "always" | "reject",
	): Promise<boolean> {
		const session = this.getSessionOrThrow(sessionId);
		session.permissionReplies.push({
			permissionId,
			response,
			timestamp: Date.now(),
		});

		const existed = session.pendingPermissions.some(
			(p) => p.id === permissionId,
		);
		session.pendingPermissions = session.pendingPermissions.filter(
			(p) => p.id !== permissionId,
		);
		return existed;
	}

	public async listPendingPermissions(
		sessionId: string,
	): Promise<PermissionData[]> {
		const session = this.getSessionOrThrow(sessionId);
		return [...session.pendingPermissions];
	}

	public async listPendingQuestions(
		sessionId: string,
	): Promise<QuestionData[]> {
		const session = this.getSessionOrThrow(sessionId);
		return [...session.pendingQuestions];
	}

	public async replyToQuestion(
		sessionId: string,
		requestId: string,
		answers: string[][],
	): Promise<void> {
		const session = this.getSessionOrThrow(sessionId);
		session.questionReplies.push({ requestId, answers, timestamp: Date.now() });
		session.pendingQuestions = session.pendingQuestions.filter(
			(question) => question.id !== requestId,
		);

		if (session.phase === "paused") {
			session.phase = "running";
			session.resumedFromQuestion = true;
			session.progressStep = Math.max(session.progressStep, 2);
		}
	}

	public async rejectQuestion(
		sessionId: string,
		requestId: string,
	): Promise<void> {
		const session = this.getSessionOrThrow(sessionId);
		session.questionRejections.push({ requestId, timestamp: Date.now() });
		session.pendingQuestions = session.pendingQuestions.filter(
			(question) => question.id !== requestId,
		);
		session.phase = "failed";
		session.progressStep = Math.max(session.progressStep, 3);
		session.messages.push(
			this.buildAssistantMessage("Question was rejected; fake run failed."),
		);
	}

	public async subscribe(
		sessionId: string,
		subscriberId: string,
		handler: (event: SessionEvent) => void,
	): Promise<void> {
		void sessionId;
		void subscriberId;
		void handler;
	}

	public async unsubscribe(
		sessionId: string,
		subscriberId: string,
	): Promise<void> {
		void sessionId;
		void subscriberId;
	}

	public async listAliveSessions(): Promise<
		Array<{
			sessionId: string;
			directory: string | null;
			status: "idle" | "busy" | "retry" | "unknown";
		}>
	> {
		return Array.from(this.store.sessions.values()).map((session) => ({
			sessionId: session.sessionId,
			directory: session.directory,
			status: this.computeSessionStatus(session),
		}));
	}

	public async getActiveSessionCount(): Promise<{
		totalSessions: number;
		busySessions: number;
		busySessionIds: string[];
	}> {
		const statuses = Array.from(this.store.sessions.values()).map(
			(session) => ({
				sessionId: session.sessionId,
				status: this.computeSessionStatus(session),
			}),
		);

		const busySessionIds = statuses
			.filter(({ status }) => status === "busy")
			.map(({ sessionId }) => sessionId);

		return {
			totalSessions: statuses.length,
			busySessions: busySessionIds.length,
			busySessionIds,
		};
	}

	public async resolveSessionDirectory(
		sessionId: string,
	): Promise<string | null> {
		const session = this.store.sessions.get(sessionId);
		if (!session) return null;
		return "/fake/project";
	}

	private getSessionOrThrow(sessionId: string): FakeSessionState {
		const session = this.store.sessions.get(sessionId);
		if (!session || session.absent) {
			throw new Error(`Unknown fake OpenCode session ${sessionId}`);
		}
		return session;
	}

	private computeProbeStatus(session: FakeSessionState): SessionProbeStatus {
		if (session.absent) {
			return "not_found";
		}
		return "alive";
	}

	private computeSessionStatus(
		session: FakeSessionState,
	): SessionActivityStatus {
		if (
			session.phase === "queued" ||
			session.phase === "running" ||
			session.phase === "paused"
		) {
			return "busy";
		}
		if (
			session.phase === "idle" ||
			session.phase === "completed" ||
			session.phase === "failed" ||
			session.phase === "aborted"
		) {
			return "idle";
		}
		return "unknown";
	}

	private advanceScenario(session: FakeSessionState): void {
		if (session.phase === "aborted" || session.phase === "completed") {
			return;
		}

		if (session.scenario === "happy-path") {
			session.phase = "completed";
			session.progressStep = 2;
			session.messages.push(
				this.buildAssistantMessage(
					"Fake run completed successfully (happy-path scenario).",
				),
			);
			return;
		}

		if (session.scenario === "failure") {
			session.phase = "failed";
			session.progressStep = 2;
			session.absent = true;
			return;
		}

		// pause-resume: advance to paused on first inspect, completed after answer
		if (
			session.phase === "queued" ||
			(session.phase === "running" && !session.questionIssued)
		) {
			session.phase = "paused";
			session.progressStep = 2;
			session.questionIssued = true;
			session.pendingQuestions = [this.buildQuestion(session.sessionId)];
			return;
		}

		if (session.phase === "running" && session.resumedFromQuestion) {
			session.phase = "completed";
			session.progressStep = 3;
			session.messages.push(
				this.buildAssistantMessage(
					"Fake run resumed after question and completed.",
				),
			);
		}
	}

	private buildUserMessage(
		prompt: string,
		preferences?: SessionStartPreferences,
	): OpenCodeMessage {
		const preferenceSuffix = this.formatPreferences(preferences);
		const content = preferenceSuffix
			? `${prompt}\n\n${preferenceSuffix}`
			: prompt;
		return {
			id: randomUUID(),
			role: "user",
			content,
			parts: [{ type: "text", text: content }],
			timestamp: Date.now(),
		};
	}

	private buildAssistantMessage(content: string): OpenCodeMessage {
		return {
			id: randomUUID(),
			role: "assistant",
			content,
			parts: [{ type: "text", text: content }],
			timestamp: Date.now(),
		};
	}

	private buildQuestion(sessionId: string): QuestionData {
		const options: QuestionOptionData[] = [
			{ label: "yes", description: "Continue execution" },
			{ label: "no", description: "Stop execution" },
		];
		const questionItem: QuestionItemData = {
			question: "Should the fake run continue?",
			options,
			multiple: false,
		};
		return {
			id: `fake-question-${randomUUID()}`,
			sessionId,
			questions: [questionItem],
			createdAt: Date.now(),
		};
	}

	private formatPreferences(preferences?: SessionStartPreferences): string {
		if (!preferences) {
			return "";
		}

		const entries: string[] = [];
		if (preferences.preferredModelName) {
			entries.push(`model=${preferences.preferredModelName}`);
		}
		if (preferences.preferredModelVariant) {
			entries.push(`variant=${preferences.preferredModelVariant}`);
		}
		if (preferences.preferredLlmAgent) {
			entries.push(`agent=${preferences.preferredLlmAgent}`);
		}

		return entries.length > 0 ? `[fake-preferences ${entries.join(" ")}]` : "";
	}
}

export function setFakeOpencodeScenario(rawScenario: string): FakeScenario {
	const scenario = parseScenario(rawScenario);
	getFakeSessionStore().scenario = scenario;
	return scenario;
}
