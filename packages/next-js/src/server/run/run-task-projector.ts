import { createLogger } from "@/lib/logger";
import { boardRepo } from "@/server/repositories/board";
import { publishSseEvent } from "@/server/events/sse-broker";
import { taskRepo } from "@/server/repositories/task";
import type { Task } from "@/server/types";
import {
	canTransitionColumn,
	getBlockedReasonForStatus,
	getClosedReasonForStatus,
	getPreferredColumnIdForStatus,
	getWorkflowColumnSystemKey,
	isStatusAllowedInWorkflowColumn,
	resolveTaskStatusReasons,
} from "@/server/workflow/task-workflow-manager";
import type { TaskStatus } from "@/types/kanban";
import type { Run } from "@/types/ipc";

const allowedTaskTypes = ["feature", "bug", "chore", "improvement"] as const;
const allowedDifficulties = ["easy", "medium", "hard", "epic"] as const;
const agentRoleTagPrefix = "agent:";

const log = createLogger("run-task-projector");

type AllowedTaskType = (typeof allowedTaskTypes)[number];
type AllowedDifficulty = (typeof allowedDifficulties)[number];

export type RunOutcomeMarker =
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

export interface RunOutcome {
	marker: RunOutcomeMarker;
	content: string;
}

type ParsedUserStoryResponse = {
	description: string;
	title?: string;
	tags?: string[];
	type?: AllowedTaskType;
	difficulty?: AllowedDifficulty;
	agentRoleId?: string;
	commitMessage?: string;
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

	const titleMatch = description.match(/^##\s*Title\s*\n+(.+)$/im);
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
			commitMessage?: unknown;
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

		if (typeof meta.commitMessage === "string") {
			const msg = meta.commitMessage.trim().slice(0, 200);
			if (msg.length > 0) {
				result.commitMessage = msg;
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

function isQaTestingRun(run: Run): boolean {
	return run.metadata?.kind === "task-qa-testing";
}

function resolveTaskStatusFromOutcome(
	outcome: RunOutcome,
	runKind: string | null,
): TaskStatus | null {
	switch (outcome.marker) {
		case "resumed":
			return "running";
		case "cancelled":
			return "pending";
		case "timeout":
			return "failed";
		case "dead":
			return "failed";
	}

	if (runKind === "task-description-improve") {
		switch (outcome.marker) {
			case "generated":
			case "done":
			case "test_ok":
				return "pending";
			case "fail":
			case "test_fail":
				return "failed";
			case "question":
				return "question";
		}
	}

	switch (outcome.marker) {
		case "done":
		case "test_ok":
			return "done";
		case "fail":
		case "test_fail":
			return "failed";
		case "question":
			return "question";
		case "generated":
			return "pending";
	}

	return null;
}

export class RunTaskProjector {
	private resolveColumnIdForStatus(task: Task, status: TaskStatus): string {
		const board = boardRepo.getById(task.boardId);
		if (!board) {
			return task.columnId;
		}

		const currentColumnId = task.columnId;
		const currentColumnKey = getWorkflowColumnSystemKey(board, currentColumnId);

		const preferredColumnId = getPreferredColumnIdForStatus(board, status);

		if (currentColumnKey && preferredColumnId) {
			const preferredColumnKey = getWorkflowColumnSystemKey(
				board,
				preferredColumnId,
			);
			if (
				preferredColumnKey &&
				canTransitionColumn(currentColumnKey, preferredColumnKey)
			) {
				return preferredColumnId;
			}
		}

		if (currentColumnKey) {
			for (const column of board.columns) {
				const targetColumnKey = getWorkflowColumnSystemKey(board, column.id);
				if (!targetColumnKey) {
					continue;
				}
				if (
					canTransitionColumn(currentColumnKey, targetColumnKey) &&
					isStatusAllowedInWorkflowColumn(status, targetColumnKey)
				) {
					return column.id;
				}
			}
		}

		if (
			currentColumnKey &&
			isStatusAllowedInWorkflowColumn(status, currentColumnKey)
		) {
			return currentColumnId;
		}

		if (preferredColumnId) {
			return preferredColumnId;
		}

		return currentColumnId;
	}

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
		const nextColumnId = this.resolveColumnIdForStatus(task, status);
		const nextColumnKey = board
			? getWorkflowColumnSystemKey(board, nextColumnId)
			: null;
		const reasons = resolveTaskStatusReasons(status, nextColumnKey);

		return {
			status,
			columnId: nextColumnId,
			blockedReason: reasons.blockedReason ?? getBlockedReasonForStatus(status),
			closedReason: reasons.closedReason ?? getClosedReasonForStatus(status),
		};
	}

	public projectRunStarted(run: Run): void {
		const task = taskRepo.getById(run.taskId);
		if (!task) {
			return;
		}

		let nextStatus: TaskStatus;
		if (isTaskDescriptionImproveRun(run)) {
			nextStatus = "generating";
		} else if (isQaTestingRun(run)) {
			nextStatus = "running";
		} else {
			nextStatus = "running";
		}

		this.updateTaskAndPublish(task.id, this.buildStatusPatch(task, nextStatus));
	}

	public projectRunOutcome(run: Run, outcome: RunOutcome): void {
		const task = taskRepo.getById(run.taskId);
		if (!task) {
			log.warn("Task not found for run", { runId: run.id, taskId: run.taskId });
			return;
		}
		const nextStatus = resolveTaskStatusFromOutcome(
			outcome,
			run.metadata?.kind ?? null,
		);

		if (!nextStatus) {
			log.info("Run outcome did not resolve to a status change", {
				runId: run.id,
				taskId: task.id,
				marker: outcome.marker,
				currentStatus: task.status,
			});
		}

		if (
			isTaskDescriptionImproveRun(run) &&
			(outcome.marker === "generated" ||
				outcome.marker === "done" ||
				outcome.marker === "test_ok")
		) {
			const parsed = parseUserStoryResponse(outcome.content);
			const currentTags = parseTaskTags(task.tags);
			const statusPatch = nextStatus
				? this.buildStatusPatch(task, nextStatus)
				: {};
			const patch: Parameters<typeof taskRepo.update>[1] & {
				commitMessage?: string | null;
			} = {
				...statusPatch,
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
			if (parsed.commitMessage) {
				patch.commitMessage = parsed.commitMessage;
			}

			this.updateTaskAndPublish(run.taskId, patch);
			return;
		}

		if (nextStatus) {
			const patch = this.buildStatusPatch(task, nextStatus);
			log.info("Applying status patch", {
				runId: run.id,
				taskId: task.id,
				marker: outcome.marker,
				fromStatus: task.status,
				toStatus: nextStatus,
				columnId: patch.columnId,
				blockedReason: patch.blockedReason,
			});
			this.updateTaskAndPublish(task.id, patch);
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
