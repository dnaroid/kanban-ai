import { createLogger } from "@/lib/logger";
import { extractOpencodeStatus } from "@/lib/opencode-status";
import { buildTaskPrompt } from "@/server/run/prompts/task";
import type { SessionEvent } from "@/server/opencode/session-manager";
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
import { getRunTaskProjector } from "@/server/run/run-task-projector";
import { publishRunUpdate } from "@/server/run/run-publisher";
import type { TaskPriority } from "@/types/kanban";
import type { Run, RunStatus } from "@/types/ipc";

const generationRunKind = "task-description-improve";
const agentRoleTagPrefix = "agent:";
const dependencyReadyStatus = "done";

const runPriorityScore: Record<TaskPriority, number> = {
	postpone: 1,
	low: 2,
	normal: 3,
	urgent: 4,
};

const log = createLogger("runs-queue");

interface QueuedRunInput {
	projectPath: string;
	sessionTitle: string;
	prompt: string;
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

export interface QueueStats {
	totalQueued: number;
	totalRunning: number;
	providers: ProviderQueueStats[];
}

function resolveAssistantRunSignal(text: string): AssistantRunSignal | null {
	const parsed = extractOpencodeStatus(text);
	if (!parsed) {
		return null;
	}

	if (parsed.status === "done") {
		return { runStatus: "completed", signalKey: "done" };
	}
	if (parsed.status === "fail") {
		return { runStatus: "failed", signalKey: "fail" };
	}
	if (parsed.status === "question") {
		return { runStatus: "paused", signalKey: "question" };
	}

	return null;
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
	private readonly providerQueues = new Map<string, string[]>();
	private readonly providerRunning = new Map<string, Set<string>>();
	private readonly providerByRunId = new Map<string, string>();
	private readonly runInputs = new Map<string, QueuedRunInput>();
	private readonly sessionSubscribers = new Map<string, string>();
	private readonly opencodeService = getOpencodeService();
	private readonly sessionManager = getOpencodeSessionManager();
	private readonly taskProjector = getRunTaskProjector();
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
	private blockedRetryTimer: ReturnType<typeof setTimeout> | null = null;
	private draining = false;

	public enqueue(runId: string, input: QueuedRunInput): void {
		if (this.providerByRunId.has(runId)) {
			log.warn("Run already queued", { runId });
			return;
		}

		const providerKey = this.resolveProviderKey(runId);
		const queue = this.ensureProviderQueue(providerKey);

		this.runInputs.set(runId, input);
		this.providerByRunId.set(runId, providerKey);
		queue.push(runId);
		log.info("Run enqueued", {
			runId,
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
		const cancelled = runRepo.update(runId, {
			status: "cancelled",
			finishedAt,
			errorText: "",
			durationSec: this.durationSec(run.startedAt ?? finishedAt, finishedAt),
		});

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
		const providerKeys = new Set<string>([
			...this.providerQueues.keys(),
			...this.providerRunning.keys(),
		]);

		const providers: ProviderQueueStats[] = [];
		for (const providerKey of providerKeys) {
			const queue = this.providerQueues.get(providerKey) ?? [];
			const running = this.providerRunning.get(providerKey);
			providers.push({
				providerKey,
				queued: queue.length,
				running: running?.size ?? 0,
				concurrency: this.resolveProviderConcurrency(providerKey),
			});
		}

		providers.sort((a, b) => {
			if (a.providerKey < b.providerKey) {
				return -1;
			}
			if (a.providerKey > b.providerKey) {
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

			for (const [providerKey, queue] of this.providerQueues.entries()) {
				const running = this.ensureProviderRunning(providerKey);
				const concurrency = this.resolveProviderConcurrency(providerKey);

				while (running.size < concurrency) {
					const runId = this.selectNextRunnableRun(queue);
					if (!runId) {
						break;
					}

					running.add(runId);
					progressed = true;

					void this.executeRun(runId).finally(() => {
						running.delete(runId);
						this.providerByRunId.delete(runId);
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
			await this.sessionManager.sendPrompt(sessionId, runInput.prompt);
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
			const failedRun = runRepo.update(runId, {
				status: "failed",
				finishedAt,
				errorText: message,
				durationSec: this.durationSec(startedAt, finishedAt),
			});

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

		if (run.status !== "running" && run.status !== "queued") {
			log.warn("Run not in running/queued state, cannot finalize", {
				runId,
				currentStatus: run.status,
			});
			return;
		}

		const finishedAt = new Date().toISOString();
		const nextRun = runRepo.update(runId, {
			status,
			finishedAt,
			errorText: status === "failed" ? "Run failed" : "",
			durationSec: this.durationSec(run.startedAt ?? finishedAt, finishedAt),
		});

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
			if (status === "completed" && this.isGenerationRun(nextRun)) {
				await this.enqueueExecutionForGeneratedTask(nextRun.taskId);
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
				this.providerByRunId.delete(runId);
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
		for (const queue of this.providerQueues.values()) {
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

	private isGenerationRun(run: Run): boolean {
		return run.metadata?.kind === generationRunKind;
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

		const availableRoles = roleRepo.list();
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

		this.enqueue(executionRun.id, {
			projectPath: project.path,
			sessionTitle: task.title.slice(0, 120),
			prompt: buildTaskPrompt(
				{ title: task.title, description: task.description },
				{
					id: project.id,
					path: project.path,
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
		const providerKey = this.providerByRunId.get(runId);

		if (providerKey) {
			const queue = this.providerQueues.get(providerKey);
			if (queue) {
				const index = queue.indexOf(runId);
				if (index >= 0) {
					queue.splice(index, 1);
				}
			}
		} else {
			for (const queue of this.providerQueues.values()) {
				const index = queue.indexOf(runId);
				if (index >= 0) {
					queue.splice(index, 1);
					break;
				}
			}
		}

		this.providerByRunId.delete(runId);
		this.runInputs.delete(runId);
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

	private ensureProviderQueue(providerKey: string): string[] {
		const existing = this.providerQueues.get(providerKey);
		if (existing) {
			return existing;
		}

		const queue: string[] = [];
		this.providerQueues.set(providerKey, queue);
		return queue;
	}

	private ensureProviderRunning(providerKey: string): Set<string> {
		const existing = this.providerRunning.get(providerKey);
		if (existing) {
			return existing;
		}

		const running = new Set<string>();
		this.providerRunning.set(providerKey, running);
		return running;
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
}

let runsQueueManager: RunsQueueManager | null = null;

export function getRunsQueueManager(): RunsQueueManager {
	if (!runsQueueManager) {
		runsQueueManager = new RunsQueueManager();
	}

	return runsQueueManager;
}
