import { createLogger } from "@/lib/logger";
import { ensureSessionLive } from "@/server/opencode/session-store";
import { publishRunUpdate } from "@/server/run/run-publisher";
import {
	adaptTriggerForQa,
	type TaskTransitionTrigger,
} from "@/server/run/task-state-machine";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { taskRepo } from "@/server/repositories/task";
import { projectUpdatesService } from "@/server/services/project-updates-service";
import type { SessionStartPreferences } from "@/server/opencode/session-manager";
import type { Run } from "@/types/ipc";

const log = createLogger("runs-queue");

interface QueuedRunInput {
	projectPath: string;
	projectId?: string;
	sessionTitle: string;
	prompt: string;
	sessionPreferences?: SessionStartPreferences;
}

interface RunExecutorDeps {
	opencodeService: { start: () => Promise<void> };
	sessionManager: {
		createSession: (
			sessionTitle: string,
			projectPath: string,
		) => Promise<string>;
		sendPrompt: (
			sessionId: string,
			prompt: string,
			sessionPreferences?: SessionStartPreferences,
		) => Promise<void>;
		abortSession: (sessionId: string) => Promise<void>;
	};
	runInputs: Map<string, QueuedRunInput>;
	activeRunSessions: Map<string, string>;
	isGenerationRun: (run: Run) => boolean;
	isStoryChatRun: (run: Run) => boolean;
	applyTaskTransition: (
		run: Run,
		trigger: TaskTransitionTrigger,
		outcomeContent: string,
	) => void;
	scheduleRetryAfterNetworkError: (
		runId: string,
		errorMessage: string,
	) => boolean;
	syncRunWorkspaceState: (run: Run) => Promise<Run>;
	isNetworkError: (error: unknown) => boolean;
	durationSec: (startedAt: string, finishedAt: string) => number;
	onComplete: (runId: string) => void;
	runLiveSubscriptionService: {
		ensureSubscribed: (runId: string, sessionId: string) => Promise<void>;
		unsubscribe: (runId: string) => Promise<void>;
	};
}

export class RunExecutor {
	private readonly deps: RunExecutorDeps;

	public constructor(deps: RunExecutorDeps) {
		this.deps = deps;
	}

	public async executeRun(runId: string): Promise<void> {
		log.info("Executing run", { runId });
		const current = runRepo.getById(runId);
		if (!current || current.status !== "queued") {
			log.warn("Run not in queued state, skipping", {
				runId,
				status: current?.status,
			});
			this.deps.runInputs.delete(runId);
			return;
		}

		const startedAt = new Date().toISOString();
		let runningRun = runRepo.update(runId, {
			status: "running",
			startedAt,
			errorText: "",
			metadata: {
				...(current.metadata ?? {}),
				lastExecutionStatus: {
					kind: "running",
					updatedAt: startedAt,
				},
			},
		});

		log.info("Run started", {
			runId,
			taskId: current.taskId,
			roleId: current.roleId,
		});
		runEventRepo.create({
			runId,
			eventType: "status",
			payload: { status: "running", message: "Run started" },
		});
		publishRunUpdate(runningRun);
		const task = taskRepo.getById(current.taskId);
		if (task) {
			projectUpdatesService.recordActivity(task.projectId);
		}
		this.deps.applyTaskTransition(
			runningRun,
			adaptTriggerForQa(
				this.deps.isStoryChatRun(runningRun)
					? "chat:start"
					: this.deps.isGenerationRun(runningRun)
						? "generate:start"
						: "run:start",
				runningRun.metadata?.kind,
			),
			"",
		);

		try {
			const runInput = this.deps.runInputs.get(runId);
			if (!runInput) {
				throw new Error(`Run input not found for run: ${runId}`);
			}

			log.debug("Starting OpenCode service", { runId });
			await this.deps.opencodeService.start();

			log.debug("Creating OpenCode session", {
				runId,
				projectPath: runInput.projectPath,
			});
			const sessionId = await this.deps.sessionManager.createSession(
				runInput.sessionTitle,
				runInput.projectPath,
			);
			log.info("OpenCode session created", { runId, sessionId });

			await ensureSessionLive(sessionId);

			runningRun = runRepo.update(runId, { sessionId });
			runEventRepo.create({
				runId,
				eventType: "status",
				payload: {
					status: "running",
					message: "OpenCode session created",
					sessionId,
				},
			});
			publishRunUpdate(runningRun);

			this.deps.activeRunSessions.set(runId, sessionId);

			await this.deps.runLiveSubscriptionService.ensureSubscribed(
				runId,
				sessionId,
			);

			log.debug("Sending prompt to OpenCode", { runId, sessionId });
			await this.deps.sessionManager.sendPrompt(
				sessionId,
				runInput.prompt,
				runInput.sessionPreferences,
			);
			log.info("Prompt request completed", { runId, sessionId });

			runEventRepo.create({
				runId,
				eventType: "status",
				payload: {
					status: "running",
					message: "Prompt sent to OpenCode",
				},
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Run execution failed";
			const latestRun = runRepo.getById(runId) ?? runningRun;

			if (this.deps.isNetworkError(error)) {
				if (latestRun.sessionId.trim().length > 0) {
					if (
						latestRun.status === "completed" ||
						latestRun.status === "failed" ||
						latestRun.status === "cancelled" ||
						latestRun.status === "paused"
					) {
						log.info(
							"Network error after session creation; run already finalized or paused, skipping recovery",
							{
								runId,
								sessionId: latestRun.sessionId,
								runStatus: latestRun.status,
								error: message,
							},
						);
						return;
					}
					const recoveredAt = new Date().toISOString();
					const resumedRun = runRepo.update(runId, {
						status: "running",
						errorText: message,
						metadata: {
							...(latestRun.metadata ?? {}),
							errorText: message,
							lastExecutionStatus: {
								kind: "running",
								sessionId: latestRun.sessionId.trim(),
								updatedAt: recoveredAt,
							},
						},
					});
					runEventRepo.create({
						runId,
						eventType: "status",
						payload: {
							status: "running",
							message: `Network error after session creation; waiting for session recovery: ${message}`,
						},
					});
					publishRunUpdate(resumedRun);
					log.warn(
						"Network error after session creation; keeping run active for session recovery",
						{
							runId,
							sessionId: latestRun.sessionId,
							error: message,
						},
					);
					return;
				}
				const retried = this.deps.scheduleRetryAfterNetworkError(
					runId,
					message,
				);
				if (retried) {
					return;
				}
				log.warn("Max retries exhausted for run after network errors", {
					runId,
					error: message,
				});
			} else {
				log.error("Run execution failed", { runId, error: message });
			}

			const finishedAt = new Date().toISOString();
			let failedRun = runRepo.update(runId, {
				status: "failed",
				finishedAt,
				errorText: message,
				durationSec: this.deps.durationSec(startedAt, finishedAt),
				metadata: {
					...(current.metadata ?? {}),
					lastExecutionStatus: {
						kind: "failed",
						content: message,
						sessionId: current.sessionId.trim() || undefined,
						updatedAt: finishedAt,
					},
				},
			});
			failedRun = await this.deps.syncRunWorkspaceState(failedRun);

			runEventRepo.create({
				runId,
				eventType: "status",
				payload: {
					status: "failed",
					message,
				},
			});
			publishRunUpdate(failedRun);
			this.deps.applyTaskTransition(
				failedRun,
				adaptTriggerForQa(
					this.deps.isGenerationRun(failedRun) ? "generate:fail" : "run:fail",
					failedRun.metadata?.kind,
				),
				message,
			);
			this.deps.activeRunSessions.delete(runId);
			this.deps.runInputs.delete(runId);
			void this.deps.runLiveSubscriptionService.unsubscribe(runId);
		} finally {
			this.deps.onComplete(runId);
		}
	}
}
