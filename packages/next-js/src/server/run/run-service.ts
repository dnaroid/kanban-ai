import { createLogger } from "@/lib/logger";
import { buildTaskPrompt } from "@/server/run/prompts/task";
import { buildQaTestingPrompt } from "@/server/run/prompts/qa-testing";
import { buildUserStoryPrompt } from "@/server/run/prompts/user-story";
import { publishSseEvent } from "@/server/events/sse-broker";
import type { SessionStartPreferences } from "@/server/opencode/session-manager";
import { publishRunUpdate } from "@/server/run/run-publisher";
import type { QueueStats } from "@/server/run/runs-queue-manager";
import { getRunsQueueManager } from "@/server/run/runs-queue-manager";
import { contextSnapshotRepo } from "@/server/repositories/context-snapshot";
import { projectRepo } from "@/server/repositories/project";
import { boardRepo } from "@/server/repositories/board";
import type {
	AgentRoleBehavior,
	AgentRolePreset,
} from "@/server/repositories/role";
import { roleRepo } from "@/server/repositories/role";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { tagRepo } from "@/server/repositories/tag";
import { taskRepo } from "@/server/repositories/task";
import { resolveTaskStatusBySignal } from "@/server/workflow/task-workflow-manager";
import { getVcsManager } from "@/server/vcs/vcs-manager";
import type { Run, RunVcsMetadata } from "@/types/ipc";

const log = createLogger("run-service");

export interface StartRunInput {
	taskId: string;
	roleId?: string;
	mode?: string;
	modelName?: string | null;
}

const allowedTaskTypes = ["feature", "bug", "chore", "improvement"] as const;
const allowedDifficulties = ["easy", "medium", "hard", "epic"] as const;
const agentRoleTagPrefix = "agent:";
const generationRunKind = "task-description-improve";
const qaTestingRunKind = "task-qa-testing";
const activeSpecializedRunStatuses = new Set(["queued", "running", "paused"]);
const activeExecutionRunStatuses = new Set(["queued", "running", "paused"]);
const behaviorSkillsFallback = {
	preferredForStoryGeneration: "business-analyst",
	preferredForQaTesting: "qa-expert",
} as const;

interface StartRunsBySignalResult {
	startedCount: number;
	skippedNoRuleCount: number;
	skippedActiveRunCount: number;
	taskIds: string[];
	runIds: string[];
}

export class RunService {
	private readonly queueManager = getRunsQueueManager();
	private readonly vcsManager = getVcsManager();

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

	public async start(input: StartRunInput): Promise<{ runId: string }> {
		log.info("Starting run", {
			taskId: input.taskId,
			roleId: input.roleId,
			mode: input.mode,
			modelName: input.modelName,
		});

		const task = taskRepo.getById(input.taskId);
		if (!task) {
			log.error("Task not found", { taskId: input.taskId });
			throw new Error(`Task not found: ${input.taskId}`);
		}

		const availableRoles = roleRepo.listWithPresets();
		const taskTags = this.parseTaskTags(task.tags);
		const assignedRoleId = this.resolveAssignedRoleIdFromTags(taskTags);
		const selectedRoleId =
			input.roleId ?? assignedRoleId ?? availableRoles[0]?.id;
		if (!selectedRoleId) {
			log.error("No agent roles configured");
			throw new Error("No agent roles configured");
		}

		const selectedRole =
			availableRoles.find((role) => role.id === selectedRoleId) ?? null;
		const selectedRolePreset = this.parseRolePreset(
			roleRepo.getPresetJson(selectedRoleId),
		);

		const project = projectRepo.getById(task.projectId);
		if (!project) {
			log.error("Project not found for task", {
				taskId: task.id,
				projectId: task.projectId,
			});
			throw new Error(`Project not found for task: ${task.id}`);
		}

		log.debug("Creating context snapshot", { taskId: task.id });
		const snapshotId = contextSnapshotRepo.create({
			taskId: task.id,
			kind: "run-start",
			summary: `Run started for ${task.title}`,
			payload: {
				taskId: task.id,
				title: task.title,
				description: task.description,
				mode: input.mode ?? "execute",
				roleId: selectedRoleId,
			},
		});

		const run = runRepo.create({
			taskId: task.id,
			roleId: selectedRoleId,
			mode: input.mode ?? "execute",
			contextSnapshotId: snapshotId,
		});

		log.info("Run created", {
			runId: run.id,
			taskId: task.id,
			roleId: selectedRoleId,
		});

		runEventRepo.create({
			runId: run.id,
			eventType: "status",
			payload: { status: run.status, message: "Run queued" },
		});
		publishRunUpdate(run);

		let executionProjectPath = project.path;
		const worktreeEnabled = process.env.RUNS_WORKTREE_ENABLED === "true";
		if (worktreeEnabled && (input.mode ?? "execute") === "execute") {
			try {
				const vcsMetadata = await this.vcsManager.provisionRunWorkspace({
					projectPath: project.path,
					runId: run.id,
					taskId: task.id,
					taskTitle: task.title,
				});
				const updatedRun = runRepo.update(run.id, {
					metadata: this.mergeVcsMetadata(run, vcsMetadata),
				});
				publishRunUpdate(updatedRun);
				runEventRepo.create({
					runId: run.id,
					eventType: "status",
					payload: {
						status: updatedRun.status,
						message: `Worktree ready: ${vcsMetadata.branchName}`,
						worktreePath: vcsMetadata.worktreePath,
					},
				});
				executionProjectPath = vcsMetadata.worktreePath;
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to provision git worktree";
				const failedRun = runRepo.update(run.id, {
					status: "failed",
					finishedAt: new Date().toISOString(),
					errorText: message,
				});
				runEventRepo.create({
					runId: run.id,
					eventType: "status",
					payload: {
						status: "failed",
						message,
					},
				});
				publishRunUpdate(failedRun);
				throw error instanceof Error ? error : new Error(message);
			}
		}

		log.debug("Enqueueing run", {
			runId: run.id,
			projectPath: executionProjectPath,
		});
		this.queueManager.enqueue(run.id, {
			projectPath: executionProjectPath,
			projectId: project.id,
			sessionTitle: task.title.slice(0, 120),
			sessionPreferences: this.toSessionPreferences(
				selectedRole,
				selectedRole?.preset_json,
				task.modelName,
				input.modelName,
			),
			prompt: buildTaskPrompt(
				{ title: task.title, description: task.description },
				{
					id: project.id,
					path: executionProjectPath,
				},
				{
					id: selectedRoleId,
					name: selectedRole?.name ?? selectedRoleId,
					systemPrompt: selectedRolePreset?.systemPrompt,
					skills: selectedRolePreset?.skills,
				},
			),
		});

		log.info("Run enqueued", { runId: run.id });
		return { runId: run.id };
	}

	public async merge(runId: string): Promise<{ run: Run }> {
		const run = runRepo.getById(runId);
		if (!run) {
			throw new Error(`Run not found: ${runId}`);
		}

		const currentVcs = run.metadata?.vcs;
		if (!currentVcs) {
			return this.mergeWithoutWorktree(run);
		}

		try {
			const mergedVcs = await this.vcsManager.mergeRunWorkspace(run, "manual");
			const vcsMetadata = await this.cleanupMergedWorkspace(mergedVcs);
			const updatedRun = runRepo.update(run.id, {
				metadata: this.mergeVcsMetadata(run, vcsMetadata),
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
					message: `Merged ${vcsMetadata.branchName} into ${vcsMetadata.baseBranch}${cleanupMessage}`,
					mergedCommit: vcsMetadata.mergedCommit,
					cleanupStatus: vcsMetadata.cleanupStatus,
				},
			});
			publishRunUpdate(updatedRun);
			return { run: updatedRun };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to merge run changes";
			const refreshedVcs = await this.vcsManager.syncRunWorkspace(run);
			const updatedRun = runRepo.update(run.id, {
				metadata: this.mergeVcsMetadata(run, {
					...(refreshedVcs ?? currentVcs),
					lastMergeError: message,
				}),
			});
			publishRunUpdate(updatedRun);
			throw error instanceof Error ? error : new Error(message);
		}
	}

	private async mergeWithoutWorktree(run: Run): Promise<{ run: Run }> {
		const task = taskRepo.getById(run.taskId);
		if (!task) {
			throw new Error(`Task not found for run: ${run.taskId}`);
		}

		const project = projectRepo.getById(task.projectId);
		if (!project?.path) {
			throw new Error(`Project path not found for task: ${task.projectId}`);
		}

		const commitMessage =
			task.commitMessage?.trim() ||
			`Merge run ${run.id.slice(0, 8)} for task ${task.title || task.id}`;

		const { commitHash } = await this.vcsManager.commitAllChanges(
			project.path,
			commitMessage,
		);

		const updatedRun = runRepo.update(run.id, {
			metadata: {
				...(run.metadata ?? {}),
				vcs: {
					repoRoot: project.path,
					worktreePath: project.path,
					branchName: "main",
					baseBranch: "main",
					baseCommit: commitHash,
					headCommit: commitHash,
					hasChanges: false,
					workspaceStatus: "merged",
					mergeStatus: "merged",
					mergedBy: "manual",
					mergedAt: new Date().toISOString(),
					mergedCommit: commitHash,
					cleanupStatus: "cleaned",
				},
			},
		});

		runEventRepo.create({
			runId: run.id,
			eventType: "status",
			payload: {
				status: updatedRun.status,
				message: `Committed all changes (${commitHash.slice(0, 8)})`,
				mergedCommit: commitHash,
			},
		});
		publishRunUpdate(updatedRun);

		return { run: updatedRun };
	}

	public async generateUserStory(taskId: string): Promise<{ runId: string }> {
		log.info("Generating user story", { taskId });

		const task = taskRepo.getById(taskId);
		if (!task) {
			log.error("Task not found", { taskId });
			throw new Error(`Task not found: ${taskId}`);
		}

		const activeGenerationRun = runRepo
			.listByTask(task.id)
			.find(
				(run) =>
					run.metadata?.kind === generationRunKind &&
					activeSpecializedRunStatuses.has(run.status),
			);
		if (activeGenerationRun) {
			log.info("User story generation already active for task", {
				taskId: task.id,
				runId: activeGenerationRun.id,
				status: activeGenerationRun.status,
			});
			return { runId: activeGenerationRun.id };
		}

		const roleId = this.resolveSpecializedRoleId(
			task,
			"preferredForStoryGeneration",
		);
		if (!roleId) {
			log.error("No agent roles configured");
			throw new Error("No agent roles configured");
		}

		const project = projectRepo.getById(task.projectId);
		if (!project) {
			log.error("Project not found for task", {
				taskId,
				projectId: task.projectId,
			});
			throw new Error(`Project not found for task: ${task.id}`);
		}

		log.debug("Creating context snapshot for user story", { taskId: task.id });
		const snapshotId = contextSnapshotRepo.create({
			taskId: task.id,
			kind: "user-story",
			summary: `User story generation started for ${task.title}`,
			payload: {
				taskId: task.id,
				title: task.title,
				description: task.description,
				roleId,
			},
		});

		const run = runRepo.create({
			taskId: task.id,
			roleId,
			mode: "execute",
			kind: generationRunKind,
			contextSnapshotId: snapshotId,
		});

		log.info("User story run created", {
			runId: run.id,
			taskId: task.id,
			roleId,
		});

		runEventRepo.create({
			runId: run.id,
			eventType: "status",
			payload: { status: run.status, message: "User story generation queued" },
		});
		const updatedTask = taskRepo.update(task.id, { status: "generating" });
		if (updatedTask) {
			publishSseEvent("task:event", {
				taskId: updatedTask.id,
				boardId: updatedTask.boardId,
				projectId: updatedTask.projectId,
				updatedAt: updatedTask.updatedAt,
			});
		}
		publishRunUpdate(run);

		const taskTags = this.parseTaskTags(task.tags);
		const availableRoles = roleRepo.listWithPresets();
		const selectedRole =
			availableRoles.find((candidate) => candidate.id === roleId) ?? null;
		const selectedRolePreset = this.parseRolePreset(
			roleRepo.getPresetJson(roleId),
		);
		const availableTags = tagRepo.listNames();

		log.debug("Enqueueing user story run", {
			runId: run.id,
			projectPath: project.path,
		});
		this.queueManager.enqueue(run.id, {
			projectPath: project.path,
			projectId: project.id,
			sessionTitle: `User Story: ${task.title}`.slice(0, 120),
			sessionPreferences: this.toSessionPreferences(
				selectedRole,
				selectedRole?.preset_json,
			),
			prompt: buildUserStoryPrompt(
				{
					title: task.title,
					description: task.description,
					tags: taskTags,
					type: task.type,
					difficulty: task.difficulty,
				},
				{
					id: project.id,
					name: project.name,
					path: project.path,
				},
				{
					availableTags,
					availableTypes: [...allowedTaskTypes],
					availableDifficulties: [...allowedDifficulties],
					availableRoles,
					role: {
						id: roleId,
						name: selectedRole?.name ?? roleId,
						systemPrompt: selectedRolePreset?.systemPrompt,
						skills: selectedRolePreset?.skills,
					},
				},
			),
		});

		log.info("User story run enqueued", { runId: run.id });
		return { runId: run.id };
	}

	public async startQaTesting(taskId: string): Promise<{ runId: string }> {
		log.info("Starting QA testing run", { taskId });

		const task = taskRepo.getById(taskId);
		if (!task) {
			log.error("Task not found", { taskId });
			throw new Error(`Task not found: ${taskId}`);
		}

		const activeQaTestingRun = runRepo
			.listByTask(task.id)
			.find(
				(run) =>
					run.metadata?.kind === qaTestingRunKind &&
					activeSpecializedRunStatuses.has(run.status),
			);
		if (activeQaTestingRun) {
			log.info("QA testing run already active for task", {
				taskId: task.id,
				runId: activeQaTestingRun.id,
				status: activeQaTestingRun.status,
			});
			return { runId: activeQaTestingRun.id };
		}

		const roleId = this.resolveSpecializedRoleId(task, "preferredForQaTesting");
		if (!roleId) {
			log.error("No agent roles configured");
			throw new Error("No agent roles configured");
		}

		const project = projectRepo.getById(task.projectId);
		if (!project) {
			log.error("Project not found for task", {
				taskId,
				projectId: task.projectId,
			});
			throw new Error(`Project not found for task: ${task.id}`);
		}

		log.debug("Creating context snapshot for QA testing", { taskId: task.id });
		const snapshotId = contextSnapshotRepo.create({
			taskId: task.id,
			kind: "qa-testing",
			summary: `QA testing started for ${task.title}`,
			payload: {
				taskId: task.id,
				title: task.title,
				description: task.description,
				roleId,
			},
		});

		const run = runRepo.create({
			taskId: task.id,
			roleId,
			mode: "execute",
			kind: qaTestingRunKind,
			contextSnapshotId: snapshotId,
		});

		log.info("QA testing run created", {
			runId: run.id,
			taskId: task.id,
			roleId,
		});

		runEventRepo.create({
			runId: run.id,
			eventType: "status",
			payload: { status: run.status, message: "QA testing queued" },
		});
		publishRunUpdate(run);

		const taskTags = this.parseTaskTags(task.tags);
		const availableRoles = roleRepo.listWithPresets();
		const selectedRole =
			availableRoles.find((candidate) => candidate.id === roleId) ?? null;
		const selectedRolePreset = this.parseRolePreset(
			roleRepo.getPresetJson(roleId),
		);
		const availableTags = tagRepo.listNames();

		log.debug("Enqueueing QA testing run", {
			runId: run.id,
			projectPath: project.path,
		});
		this.queueManager.enqueue(run.id, {
			projectPath: project.path,
			projectId: project.id,
			sessionTitle: `QA Testing: ${task.title}`.slice(0, 120),
			sessionPreferences: this.toSessionPreferences(
				selectedRole,
				selectedRole?.preset_json,
			),
			prompt: buildQaTestingPrompt(
				{
					title: task.title,
					description: task.description,
					tags: taskTags,
					type: task.type,
					difficulty: task.difficulty,
				},
				{
					id: project.id,
					name: project.name,
					path: project.path,
				},
				{
					availableTags,
					availableTypes: [...allowedTaskTypes],
					availableDifficulties: [...allowedDifficulties],
					availableRoles,
					role: {
						id: roleId,
						name: selectedRole?.name ?? roleId,
						systemPrompt: selectedRolePreset?.systemPrompt,
						skills: selectedRolePreset?.skills,
					},
				},
			),
		});

		log.info("QA testing run enqueued", { runId: run.id });
		return { runId: run.id };
	}

	public async startRunsBySignal(
		projectId: string,
		signalKey: string,
	): Promise<StartRunsBySignalResult> {
		const board = boardRepo.getByProjectId(projectId);
		if (!board) {
			throw new Error(`Board not found for project: ${projectId}`);
		}

		const columnSystemKeyById = new Map(
			board.columns.map((column) => [column.id, column.systemKey] as const),
		);
		const columnOrderById = new Map(
			board.columns.map((column, index) => [column.id, index] as const),
		);

		const candidateTasks = [...taskRepo.listByBoard(board.id)].sort((a, b) => {
			const leftColumnOrder =
				columnOrderById.get(a.columnId) ?? Number.MAX_SAFE_INTEGER;
			const rightColumnOrder =
				columnOrderById.get(b.columnId) ?? Number.MAX_SAFE_INTEGER;
			if (leftColumnOrder !== rightColumnOrder) {
				return leftColumnOrder - rightColumnOrder;
			}
			return a.orderInColumn - b.orderInColumn;
		});

		let skippedNoRuleCount = 0;
		let skippedActiveRunCount = 0;
		const taskIds: string[] = [];
		const runIds: string[] = [];

		for (const task of candidateTasks) {
			const currentColumnSystemKey =
				columnSystemKeyById.get(task.columnId) ?? null;
			const nextStatus = resolveTaskStatusBySignal({
				scope: "user_action",
				signalKey,
				runKind: null,
				runStatus: null,
				currentStatus: task.status,
				currentColumnSystemKey,
			});
			if (!nextStatus) {
				skippedNoRuleCount += 1;
				continue;
			}

			const hasActiveRun = runRepo
				.listByTask(task.id)
				.some((run) => activeExecutionRunStatuses.has(run.status));
			if (hasActiveRun) {
				skippedActiveRunCount += 1;
				continue;
			}

			const started = await this.start({ taskId: task.id });
			taskIds.push(task.id);
			runIds.push(started.runId);
		}

		return {
			startedCount: runIds.length,
			skippedNoRuleCount,
			skippedActiveRunCount,
			taskIds,
			runIds,
		};
	}

	public listByTask(taskId: string): Run[] {
		return runRepo.listByTask(taskId);
	}

	public get(runId: string): Run | null {
		return runRepo.getById(runId);
	}

	public getQueueStats(): QueueStats {
		return this.queueManager.getQueueStats();
	}

	public async cancel(runId: string): Promise<void> {
		log.info("Cancelling run via service", { runId });
		await this.queueManager.cancel(runId);
	}

	public async delete(runId: string): Promise<void> {
		log.info("Deleting run", { runId });
		await this.cancel(runId);
		runRepo.delete(runId);
		log.info("Run deleted", { runId });
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
			const behavior = this.parseRoleBehavior(parsed.behavior);
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
				behavior,
			};
		} catch {
			return null;
		}
	}

	private parseRoleBehavior(rawBehavior: unknown): AgentRoleBehavior {
		if (!rawBehavior || typeof rawBehavior !== "object") {
			return {};
		}

		const source = rawBehavior as Record<string, unknown>;
		return {
			preferredForStoryGeneration: source.preferredForStoryGeneration === true,
			preferredForQaTesting: source.preferredForQaTesting === true,
			recommended: source.recommended === true,
			optional: source.optional === true,
			quickSelect: source.quickSelect === true,
		};
	}

	private toSessionPreferences(
		role: {
			preferred_model_name?: string | null;
			preferred_model_variant?: string | null;
			preferred_llm_agent?: string | null;
		} | null,
		presetJson?: string | null,
		taskModelName?: string | null,
		startModelName?: string | null,
	): SessionStartPreferences | undefined {
		const fromPreset = this.extractSessionPreferencesFromPreset(presetJson);
		const normalizedTaskModelName =
			startModelName?.trim() || taskModelName?.trim() || "";
		const [taskModelFromNameRaw = "", taskModelVariantRaw = ""] =
			normalizedTaskModelName
				? normalizedTaskModelName.split("#", 2)
				: ["", ""];
		const taskModelFromName = taskModelFromNameRaw.trim();
		const taskModelVariant = taskModelVariantRaw.trim();

		const preferredModelName =
			taskModelFromName ||
			role?.preferred_model_name?.trim() ||
			fromPreset?.preferredModelName;
		const preferredModelVariant = taskModelFromName
			? taskModelVariant || undefined
			: role?.preferred_model_variant?.trim() ||
				fromPreset?.preferredModelVariant;
		const preferredLlmAgent =
			role?.preferred_llm_agent?.trim() || fromPreset?.preferredLlmAgent;

		if (!preferredModelName && !preferredModelVariant && !preferredLlmAgent) {
			return undefined;
		}

		return {
			preferredModelName,
			preferredModelVariant,
			preferredLlmAgent,
		};
	}

	private resolveSpecializedRoleId(
		task: { tags: string | null },
		behaviorKey: keyof typeof behaviorSkillsFallback,
	): string | null {
		const assignedRoleId = this.resolveAssignedRoleIdFromTags(
			this.parseTaskTags(task.tags),
		);
		if (assignedRoleId) {
			return assignedRoleId;
		}

		return this.resolveRoleIdByBehavior(behaviorKey);
	}

	private resolveRoleIdByBehavior(
		behaviorKey: keyof typeof behaviorSkillsFallback,
	): string | null {
		const roleRepository = roleRepo as {
			list: () => Array<{ id: string; name: string; description: string }>;
			listWithPresets?: () => Array<{
				id: string;
				name: string;
				description: string;
				preset_json: string;
			}>;
		};

		const rolesWithPresets =
			typeof roleRepository.listWithPresets === "function"
				? roleRepository.listWithPresets()
				: roleRepository.list().map((role) => ({
						...role,
						preset_json: "",
					}));
		if (rolesWithPresets.length === 0) {
			return null;
		}

		for (const role of rolesWithPresets) {
			const preset = this.parseRolePreset(role.preset_json);
			if (preset?.behavior?.[behaviorKey] === true) {
				return role.id;
			}
		}

		const fallbackSkill = behaviorSkillsFallback[behaviorKey];
		for (const role of rolesWithPresets) {
			const preset = this.parseRolePreset(role.preset_json);
			if (preset?.skills.includes(fallbackSkill)) {
				return role.id;
			}
		}

		return rolesWithPresets[0]?.id ?? null;
	}

	private mergeVcsMetadata(
		run: Run,
		vcsMetadata: RunVcsMetadata,
	): NonNullable<Run["metadata"]> {
		return {
			...(run.metadata ?? {}),
			vcs: vcsMetadata,
		};
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
}

export const runService = new RunService();
