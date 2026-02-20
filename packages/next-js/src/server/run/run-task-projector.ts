import { boardRepo } from "@/server/repositories/board";
import { publishSseEvent } from "@/server/events/sse-broker";
import { taskRepo } from "@/server/repositories/task";
import type { Task } from "@/server/types";
import {
	getPreferredColumnIdForStatus,
	getWorkflowColumnSystemKey,
	resolveTaskStatusReasons,
} from "@/server/workflow/task-workflow-manager";
import type { TaskStatus } from "@/types/kanban";
import type { Run, RunStatus } from "@/types/ipc";

const allowedTaskTypes = [
	"feature",
	"bug",
	"chore",
	"improvement",
	"task",
] as const;
const allowedDifficulties = ["easy", "medium", "hard", "epic"] as const;
const agentRoleTagPrefix = "agent:";

type AllowedTaskType = (typeof allowedTaskTypes)[number];
type AllowedDifficulty = (typeof allowedDifficulties)[number];

type ParsedUserStoryResponse = {
	description: string;
	title?: string;
	tags?: string[];
	type?: AllowedTaskType;
	difficulty?: AllowedDifficulty;
	agentRoleId?: string;
};

function parseTaskTags(rawTags: unknown): string[] {
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

function upsertAgentRoleTag(tags: string[], roleId: string): string[] {
	const normalized = roleId.trim();
	if (normalized.length === 0) {
		return tags;
	}

	const withoutRoleTag = tags.filter(
		(tag) => !tag.toLowerCase().startsWith(agentRoleTagPrefix),
	);
	return [...withoutRoleTag, `${agentRoleTagPrefix}${normalized}`];
}

function parseUserStoryResponse(content: string): ParsedUserStoryResponse {
	const metaMatch = content.match(/<META>([\s\S]*?)<\/META>/i);
	const storyMatch = content.match(/<STORY>([\s\S]*?)<\/STORY>/i);

	const storyBody = storyMatch?.[1]?.trim();
	const fallback = metaMatch
		? content.replace(metaMatch[0], "").trim()
		: content.trim();
	const description = storyBody && storyBody.length > 0 ? storyBody : fallback;

	const result: ParsedUserStoryResponse = { description };

	const titleMatch = description.match(/^##\s*Название\s*\n+(.+)$/im);
	if (titleMatch?.[1]) {
		let title = titleMatch[1].trim();
		title = title.replace(/^[\s>*_-]+/, "").replace(/[\s>*_-]+$/, "");
		if (
			(title.startsWith("**") && title.endsWith("**")) ||
			(title.startsWith("__") && title.endsWith("__"))
		) {
			title = title.slice(2, -2).trim();
		}
		title = title.replace(/^\*+/, "").replace(/\*+$/, "").trim();
		title = title.replace(/^_+/, "").replace(/_+$/, "").trim();
		if (title.length > 0) {
			result.title = title;
		}
	}

	if (!metaMatch?.[1]) {
		return result;
	}

	let rawMeta = metaMatch[1].trim();
	rawMeta = rawMeta
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "")
		.trim();

	if (!rawMeta.startsWith("{") || !rawMeta.endsWith("}")) {
		return result;
	}

	try {
		const meta = JSON.parse(rawMeta) as {
			tags?: unknown;
			type?: unknown;
			difficulty?: unknown;
			agentRoleId?: unknown;
		};

		if (Array.isArray(meta.tags)) {
			const tags = meta.tags
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter((value) => value.length > 0);
			if (tags.length > 0) {
				result.tags = [...new Set(tags)];
			}
		}

		if (typeof meta.type === "string") {
			const typeValue = meta.type.trim();
			if ((allowedTaskTypes as readonly string[]).includes(typeValue)) {
				result.type = typeValue as AllowedTaskType;
			}
		}

		if (typeof meta.difficulty === "string") {
			const difficultyValue = meta.difficulty.trim();
			if (
				(allowedDifficulties as readonly string[]).includes(difficultyValue)
			) {
				result.difficulty = difficultyValue as AllowedDifficulty;
			}
		}

		if (typeof meta.agentRoleId === "string") {
			const roleId = meta.agentRoleId.trim();
			if (/^[a-z0-9_-]+$/i.test(roleId)) {
				result.agentRoleId = roleId;
			}
		}
	} catch {
		return result;
	}

	return result;
}

function isTaskDescriptionImproveRun(run: Run): boolean {
	return run.metadata?.kind === "task-description-improve";
}

export class RunTaskProjector {
	private updateTaskAndPublish(
		taskId: string,
		patch: Parameters<typeof taskRepo.update>[1],
	): void {
		const updatedTask = taskRepo.update(taskId, patch);
		if (!updatedTask) {
			return;
		}

		publishSseEvent("task:event", {
			taskId: updatedTask.id,
			boardId: updatedTask.boardId,
			projectId: updatedTask.projectId,
			updatedAt: updatedTask.updatedAt,
		});
	}

	private buildStatusPatch(
		task: Task,
		status: TaskStatus,
	): Parameters<typeof taskRepo.update>[1] {
		const board = boardRepo.getById(task.boardId);
		const preferredColumnId = board
			? getPreferredColumnIdForStatus(board, status)
			: null;
		const nextColumnId = preferredColumnId ?? task.columnId;
		const nextColumnKey = board
			? getWorkflowColumnSystemKey(board, nextColumnId)
			: null;
		const reasons = resolveTaskStatusReasons(status, nextColumnKey);

		return {
			status,
			columnId: nextColumnId,
			blockedReason: reasons.blockedReason,
			closedReason: reasons.closedReason,
		};
	}

	public projectRunStarted(run: Run): void {
		const task = taskRepo.getById(run.taskId);
		if (!task) {
			return;
		}

		if (isTaskDescriptionImproveRun(run)) {
			this.updateTaskAndPublish(
				task.id,
				this.buildStatusPatch(task, "generating"),
			);
			return;
		}

		this.updateTaskAndPublish(task.id, this.buildStatusPatch(task, "running"));
	}

	public projectRunOutcome(
		run: Run,
		status: RunStatus,
		assistantContent: string,
	): void {
		const task = taskRepo.getById(run.taskId);
		if (!task) {
			return;
		}

		if (isTaskDescriptionImproveRun(run) && status === "completed") {
			const parsed = parseUserStoryResponse(assistantContent);
			const currentTags = parseTaskTags(task.tags);
			const patch: Parameters<typeof taskRepo.update>[1] = {
				...this.buildStatusPatch(task, "queued"),
				description: parsed.description,
				descriptionMd: parsed.description,
			};

			if (parsed.title) {
				patch.title = parsed.title;
			}
			let nextTags =
				parsed.tags && parsed.tags.length > 0 ? parsed.tags : currentTags;
			if (parsed.agentRoleId) {
				nextTags = upsertAgentRoleTag(nextTags, parsed.agentRoleId);
			}

			if (nextTags.length > 0) {
				patch.tags = JSON.stringify([...new Set(nextTags)]);
			}
			if (parsed.type) {
				patch.type = parsed.type;
			}
			if (parsed.difficulty) {
				patch.difficulty = parsed.difficulty;
			}

			this.updateTaskAndPublish(run.taskId, patch);
			return;
		}

		if (isTaskDescriptionImproveRun(run)) {
			if (status === "failed" || status === "timeout") {
				this.updateTaskAndPublish(
					task.id,
					this.buildStatusPatch(task, "failed"),
				);
				return;
			}

			if (status === "paused") {
				this.updateTaskAndPublish(
					task.id,
					this.buildStatusPatch(task, "question"),
				);
				return;
			}

			if (status === "cancelled") {
				this.updateTaskAndPublish(
					task.id,
					this.buildStatusPatch(task, "queued"),
				);
			}
			return;
		}

		if (status === "completed") {
			this.updateTaskAndPublish(task.id, this.buildStatusPatch(task, "done"));
			return;
		}

		if (status === "failed" || status === "timeout") {
			this.updateTaskAndPublish(task.id, this.buildStatusPatch(task, "failed"));
			return;
		}

		if (status === "paused") {
			this.updateTaskAndPublish(task.id, this.buildStatusPatch(task, "paused"));
			return;
		}

		if (status === "cancelled") {
			this.updateTaskAndPublish(task.id, this.buildStatusPatch(task, "queued"));
		}
	}
}

let runTaskProjector: RunTaskProjector | null = null;

export function getRunTaskProjector(): RunTaskProjector {
	if (!runTaskProjector) {
		runTaskProjector = new RunTaskProjector();
	}

	return runTaskProjector;
}
