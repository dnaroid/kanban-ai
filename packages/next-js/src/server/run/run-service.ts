import { createLogger } from "@/lib/logger";
import { buildTaskPrompt } from "@/server/run/prompts/task";
import { buildQaTestingPrompt } from "@/server/run/prompts/qa-testing";
import { buildUserStoryPrompt } from "@/server/run/prompts/user-story";
import { publishSseEvent } from "@/server/events/sse-broker";
import { publishRunUpdate } from "@/server/run/run-publisher";
import type { QueueStats } from "@/server/run/runs-queue-manager";
import { getRunsQueueManager } from "@/server/run/runs-queue-manager";
import { contextSnapshotRepo } from "@/server/repositories/context-snapshot";
import { projectRepo } from "@/server/repositories/project";
import type { AgentRolePreset } from "@/server/repositories/role";
import { roleRepo } from "@/server/repositories/role";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { tagRepo } from "@/server/repositories/tag";
import { taskRepo } from "@/server/repositories/task";
import type { Run } from "@/types/ipc";

const log = createLogger("run-service");

export interface StartRunInput {
	taskId: string;
	roleId?: string;
	mode?: string;
}

const allowedTaskTypes = ["feature", "bug", "chore", "improvement"] as const;
const allowedDifficulties = ["easy", "medium", "hard", "epic"] as const;
const agentRoleTagPrefix = "agent:";
const generationRunKind = "task-description-improve";
const qaTestingRunKind = "task-qa-testing";
const activeSpecializedRunStatuses = new Set(["queued", "running", "paused"]);

export class RunService {
	private readonly queueManager = getRunsQueueManager();

	public async start(input: StartRunInput): Promise<{ runId: string }> {
		log.info("Starting run", {
			taskId: input.taskId,
			roleId: input.roleId,
			mode: input.mode,
		});

		const task = taskRepo.getById(input.taskId);
		if (!task) {
			log.error("Task not found", { taskId: input.taskId });
			throw new Error(`Task not found: ${input.taskId}`);
		}

		const availableRoles = roleRepo.list();
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

		const project = projectRepo.getById(task.projectId);
		if (!project) {
			log.error("Project not found for task", {
				taskId: task.id,
				projectId: task.projectId,
			});
			throw new Error(`Project not found for task: ${task.id}`);
		}

		log.debug("Enqueueing run", { runId: run.id, projectPath: project.path });
		this.queueManager.enqueue(run.id, {
			projectPath: project.path,
			sessionTitle: task.title.slice(0, 120),
			prompt: buildTaskPrompt(
				{ title: task.title, description: task.description },
				{
					id: project.id,
					path: project.path,
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

		const selectedRoleId = roleRepo.list().find((role) => role.id === "ba")?.id;
		const roleId = selectedRoleId ?? roleRepo.list()[0]?.id;
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
		const availableRoles = roleRepo.list();
		const availableTags = tagRepo.listNames();

		log.debug("Enqueueing user story run", {
			runId: run.id,
			projectPath: project.path,
		});
		this.queueManager.enqueue(run.id, {
			projectPath: project.path,
			sessionTitle: `User Story: ${task.title}`.slice(0, 120),
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

		const selectedRoleId = roleRepo.list().find((role) => role.id === "qa")?.id;
		const roleId = selectedRoleId ?? roleRepo.list()[0]?.id;
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
		const availableRoles = roleRepo.list();
		const availableTags = tagRepo.listNames();

		log.debug("Enqueueing QA testing run", {
			runId: run.id,
			projectPath: project.path,
		});
		this.queueManager.enqueue(run.id, {
			projectPath: project.path,
			sessionTitle: `QA Testing: ${task.title}`.slice(0, 120),
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
				},
			),
		});

		log.info("QA testing run enqueued", { runId: run.id });
		return { runId: run.id };
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
}

export const runService = new RunService();
