import { buildTaskPrompt } from "@/server/run/prompts/task";
import { buildUserStoryPrompt } from "@/server/run/prompts/user-story";
import { publishRunUpdate } from "@/server/run/run-publisher";
import type { QueueStats } from "@/server/run/runs-queue-manager";
import { getRunsQueueManager } from "@/server/run/runs-queue-manager";
import { contextSnapshotRepo } from "@/server/repositories/context-snapshot";
import { projectRepo } from "@/server/repositories/project";
import { roleRepo } from "@/server/repositories/role";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { taskRepo } from "@/server/repositories/task";
import type { Run } from "@/types/ipc";

export interface StartRunInput {
	taskId: string;
	roleId?: string;
	mode?: string;
}

const allowedTaskTypes = [
	"feature",
	"bug",
	"chore",
	"improvement",
	"task",
] as const;
const allowedDifficulties = ["easy", "medium", "hard", "epic"] as const;

export class RunService {
	private readonly queueManager = getRunsQueueManager();

	public async start(input: StartRunInput): Promise<{ runId: string }> {
		const task = taskRepo.getById(input.taskId);
		if (!task) {
			throw new Error(`Task not found: ${input.taskId}`);
		}

		const selectedRoleId = input.roleId ?? roleRepo.list()[0]?.id;
		if (!selectedRoleId) {
			throw new Error("No agent roles configured");
		}

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

		runEventRepo.create({
			runId: run.id,
			eventType: "status",
			payload: { status: run.status, message: "Run queued" },
		});
		publishRunUpdate(run);

		const project = projectRepo.getById(task.projectId);
		if (!project) {
			throw new Error(`Project not found for task: ${task.id}`);
		}

		this.queueManager.enqueue(run.id, {
			projectPath: project.path,
			sessionTitle: task.title.slice(0, 120),
			prompt: buildTaskPrompt(
				{ title: task.title, description: task.description },
				{
					id: project.id,
					path: project.path,
				},
			),
		});

		return { runId: run.id };
	}

	public async generateUserStory(taskId: string): Promise<{ runId: string }> {
		const task = taskRepo.getById(taskId);
		if (!task) {
			throw new Error(`Task not found: ${taskId}`);
		}

		const selectedRoleId = roleRepo.list().find((role) => role.id === "ba")?.id;
		const roleId = selectedRoleId ?? roleRepo.list()[0]?.id;
		if (!roleId) {
			throw new Error("No agent roles configured");
		}

		const project = projectRepo.getById(task.projectId);
		if (!project) {
			throw new Error(`Project not found for task: ${task.id}`);
		}

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
			kind: "task-description-improve",
			contextSnapshotId: snapshotId,
		});

		runEventRepo.create({
			runId: run.id,
			eventType: "status",
			payload: { status: run.status, message: "User story generation queued" },
		});
		taskRepo.update(task.id, { status: "generating" });
		publishRunUpdate(run);

		const taskTags = this.parseTaskTags(task.tags);

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
					availableTags: taskTags,
					availableTypes: [...allowedTaskTypes],
					availableDifficulties: [...allowedDifficulties],
				},
			),
		});

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
		await this.queueManager.cancel(runId);
	}

	public async delete(runId: string): Promise<void> {
		await this.cancel(runId);
		runRepo.delete(runId);
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
}

export const runService = new RunService();
