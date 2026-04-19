import { createLogger } from "@/lib/logger";
import { publishRunUpdate } from "@/server/run/run-publisher";
import { publishSseEvent } from "@/server/events/sse-broker";
import type {
	PermissionData,
	QuestionData,
} from "@/server/opencode/session-manager";
import type { Run } from "@/types/ipc";
import type { TaskTransitionTrigger } from "@/server/run/task-state-machine";

const log = createLogger("runs-queue");

function asObject(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	return value as Record<string, unknown>;
}

interface RunEventLike {
	eventType: string;
	payload: unknown;
}

interface RunInteractionCoordinatorDeps {
	getRunById: (runId: string) => Run | null;
	updateRun: (runId: string, patch: Partial<Run>) => Run;
	createRunEvent: (
		runId: string,
		eventType: string,
		payload: Record<string, unknown>,
	) => void;
	listRunEvents: (runId: string, limit: number) => RunEventLike[];
	applyTaskTransition: (
		run: Run,
		trigger: TaskTransitionTrigger,
		outcomeContent: string,
	) => void;
	listPendingPermissions: (sessionId: string) => Promise<PermissionData[]>;
	listPendingQuestions: (sessionId: string) => Promise<QuestionData[]>;
	setActiveRunSession: (runId: string, sessionId: string) => void;
}

export class RunInteractionCoordinator {
	private readonly deps: RunInteractionCoordinatorDeps;

	public constructor(deps: RunInteractionCoordinatorDeps) {
		this.deps = deps;
	}

	public attachReconciledSession(runId: string, sessionId: string): void {
		this.deps.setActiveRunSession(runId, sessionId);
	}

	public async resumeRunAfterPermissionApproval(
		runId: string,
		permissionId: string,
	): Promise<void> {
		log.info("Permission approved, resuming run", { runId, permissionId });

		const run = this.deps.getRunById(runId);
		if (!run || run.status !== "paused") {
			log.debug("Run not found or not paused, skipping permission resume", {
				runId,
				currentStatus: run?.status,
			});
			return;
		}

		const resumedRun = this.deps.updateRun(runId, { status: "running" });
		this.deps.createRunEvent(runId, "permission", {
			status: "approved",
			permissionId,
			response: "approved",
			message: `Permission approved: ${permissionId}`,
		});
		publishRunUpdate(resumedRun);
		this.deps.applyTaskTransition(
			resumedRun,
			"run:answer",
			`Permission approved: ${permissionId}`,
		);
	}

	public async resumeRunAfterQuestionAnswered(
		runId: string,
		questionId: string,
	): Promise<void> {
		log.info("Question answered, resuming run", { runId, questionId });

		const run = this.deps.getRunById(runId);
		if (!run || run.status !== "paused") {
			log.debug("Run not found or not paused, skipping question resume", {
				runId,
				currentStatus: run?.status,
			});
			return;
		}

		const resumedRun = this.deps.updateRun(runId, { status: "running" });
		this.deps.createRunEvent(runId, "question", {
			status: "answered",
			questionId,
			response: "answered",
			message: "Question answered",
		});
		publishRunUpdate(resumedRun);
		this.deps.applyTaskTransition(
			resumedRun,
			"run:answer",
			"Question answered",
		);
	}

	public async resumeOrphanedPausedRun(runId: string): Promise<void> {
		log.info("Resuming orphaned paused run — no pending interaction", {
			runId,
		});

		const run = this.deps.getRunById(runId);
		if (!run || run.status !== "paused") {
			return;
		}

		const resumedRun = this.deps.updateRun(runId, { status: "running" });
		this.deps.createRunEvent(runId, "status", {
			status: "running",
			message: "Auto-resumed: no pending user interaction",
		});
		publishRunUpdate(resumedRun);
		this.deps.applyTaskTransition(
			resumedRun,
			"run:answer",
			"Resumed orphaned paused run",
		);
	}

	public getAwaitingPermissionId(runId: string): string | null {
		const events = this.deps.listRunEvents(runId, 50);
		for (let index = events.length - 1; index >= 0; index -= 1) {
			const event = events[index];
			if (event.eventType !== "permission") {
				continue;
			}

			const payload = asObject(event.payload);
			if (!payload) {
				continue;
			}

			if (payload.status === "paused") {
				return typeof payload.permissionId === "string"
					? payload.permissionId
					: null;
			}

			if (payload.status === "approved" || payload.status === "denied") {
				return null;
			}
		}

		return null;
	}

	public getAwaitingQuestionId(runId: string): string | null {
		const events = this.deps.listRunEvents(runId, 50);
		for (let index = events.length - 1; index >= 0; index -= 1) {
			const event = events[index];
			if (event.eventType !== "question") {
				continue;
			}

			const payload = asObject(event.payload);
			if (!payload) {
				continue;
			}

			if (payload.status === "paused") {
				return typeof payload.questionId === "string"
					? payload.questionId
					: null;
			}

			if (payload.status === "answered" || payload.status === "rejected") {
				return null;
			}
		}

		return null;
	}

	public async reconcilePausedRun(
		runId: string,
		sessionId: string,
	): Promise<void> {
		const awaitingPermissionId = this.getAwaitingPermissionId(runId);
		if (awaitingPermissionId) {
			const pendingPermissions =
				await this.deps.listPendingPermissions(sessionId);
			const stillPending = pendingPermissions.some(
				(permission) => permission.id === awaitingPermissionId,
			);
			if (!stillPending) {
				await this.resumeRunAfterPermissionApproval(
					runId,
					awaitingPermissionId,
				);
			}
			return;
		}

		const awaitingQuestionId = this.getAwaitingQuestionId(runId);
		if (awaitingQuestionId) {
			const pendingQuestions = await this.deps.listPendingQuestions(sessionId);
			const stillPending = pendingQuestions.some(
				(question) => question.id === awaitingQuestionId,
			);
			if (!stillPending) {
				await this.resumeRunAfterQuestionAnswered(runId, awaitingQuestionId);
			}
			return;
		}

		const [orphanPermissions, orphanQuestions] = await Promise.all([
			this.deps.listPendingPermissions(sessionId),
			this.deps.listPendingQuestions(sessionId),
		]);
		if (orphanPermissions.length === 0 && orphanQuestions.length === 0) {
			await this.resumeOrphanedPausedRun(runId);
		}
	}

	public ensureRunPausedForPermission(
		run: Run,
		permission: PermissionData,
	): Run {
		if (run.status === "paused") {
			return run;
		}

		const pausedRun = this.deps.updateRun(run.id, { status: "paused" });
		this.deps.createRunEvent(run.id, "permission", {
			status: "paused",
			permissionId: permission.id,
			permissionType: permission.permissionType,
			pattern: permission.pattern,
			title: permission.title,
			sessionId: permission.sessionId,
			messageId: permission.messageId,
			message: `Permission requested: ${permission.title}`,
		});
		publishSseEvent("run:permission", {
			runId: run.id,
			taskId: pausedRun.taskId,
			permissionId: permission.id,
			permissionType: permission.permissionType,
			pattern: permission.pattern,
			title: permission.title,
			sessionId: permission.sessionId,
			messageId: permission.messageId,
			createdAt: permission.createdAt,
		});
		publishRunUpdate(pausedRun);
		this.deps.applyTaskTransition(
			pausedRun,
			"run:question",
			`Permission requested: ${permission.title}`,
		);
		return pausedRun;
	}

	public ensureRunPausedForQuestion(run: Run, question: QuestionData): Run {
		if (run.status === "paused") {
			return run;
		}

		const pausedRun = this.deps.updateRun(run.id, { status: "paused" });
		this.deps.createRunEvent(run.id, "question", {
			status: "paused",
			questionId: question.id,
			questions: question.questions.map((item) => item.question),
			sessionId: question.sessionId,
			message: "Question asked",
		});
		publishSseEvent("run:question", {
			runId: run.id,
			taskId: pausedRun.taskId,
			questionId: question.id,
			questions: question.questions,
			sessionId: question.sessionId,
			createdAt: question.createdAt,
		});
		publishRunUpdate(pausedRun);
		this.deps.applyTaskTransition(pausedRun, "run:question", "Question asked");
		return pausedRun;
	}
}
