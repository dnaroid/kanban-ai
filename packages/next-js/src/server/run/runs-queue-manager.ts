import { createLogger } from "@/lib/logger";
import { extractOpencodeStatus } from "@/lib/opencode-status";
import { buildTaskPrompt } from "@/server/run/prompts/task";
import type {
	PermissionData,
	QuestionData,
	SessionInspectionResult,
	SessionStartPreferences,
} from "@/server/opencode/session-manager";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import { ensureSessionLive } from "@/server/opencode/session-store";
import { contextSnapshotRepo } from "@/server/repositories/context-snapshot";
import { projectRepo } from "@/server/repositories/project";
import type { AgentRolePreset } from "@/server/repositories/role";
import { roleRepo } from "@/server/repositories/role";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { taskLinkRepo } from "@/server/repositories/task-link";
import { taskRepo } from "@/server/repositories/task";
import { boardRepo } from "@/server/repositories/board";
import {
	getTaskStateMachine,
	resolveTransitionTrigger,
	type TaskTransitionInput,
	type TaskTransitionTrigger,
} from "@/server/run/task-state-machine";
import { getWorkflowColumnIdBySystemKey } from "@/server/workflow/task-workflow-manager";
import { getWorkflowColumnSystemKey } from "@/server/workflow/task-workflow-manager";
import { publishRunUpdate } from "@/server/run/run-publisher";
import { publishSseEvent } from "@/server/events/sse-broker";
import { getVcsManager } from "@/server/vcs/vcs-manager";
import type { TaskPriority } from "@/types/kanban";
import type { Run, RunStatus, RunVcsMetadata } from "@/types/ipc";
import type { Task } from "@/server/types";

const generationRunKind = "task-description-improve";
const agentRoleTagPrefix = "agent:";
const dependencyReadyStatus = "done";
const lateCompletionRecoveryWindowMs = 15 * 60 * 1000;

type RunOutcomeMarker =
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

type RunOutcome = {
	marker: RunOutcomeMarker;
	content: string;
};

const runPriorityScore: Record<TaskPriority, number> = {
	postpone: 1,
	low: 2,
	normal: 3,
	urgent: 4,
};

const log = createLogger("runs-queue");

interface QueuedRunInput {
	projectPath: string;
	projectId?: string;
	sessionTitle: string;
	prompt: string;
	sessionPreferences?: SessionStartPreferences;
}

interface QueueMeta {
	projectScope: string;
	providerKey: string;
	isGeneration: boolean;
}

type SessionMetaStatus =
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

export interface ProviderQueueStats {
	providerKey: string;
	queued: number;
	running: number;
	concurrency: number;
}

export interface ProjectQueueStats {
	projectScope: string;
	queued: number;
	running: number;
	providers: ProviderQueueStats[];
}

export interface QueueStats {
	totalQueued: number;
	totalRunning: number;
	providers: ProviderQueueStats[];
	byProject: ProjectQueueStats[];
}

function deriveMetaStatus(
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

	if (inspection.probeStatus === "not_found") {
		return { kind: "dead" };
	}

	if (inspection.probeStatus === "transient_error") {
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

	return { kind: "running" };
}

function findCompletionContent(inspection: SessionInspectionResult): string {
	for (let i = inspection.messages.length - 1; i >= 0; i--) {
		const msg = inspection.messages[i];
		if (msg.role === "assistant") {
			return msg.content;
		}
	}
	return "";
}

function stripOpencodeStatusLine(content: string): string {
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

function findStoryContent(inspection: SessionInspectionResult): string {
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

function getRunErrorText(run: Run): string {
	const errorText = run.metadata?.errorText;
	if (typeof errorText !== "string") {
		return "";
	}

	return errorText.trim();
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
		normalizedMessage.includes("econnreset") ||
		normalizedMessage.includes("etimedout") ||
		normalizedMessage.includes("network")
	);
}

function asObject(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}

	return value as Record<string, unknown>;
}

function pickString(
	object: Record<string, unknown> | null,
	keys: readonly string[],
): string | null {
	if (!object) {
		return null;
	}

	for (const key of keys) {
		const value = object[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}

	return null;
}

function normalizeProviderPart(value: string | null): string | null {
	if (!value) {
		return null;
	}

	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9:_./-]/g, "");

	return normalized.length > 0 ? normalized : null;
}

function buildProviderKey(roleId: string, presetJson: string | null): string {
	if (!presetJson || presetJson.trim().length === 0) {
		return `role:${roleId}`;
	}

	try {
		const parsed = JSON.parse(presetJson) as unknown;
		const root = asObject(parsed);
		const model = asObject(root?.model);
		const llm = asObject(root?.llm);

		const provider = normalizeProviderPart(
			pickString(root, [
				"provider",
				"modelProvider",
				"model_provider",
				"llmProvider",
			]) ??
				pickString(model, ["provider", "vendor"]) ??
				pickString(llm, ["provider", "vendor"]),
		);

		const modelName = normalizeProviderPart(
			pickString(root, ["model", "modelName", "model_name"]) ??
				pickString(model, ["name", "id", "model", "modelName"]),
		);

		if (provider && modelName) {
			return `${provider}:${modelName}`;
		}
		if (provider) {
			return provider;
		}
		if (modelName) {
			return `model:${modelName}`;
		}
	} catch {
		return `role:${roleId}`;
	}

	return `role:${roleId}`;
}

function parsePositiveInt(input: string | undefined, fallback: number): number {
	if (!input) {
		return fallback;
	}

	const parsed = Number.parseInt(input, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
}

function parseProviderConcurrencyConfig(
	raw: string | undefined,
): Map<string, number> {
	const result = new Map<string, number>();
	if (!raw || raw.trim().length === 0) {
		return result;
	}

	const entries = raw.split(",").map((entry) => entry.trim());
	for (const entry of entries) {
		if (!entry) {
			continue;
		}

		const separator = entry.indexOf("=");
		if (separator <= 0 || separator >= entry.length - 1) {
			continue;
		}

		const rawKey = entry.slice(0, separator).trim();
		const rawValue = entry.slice(separator + 1).trim();
		const key = normalizeProviderPart(rawKey);
		const value = parsePositiveInt(rawValue, 0);

		if (key && value > 0) {
			result.set(key, value);
		}
	}

	return result;
}

export class RunsQueueManager {
	private readonly queues = new Map<string, string[]>();
	private readonly running = new Map<string, Set<string>>();
	private readonly queueMetaByQueueKey = new Map<string, QueueMeta>();
	private readonly queueKeyByRunId = new Map<string, string>();
	private readonly runInputs = new Map<string, QueuedRunInput>();
	private readonly activeRunSessions = new Map<string, string>();
	private readonly opencodeService = getOpencodeService();
	private readonly sessionManager = getOpencodeSessionManager();
	private readonly stateMachine = getTaskStateMachine();
	private readonly vcsManager = getVcsManager();
	private readonly defaultConcurrency = parsePositiveInt(
		process.env.RUNS_DEFAULT_CONCURRENCY,
		1,
	);
	private readonly generationDefaultConcurrency = parsePositiveInt(
		process.env.GENERATION_DEFAULT_CONCURRENCY,
		5,
	);
	private readonly providerConcurrency = parseProviderConcurrencyConfig(
		process.env.RUNS_PROVIDER_CONCURRENCY,
	);
	private readonly blockedRetryDelayMs = parsePositiveInt(
		process.env.RUNS_BLOCKED_RETRY_MS,
		5000,
	);
	private readonly maxRetryCount = parsePositiveInt(
		process.env.RUNS_MAX_RETRY_COUNT,
		3,
	);
	private readonly retryBaseDelayMs = parsePositiveInt(
		process.env.RUNS_RETRY_BASE_DELAY_MS,
		5000,
	);
	private readonly worktreeEnabled =
		process.env.RUNS_WORKTREE_ENABLED === "true";
	private blockedRetryTimer: ReturnType<typeof setTimeout> | null = null;
	private projectPollingTimer: ReturnType<typeof setInterval> | null = null;
	private draining = false;
	private readonly reconciling = new Set<string>();
	private readonly reconcilingProjects = new Set<string>();
	private readonly activeProjectBoardWatchers = new Map<
		string,
		Map<string, number>
	>();
	private reconciliationTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly projectPollingIntervalMs = 5_000;
	private readonly projectBoardWatcherTtlMs = 15_000;
	private readonly reconciliationIntervalMs = 30_000;
	private readonly staleRunThresholdMs = 10 * 60 * 1000;
	private readonly manualStatusGraceMs = 15_000;
	private readonly retryTimers = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();

	public constructor() {
		queueMicrotask(() => {
			void this.rehydrateAndReconcileRuns();
		});
		this.schedulePeriodicReconciliation();
	}

	private applyTaskTransition(
		run: Run,
		trigger: TaskTransitionTrigger,
		outcomeContent: string,
		hasSessionExisted: boolean = true,
	): void {
		const task = taskRepo.getById(run.taskId);
		if (!task) {
			return;
		}

		const board =
			typeof boardRepo.getById === "function"
				? boardRepo.getById(task.boardId)
				: boardRepo.getByProjectId(task.projectId);
		if (!board) {
			return;
		}

		const input: TaskTransitionInput & {
			task: TaskTransitionInput["task"] & { tags: string };
		} = {
			task: {
				id: task.id,
				boardId: task.boardId,
				status: task.status,
				columnId: task.columnId,
				tags: task.tags,
			},
			board,
			trigger,
			runKind: run.metadata?.kind ?? null,
			outcomeContent,
			hasSessionExisted,
			isManualStatusGracePeriod: false,
		};

		const result = this.stateMachine.transition(input);
		if (result.action !== "update") {
			return;
		}

		taskRepo.update(task.id, result.patch);
		for (const effect of result.effects) {
			if (effect.type === "publishSse") {
				publishSseEvent("task:event", {
					taskId: task.id,
					boardId: task.boardId,
					projectId: effect.projectId,
					updatedAt: new Date().toISOString(),
				});
			}
		}
	}

	private resolveTriggerFromOutcome(
		run: Run,
		runStatus: RunStatus,
		outcome: RunOutcome,
	): TaskTransitionTrigger | null {
		if (outcome.marker === "cancelled") {
			return "run:cancelled";
		}

		if (outcome.marker === "resumed") {
			return "run:answer";
		}

		if (outcome.marker === "question") {
			return "run:question";
		}

		if (outcome.marker === "dead") {
			return "run:dead";
		}

		if (outcome.marker === "timeout") {
			return this.isGenerationRun(run) ? "generate:fail" : "run:fail";
		}

		const sessionMetaKind =
			outcome.marker === "done" ||
			outcome.marker === "generated" ||
			outcome.marker === "test_ok"
				? "completed"
				: outcome.marker === "fail" || outcome.marker === "test_fail"
					? "failed"
					: null;

		if (!sessionMetaKind) {
			return null;
		}

		return resolveTransitionTrigger({
			runStatus,
			sessionMetaKind,
			completionMarker: outcome.marker,
			runKind: run.metadata?.kind ?? null,
		});
	}

	private extractSessionPreferencesFromPreset(
		presetJson: string | null | undefined,
	): SessionStartPreferences | undefined {
		if (!presetJson || presetJson.trim().length === 0) {
			return undefined;
		}

		try {
			const parsed = JSON.parse(presetJson) as Record<string, unknown>;
			const nestedModel =
				typeof parsed.model === "object" && parsed.model
					? (parsed.model as Record<string, unknown>)
					: null;
			const nestedLlm =
				typeof parsed.llm === "object" && parsed.llm
					? (parsed.llm as Record<string, unknown>)
					: null;

			const rawModelName =
				(typeof parsed.modelName === "string" && parsed.modelName.trim()) ||
				(typeof parsed.model === "string" && parsed.model.trim()) ||
				(typeof nestedModel?.name === "string" && nestedModel.name.trim()) ||
				(typeof nestedModel?.id === "string" && nestedModel.id.trim()) ||
				undefined;

			const rawProvider =
				(typeof parsed.provider === "string" && parsed.provider.trim()) ||
				(typeof nestedModel?.provider === "string" &&
					nestedModel.provider.trim()) ||
				undefined;

			const explicitVariant =
				(typeof parsed.modelVariant === "string" &&
					parsed.modelVariant.trim()) ||
				(typeof parsed.variant === "string" && parsed.variant.trim()) ||
				(typeof nestedModel?.variant === "string" &&
					nestedModel.variant.trim()) ||
				undefined;

			const [modelWithoutVariant, modelVariantFromName] = rawModelName
				? rawModelName.split("#", 2)
				: [undefined, undefined];

			const normalizedModelName = modelWithoutVariant?.trim() || undefined;
			const preferredModelName = normalizedModelName
				? normalizedModelName.includes("/")
					? normalizedModelName
					: rawProvider
						? `${rawProvider}/${normalizedModelName}`
						: normalizedModelName
				: undefined;
			const preferredModelVariant =
				explicitVariant || modelVariantFromName?.trim() || undefined;

			const preferredLlmAgent =
				(typeof parsed.agent === "string" && parsed.agent.trim()) ||
				(typeof parsed.llmAgent === "string" && parsed.llmAgent.trim()) ||
				(typeof nestedLlm?.agent === "string" && nestedLlm.agent.trim()) ||
				undefined;

			if (!preferredModelName && !preferredModelVariant && !preferredLlmAgent) {
				return undefined;
			}

			return {
				preferredModelName,
				preferredModelVariant,
				preferredLlmAgent,
			};
		} catch {
			return undefined;
		}
	}

	public enqueue(runId: string, input: QueuedRunInput): void {
		if (this.queueKeyByRunId.has(runId)) {
			log.warn("Run already queued", { runId });
			return;
		}

		const providerKey = this.resolveProviderKey(runId);
		const projectScope = input.projectId ?? input.projectPath;
		const currentRun = runRepo.getById(runId);
		const isGeneration = currentRun ? this.isGenerationRun(currentRun) : false;
		const queueKey = this.buildQueueKey(
			projectScope,
			providerKey,
			isGeneration,
		);
		const queue = this.ensureQueue(queueKey);

		this.runInputs.set(runId, input);
		this.queueKeyByRunId.set(runId, queueKey);
		this.queueMetaByQueueKey.set(queueKey, {
			projectScope,
			providerKey,
			isGeneration,
		});
		queue.push(runId);
		log.info("Run enqueued", {
			runId,
			projectScope,
			providerKey,
			projectPath: input.projectPath,
			isGeneration,
		});
		this.scheduleDrain();
	}

	public async cancel(runId: string): Promise<void> {
		log.info("Cancelling run", { runId });
		this.clearRetryTimer(runId);
		this.removeFromQueue(runId);

		const run = runRepo.getById(runId);
		if (!run) {
			log.warn("Run not found for cancel", { runId });
			return;
		}

		if (run.sessionId) {
			try {
				log.debug("Aborting OpenCode session", {
					runId,
					sessionId: run.sessionId,
				});
				await this.sessionManager.abortSession(run.sessionId);
			} catch (error) {
				log.error("Failed to abort OpenCode session during cancel", {
					runId,
					sessionId: run.sessionId,
					error,
				});
			}
		}

		const finishedAt = new Date().toISOString();
		let cancelled = runRepo.update(runId, {
			status: "cancelled",
			finishedAt,
			errorText: "",
			durationSec: this.durationSec(run.startedAt ?? finishedAt, finishedAt),
		});
		cancelled = await this.syncRunWorkspaceState(cancelled);

		runEventRepo.create({
			runId,
			eventType: "status",
			payload: { status: "cancelled", message: "Run cancelled" },
		});
		publishRunUpdate(cancelled);
		this.applyTaskTransition(cancelled, "run:cancelled", "");

		this.activeRunSessions.delete(runId);
	}

	public getQueueStats(): QueueStats {
		const queueKeys = new Set<string>([
			...this.queues.keys(),
			...this.running.keys(),
		]);

		const providerStatsByProviderKey = new Map<string, ProviderQueueStats>();
		const projectStatsByProjectScope = new Map<
			string,
			{
				queued: number;
				running: number;
				providers: Map<string, ProviderQueueStats>;
			}
		>();

		for (const queueKey of queueKeys) {
			const meta = this.queueMetaByQueueKey.get(queueKey);
			if (!meta) {
				continue;
			}

			const queue = this.queues.get(queueKey) ?? [];
			const running = this.running.get(queueKey);
			const queuedCount = queue.length;
			const runningCount = running?.size ?? 0;
			const concurrency = this.resolveProviderConcurrency(
				meta.providerKey,
				meta.isGeneration,
			);

			const providerStats = providerStatsByProviderKey.get(
				meta.providerKey,
			) ?? {
				providerKey: meta.providerKey,
				queued: 0,
				running: 0,
				concurrency,
			};
			providerStats.queued += queuedCount;
			providerStats.running += runningCount;
			providerStatsByProviderKey.set(meta.providerKey, providerStats);

			const projectStats = projectStatsByProjectScope.get(
				meta.projectScope,
			) ?? {
				queued: 0,
				running: 0,
				providers: new Map<string, ProviderQueueStats>(),
			};
			projectStats.queued += queuedCount;
			projectStats.running += runningCount;

			const projectProviderStats = projectStats.providers.get(
				meta.providerKey,
			) ?? {
				providerKey: meta.providerKey,
				queued: 0,
				running: 0,
				concurrency,
			};
			projectProviderStats.queued += queuedCount;
			projectProviderStats.running += runningCount;
			projectStats.providers.set(meta.providerKey, projectProviderStats);
			projectStatsByProjectScope.set(meta.projectScope, projectStats);
		}

		const providers = [...providerStatsByProviderKey.values()].sort((a, b) => {
			if (a.providerKey < b.providerKey) {
				return -1;
			}
			if (a.providerKey > b.providerKey) {
				return 1;
			}
			return 0;
		});

		const byProject = [...projectStatsByProjectScope.entries()]
			.map(([projectScope, stats]) => ({
				projectScope,
				queued: stats.queued,
				running: stats.running,
				providers: [...stats.providers.values()].sort((a, b) => {
					if (a.providerKey < b.providerKey) {
						return -1;
					}
					if (a.providerKey > b.providerKey) {
						return 1;
					}
					return 0;
				}),
			}))
			.sort((a, b) => {
				if (a.projectScope < b.projectScope) {
					return -1;
				}
				if (a.projectScope > b.projectScope) {
					return 1;
				}
				return 0;
			});

		const totalQueued = providers.reduce((sum, item) => sum + item.queued, 0);
		const totalRunning = providers.reduce((sum, item) => sum + item.running, 0);

		return {
			totalQueued,
			totalRunning,
			providers,
			byProject,
		};
	}

	private scheduleDrain(): void {
		if (this.draining) {
			return;
		}

		this.draining = true;
		queueMicrotask(() => {
			void this.drainQueue();
		});
	}

	private async drainQueue(): Promise<void> {
		this.draining = false;
		let progressed = true;

		while (progressed) {
			progressed = false;

			for (const [queueKey, queue] of this.queues.entries()) {
				const meta = this.queueMetaByQueueKey.get(queueKey);
				if (!meta) {
					continue;
				}

				const running = this.ensureRunning(queueKey);
				const concurrency = this.resolveProviderConcurrency(
					meta.providerKey,
					meta.isGeneration,
				);

				while (running.size < concurrency) {
					const runId = this.selectNextRunnableRun(queue);
					if (!runId) {
						this.cleanupQueueState(queueKey);
						break;
					}

					running.add(runId);
					progressed = true;

					void this.executeRun(runId).finally(() => {
						running.delete(runId);
						this.queueKeyByRunId.delete(runId);
						this.cleanupQueueState(queueKey);
						this.scheduleDrain();
					});
				}
			}
		}

		if (!progressed && this.hasQueuedRuns()) {
			this.scheduleBlockedRetry();
		}
	}

	private async executeRun(runId: string): Promise<void> {
		log.info("Executing run", { runId });
		const current = runRepo.getById(runId);
		if (!current || current.status !== "queued") {
			log.warn("Run not in queued state, skipping", {
				runId,
				status: current?.status,
			});
			this.runInputs.delete(runId);
			return;
		}

		const startedAt = new Date().toISOString();
		let runningRun = runRepo.update(runId, {
			status: "running",
			startedAt,
			errorText: "",
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
		this.applyTaskTransition(
			runningRun,
			this.isGenerationRun(runningRun) ? "generate:start" : "run:start",
			"",
		);

		try {
			const runInput = this.runInputs.get(runId);
			if (!runInput) {
				throw new Error(`Run input not found for run: ${runId}`);
			}

			log.debug("Starting OpenCode service", { runId });
			await this.opencodeService.start();

			log.debug("Creating OpenCode session", {
				runId,
				projectPath: runInput.projectPath,
			});
			const sessionId = await this.sessionManager.createSession(
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

			this.activeRunSessions.set(runId, sessionId);

			log.debug("Sending prompt to OpenCode", { runId, sessionId });
			await this.sessionManager.sendPrompt(
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

			await this.tryFinalizeFromSessionSnapshot(runId, sessionId);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Run execution failed";

			if (isNetworkError(error)) {
				const retried = this.scheduleRetryAfterNetworkError(runId, message);
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
				durationSec: this.durationSec(startedAt, finishedAt),
			});
			failedRun = await this.syncRunWorkspaceState(failedRun);

			runEventRepo.create({
				runId,
				eventType: "status",
				payload: {
					status: "failed",
					message,
				},
			});
			publishRunUpdate(failedRun);
			this.applyTaskTransition(
				failedRun,
				this.isGenerationRun(failedRun) ? "generate:fail" : "run:fail",
				message,
			);
			this.activeRunSessions.delete(runId);
			this.runInputs.delete(runId);
		}
	}

	private scheduleRetryAfterNetworkError(
		runId: string,
		errorMessage: string,
	): boolean {
		const run = runRepo.getById(runId);
		if (!run) {
			return false;
		}

		if (run.sessionId?.trim()) {
			return false;
		}

		const currentRetryCount =
			typeof run.metadata?._retryCount === "number" &&
			Number.isFinite(run.metadata._retryCount)
				? run.metadata._retryCount
				: 0;
		if (currentRetryCount >= this.maxRetryCount) {
			return false;
		}

		const retryCount = currentRetryCount + 1;
		const delayMs = this.retryBaseDelayMs * Math.pow(2, currentRetryCount);
		const queuedRun = runRepo.update(runId, {
			status: "queued",
			startedAt: null,
			finishedAt: null,
			errorText: "",
			metadata: {
				...run.metadata,
				_retryCount: retryCount,
				_lastRetryError: errorMessage,
			},
		});
		publishRunUpdate(queuedRun);

		log.info("Scheduling retry for run after network error", {
			runId,
			retryCount,
			delayMs,
		});
		runEventRepo.create({
			runId,
			eventType: "status",
			payload: {
				status: "queued",
				message: `Retrying after network error (attempt ${retryCount} of ${this.maxRetryCount})`,
			},
		});

		this.activeRunSessions.delete(runId);

		const timer = setTimeout(() => {
			this.retryTimers.delete(runId);
			// Re-read from DB to guard against cancellation during the delay
			const current = runRepo.getById(runId);
			if (!current || current.status !== "queued") {
				return;
			}
			const input = this.runInputs.get(runId);
			if (input) {
				this.enqueue(runId, input);
			}
		}, delayMs);
		this.retryTimers.set(runId, timer);

		return true;
	}

	public startProjectBoardPolling(projectId: string, viewerId: string): void {
		const normalizedProjectId = projectId.trim();
		const normalizedViewerId = viewerId.trim();
		if (normalizedProjectId.length === 0 || normalizedViewerId.length === 0) {
			return;
		}

		let viewers = this.activeProjectBoardWatchers.get(normalizedProjectId);
		if (!viewers) {
			viewers = new Map<string, number>();
			this.activeProjectBoardWatchers.set(normalizedProjectId, viewers);
		}

		viewers.set(normalizedViewerId, Date.now());
		this.ensureProjectPollingActive();
		void this.reconcileProjectRuns(normalizedProjectId);
	}

	public stopProjectBoardPolling(projectId: string, viewerId: string): void {
		const viewers = this.activeProjectBoardWatchers.get(projectId.trim());
		if (!viewers) {
			return;
		}

		viewers.delete(viewerId.trim());
		if (viewers.size === 0) {
			this.activeProjectBoardWatchers.delete(projectId.trim());
		}

		if (this.activeProjectBoardWatchers.size === 0) {
			this.stopProjectPolling();
		}
	}

	private ensureProjectPollingActive(): void {
		if (this.projectPollingTimer) {
			return;
		}

		this.projectPollingTimer = setInterval(() => {
			void this.pollViewedProjects();
		}, this.projectPollingIntervalMs);
		log.info("Started project board reconciliation polling", {
			projects: this.activeProjectBoardWatchers.size,
		});
	}

	private stopProjectPolling(): void {
		if (!this.projectPollingTimer) {
			return;
		}

		clearInterval(this.projectPollingTimer);
		this.projectPollingTimer = null;
		log.info("Stopped project board reconciliation polling");
	}

	private async pollViewedProjects(): Promise<void> {
		this.pruneInactiveProjectBoardWatchers();
		if (this.activeProjectBoardWatchers.size === 0) {
			this.stopProjectPolling();
			return;
		}

		for (const projectId of this.activeProjectBoardWatchers.keys()) {
			await this.reconcileProjectRuns(projectId);
		}
	}

	private pruneInactiveProjectBoardWatchers(): void {
		const cutoff = Date.now() - this.projectBoardWatcherTtlMs;
		for (const [
			projectId,
			viewers,
		] of this.activeProjectBoardWatchers.entries()) {
			for (const [viewerId, lastSeenAt] of viewers.entries()) {
				if (lastSeenAt >= cutoff) {
					continue;
				}

				viewers.delete(viewerId);
			}

			if (viewers.size === 0) {
				this.activeProjectBoardWatchers.delete(projectId);
			}
		}
	}

	private async finalizeDeadRun(runId: string): Promise<void> {
		const run = runRepo.getById(runId);
		if (!run) {
			return;
		}

		if (
			run.status === "completed" ||
			run.status === "failed" ||
			run.status === "cancelled"
		) {
			this.activeRunSessions.delete(runId);
			return;
		}

		const finishedAt = new Date().toISOString();
		let failedRun = runRepo.update(runId, {
			status: "failed",
			finishedAt,
			errorText: "Session not found or unreachable",
			durationSec: this.durationSec(run.startedAt ?? finishedAt, finishedAt),
		});
		failedRun = await this.syncRunWorkspaceState(failedRun);

		runEventRepo.create({
			runId,
			eventType: "status",
			payload: { status: "failed", message: "Session not found" },
		});

		this.applyTaskTransition(
			failedRun,
			"run:dead",
			"Session not found or unreachable",
		);

		publishRunUpdate(failedRun);
		this.activeRunSessions.delete(runId);
		this.runInputs.delete(runId);
	}

	private async pauseRunForPendingPermission(
		runId: string,
		permission: PermissionData,
	): Promise<void> {
		log.info("Permission request received, pausing run", {
			runId,
			permissionId: permission.id,
			permissionType: permission.permissionType,
			title: permission.title,
		});

		const run = runRepo.getById(runId);
		if (!run || run.status !== "running") {
			log.warn("Run not found or not running, cannot pause for permission", {
				runId,
				currentStatus: run?.status,
			});
			return;
		}

		const pausedRun = runRepo.update(runId, { status: "paused" });
		runEventRepo.create({
			runId,
			eventType: "permission",
			payload: {
				status: "paused",
				permissionId: permission.id,
				permissionType: permission.permissionType,
				pattern: permission.pattern,
				title: permission.title,
				sessionId: permission.sessionId,
				messageId: permission.messageId,
				message: `Permission requested: ${permission.title}`,
			},
		});

		publishSseEvent("run:permission", {
			runId,
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

		this.applyTaskTransition(
			pausedRun,
			"run:question",
			`Permission requested: ${permission.title}`,
		);
	}

	private async pauseRunForPendingQuestion(
		runId: string,
		question: QuestionData,
	): Promise<void> {
		log.info("Question received, pausing run", {
			runId,
			questionId: question.id,
			questions: question.questions.map((item) => item.question),
			sessionId: question.sessionId,
		});

		const run = runRepo.getById(runId);
		if (!run || run.status !== "running") {
			log.warn("Run not found or not running, cannot pause for question", {
				runId,
				currentStatus: run?.status,
			});
			return;
		}

		const pausedRun = runRepo.update(runId, { status: "paused" });
		runEventRepo.create({
			runId,
			eventType: "question",
			payload: {
				status: "paused",
				questionId: question.id,
				questions: question.questions.map((item) => item.question),
				sessionId: question.sessionId,
				message: "Question asked",
			},
		});

		publishSseEvent("run:question", {
			runId,
			taskId: pausedRun.taskId,
			questionId: question.id,
			questions: question.questions,
			sessionId: question.sessionId,
			createdAt: question.createdAt,
		});
		publishRunUpdate(pausedRun);

		this.applyTaskTransition(pausedRun, "run:question", "Question asked");
	}

	private async resumeRunAfterPermissionApproval(
		runId: string,
		permissionId: string,
	): Promise<void> {
		log.info("Permission approved, resuming run", {
			runId,
			permissionId,
		});

		const run = runRepo.getById(runId);
		if (!run || run.status !== "paused") {
			log.debug("Run not found or not paused, skipping permission resume", {
				runId,
				currentStatus: run?.status,
			});
			return;
		}

		const resumedRun = runRepo.update(runId, { status: "running" });
		runEventRepo.create({
			runId,
			eventType: "permission",
			payload: {
				status: "approved",
				permissionId,
				response: "approved",
				message: `Permission approved: ${permissionId}`,
			},
		});
		publishRunUpdate(resumedRun);
		this.applyTaskTransition(
			resumedRun,
			"run:answer",
			`Permission approved: ${permissionId}`,
		);
	}

	private async resumeRunAfterQuestionAnswered(
		runId: string,
		questionId: string,
	): Promise<void> {
		log.info("Question answered, resuming run", {
			runId,
			questionId,
		});

		const run = runRepo.getById(runId);
		if (!run || run.status !== "paused") {
			log.debug("Run not found or not paused, skipping question resume", {
				runId,
				currentStatus: run?.status,
			});
			return;
		}

		const resumedRun = runRepo.update(runId, { status: "running" });
		runEventRepo.create({
			runId,
			eventType: "question",
			payload: {
				status: "answered",
				questionId,
				response: "answered",
				message: "Question answered",
			},
		});
		publishRunUpdate(resumedRun);
		this.applyTaskTransition(resumedRun, "run:answer", "Question answered");
	}

	private async resumeOrphanedPausedRun(runId: string): Promise<void> {
		log.info("Resuming orphaned paused run — no pending interaction", {
			runId,
		});

		const run = runRepo.getById(runId);
		if (!run || run.status !== "paused") {
			return;
		}

		const resumedRun = runRepo.update(runId, { status: "running" });
		runEventRepo.create({
			runId,
			eventType: "status",
			payload: {
				status: "running",
				message: "Auto-resumed: no pending user interaction",
			},
		});
		publishRunUpdate(resumedRun);
		this.applyTaskTransition(
			resumedRun,
			"run:answer",
			"Resumed orphaned paused run",
		);
	}

	private getAwaitingPermissionId(runId: string): string | null {
		const events = runEventRepo.listByRun(runId, 50);
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

	private getAwaitingQuestionId(runId: string): string | null {
		const events = runEventRepo.listByRun(runId, 50);
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

	private async finalizeRunFromSession(
		runId: string,
		status: RunStatus,
		outcome: RunOutcome,
	): Promise<void> {
		log.info("Finalizing run", { runId, status });
		const run = runRepo.getById(runId);
		if (!run || run.status === status) {
			log.debug("Run already in target status or not found", {
				runId,
				currentStatus: run?.status,
				targetStatus: status,
			});
			return;
		}

		const canRecoverLateCompletion = this.canRecoverLateCompletion(run, status);
		if (
			run.status !== "running" &&
			run.status !== "queued" &&
			!canRecoverLateCompletion
		) {
			log.warn("Run not in running/queued state, cannot finalize", {
				runId,
				currentStatus: run.status,
			});
			return;
		}

		if (canRecoverLateCompletion) {
			log.info("Recovering failed run from late completion marker", {
				runId,
				errorText: getRunErrorText(run),
			});
		}

		const finishedAt = new Date().toISOString();
		let nextRun = runRepo.update(runId, {
			status,
			finishedAt,
			errorText: status === "failed" ? "Run failed" : "",
			durationSec: this.durationSec(run.startedAt ?? finishedAt, finishedAt),
		});
		nextRun = await this.syncRunWorkspaceState(nextRun);

		log.info("Run finalized", {
			runId,
			status,
			durationSec: this.durationSec(run.startedAt ?? finishedAt, finishedAt),
			taskId: run.taskId,
		});
		runEventRepo.create({
			runId,
			eventType: "status",
			payload: { status, message: `Run ${status}` },
		});

		try {
			const trigger = this.resolveTriggerFromOutcome(nextRun, status, outcome);
			if (trigger) {
				this.applyTaskTransition(nextRun, trigger, outcome.content);
			}
			if (
				status === "completed" &&
				this.isGenerationRun(nextRun) &&
				this.shouldAutoExecuteAfterGeneration()
			) {
				await this.enqueueExecutionForGeneratedTask(nextRun.taskId);
			}

			if (status === "completed" && !this.isGenerationRun(nextRun)) {
				const mergedRun = await this.tryAutomaticMerge(nextRun);
				const mergeStatus = mergedRun.metadata?.vcs?.mergeStatus;
				if (mergeStatus === "merged") {
					await this.startNextReadyTaskAfterMerge(nextRun.taskId);
				}
			}
		} catch (error) {
			log.error("Failed to project run outcome", {
				runId,
				status,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		publishRunUpdate(nextRun);
		this.activeRunSessions.delete(runId);
		this.runInputs.delete(runId);
	}

	public async rehydrateAndReconcileRuns(): Promise<void> {
		const activeRuns = this.listActiveRunsForReconciliation();
		await this.reconcileRuns(activeRuns);
	}

	public async reconcileProjectRuns(projectId: string): Promise<void> {
		if (this.reconcilingProjects.has(projectId)) {
			return;
		}

		this.reconcilingProjects.add(projectId);
		try {
			const scopedBoard = this.getPollableBoardContext(projectId);
			if (!scopedBoard) {
				return;
			}

			const activeRuns = this.listActiveRunsForReconciliation().filter((run) =>
				scopedBoard.taskIds.has(run.taskId),
			);
			await this.reconcileRuns(activeRuns);
			await this.reconcileTaskStatuses(
				projectId,
				scopedBoard.board,
				scopedBoard.tasks,
			);
		} finally {
			this.reconcilingProjects.delete(projectId);
		}
	}

	public async recoverOrphanedRuns(): Promise<void> {
		const failedRuns = runRepo.listByStatus("failed");
		const recoverableRuns = failedRuns.filter(
			(run) =>
				run.sessionId.trim().length > 0 &&
				getRunErrorText(run).toLowerCase() === "fetch failed",
		);

		for (const run of recoverableRuns) {
			try {
				const inspection = await this.sessionManager.inspectSession(
					run.sessionId,
				);
				const meta = deriveMetaStatus(inspection);

				if (meta.kind === "completed" || meta.kind === "failed") {
					const runStatus =
						meta.kind === "completed"
							? ("completed" as RunStatus)
							: ("failed" as RunStatus);
					await this.finalizeRunFromSession(run.id, runStatus, {
						marker: meta.marker,
						content: meta.content,
					});
				}
			} catch (error) {
				log.warn("Failed to recover orphaned run from session", {
					runId: run.id,
					sessionId: run.sessionId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	private async reconcileRuns(runs: Run[]): Promise<void> {
		for (const run of runs) {
			if (this.reconciling.has(run.id)) {
				log.debug("Skipping reconciliation for already-locked run", {
					runId: run.id,
					status: run.status,
				});
				continue;
			}

			this.reconciling.add(run.id);
			try {
				await this.reconcileRun(run.id);
			} catch (error) {
				log.warn("Run reconciliation failed", {
					runId: run.id,
					status: run.status,
					error: error instanceof Error ? error.message : String(error),
				});
			} finally {
				this.reconciling.delete(run.id);
			}
		}
	}

	private getPollableBoardContext(projectId: string): {
		board: ReturnType<typeof boardRepo.getByProjectId> extends infer T
			? Exclude<T, null>
			: never;
		tasks: Task[];
		taskIds: Set<string>;
	} | null {
		const board = boardRepo.getByProjectId(projectId);
		if (!board) {
			log.warn("Skipping task status reconciliation; board not found", {
				projectId,
			});
			return null;
		}

		const tasks = taskRepo.listByBoard(board.id).filter((task) => {
			const columnKey = getWorkflowColumnSystemKey(board, task.columnId);
			return columnKey !== "deferred" && columnKey !== "closed";
		});

		return {
			board,
			tasks,
			taskIds: new Set(tasks.map((task) => task.id)),
		};
	}

	private async reconcileTaskStatuses(
		projectId: string,
		board: NonNullable<ReturnType<typeof boardRepo.getByProjectId>>,
		tasks: Task[],
	): Promise<void> {
		for (const task of tasks) {
			const timeSinceUpdate = Date.now() - Date.parse(task.updatedAt);
			if (timeSinceUpdate < this.manualStatusGraceMs) {
				continue;
			}

			const runs = [...runRepo.listByTask(task.id)].sort(
				(a, b) =>
					Date.parse(b.updatedAt ?? b.createdAt) -
					Date.parse(a.updatedAt ?? a.createdAt),
			);
			const activeRuns = runs.filter(
				(run) =>
					run.status === "queued" ||
					run.status === "running" ||
					run.status === "paused",
			);

			if (activeRuns.length > 0) {
				const nonStaleActiveRunExists = activeRuns.some(
					(run) => !this.isRunStale(run),
				);
				if (nonStaleActiveRunExists) {
					this.reconcileTaskWithActiveRuns(
						task,
						activeRuns.filter((run) => !this.isRunStale(run)),
					);
					continue;
				}

				for (const activeRun of activeRuns) {
					if (!this.isRunStale(activeRun)) {
						continue;
					}

					log.info(
						"Attempting to finalize stale run during task reconciliation",
						{
							projectId,
							taskId: task.id,
							runId: activeRun.id,
							runStatus: activeRun.status,
							startedAt: activeRun.startedAt,
						},
					);

					await this.reconcileStaleRun(activeRun, projectId, task.id);
				}
				continue;
			}

			const latestSettledRun = runs.find(
				(run) => run.status === "completed" || run.status === "failed",
			);
			if (!latestSettledRun) {
				if (
					task.status !== "running" &&
					task.status !== "generating" &&
					task.status !== "paused" &&
					task.status !== "question"
				) {
					continue;
				}

				log.info("Skipping stale task reconciliation without settled run", {
					projectId,
					taskId: task.id,
					status: task.status,
					columnId: task.columnId,
					columnKey: getWorkflowColumnSystemKey(board, task.columnId),
				});
				continue;
			}

			let derivedMarker: RunOutcomeMarker | null = null;
			let derivedContent = "";
			let source: "session" | "fallback" = "fallback";

			if (latestSettledRun.status === "completed") {
				const sessionId = latestSettledRun.sessionId.trim();
				if (sessionId.length > 0) {
					try {
						const inspection =
							await this.sessionManager.inspectSession(sessionId);
						const meta = deriveMetaStatus(inspection);

						if (meta.kind === "completed" || meta.kind === "failed") {
							derivedMarker = meta.marker;
							derivedContent = meta.content;
							source = "session";
						} else {
							log.warn(
								"Task status reconciliation inspection did not yield a terminal marker",
								{
									projectId,
									taskId: task.id,
									runId: latestSettledRun.id,
									sessionId,
									inspectionKind: meta.kind,
								},
							);
						}
					} catch (error) {
						log.warn(
							"Failed to inspect session during task status reconciliation",
							{
								projectId,
								taskId: task.id,
								runId: latestSettledRun.id,
								sessionId,
								error: error instanceof Error ? error.message : String(error),
							},
						);
					}
				}

				if (!derivedMarker) {
					derivedMarker = this.staleRunFallbackMarker(latestSettledRun);
				}
			} else if (latestSettledRun.status === "failed") {
				derivedMarker = "fail";
			}

			if (!derivedMarker) {
				continue;
			}

			try {
				const trigger = this.resolveTriggerFromOutcome(
					latestSettledRun,
					latestSettledRun.status,
					{
						marker: derivedMarker,
						content: derivedContent,
					},
				);
				if (!trigger) {
					continue;
				}
				this.applyTaskTransition(latestSettledRun, trigger, derivedContent);
				log.info("Reconciled task status from latest settled run", {
					projectId,
					taskId: task.id,
					fromStatus: task.status,
					runId: latestSettledRun.id,
					runStatus: latestSettledRun.status,
					runKind: latestSettledRun.metadata?.kind ?? null,
					marker: derivedMarker,
					source,
				});
			} catch (error) {
				log.error("Failed to reconcile task status from latest settled run", {
					projectId,
					taskId: task.id,
					runId: latestSettledRun.id,
					marker: derivedMarker,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	private reconcileTaskWithActiveRuns(task: Task, activeRuns: Run[]): void {
		const runningRun = activeRuns.find((run) => run.status === "running");
		if (runningRun) {
			const nextStatus = this.isGenerationRun(runningRun)
				? "generating"
				: "running";
			if (task.status !== nextStatus) {
				this.applyTaskTransition(
					runningRun,
					this.isGenerationRun(runningRun) ? "generate:start" : "run:start",
					"",
				);
			}
			return;
		}

		const pausedRun = activeRuns.find((run) => run.status === "paused");
		if (pausedRun && task.status !== "question") {
			this.applyTaskTransition(
				pausedRun,
				"run:question",
				"Run paused awaiting input",
			);
		}
	}

	private isRunStale(run: Run): boolean {
		if (run.status !== "running") {
			return false;
		}

		const startedAt = run.startedAt ?? run.updatedAt ?? run.createdAt;
		const elapsedMs = Date.now() - Date.parse(startedAt);
		return elapsedMs > this.staleRunThresholdMs;
	}

	private async reconcileStaleRun(
		run: Run,
		projectId: string,
		taskId: string,
	): Promise<void> {
		const sessionId = run.sessionId.trim();
		if (sessionId.length === 0) {
			log.warn("Cannot reconcile stale run; no session ID", {
				projectId,
				taskId,
				runId: run.id,
			});
			return;
		}

		try {
			const inspection = await this.sessionManager.inspectSession(sessionId);
			const meta = deriveMetaStatus(inspection);

			if (meta.kind === "completed" || meta.kind === "failed") {
				const runStatus =
					meta.kind === "completed"
						? ("completed" as RunStatus)
						: ("failed" as RunStatus);
				await this.finalizeRunFromSession(run.id, runStatus, {
					marker: meta.marker,
					content: meta.content,
				});
				log.info("Finalized stale run during task reconciliation", {
					projectId,
					taskId,
					runId: run.id,
					runStatus,
					marker: meta.marker,
				});
				return;
			}

			if (meta.kind === "dead") {
				await this.failRunDuringReconciliation(
					run,
					"Session not found for stale run",
					"Session expired",
				);
				log.info("Failed stale run (session dead) during task reconciliation", {
					projectId,
					taskId,
					runId: run.id,
				});
				return;
			}

			log.info(
				"Stale run session alive but no completion marker; force-finalizing",
				{
					projectId,
					taskId,
					runId: run.id,
					inspectionKind: meta.kind,
					runKind: run.metadata?.kind ?? null,
				},
			);

			const fallbackMarker = this.staleRunFallbackMarker(run);
			const fallbackContent = findStoryContent(inspection);
			await this.finalizeRunFromSession(run.id, "completed" as RunStatus, {
				marker: fallbackMarker,
				content: fallbackContent,
			});
			log.info("Force-finalized stale run with fallback marker", {
				projectId,
				taskId,
				runId: run.id,
				marker: fallbackMarker,
			});
		} catch (error) {
			log.error("Failed to reconcile stale run", {
				projectId,
				taskId,
				runId: run.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private staleRunFallbackMarker(run: Run): RunOutcomeMarker {
		const kind = run.metadata?.kind;
		if (kind === generationRunKind) {
			return "generated";
		}
		if (kind === "task-qa-testing") {
			return "test_ok";
		}
		return "done";
	}

	private listActiveRunsForReconciliation(): Run[] {
		const listByStatuses = (
			runRepo as { listByStatuses?: (statuses: string[]) => Run[] }
		).listByStatuses;
		if (typeof listByStatuses === "function") {
			return listByStatuses.call(runRepo, ["queued", "running", "paused"]);
		}

		return [
			...runRepo.listByStatus("queued"),
			...runRepo.listByStatus("running"),
			...runRepo.listByStatus("paused"),
		].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
	}

	private async reconcileRun(runId: string): Promise<void> {
		const run = runRepo.getById(runId);
		if (!run) {
			return;
		}

		if (
			run.status !== "queued" &&
			run.status !== "running" &&
			run.status !== "paused"
		) {
			return;
		}

		const sessionId = run.sessionId.trim();
		if (run.status === "queued" && sessionId.length === 0) {
			const runInput = this.runInputs.get(run.id);
			if (!runInput) {
				log.warn("Failing queued run; input lost during reconciliation", {
					runId: run.id,
				});
				await this.failRunDuringReconciliation(
					run,
					"Run input lost on restart",
					"Run input lost on restart",
				);
				return;
			}

			log.info("Re-enqueueing queued run during reconciliation", {
				runId: run.id,
				projectId: runInput.projectId,
				projectPath: runInput.projectPath,
			});
			this.enqueue(run.id, runInput);
			return;
		}

		if (sessionId.length === 0) {
			log.warn("Skipping reconciliation for active run without session", {
				runId: run.id,
				status: run.status,
			});
			return;
		}

		log.info("Inspecting run session during reconciliation", {
			runId: run.id,
			status: run.status,
			sessionId,
		});
		const inspection = await this.sessionManager.inspectSession(sessionId);
		await this.applyInspectionResult(run, sessionId, inspection);
	}

	private async applyInspectionResult(
		run: Run,
		sessionId: string,
		inspection: SessionInspectionResult,
	): Promise<void> {
		const meta = deriveMetaStatus(inspection);

		switch (meta.kind) {
			case "completed":
			case "failed": {
				const runStatus =
					meta.kind === "completed"
						? ("completed" as RunStatus)
						: ("failed" as RunStatus);
				await this.finalizeRunFromSession(run.id, runStatus, {
					marker: meta.marker,
					content: meta.content,
				});
				return;
			}
			case "dead":
				await this.failRunDuringReconciliation(
					run,
					"Session not found during reconciliation",
					"Session not found",
				);
				return;
			case "running":
				break;
			case "permission": {
				const nextRun = this.ensureRunPausedForPermission(run, meta.permission);
				this.attachReconciledSession(nextRun.id, sessionId);
				return;
			}
			case "question": {
				const nextRun = this.ensureRunPausedForQuestion(run, meta.questions[0]);
				this.attachReconciledSession(nextRun.id, sessionId);
				return;
			}
		}

		if (
			run.status === "running" &&
			this.isRunStale(run) &&
			inspection.probeStatus !== "transient_error"
		) {
			const fallbackMarker = this.staleRunFallbackMarker(run);
			await this.finalizeRunFromSession(run.id, "completed", {
				marker: fallbackMarker,
				content: "",
			});
			log.info("Force-finalized stale running run during reconciliation", {
				runId: run.id,
				sessionId,
				marker: fallbackMarker,
				runKind: run.metadata?.kind ?? null,
			});
			return;
		}

		if (run.status === "paused") {
			await this.reconcilePausedRun(run.id, sessionId);
			this.attachReconciledSession(run.id, sessionId);
			return;
		}

		if (run.status === "queued") {
			const startedAt = run.startedAt ?? new Date().toISOString();
			const resumedRun = runRepo.update(run.id, {
				status: "running",
				startedAt,
				errorText: "",
			});
			runEventRepo.create({
				runId: run.id,
				eventType: "status",
				payload: {
					status: "running",
					message: "Run resumed during reconciliation",
				},
			});
			publishRunUpdate(resumedRun);
			this.applyTaskTransition(
				resumedRun,
				"run:answer",
				"Run resumed during reconciliation",
			);
			log.info("Reattached queued run as running during reconciliation", {
				runId: run.id,
				sessionId,
			});
			this.attachReconciledSession(resumedRun.id, sessionId);
			return;
		}

		log.info("Reattached active run during reconciliation", {
			runId: run.id,
			sessionId,
			status: run.status,
		});
		this.attachReconciledSession(run.id, sessionId);
	}

	private async reconcilePausedRun(
		runId: string,
		sessionId: string,
	): Promise<void> {
		const awaitingPermissionId = this.getAwaitingPermissionId(runId);
		if (awaitingPermissionId) {
			const pendingPermissions =
				await this.sessionManager.listPendingPermissions(sessionId);
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
			const pendingQuestions =
				await this.sessionManager.listPendingQuestions(sessionId);
			const stillPending = pendingQuestions.some(
				(question) => question.id === awaitingQuestionId,
			);
			if (!stillPending) {
				await this.resumeRunAfterQuestionAnswered(runId, awaitingQuestionId);
			}
			return;
		}

		const [orphanPermissions, orphanQuestions] = await Promise.all([
			this.sessionManager.listPendingPermissions(sessionId),
			this.sessionManager.listPendingQuestions(sessionId),
		]);
		if (orphanPermissions.length === 0 && orphanQuestions.length === 0) {
			await this.resumeOrphanedPausedRun(runId);
		}
	}

	private ensureRunPausedForPermission(
		run: Run,
		permission: PermissionData,
	): Run {
		if (run.status === "paused") {
			return run;
		}

		const pausedRun = runRepo.update(run.id, { status: "paused" });
		runEventRepo.create({
			runId: run.id,
			eventType: "permission",
			payload: {
				status: "paused",
				permissionId: permission.id,
				permissionType: permission.permissionType,
				pattern: permission.pattern,
				title: permission.title,
				sessionId: permission.sessionId,
				messageId: permission.messageId,
				message: `Permission requested: ${permission.title}`,
			},
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
		this.applyTaskTransition(
			pausedRun,
			"run:question",
			`Permission requested: ${permission.title}`,
		);
		return pausedRun;
	}

	private ensureRunPausedForQuestion(run: Run, question: QuestionData): Run {
		if (run.status === "paused") {
			return run;
		}

		const pausedRun = runRepo.update(run.id, { status: "paused" });
		runEventRepo.create({
			runId: run.id,
			eventType: "question",
			payload: {
				status: "paused",
				questionId: question.id,
				questions: question.questions.map((item) => item.question),
				sessionId: question.sessionId,
				message: "Question asked",
			},
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
		this.applyTaskTransition(pausedRun, "run:question", "Question asked");
		return pausedRun;
	}

	private attachReconciledSession(runId: string, sessionId: string): void {
		this.activeRunSessions.set(runId, sessionId);
	}

	private async failRunDuringReconciliation(
		run: Run,
		errorText: string,
		assistantContent: string,
	): Promise<void> {
		const finishedAt = new Date().toISOString();
		let failedRun = runRepo.update(run.id, {
			status: "failed",
			finishedAt,
			errorText,
			durationSec: this.durationSec(run.startedAt ?? finishedAt, finishedAt),
		});
		failedRun = await this.syncRunWorkspaceState(failedRun);

		runEventRepo.create({
			runId: run.id,
			eventType: "status",
			payload: {
				status: "failed",
				message: errorText,
			},
		});
		publishRunUpdate(failedRun);
		this.applyTaskTransition(
			failedRun,
			this.isGenerationRun(failedRun) ? "generate:fail" : "run:fail",
			assistantContent,
		);

		this.activeRunSessions.delete(run.id);
		this.removeFromQueue(run.id);
	}

	private schedulePeriodicReconciliation(): void {
		if (this.reconciliationTimer) {
			return;
		}

		this.reconciliationTimer = setTimeout(() => {
			this.reconciliationTimer = null;
			void this.rehydrateAndReconcileRuns().finally(() => {
				this.schedulePeriodicReconciliation();
			});
		}, this.reconciliationIntervalMs);
	}

	private async syncRunWorkspaceState(run: Run): Promise<Run> {
		const vcsMetadata = await this.vcsManager.syncRunWorkspace(run);
		if (!vcsMetadata) {
			return run;
		}

		return runRepo.update(run.id, {
			metadata: {
				...(run.metadata ?? {}),
				vcs: vcsMetadata,
			},
		});
	}

	private async tryAutomaticMerge(run: Run): Promise<Run> {
		const currentVcs = run.metadata?.vcs;
		if (!currentVcs || currentVcs.mergeStatus === "merged") {
			return run;
		}

		try {
			const mergedVcs = await this.vcsManager.mergeRunWorkspace(
				run,
				"automatic",
			);
			const vcsMetadata = await this.cleanupMergedWorkspace(mergedVcs);
			const updatedRun = runRepo.update(run.id, {
				metadata: {
					...(run.metadata ?? {}),
					vcs: vcsMetadata,
				},
			});
			const cleanupMessage =
				vcsMetadata.cleanupStatus === "cleaned"
					? " and cleaned the worktree"
					: vcsMetadata.lastCleanupError
						? `, but cleanup is pending: ${vcsMetadata.lastCleanupError}`
						: "";
			runEventRepo.create({
				runId: run.id,
				eventType: "status",
				payload: {
					status: updatedRun.status,
					message: `Automatically merged ${vcsMetadata.branchName} into ${vcsMetadata.baseBranch}${cleanupMessage}`,
					autoMerged: true,
					mergedCommit: vcsMetadata.mergedCommit,
					cleanupStatus: vcsMetadata.cleanupStatus,
				},
			});
			return updatedRun;
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Automatic merge could not be completed";
			const refreshedVcs = await this.vcsManager.syncRunWorkspace(run);
			const updatedRun = runRepo.update(run.id, {
				metadata: {
					...(run.metadata ?? {}),
					vcs: {
						...(refreshedVcs ?? currentVcs),
						lastMergeError: message,
					},
				},
			});
			runEventRepo.create({
				runId: run.id,
				eventType: "status",
				payload: {
					status: updatedRun.status,
					message: `Automatic merge deferred: ${message}`,
					autoMerged: false,
				},
			});
			return updatedRun;
		}
	}

	private async cleanupMergedWorkspace(
		vcsMetadata: RunVcsMetadata,
	): Promise<RunVcsMetadata> {
		try {
			return await this.vcsManager.cleanupRunWorkspace(vcsMetadata);
		} catch (error) {
			const syncedVcs = await this.vcsManager
				.syncVcsMetadata(vcsMetadata)
				.catch(() => vcsMetadata);
			const message =
				error instanceof Error
					? error.message
					: "Merged successfully, but worktree cleanup failed";
			return {
				...syncedVcs,
				cleanupStatus: "failed",
				lastCleanupError: message,
			};
		}
	}

	private selectNextRunnableRun(queue: string[]): string | null {
		let bestIndex = -1;
		let bestScore = Number.NEGATIVE_INFINITY;
		let bestCreatedAt = Number.POSITIVE_INFINITY;

		for (let index = 0; index < queue.length; index += 1) {
			const runId = queue[index];
			const run = runRepo.getById(runId);
			if (!run) {
				queue.splice(index, 1);
				index -= 1;
				this.queueKeyByRunId.delete(runId);
				this.runInputs.delete(runId);
				continue;
			}

			if (!this.canRunNow(run)) {
				continue;
			}

			const score = this.resolveRunPriorityScore(run);
			const createdAtMs = Date.parse(run.createdAt);
			const safeCreatedAt = Number.isFinite(createdAtMs)
				? createdAtMs
				: Number.POSITIVE_INFINITY;

			if (
				score > bestScore ||
				(score === bestScore && safeCreatedAt < bestCreatedAt)
			) {
				bestIndex = index;
				bestScore = score;
				bestCreatedAt = safeCreatedAt;
			}
		}

		if (bestIndex < 0) {
			return null;
		}

		const [selected] = queue.splice(bestIndex, 1);
		return selected ?? null;
	}

	private canRunNow(run: Run): boolean {
		if (this.isGenerationRun(run)) {
			return true;
		}

		const task = taskRepo.getById(run.taskId);
		if (!task) {
			return true;
		}

		if (task.priority === "postpone") {
			return false;
		}

		return this.areDependenciesResolved(task.id);
	}

	private areDependenciesResolved(taskId: string): boolean {
		const links = taskLinkRepo.listByTaskId(taskId);
		const blockers = links.filter(
			(link) => link.linkType === "blocks" && link.toTaskId === taskId,
		);
		for (const blocker of blockers) {
			const blockerTask = taskRepo.getById(blocker.fromTaskId);
			if (!blockerTask) {
				continue;
			}

			if (blockerTask.status !== dependencyReadyStatus) {
				return false;
			}
		}

		return true;
	}

	private resolveRunPriorityScore(run: Run): number {
		if (this.isGenerationRun(run)) {
			return Number.MAX_SAFE_INTEGER;
		}

		const task = taskRepo.getById(run.taskId);
		if (!task) {
			return runPriorityScore.normal;
		}

		switch (task.priority) {
			case "postpone":
				return runPriorityScore.postpone;
			case "low":
				return runPriorityScore.low;
			case "normal":
				return runPriorityScore.normal;
			case "urgent":
				return runPriorityScore.urgent;
			default:
				return runPriorityScore.normal;
		}
	}

	private hasQueuedRuns(): boolean {
		for (const queue of this.queues.values()) {
			if (queue.length > 0) {
				return true;
			}
		}

		return false;
	}

	private scheduleBlockedRetry(): void {
		if (this.blockedRetryTimer) {
			return;
		}

		this.blockedRetryTimer = setTimeout(() => {
			this.blockedRetryTimer = null;
			this.scheduleDrain();
		}, this.blockedRetryDelayMs);
	}

	public pickNextReadyTask(boardId: string): Task | null {
		const board = boardRepo.getById(boardId);
		if (!board) {
			log.warn("pickNextReadyTask: board not found", { boardId });
			return null;
		}

		const readyColumnId = getWorkflowColumnIdBySystemKey(board, "ready");
		if (!readyColumnId) {
			log.warn("pickNextReadyTask: ready column not found on board", {
				boardId,
			});
			return null;
		}

		const allTasks = taskRepo.listByBoard(boardId);
		const readyTasks = allTasks.filter(
			(task) =>
				task.columnId === readyColumnId &&
				task.priority !== "postpone" &&
				task.status === "pending",
		);

		if (readyTasks.length === 0) {
			log.info("pickNextReadyTask: no ready tasks found", { boardId });
			return null;
		}

		readyTasks.sort((a, b) => {
			const scoreA =
				runPriorityScore[a.priority as TaskPriority] ?? runPriorityScore.normal;
			const scoreB =
				runPriorityScore[b.priority as TaskPriority] ?? runPriorityScore.normal;
			if (scoreA !== scoreB) return scoreB - scoreA;
			return a.orderInColumn - b.orderInColumn;
		});

		for (const task of readyTasks) {
			if (this.areDependenciesResolved(task.id)) {
				return task;
			}
			log.info(
				"pickNextReadyTask: skipping task with unresolved dependencies",
				{
					taskId: task.id,
					taskTitle: task.title,
				},
			);
		}

		log.info(
			"pickNextReadyTask: all ready tasks have unresolved dependencies",
			{
				boardId,
			},
		);
		return null;
	}

	public async startNextReadyTaskAfterMerge(
		mergedTaskId: string,
	): Promise<void> {
		try {
			const mergedTask = taskRepo.getById(mergedTaskId);
			if (!mergedTask) {
				log.warn("startNextReadyTaskAfterMerge: merged task not found", {
					mergedTaskId,
				});
				return;
			}

			const nextTask = this.pickNextReadyTask(mergedTask.boardId);
			if (!nextTask) {
				log.info(
					"startNextReadyTaskAfterMerge: no suitable next task in Ready",
					{ boardId: mergedTask.boardId, mergedTaskId },
				);
				return;
			}

			const activeRun = runRepo
				.listByTask(nextTask.id)
				.find(
					(run) =>
						!this.isGenerationRun(run) &&
						(run.status === "queued" ||
							run.status === "running" ||
							run.status === "paused"),
				);
			if (activeRun) {
				log.info(
					"startNextReadyTaskAfterMerge: next task already has active run",
					{
						taskId: nextTask.id,
						runId: activeRun.id,
						status: activeRun.status,
					},
				);
				return;
			}

			log.info("startNextReadyTaskAfterMerge: starting next task from Ready", {
				mergedTaskId,
				nextTaskId: nextTask.id,
				nextTaskTitle: nextTask.title,
				boardId: mergedTask.boardId,
			});

			await this.enqueueExecutionForNextTask(nextTask.id);
		} catch (error) {
			log.error("startNextReadyTaskAfterMerge: failed", {
				mergedTaskId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private isGenerationRun(run: Run): boolean {
		return run.metadata?.kind === generationRunKind;
	}

	private shouldAutoExecuteAfterGeneration(): boolean {
		return process.env.RUNS_AUTO_EXECUTE_AFTER_GENERATION === "1";
	}

	private async enqueueExecutionForGeneratedTask(
		taskId: string,
	): Promise<void> {
		const task = taskRepo.getById(taskId);
		if (!task) {
			log.warn("Skipping execution enqueue after generation; task not found", {
				taskId,
			});
			return;
		}

		if (task.priority === "postpone") {
			log.info("Skipping execution enqueue for postponed task", {
				taskId,
			});
			return;
		}

		const activeExecutionRun = runRepo
			.listByTask(task.id)
			.find(
				(run) =>
					!this.isGenerationRun(run) &&
					(run.status === "queued" ||
						run.status === "running" ||
						run.status === "paused"),
			);
		if (activeExecutionRun) {
			log.info("Execution run already active for task", {
				taskId: task.id,
				runId: activeExecutionRun.id,
				status: activeExecutionRun.status,
			});
			return;
		}

		const project = projectRepo.getById(task.projectId);
		if (!project) {
			log.warn("Skipping execution enqueue; project not found", {
				taskId: task.id,
				projectId: task.projectId,
			});
			return;
		}

		const availableRoles = roleRepo.listWithPresets();
		const taskTags = this.parseTaskTags(task.tags);
		const assignedRoleId = this.resolveAssignedRoleIdFromTags(taskTags);
		const roleId = assignedRoleId ?? availableRoles[0]?.id;
		if (!roleId) {
			log.warn("Skipping execution enqueue; no roles configured", {
				taskId: task.id,
			});
			return;
		}

		const selectedRole =
			availableRoles.find((role) => role.id === roleId) ?? null;
		const selectedRolePreset = this.parseRolePreset(
			roleRepo.getPresetJson(roleId),
		);

		const snapshotId = contextSnapshotRepo.create({
			taskId: task.id,
			kind: "run-start",
			summary: `Execution queued after BA story generation for ${task.title}`,
			payload: {
				taskId: task.id,
				title: task.title,
				description: task.description,
				mode: "execute",
				roleId,
				reason: "generated-story-ready",
			},
		});

		const executionRun = runRepo.create({
			taskId: task.id,
			roleId,
			mode: "execute",
			contextSnapshotId: snapshotId,
		});

		runEventRepo.create({
			runId: executionRun.id,
			eventType: "status",
			payload: {
				status: executionRun.status,
				message: "Execution run queued after BA story generation",
			},
		});
		publishRunUpdate(executionRun);

		let queuedExecutionRun = executionRun;
		let executionProjectPath = project.path;
		if (this.worktreeEnabled) {
			try {
				const vcsMetadata = await this.vcsManager.provisionRunWorkspace({
					projectPath: project.path,
					runId: executionRun.id,
					taskId: task.id,
					taskTitle: task.title,
				});
				queuedExecutionRun = runRepo.update(executionRun.id, {
					metadata: {
						...(executionRun.metadata ?? {}),
						vcs: vcsMetadata,
					},
				});
				runEventRepo.create({
					runId: executionRun.id,
					eventType: "status",
					payload: {
						status: queuedExecutionRun.status,
						message: `Worktree ready: ${vcsMetadata.branchName}`,
						worktreePath: vcsMetadata.worktreePath,
					},
				});
				publishRunUpdate(queuedExecutionRun);
				executionProjectPath = vcsMetadata.worktreePath;
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to provision git worktree";
				const failedRun = runRepo.update(executionRun.id, {
					status: "failed",
					finishedAt: new Date().toISOString(),
					errorText: message,
				});
				runEventRepo.create({
					runId: executionRun.id,
					eventType: "status",
					payload: {
						status: "failed",
						message,
					},
				});
				publishRunUpdate(failedRun);
				return;
			}
		}

		this.enqueue(queuedExecutionRun.id, {
			projectPath: executionProjectPath,
			projectId: project.id,
			sessionTitle: task.title.slice(0, 120),
			sessionPreferences: this.toSessionPreferences(
				selectedRole,
				selectedRole?.preset_json,
			),
			prompt: buildTaskPrompt(
				{ title: task.title, description: task.description },
				{
					id: project.id,
					path: executionProjectPath,
				},
				{
					id: roleId,
					name: selectedRole?.name ?? roleId,
					systemPrompt: selectedRolePreset?.systemPrompt,
					skills: selectedRolePreset?.skills,
				},
			),
		});
	}

	private async enqueueExecutionForNextTask(taskId: string): Promise<void> {
		const task = taskRepo.getById(taskId);
		if (!task) {
			log.warn("enqueueExecutionForNextTask: task not found", { taskId });
			return;
		}

		if (task.priority === "postpone") {
			log.info("enqueueExecutionForNextTask: skipping postponed task", {
				taskId,
			});
			return;
		}

		const activeExecutionRun = runRepo
			.listByTask(task.id)
			.find(
				(run) =>
					!this.isGenerationRun(run) &&
					(run.status === "queued" ||
						run.status === "running" ||
						run.status === "paused"),
			);
		if (activeExecutionRun) {
			log.info("enqueueExecutionForNextTask: execution run already active", {
				taskId: task.id,
				runId: activeExecutionRun.id,
				status: activeExecutionRun.status,
			});
			return;
		}

		const project = projectRepo.getById(task.projectId);
		if (!project) {
			log.warn("enqueueExecutionForNextTask: project not found", {
				taskId: task.id,
				projectId: task.projectId,
			});
			return;
		}

		const availableRoles = roleRepo.listWithPresets();
		const taskTags = this.parseTaskTags(task.tags);
		const assignedRoleId = this.resolveAssignedRoleIdFromTags(taskTags);
		const roleId = assignedRoleId ?? availableRoles[0]?.id;
		if (!roleId) {
			log.warn("enqueueExecutionForNextTask: no roles configured", {
				taskId: task.id,
			});
			return;
		}

		const selectedRole =
			availableRoles.find((role) => role.id === roleId) ?? null;
		const selectedRolePreset = this.parseRolePreset(
			roleRepo.getPresetJson(roleId),
		);

		const snapshotId = contextSnapshotRepo.create({
			taskId: task.id,
			kind: "run-start",
			summary: `Auto-started after merge for ${task.title}`,
			payload: {
				taskId: task.id,
				title: task.title,
				description: task.description,
				mode: "execute",
				roleId,
				reason: "auto-start-after-merge",
			},
		});

		const executionRun = runRepo.create({
			taskId: task.id,
			roleId,
			mode: "execute",
			contextSnapshotId: snapshotId,
		});

		runEventRepo.create({
			runId: executionRun.id,
			eventType: "status",
			payload: {
				status: executionRun.status,
				message: "Execution run auto-started after previous task merge",
			},
		});
		publishRunUpdate(executionRun);

		let queuedExecutionRun = executionRun;
		let executionProjectPath = project.path;
		if (this.worktreeEnabled) {
			try {
				const vcsMetadata = await this.vcsManager.provisionRunWorkspace({
					projectPath: project.path,
					runId: executionRun.id,
					taskId: task.id,
					taskTitle: task.title,
				});
				queuedExecutionRun = runRepo.update(executionRun.id, {
					metadata: {
						...(executionRun.metadata ?? {}),
						vcs: vcsMetadata,
					},
				});
				runEventRepo.create({
					runId: executionRun.id,
					eventType: "status",
					payload: {
						status: queuedExecutionRun.status,
						message: `Worktree ready: ${vcsMetadata.branchName}`,
						worktreePath: vcsMetadata.worktreePath,
					},
				});
				publishRunUpdate(queuedExecutionRun);
				executionProjectPath = vcsMetadata.worktreePath;
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to provision git worktree";
				const failedRun = runRepo.update(executionRun.id, {
					status: "failed",
					finishedAt: new Date().toISOString(),
					errorText: message,
				});
				runEventRepo.create({
					runId: executionRun.id,
					eventType: "status",
					payload: {
						status: "failed",
						message,
					},
				});
				publishRunUpdate(failedRun);
				return;
			}
		}

		this.enqueue(queuedExecutionRun.id, {
			projectPath: executionProjectPath,
			projectId: project.id,
			sessionTitle: task.title.slice(0, 120),
			sessionPreferences: this.toSessionPreferences(
				selectedRole,
				selectedRole?.preset_json,
			),
			prompt: buildTaskPrompt(
				{ title: task.title, description: task.description },
				{
					id: project.id,
					path: executionProjectPath,
				},
				{
					id: roleId,
					name: selectedRole?.name ?? roleId,
					systemPrompt: selectedRolePreset?.systemPrompt,
					skills: selectedRolePreset?.skills,
				},
			),
		});
	}

	private toSessionPreferences(
		role:
			| {
					preferred_model_name?: string | null;
					preferred_model_variant?: string | null;
					preferred_llm_agent?: string | null;
			  }
			| null
			| undefined,
		presetJson?: string | null,
	): SessionStartPreferences | undefined {
		const fromPreset = this.extractSessionPreferencesFromPreset(presetJson);

		const modelName =
			role?.preferred_model_name?.trim() || fromPreset?.preferredModelName;
		const modelVariant =
			role?.preferred_model_variant?.trim() ||
			fromPreset?.preferredModelVariant;
		const llmAgent =
			role?.preferred_llm_agent?.trim() || fromPreset?.preferredLlmAgent;

		if (!modelName && !modelVariant && !llmAgent) {
			return undefined;
		}

		return {
			preferredModelName: modelName,
			preferredModelVariant: modelVariant,
			preferredLlmAgent: llmAgent,
		};
	}

	private parseTaskTags(rawTags: unknown): string[] {
		if (typeof rawTags !== "string" || rawTags.trim().length === 0) {
			return [];
		}

		try {
			const parsed = JSON.parse(rawTags) as unknown;
			if (!Array.isArray(parsed)) {
				return [];
			}

			return parsed
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter((value) => value.length > 0);
		} catch {
			return [];
		}
	}

	private resolveAssignedRoleIdFromTags(tags: string[]): string | null {
		const roleTag = tags.find((tag) =>
			tag.toLowerCase().startsWith(agentRoleTagPrefix),
		);
		if (!roleTag) {
			return null;
		}

		const roleId = roleTag.slice(agentRoleTagPrefix.length).trim();
		if (roleId.length === 0) {
			return null;
		}

		if (!roleRepo.list().some((role) => role.id === roleId)) {
			return null;
		}

		return roleId;
	}

	private parseRolePreset(rawPreset: string | null): AgentRolePreset | null {
		if (!rawPreset) {
			return null;
		}

		try {
			const parsed = JSON.parse(rawPreset) as Partial<AgentRolePreset>;
			return {
				version: parsed.version ?? "1.0",
				provider: parsed.provider ?? "",
				modelName: parsed.modelName ?? "",
				skills: Array.isArray(parsed.skills)
					? parsed.skills.filter(
							(skill): skill is string => typeof skill === "string",
						)
					: [],
				systemPrompt:
					typeof parsed.systemPrompt === "string" ? parsed.systemPrompt : "",
				mustDo: Array.isArray(parsed.mustDo)
					? parsed.mustDo.filter(
							(item): item is string => typeof item === "string",
						)
					: [],
				outputContract: Array.isArray(parsed.outputContract)
					? parsed.outputContract.filter(
							(item): item is string => typeof item === "string",
						)
					: [],
			};
		} catch {
			return null;
		}
	}

	private async tryFinalizeFromSessionSnapshot(
		runId: string,
		sessionId: string,
	): Promise<void> {
		const run = runRepo.getById(runId);
		if (!run || (run.status !== "running" && run.status !== "queued")) {
			return;
		}

		const inspection = await this.sessionManager.inspectSession(sessionId);
		const meta = deriveMetaStatus(inspection);

		if (meta.kind === "completed" || meta.kind === "failed") {
			const runStatus =
				meta.kind === "completed"
					? ("completed" as RunStatus)
					: ("failed" as RunStatus);
			await this.finalizeRunFromSession(runId, runStatus, {
				marker: meta.marker,
				content: meta.content,
			});
		}
	}

	private clearRetryTimer(runId: string): void {
		const timer = this.retryTimers.get(runId);
		if (timer) {
			clearTimeout(timer);
			this.retryTimers.delete(runId);
		}
	}

	private removeFromQueue(runId: string): void {
		const queueKey = this.queueKeyByRunId.get(runId);

		if (queueKey) {
			const queue = this.queues.get(queueKey);
			if (queue) {
				const index = queue.indexOf(runId);
				if (index >= 0) {
					queue.splice(index, 1);
				}
			}
			this.cleanupQueueState(queueKey);
		} else {
			for (const [currentQueueKey, queue] of this.queues.entries()) {
				const index = queue.indexOf(runId);
				if (index >= 0) {
					queue.splice(index, 1);
					this.cleanupQueueState(currentQueueKey);
					break;
				}
			}
		}

		this.queueKeyByRunId.delete(runId);
		this.runInputs.delete(runId);
		this.clearRetryTimer(runId);
	}

	private buildQueueKey(
		projectScope: string,
		providerKey: string,
		isGeneration: boolean,
	): string {
		const suffix = isGeneration ? ":gen" : "";
		return `${projectScope}\0${providerKey}${suffix}`;
	}

	private resolveProviderKey(runId: string): string {
		const run = runRepo.getById(runId);
		if (!run) {
			return "default";
		}

		const roleId = run.roleId ?? "default";
		const presetJson = roleRepo.getPresetJson(roleId);
		return buildProviderKey(roleId, presetJson);
	}

	private ensureQueue(queueKey: string): string[] {
		const existing = this.queues.get(queueKey);
		if (existing) {
			return existing;
		}

		const queue: string[] = [];
		this.queues.set(queueKey, queue);
		return queue;
	}

	private ensureRunning(queueKey: string): Set<string> {
		const existing = this.running.get(queueKey);
		if (existing) {
			return existing;
		}

		const running = new Set<string>();
		this.running.set(queueKey, running);
		return running;
	}

	private cleanupQueueState(queueKey: string): void {
		const queue = this.queues.get(queueKey);
		if (queue && queue.length === 0) {
			this.queues.delete(queueKey);
		}

		const running = this.running.get(queueKey);
		if (running && running.size === 0) {
			this.running.delete(queueKey);
		}

		if (!this.queues.has(queueKey) && !this.running.has(queueKey)) {
			this.queueMetaByQueueKey.delete(queueKey);
		}
	}

	private resolveProviderConcurrency(
		providerKey: string,
		isGeneration: boolean = false,
	): number {
		if (isGeneration) {
			return this.generationDefaultConcurrency;
		}

		const configured = this.providerConcurrency.get(providerKey);
		if (configured && configured > 0) {
			return configured;
		}

		return this.defaultConcurrency;
	}

	private durationSec(startedAt: string, finishedAt: string): number {
		const startMs = Date.parse(startedAt);
		const endMs = Date.parse(finishedAt);
		if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
			return 0;
		}
		return Math.max(0, Math.round((endMs - startMs) / 1000));
	}

	private canRecoverLateCompletion(run: Run, targetStatus: RunStatus): boolean {
		if (run.status !== "failed" || targetStatus !== "completed") {
			return false;
		}

		if (getRunErrorText(run).toLowerCase() !== "fetch failed") {
			return false;
		}

		const endedAt = run.endedAt;
		if (!endedAt) {
			return false;
		}

		const finishedMs = Date.parse(endedAt);
		if (!Number.isFinite(finishedMs)) {
			return false;
		}

		const ageMs = Date.now() - finishedMs;
		return ageMs >= 0 && ageMs <= lateCompletionRecoveryWindowMs;
	}
}

let runsQueueManager: RunsQueueManager | null = null;

export function getRunsQueueManager(): RunsQueueManager {
	if (!runsQueueManager) {
		runsQueueManager = new RunsQueueManager();
	}

	return runsQueueManager;
}
