import { createLogger } from "@/lib/logger";
import { extractOpencodeStatus } from "@/lib/opencode-status";
import { buildTaskPrompt } from "@/server/run/prompts/task";
import type {
	SessionEvent,
	SessionStartPreferences,
} from "@/server/opencode/session-manager";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import { contextSnapshotRepo } from "@/server/repositories/context-snapshot";
import { projectRepo } from "@/server/repositories/project";
import type { AgentRolePreset } from "@/server/repositories/role";
import { roleRepo } from "@/server/repositories/role";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { taskLinkRepo } from "@/server/repositories/task-link";
import { taskRepo } from "@/server/repositories/task";
import { boardRepo } from "@/server/repositories/board";
import { getWorkflowColumnIdBySystemKey } from "@/server/workflow/task-workflow-manager";
import { getRunTaskProjector } from "@/server/run/run-task-projector";
import { publishRunUpdate } from "@/server/run/run-publisher";
import { getVcsManager } from "@/server/vcs/vcs-manager";
import type { TaskPriority } from "@/types/kanban";
import type { Run, RunStatus, RunVcsMetadata } from "@/types/ipc";
import type { Task } from "@/server/types";

const generationRunKind = "task-description-improve";
const agentRoleTagPrefix = "agent:";
const dependencyReadyStatus = "done";
const lateCompletionRecoveryWindowMs = 15 * 60 * 1000;

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
}

interface AssistantRunSignal {
	runStatus: RunStatus;
	signalKey: string;
}

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

function resolveAssistantRunSignal(text: string): AssistantRunSignal | null {
	const parsed = extractOpencodeStatus(text);
	if (!parsed) {
		return null;
	}

	if (parsed.status === "done") {
		return { runStatus: "completed", signalKey: "done" };
	}
	if (parsed.status === "generated") {
		return { runStatus: "completed", signalKey: "generated" };
	}
	if (parsed.status === "fail") {
		return { runStatus: "failed", signalKey: "fail" };
	}
	if (parsed.status === "question") {
		return { runStatus: "paused", signalKey: "question" };
	}
	if (parsed.status === "test_ok") {
		return { runStatus: "completed", signalKey: "test_ok" };
	}
	if (parsed.status === "test_fail") {
		return { runStatus: "failed", signalKey: "test_fail" };
	}

	return null;
}

function getRunErrorText(run: Run): string {
	const errorText = run.metadata?.errorText;
	if (typeof errorText !== "string") {
		return "";
	}

	return errorText.trim();
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
	private readonly sessionSubscribers = new Map<string, string>();
	private readonly opencodeService = getOpencodeService();
	private readonly sessionManager = getOpencodeSessionManager();
	private readonly taskProjector = getRunTaskProjector();
	private readonly vcsManager = getVcsManager();
	private readonly defaultConcurrency = parsePositiveInt(
		process.env.RUNS_DEFAULT_CONCURRENCY,
		1,
	);
	private readonly providerConcurrency = parseProviderConcurrencyConfig(
		process.env.RUNS_PROVIDER_CONCURRENCY,
	);
	private readonly blockedRetryDelayMs = parsePositiveInt(
		process.env.RUNS_BLOCKED_RETRY_MS,
		5000,
	);
	private readonly worktreeEnabled =
		process.env.RUNS_WORKTREE_ENABLED === "true";
	private blockedRetryTimer: ReturnType<typeof setTimeout> | null = null;
	private draining = false;

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
		const queueKey = this.buildQueueKey(projectScope, providerKey);
		const queue = this.ensureQueue(queueKey);

		this.runInputs.set(runId, input);
		this.queueKeyByRunId.set(runId, queueKey);
		this.queueMetaByQueueKey.set(queueKey, { projectScope, providerKey });
		queue.push(runId);
		log.info("Run enqueued", {
			runId,
			projectScope,
			providerKey,
			projectPath: input.projectPath,
		});
		this.scheduleDrain();
	}

	public async cancel(runId: string): Promise<void> {
		log.info("Cancelling run", { runId });
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
		this.taskProjector.projectRunOutcome(
			cancelled,
			"cancelled",
			"cancelled",
			"",
		);

		await this.unsubscribeRunSession(runId);
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
			const concurrency = this.resolveProviderConcurrency(meta.providerKey);

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
				const concurrency = this.resolveProviderConcurrency(meta.providerKey);

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
		this.taskProjector.projectRunStarted(runningRun);

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

			// Subscribe BEFORE sending prompt to avoid race condition
			// (session may complete before subscription is established)
			await this.subscribeRunSession(runId, sessionId);

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
			log.error("Run execution failed", { runId, error: message });
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
			this.taskProjector.projectRunOutcome(
				failedRun,
				"failed",
				"fail",
				message,
			);
			this.runInputs.delete(runId);
		}
	}

	private async subscribeRunSession(
		runId: string,
		sessionId: string,
	): Promise<void> {
		log.debug("Subscribing to session", { runId, sessionId });
		const subscriberId = `run:${runId}`;
		if (this.sessionSubscribers.has(runId)) {
			log.debug("Already subscribed to session", { runId, sessionId });
			return;
		}

		await this.sessionManager.subscribe(sessionId, subscriberId, (event) => {
			void this.handleSessionEvent(runId, event);
		});

		this.sessionSubscribers.set(runId, sessionId);
		log.info("Subscribed to session", { runId, sessionId });
	}

	private async handleSessionEvent(
		runId: string,
		event: SessionEvent,
	): Promise<void> {
		log.debug("Session event received", { runId, eventType: event.type });
		if (event.type !== "message.updated") {
			return;
		}

		if (event.message.role !== "assistant") {
			return;
		}

		const runSignal = resolveAssistantRunSignal(event.message.content);
		if (!runSignal) {
			return;
		}

		log.info("Assistant response received, finalizing run", {
			runId,
			status: runSignal.runStatus,
			signalKey: runSignal.signalKey,
		});
		await this.finalizeRunFromSession(
			runId,
			runSignal.runStatus,
			runSignal.signalKey,
			event.message.content,
		);
	}

	private async finalizeRunFromSession(
		runId: string,
		status: RunStatus,
		signalKey: string,
		assistantContent: string,
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
			this.taskProjector.projectRunOutcome(
				nextRun,
				status,
				signalKey,
				assistantContent,
			);
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
		this.runInputs.delete(runId);

		await this.unsubscribeRunSession(runId);
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

		const messages = await this.sessionManager.getMessages(sessionId, 200);
		if (messages.length === 0) {
			log.warn("No session messages found after prompt completion", {
				runId,
				sessionId,
			});
			return;
		}

		for (let index = messages.length - 1; index >= 0; index -= 1) {
			const message = messages[index];
			if (message.role !== "assistant") {
				continue;
			}

			const runSignal = resolveAssistantRunSignal(message.content);
			if (!runSignal) {
				continue;
			}

			log.info("Finalizing run from session snapshot", {
				runId,
				sessionId,
				status: runSignal.runStatus,
				signalKey: runSignal.signalKey,
				messageId: message.id,
			});
			await this.finalizeRunFromSession(
				runId,
				runSignal.runStatus,
				runSignal.signalKey,
				message.content,
			);
			return;
		}

		log.warn("No assistant completion marker in session snapshot", {
			runId,
			sessionId,
			messageCount: messages.length,
		});
	}

	private async unsubscribeRunSession(runId: string): Promise<void> {
		const sessionId = this.sessionSubscribers.get(runId);
		if (!sessionId) {
			return;
		}

		log.debug("Unsubscribing from session", { runId, sessionId });
		this.sessionSubscribers.delete(runId);
		await this.sessionManager.unsubscribe(sessionId, `run:${runId}`);
		log.info("Unsubscribed from session", { runId, sessionId });
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
	}

	private buildQueueKey(projectScope: string, providerKey: string): string {
		return `${projectScope}\0${providerKey}`;
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

	private resolveProviderConcurrency(providerKey: string): number {
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
