import { createLogger } from "@/lib/logger";
import { buildOpencodeStatusLine } from "@/lib/opencode-status";
import { buildTaskPrompt } from "@/server/run/prompts/task";
import type { SessionStartPreferences } from "@/server/opencode/session-manager";
import { artifactRepo } from "@/server/repositories/artifact";
import { contextSnapshotRepo } from "@/server/repositories/context-snapshot";
import { projectRepo } from "@/server/repositories/project";
import type { AgentRolePreset } from "@/server/repositories/role";
import { roleRepo } from "@/server/repositories/role";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { taskRepo } from "@/server/repositories/task";
import { boardRepo } from "@/server/repositories/board";
import { getWorkflowColumnIdBySystemKey } from "@/server/run/task-state-machine";
import { publishRunUpdate } from "@/server/run/run-publisher";
import { publishSseEvent } from "@/server/events/sse-broker";
import type { Task } from "@/server/types";
import type { Run, RunVcsMetadata } from "@/types/ipc";

const log = createLogger("runs-queue");
const agentRoleTagPrefix = "agent:";

interface ExecutionBootstrapServiceDeps {
	worktreeEnabled: boolean;
	enqueue: (
		runId: string,
		input: {
			projectPath: string;
			projectId: string;
			sessionTitle: string;
			sessionPreferences?: SessionStartPreferences;
			prompt: string;
		},
	) => void;
	provisionRunWorkspace: (input: {
		projectPath: string;
		runId: string;
		taskId: string;
		taskTitle: string;
	}) => Promise<RunVcsMetadata>;
	sendPrompt: (sessionId: string, prompt: string) => Promise<void>;
}

export class ExecutionBootstrapService {
	private readonly deps: ExecutionBootstrapServiceDeps;

	public constructor(deps: ExecutionBootstrapServiceDeps) {
		this.deps = deps;
	}

	public async enqueueExecutionForGeneratedTask(taskId: string): Promise<void> {
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

		const activeExecutionRun = this.getActiveTaskRunForTask(task.id);
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

		const executionRun = this.prepareTaskRunForTask({
			taskId: task.id,
			roleId,
			mode: "execute",
			kind: "task-run",
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

		const bootstrapped = await this.bootstrapRunWorkspace(
			executionRun,
			project.path,
			task.id,
			task.title,
		);
		if (!bootstrapped) {
			return;
		}

		this.deps.enqueue(bootstrapped.run.id, {
			projectPath: bootstrapped.projectPath,
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
					path: bootstrapped.projectPath,
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

	public async enqueueExecutionForNextTask(taskId: string): Promise<void> {
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

		const activeExecutionRun = this.getActiveTaskRunForTask(task.id);
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

		const executionRun = this.prepareTaskRunForTask({
			taskId: task.id,
			roleId,
			mode: "execute",
			kind: "task-run",
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

		const bootstrapped = await this.bootstrapRunWorkspace(
			executionRun,
			project.path,
			task.id,
			task.title,
		);
		if (!bootstrapped) {
			return;
		}

		this.transitionTaskToInProgress(task);

		this.deps.enqueue(bootstrapped.run.id, {
			projectPath: bootstrapped.projectPath,
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
					path: bootstrapped.projectPath,
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

	public transitionTaskToInProgress(task: Task): void {
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

	public listAllTaskRuns(taskId: string): Run[] {
		const repository = runRepo as typeof runRepo & {
			listAllByTask?: (taskId: string) => Run[];
		};

		if (typeof repository.listAllByTask === "function") {
			return repository.listAllByTask(taskId);
		}

		return repository.listByTask(taskId);
	}

	public async resumeRejectedTaskRun(task: Task): Promise<boolean> {
		if (task.status !== "rejected" || !task.qaReport) {
			return false;
		}

		const completedRun = this.listAllTaskRuns(task.id).find(
			(run) =>
				this.isExecutionRun(run) &&
				run.status === "completed" &&
				typeof run.sessionId === "string" &&
				run.sessionId.trim().length > 0,
		);
		if (!completedRun?.sessionId) {
			return false;
		}

		const board =
			boardRepo.getById(task.boardId) ??
			boardRepo.getByProjectId(task.projectId);
		if (!board) {
			return false;
		}

		const qaMessage = [
			"",
			"This task did not pass QA review. Reasons:",
			task.qaReport,
			"",
			"Fix ALL issues listed above. Do NOT skip any item.",
			"",
			`When done, output exactly one status line: ${buildOpencodeStatusLine("done")} or ${buildOpencodeStatusLine("fail")} or ${buildOpencodeStatusLine("question")}`,
		].join("\n");

		await this.deps.sendPrompt(completedRun.sessionId, qaMessage);

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
				qaReport: null,
			});
		} else {
			taskRepo.update(task.id, {
				status: "running",
				qaReport: null,
			});
		}

		runEventRepo.create({
			runId: resumedRun.id,
			eventType: "status",
			payload: {
				status: "running",
				message: "Execution run resumed after QA rejection",
			},
		});
		publishRunUpdate(resumedRun);
		publishSseEvent("task:event", {
			taskId: task.id,
			boardId: task.boardId,
			projectId: task.projectId,
			eventType: "task:updated",
			updatedAt: resumedAt,
		});

		return true;
	}

	public getCurrentTaskRun(taskId: string): Run | null {
		const repository = runRepo as {
			getByTask?: (taskId: string) => Run | null;
			listByTask: (taskId: string) => Run[];
		};

		if (typeof repository.getByTask === "function") {
			return repository.getByTask(taskId);
		}

		return repository.listByTask(taskId)[0] ?? null;
	}

	public getActiveTaskRunForTask(taskId: string): Run | null {
		const run = this.getCurrentTaskRun(taskId);
		if (!run) {
			return null;
		}

		return run.status === "queued" ||
			run.status === "running" ||
			run.status === "paused"
			? run
			: null;
	}

	public prepareTaskRunForTask(input: {
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

		for (const run of existingRuns.slice(1)) {
			this.deleteRunHistory(run.id);
			runRepo.delete(run.id);
		}

		const repository = runRepo as {
			deleteAllExceptTaskRun?: (taskId: string, keepRunId: string) => void;
		};
		repository.deleteAllExceptTaskRun?.(input.taskId, resetRun.id);
		return resetRun;
	}

	public deleteRunHistory(runId: string): void {
		const eventRepository = runEventRepo as {
			deleteByRun?: (runId: string) => void;
		};
		const artifactsRepository = artifactRepo as {
			deleteByRun?: (runId: string) => void;
		};

		eventRepository.deleteByRun?.(runId);
		artifactsRepository.deleteByRun?.(runId);
	}

	public parseTaskTags(rawTags: unknown): string[] {
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

	public resolveAssignedRoleIdFromTags(tags: string[]): string | null {
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

	public parseRolePreset(rawPreset: string | null): AgentRolePreset | null {
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

	public toSessionPreferences(
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

	private async bootstrapRunWorkspace(
		executionRun: Run,
		projectPath: string,
		taskId: string,
		taskTitle: string,
	): Promise<{ run: Run; projectPath: string } | null> {
		let queuedExecutionRun = executionRun;
		let executionProjectPath = projectPath;

		if (!this.deps.worktreeEnabled) {
			return { run: queuedExecutionRun, projectPath: executionProjectPath };
		}

		try {
			const vcsMetadata = await this.deps.provisionRunWorkspace({
				projectPath,
				runId: executionRun.id,
				taskId,
				taskTitle,
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
			return { run: queuedExecutionRun, projectPath: executionProjectPath };
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
			return null;
		}
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
				(typeof nestedModel?.variant === "string" &&
					nestedModel.variant.trim()) ||
				undefined;

			const [modelWithoutVariant, modelVariantFromName] = rawModelName
				? rawModelName.split(":", 2)
				: [undefined, undefined];

			const normalizedModelName =
				modelWithoutVariant?.trim() || rawModelName || undefined;
			const preferredModelName = rawProvider
				? `${rawProvider}/${normalizedModelName}`
				: normalizedModelName;
			const preferredModelVariant =
				explicitVariant || modelVariantFromName?.trim() || undefined;
			const preferredLlmAgent =
				(typeof parsed.preferredLlmAgent === "string" &&
					parsed.preferredLlmAgent.trim()) ||
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

	private isExecutionRun(run: Run): boolean {
		return (run.metadata?.kind ?? "task-run") === "task-run";
	}
}
