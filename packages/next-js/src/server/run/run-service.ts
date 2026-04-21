import { createLogger } from "@/lib/logger";
import { buildTaskPrompt } from "@/server/run/prompts/task";
import { sendSessionMessage } from "@/server/opencode/session-store";
import { buildQaTestingPrompt } from "@/server/run/prompts/qa-testing";
import { buildStoryChatPrompt } from "@/server/run/prompts/story-chat";
import { buildUserStoryPrompt } from "@/server/run/prompts/user-story";
import { publishSseEvent } from "@/server/events/sse-broker";
import type { SessionStartPreferences } from "@/server/opencode/session-manager";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import { publishRunUpdate } from "@/server/run/run-publisher";
import { getWorkflowColumnIdBySystemKey } from "@/server/run/task-state-machine";
import type { QueueStats } from "@/server/run/runs-queue-manager";
import { getRunsQueueManager } from "@/server/run/runs-queue-manager";
import { contextSnapshotRepo } from "@/server/repositories/context-snapshot";
import { projectRepo } from "@/server/repositories/project";
import { boardRepo } from "@/server/repositories/board";
import { artifactRepo } from "@/server/repositories/artifact";
import type {
	AgentRoleBehavior,
	AgentRolePreset,
} from "@/server/repositories/role";
import { roleRepo } from "@/server/repositories/role";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { tagRepo } from "@/server/repositories/tag";
import { taskRepo } from "@/server/repositories/task";
import { getVcsManager } from "@/server/vcs/vcs-manager";
import type { Run, RunVcsMetadata, DiffFile } from "@/types/ipc";
import type { TaskPriority } from "@/types/kanban";

const log = createLogger("run-service");

export interface StartRunInput {
	taskId: string;
	roleId?: string;
	mode?: string;
	modelName?: string | null;
	forceDirtyGit?: boolean;
}

const allowedTaskTypes = ["feature", "bug", "chore", "improvement"] as const;
const allowedDifficulties = ["easy", "medium", "hard", "epic"] as const;
const agentRoleTagPrefix = "agent:";
const generationRunKind = "task-description-improve";
const qaTestingRunKind = "task-qa-testing";
const storyChatRunKind = "task-story-chat";
const defaultRunKind = "task-run";
const activeSpecializedRunStatuses = new Set(["queued", "running", "paused"]);
const activeExecutionRunStatuses = new Set(["queued", "running", "paused"]);
const priorityScore: Record<string, number> = {
	postpone: 1,
	low: 2,
	normal: 3,
	urgent: 4,
} satisfies Record<TaskPriority, number>;
const behaviorSkillsFallback = {
	preferredForStoryGeneration: "business-analyst",
	preferredForQaTesting: "qa-expert",
} as const;
type StoryLanguage = string;

interface StartRunsBySignalResult {
	startedCount: number;
	skippedNoRuleCount: number;
	skippedActiveRunCount: number;
	skippedPostponeCount: number;
	taskIds: string[];
	runIds: string[];
}

interface ProjectExecutionSessionRisk {
	taskId: string;
	taskTitle: string;
	runId: string;
	sessionId: string;
}

interface StartReadyTasksOptions {
	force?: boolean;
	forceDirtyGit?: boolean;
	confirmActiveSession?: boolean;
}

export class RunService {
	private readonly queueManager = getRunsQueueManager();
	private readonly vcsManager = getVcsManager();
	private readonly sessionManager = getOpencodeSessionManager();

	private static resolveStoryLanguage(): StoryLanguage {
		return process.env.STORY_LANGUAGE?.trim().toLowerCase() || "en";
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

		const activeRun = this.getActiveTaskRun(task.id);
		if (activeRun) {
			log.info("Task already has active run", {
				taskId: task.id,
				runId: activeRun.id,
				status: activeRun.status,
			});
			return { runId: activeRun.id };
		}

		const resumedRun = await this.resumeRejectedTaskRun(task);
		if (resumedRun) {
			return resumedRun;
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

		const effectiveMode = input.mode ?? "execute";
		const skipDirtyGitCheck =
			input.forceDirtyGit === true ||
			(process.env.RUNS_WORKTREE_ENABLED === "true" &&
				effectiveMode === "execute");
		if (project.path && !skipDirtyGitCheck) {
			const hasChanges = await this.vcsManager.hasUncommittedChanges(
				project.path,
			);
			if (hasChanges) {
				throw new Error(
					"DIRTY_GIT: working tree has uncommitted changes. Commit or stash them first.",
				);
			}
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

		const run = this.prepareTaskRun({
			taskId: task.id,
			roleId: selectedRoleId,
			mode: input.mode ?? "execute",
			kind: defaultRunKind,
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
		this.transitionTaskToInProgress(task);
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
				{
					title: task.title,
					description: task.description,
					qaReport: task.qaReport,
				},
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

	private transitionTaskToInProgress(task: {
		id: string;
		boardId: string;
		projectId: string;
	}): void {
		const board =
			boardRepo.getById(task.boardId) ??
			boardRepo.getByProjectId(task.projectId);

		if (board) {
			const inProgressColumnId = getWorkflowColumnIdBySystemKey(
				board,
				"in_progress",
			);
			if (inProgressColumnId) {
				const existingInColumn = taskRepo
					.listByBoard(board.id)
					.filter((item) => item.columnId === inProgressColumnId).length;
				taskRepo.update(task.id, {
					status: "running",
					columnId: inProgressColumnId,
					orderInColumn: existingInColumn,
				});
			} else {
				taskRepo.update(task.id, { status: "running" });
			}
		} else {
			taskRepo.update(task.id, { status: "running" });
		}

		publishSseEvent("task:event", {
			taskId: task.id,
			boardId: task.boardId,
			projectId: task.projectId,
			eventType: "task:updated",
			updatedAt: new Date().toISOString(),
		});
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
			this.startNextReadyTaskAfterMerge(run.taskId).catch((err: unknown) =>
				log.error("startNextReadyTaskAfterMerge failed after merge", {
					runId: run.id,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
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

		this.startNextReadyTaskAfterMerge(run.taskId).catch((err: unknown) =>
			log.error(
				"startNextReadyTaskAfterMerge failed after mergeWithoutWorktree",
				{
					runId: run.id,
					error: err instanceof Error ? err.message : String(err),
				},
			),
		);

		return { run: updatedRun };
	}

	public async generateUserStory(
		taskId: string,
		modelName?: string | null,
	): Promise<{ runId: string }> {
		log.info("Generating user story", { taskId });

		const task = taskRepo.getById(taskId);
		if (!task) {
			log.error("Task not found", { taskId });
			throw new Error(`Task not found: ${taskId}`);
		}

		const activeRun = this.getActiveTaskRun(task.id);
		if (activeRun) {
			log.info("Task already has active run", {
				taskId: task.id,
				runId: activeRun.id,
				status: activeRun.status,
				kind: activeRun.metadata?.kind ?? defaultRunKind,
			});
			return { runId: activeRun.id };
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

		const run = this.prepareTaskRun({
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
		const storyLanguage = RunService.resolveStoryLanguage();

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
				undefined,
				modelName,
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
					language: storyLanguage,
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

	public async startStoryChat(
		taskId: string,
		userPrompt: string,
		modelName?: string,
	): Promise<{ runId: string }> {
		log.info("Starting story chat run", { taskId });

		const task = taskRepo.getById(taskId);
		if (!task) {
			log.error("Task not found", { taskId });
			throw new Error(`Task not found: ${taskId}`);
		}

		const normalizedPrompt = userPrompt.trim();
		if (!normalizedPrompt) {
			throw new Error("Prompt cannot be empty");
		}

		const activeRun = this.getActiveTaskRun(task.id);
		if (activeRun) {
			if (this.isStoryChatRun(activeRun)) {
				log.info("Task already has active story-chat run", {
					taskId: task.id,
					runId: activeRun.id,
					status: activeRun.status,
				});
				return { runId: activeRun.id };
			}

			throw new Error(
				`Task already has an active run (${activeRun.metadata?.kind ?? defaultRunKind})`,
			);
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

		const selectedRole = roleRepo
			.listWithPresets()
			.find((candidate) => candidate.id === roleId);
		const selectedRolePreset = this.parseRolePreset(
			roleRepo.getPresetJson(roleId),
		);

		const snapshotId = contextSnapshotRepo.create({
			taskId: task.id,
			kind: "run-start",
			summary: `Story chat started for ${task.title}`,
			payload: {
				taskId: task.id,
				title: task.title,
				description: task.description,
				prompt: normalizedPrompt,
				roleId,
			},
		});

		const run = this.prepareTaskRun({
			taskId: task.id,
			roleId,
			mode: "execute",
			kind: storyChatRunKind,
			contextSnapshotId: snapshotId,
		});

		runEventRepo.create({
			runId: run.id,
			eventType: "status",
			payload: { status: run.status, message: "Story chat queued" },
		});
		publishRunUpdate(run);

		this.queueManager.enqueue(run.id, {
			projectPath: project.path,
			projectId: project.id,
			sessionTitle: `Story Chat: ${task.title}`.slice(0, 120),
			sessionPreferences: this.toSessionPreferences(
				selectedRole ?? null,
				selectedRole?.preset_json,
				undefined,
				modelName,
			),
			prompt: buildStoryChatPrompt(
				{
					title: task.title,
					description: task.description,
				},
				{
					id: project.id,
					name: project.name,
					path: project.path,
				},
				normalizedPrompt,
				{
					role: {
						id: roleId,
						name: selectedRole?.name ?? roleId,
						systemPrompt: selectedRolePreset?.systemPrompt,
						skills: selectedRolePreset?.skills,
					},
				},
			),
		});

		log.info("Story chat run enqueued", { runId: run.id });
		return { runId: run.id };
	}

	public async triggerStoryGeneration(runId: string): Promise<void> {
		const run = runRepo.getById(runId);
		if (!run) {
			throw new Error(`Run not found: ${runId}`);
		}

		if (!this.isStoryChatRun(run)) {
			throw new Error(
				"Story generation can only be triggered from story-chat runs",
			);
		}

		const sessionId = run.sessionId?.trim();
		if (!sessionId) {
			throw new Error("Run has no session ID");
		}

		const inspection = await this.sessionManager.inspectSession(sessionId);
		if (inspection.probeStatus !== "alive") {
			throw new Error("Story chat session is not alive");
		}

		const task = taskRepo.getById(run.taskId);
		if (!task) {
			throw new Error(`Task not found: ${run.taskId}`);
		}

		const project = projectRepo.getById(task.projectId);
		if (!project) {
			throw new Error(`Project not found for task: ${task.id}`);
		}

		const taskTags = this.parseTaskTags(task.tags);
		const runRoleId = run.roleId?.trim();
		if (!runRoleId) {
			throw new Error(`Run has no role ID: ${run.id}`);
		}
		const availableRoles = roleRepo.listWithPresets();
		const selectedRole =
			availableRoles.find((candidate) => candidate.id === runRoleId) ?? null;
		const selectedRolePreset = this.parseRolePreset(
			roleRepo.getPresetJson(runRoleId),
		);
		const availableTags = tagRepo.listNames();
		const storyLanguage = RunService.resolveStoryLanguage();

		const generationPrompt = buildUserStoryPrompt(
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
				language: storyLanguage,
				role: {
					id: runRoleId,
					name: selectedRole?.name ?? runRoleId,
					systemPrompt: selectedRolePreset?.systemPrompt,
					skills: selectedRolePreset?.skills,
				},
			},
		);

		const storyGenerationRequestedAt = new Date().toISOString();
		await sendSessionMessage(sessionId, generationPrompt);

		const switchedRun = runRepo.update(run.id, {
			kind: generationRunKind,
			metadata: {
				...(run.metadata ?? {}),
				storyGenerationRequestedAt,
				lastExecutionStatus: {
					kind: "running",
					sessionId,
					updatedAt: storyGenerationRequestedAt,
				},
			},
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

		runEventRepo.create({
			runId: switchedRun.id,
			eventType: "status",
			payload: {
				status: switchedRun.status,
				message: "User story generation triggered from story chat",
			},
		});
		publishRunUpdate(switchedRun);
	}

	public async startQaTesting(taskId: string): Promise<{ runId: string }> {
		log.info("Starting QA testing run", { taskId });

		const task = taskRepo.getById(taskId);
		if (!task) {
			log.error("Task not found", { taskId });
			throw new Error(`Task not found: ${taskId}`);
		}

		const activeRun = this.getActiveTaskRun(task.id);
		if (activeRun) {
			log.info("Task already has active run", {
				taskId: task.id,
				runId: activeRun.id,
				status: activeRun.status,
				kind: activeRun.metadata?.kind ?? defaultRunKind,
			});
			return { runId: activeRun.id };
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

		const run = this.prepareTaskRun({
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

	public async startReadyTasks(
		projectId: string,
		options?: boolean | StartReadyTasksOptions,
	): Promise<StartRunsBySignalResult> {
		const normalizedOptions =
			typeof options === "boolean" ? { force: options } : (options ?? {});
		const skipDirtyGitCheck =
			normalizedOptions.force === true ||
			normalizedOptions.forceDirtyGit === true;
		const skipActiveSessionConfirm =
			normalizedOptions.force === true ||
			normalizedOptions.confirmActiveSession === true;

		const board = boardRepo.getByProjectId(projectId);
		if (!board) {
			throw new Error(`Board not found for project: ${projectId}`);
		}

		const readyColumn = board.columns.find((col) => col.systemKey === "ready");
		if (!readyColumn) {
			return {
				startedCount: 0,
				skippedNoRuleCount: 0,
				skippedActiveRunCount: 0,
				skippedPostponeCount: 0,
				taskIds: [],
				runIds: [],
			};
		}

		const eligibleTasks = [...taskRepo.listByBoard(board.id)]
			.filter(
				(task) =>
					task.columnId === readyColumn.id &&
					(task.status === "pending" || task.status === "rejected") &&
					task.priority !== "postpone",
			)
			.sort((a, b) => {
				const scoreA = priorityScore[a.priority] ?? 3;
				const scoreB = priorityScore[b.priority] ?? 3;
				if (scoreA !== scoreB) return scoreB - scoreA;
				return a.orderInColumn - b.orderInColumn;
			});

		if (eligibleTasks.length === 0) {
			return {
				startedCount: 0,
				skippedNoRuleCount: 0,
				skippedActiveRunCount: 0,
				skippedPostponeCount: 0,
				taskIds: [],
				runIds: [],
			};
		}

		const project = projectRepo.getById(projectId);
		if (project?.path && !skipDirtyGitCheck) {
			const hasChanges = await this.vcsManager.hasUncommittedChanges(
				project.path,
			);
			if (hasChanges) {
				throw new Error(
					"DIRTY_GIT: working tree has uncommitted changes. Commit or stash them first.",
				);
			}
		}

		const candidateCount = [...taskRepo.listByBoard(board.id)].filter(
			(task) =>
				task.columnId === readyColumn.id &&
				(task.status === "pending" || task.status === "rejected"),
		).length;
		const skippedPostponeCount = candidateCount - eligibleTasks.length;

		let skippedActiveRunCount = 0;
		const taskIds: string[] = [];
		const runIds: string[] = [];

		const taskToStart = eligibleTasks.find((task) => {
			return !runRepo
				.listByTask(task.id)
				.some((run) => activeExecutionRunStatuses.has(run.status));
		});

		if (eligibleTasks.length > 0 && !taskToStart) {
			skippedActiveRunCount = eligibleTasks.length;
		}

		if (taskToStart) {
			if (!skipActiveSessionConfirm) {
				const activeSessionRisk = await this.findProjectExecutionSessionRisk(
					board.id,
				);
				if (activeSessionRisk) {
					throw new Error(
						`ACTIVE_EXECUTION_SESSION: Task "${activeSessionRisk.taskTitle}" already has a working execution session in this project. Starting another Ready task may conflict with it.`,
					);
				}
			}

			const resumedRun = await this.resumeRejectedTaskRun(taskToStart);
			if (resumedRun) {
				taskIds.push(taskToStart.id);
				runIds.push(resumedRun.runId);
			} else {
				const started = await this.start({ taskId: taskToStart.id });
				taskIds.push(taskToStart.id);
				runIds.push(started.runId);
			}
		}

		return {
			startedCount: runIds.length,
			skippedNoRuleCount: 0,
			skippedActiveRunCount,
			skippedPostponeCount,
			taskIds,
			runIds,
		};
	}

	private async findProjectExecutionSessionRisk(
		boardId: string,
	): Promise<ProjectExecutionSessionRisk | null> {
		const projectTasks = taskRepo.listByBoard(boardId);

		for (const task of projectTasks) {
			const activeExecutionRuns = runRepo.listByTask(task.id).filter((run) => {
				return (
					this.isExecutionRun(run) &&
					activeExecutionRunStatuses.has(run.status) &&
					typeof run.sessionId === "string" &&
					run.sessionId.trim().length > 0
				);
			});

			for (const run of activeExecutionRuns) {
				let inspection: Awaited<
					ReturnType<typeof this.sessionManager.inspectSession>
				>;
				try {
					inspection = await this.sessionManager.inspectSession(run.sessionId);
				} catch (error) {
					log.warn(
						"Failed to inspect execution session while checking Ready-task start risk",
						{
							taskId: task.id,
							runId: run.id,
							sessionId: run.sessionId,
							error: error instanceof Error ? error.message : String(error),
						},
					);
					continue;
				}

				if (
					inspection.probeStatus === "alive" &&
					(inspection.sessionStatus === "busy" ||
						inspection.sessionStatus === "retry")
				) {
					return {
						taskId: task.id,
						taskTitle: task.title,
						runId: run.id,
						sessionId: run.sessionId,
					};
				}
			}
		}

		return null;
	}

	private isExecutionRun(run: Run): boolean {
		return (run.metadata?.kind ?? defaultRunKind) === defaultRunKind;
	}

	private isStoryChatRun(run: Run): boolean {
		return run.metadata?.kind === storyChatRunKind;
	}

	public listByTask(taskId: string): Run[] {
		return runRepo.listByTask(taskId);
	}

	public get(runId: string): Run | null {
		return runRepo.getById(runId);
	}

	public async getDiff(runId: string): Promise<{ files: DiffFile[] } | null> {
		const run = runRepo.getById(runId);
		if (!run) {
			return null;
		}

		const vcs = run.metadata?.vcs;
		if (!vcs) {
			const task = taskRepo.getById(run.taskId);
			if (!task) {
				return { files: [] };
			}
			const project = projectRepo.getById(task.projectId);
			if (!project?.path) {
				return { files: [] };
			}
			return this.vcsManager.getWorkingDiff(project.path);
		}

		if (
			vcs.workspaceStatus === "missing" ||
			vcs.workspaceStatus === "cleaned"
		) {
			return null;
		}

		const synced = await this.vcsManager.syncVcsMetadata(vcs);
		const headCommit = synced.headCommit;
		if (!headCommit || headCommit === synced.baseCommit) {
			return { files: [] };
		}

		return this.vcsManager.getDiff(
			synced.worktreePath,
			synced.baseCommit,
			headCommit,
		);
	}

	public getQueueStats(): QueueStats {
		return this.queueManager.getQueueStats();
	}

	public async startNextReadyTaskAfterMerge(taskId: string): Promise<void> {
		await this.queueManager.startNextReadyTaskAfterMerge(taskId);
	}

	public async cancel(runId: string): Promise<void> {
		log.info("Cancelling run via service", { runId });
		await this.queueManager.cancel(runId);
	}

	public async replyPermission(
		runId: string,
		permissionId: string,
		response: "once" | "always" | "reject",
	): Promise<void> {
		log.info("Replying to permission request", {
			runId,
			permissionId,
			response,
		});

		const run = runRepo.getById(runId);
		if (!run) {
			throw new Error(`Run not found: ${runId}`);
		}

		if (!run.sessionId) {
			throw new Error(`Run has no session ID, cannot reply to permission`);
		}

		const sessionManager = getOpencodeSessionManager();
		await sessionManager.replyToPermission(
			run.sessionId,
			permissionId,
			response,
		);
		log.info("Permission reply sent", { runId, permissionId, response });
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

	private getActiveTaskRun(taskId: string): Run | null {
		const run = this.getCurrentTaskRun(taskId);
		if (!run) {
			return null;
		}

		return activeSpecializedRunStatuses.has(run.status) ? run : null;
	}

	private prepareTaskRun(input: {
		taskId: string;
		roleId: string;
		mode: string;
		kind: string;
		contextSnapshotId: string;
	}): Run {
		const existingRuns = this.listAllTaskRuns(input.taskId);
		const currentRun = existingRuns[0] ?? null;

		if (!currentRun) {
			return runRepo.create({
				taskId: input.taskId,
				roleId: input.roleId,
				mode: input.mode,
				kind: input.kind,
				contextSnapshotId: input.contextSnapshotId,
				metadata: {},
			});
		}

		this.deleteRunHistory(currentRun.id);

		const resetRun = runRepo.update(currentRun.id, {
			status: "queued",
			sessionId: "",
			startedAt: null,
			finishedAt: null,
			errorText: "",
			mode: input.mode,
			roleId: input.roleId,
			kind: input.kind,
			budget: {},
			tokensIn: 0,
			tokensOut: 0,
			costUsd: 0,
			durationSec: 0,
			metadata: {},
		});

		this.cleanupDuplicateRuns(input.taskId, resetRun.id, existingRuns.slice(1));
		return resetRun;
	}

	private cleanupDuplicateRuns(
		taskId: string,
		keepRunId: string,
		runs?: Run[],
	): void {
		const duplicates = (runs ?? this.listAllTaskRuns(taskId).slice(1)).filter(
			(run) => run.id !== keepRunId,
		);

		for (const run of duplicates) {
			this.deleteRunHistory(run.id);
			runRepo.delete(run.id);
		}

		const repository = runRepo as {
			deleteAllExceptTaskRun?: (taskId: string, keepRunId: string) => void;
		};
		repository.deleteAllExceptTaskRun?.(taskId, keepRunId);
	}

	private getCurrentTaskRun(taskId: string): Run | null {
		const repository = runRepo as {
			getByTask?: (taskId: string) => Run | null;
			listByTask: (taskId: string) => Run[];
		};

		if (typeof repository.getByTask === "function") {
			return repository.getByTask(taskId);
		}

		return repository.listByTask(taskId)[0] ?? null;
	}

	private listAllTaskRuns(taskId: string): Run[] {
		const repository = runRepo as {
			listAllByTask?: (taskId: string) => Run[];
			listByTask: (taskId: string) => Run[];
		};

		if (typeof repository.listAllByTask === "function") {
			return repository.listAllByTask(taskId);
		}

		return repository.listByTask(taskId);
	}

	private async resumeRejectedTaskRun(task: {
		id: string;
		boardId: string;
		projectId: string;
		status: string;
		columnId: string;
		qaReport: string | null;
	}): Promise<{ runId: string } | null> {
		if (task.status !== "rejected" || !task.qaReport) {
			return null;
		}

		const completedRun = this.listAllTaskRuns(task.id).find(
			(run) =>
				this.isExecutionRun(run) &&
				run.status === "completed" &&
				typeof run.sessionId === "string" &&
				run.sessionId.trim().length > 0,
		);
		if (!completedRun?.sessionId) {
			return null;
		}

		const board =
			boardRepo.getById(task.boardId) ??
			boardRepo.getByProjectId(task.projectId);
		if (!board) {
			return null;
		}

		const qaMessage = [
			"",
			"This task did not pass QA review. Reasons:",
			task.qaReport,
			"",
			"Fix ALL issues listed above. Do NOT skip any item.",
			"",
			`When done, output exactly one corresponding status line.`,
		].join("\n");

		const resumedAt = new Date().toISOString();
		const resumedRun = runRepo.update(completedRun.id, {
			status: "running",
			startedAt: resumedAt,
			finishedAt: null,
			errorText: "",
			metadata: {
				...(completedRun.metadata ?? {}),
				lastExecutionStatus: {
					kind: "running",
					sessionId: completedRun.sessionId,
					updatedAt: resumedAt,
				},
			},
		});

		const inProgressColumn = board.columns.find(
			(column) => column.systemKey === "in_progress",
		);
		if (inProgressColumn) {
			const existingInColumn = taskRepo
				.listByBoard(board.id)
				.filter((item) => item.columnId === inProgressColumn.id).length;
			taskRepo.update(task.id, {
				status: "running",
				columnId: inProgressColumn.id,
				orderInColumn: existingInColumn,
				qaReport: null,
			});
		} else {
			taskRepo.update(task.id, {
				status: "running",
				qaReport: null,
			});
		}

		publishSseEvent("task:event", {
			taskId: task.id,
			boardId: task.boardId,
			projectId: task.projectId,
			eventType: "task:updated",
			updatedAt: resumedAt,
		});
		runEventRepo.create({
			runId: resumedRun.id,
			eventType: "status",
			payload: {
				status: "running",
				message: "Execution run resumed after QA rejection",
			},
		});
		publishRunUpdate(resumedRun);

		void sendSessionMessage(completedRun.sessionId, qaMessage).catch(
			(sessionError) => {
				const errorMessage =
					sessionError instanceof Error
						? sessionError.message
						: String(sessionError);

				log.warn("Failed to send QA follow-up message to resumed session", {
					taskId: task.id,
					runId: completedRun.id,
					sessionId: completedRun.sessionId,
					error: errorMessage,
				});

				const failedRun = runRepo.update(completedRun.id, {
					status: "failed",
					finishedAt: new Date().toISOString(),
					errorText: errorMessage,
					metadata: {
						...(completedRun.metadata ?? {}),
						lastExecutionStatus: {
							kind: "failed",
							sessionId: completedRun.sessionId,
							updatedAt: new Date().toISOString(),
						},
					},
				});

				runEventRepo.create({
					runId: failedRun.id,
					eventType: "status",
					payload: {
						status: "failed",
						message: errorMessage,
					},
				});
				publishRunUpdate(failedRun);
			},
		);

		return { runId: completedRun.id };
	}

	private deleteRunHistory(runId: string): void {
		const eventRepository = runEventRepo as {
			deleteByRun?: (runId: string) => void;
		};
		const artifactsRepository = artifactRepo as {
			deleteByRun?: (runId: string) => void;
		};

		eventRepository.deleteByRun?.(runId);
		artifactsRepository.deleteByRun?.(runId);
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
