import type { Board } from "@/server/types";
import {
	canTransitionColumn,
	getBlockedReasonForStatus,
	getClosedReasonForStatus,
	getPreferredColumnIdForStatus,
	getWorkflowColumnSystemKey,
	isStatusAllowedInWorkflowColumn,
	resolveTaskStatusReasons,
} from "@/server/workflow/task-workflow-manager";
import type { BlockedReason, ClosedReason, TaskStatus } from "@/types/kanban";
import type { RunStatus } from "@/types/ipc";

const allowedTaskTypes = ["feature", "bug", "chore", "improvement"] as const;
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
	commitMessage?: string;
};

export type TaskTransitionTrigger =
	| "generate:start"
	| "generate:ok"
	| "generate:fail"
	| "run:start"
	| "run:cancelled"
	| "run:done"
	| "run:fail"
	| "run:question"
	| "run:answer"
	| "run:dead"
	| "review:approve"
	| "review:reject"
	| "recover:retry"
	| "recover:reopen";

export interface TaskTransitionInput {
	task: {
		id: string;
		boardId: string;
		status: TaskStatus;
		columnId: string;
	};
	board: Board;
	trigger: TaskTransitionTrigger;
	runKind: string | null;
	outcomeContent: string;
	hasSessionExisted: boolean;
	isManualStatusGracePeriod: boolean;
}

export interface TaskTransitionResult {
	action: "update" | "skip";
	patch: {
		status?: TaskStatus;
		columnId?: string;
		blockedReason?: BlockedReason | null;
		closedReason?: ClosedReason | null;
		description?: string;
		descriptionMd?: string;
		title?: string;
		tags?: string;
		type?: string;
		difficulty?: string;
		commitMessage?: string | null;
	};
	effects: TaskEffect[];
}

export type TaskEffect =
	| { type: "publishSse"; taskId: string; boardId: string; projectId: string }
	| { type: "parseStoryContent"; content: string; runKind: string };

type TaskPatch = TaskTransitionResult["patch"];

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

function isDescriptionImproveRun(runKind: string | null): boolean {
	return runKind === "task-description-improve";
}

function shouldParseStoryContent(input: TaskTransitionInput): boolean {
	if (!isDescriptionImproveRun(input.runKind)) {
		return false;
	}

	return input.trigger === "generate:ok" || input.trigger === "run:done";
}

function shouldExtractCommitMessage(input: TaskTransitionInput): boolean {
	return input.trigger === "run:done";
}

function readCurrentTaskTags(task: TaskTransitionInput["task"]): string[] {
	if (!("tags" in task)) {
		return [];
	}

	const rawTags = task.tags;
	return parseTaskTags(rawTags);
}

function compactPatch(patch: TaskPatch): TaskPatch {
	const compacted: TaskPatch = {};

	if (patch.status !== undefined) compacted.status = patch.status;
	if (patch.columnId !== undefined) compacted.columnId = patch.columnId;
	if (patch.blockedReason !== undefined)
		compacted.blockedReason = patch.blockedReason;
	if (patch.closedReason !== undefined)
		compacted.closedReason = patch.closedReason;
	if (patch.description !== undefined)
		compacted.description = patch.description;
	if (patch.descriptionMd !== undefined)
		compacted.descriptionMd = patch.descriptionMd;
	if (patch.title !== undefined) compacted.title = patch.title;
	if (patch.tags !== undefined) compacted.tags = patch.tags;
	if (patch.type !== undefined) compacted.type = patch.type;
	if (patch.difficulty !== undefined) compacted.difficulty = patch.difficulty;
	if (patch.commitMessage !== undefined)
		compacted.commitMessage = patch.commitMessage;

	return compacted;
}

function createSkipResult(): TaskTransitionResult {
	return {
		action: "skip",
		patch: {},
		effects: [],
	};
}

function isPatchEmpty(patch: TaskPatch): boolean {
	return Object.keys(patch).length === 0;
}

export function resolveTransitionTrigger(params: {
	runStatus: RunStatus;
	sessionMetaKind:
		| "completed"
		| "failed"
		| "running"
		| "question"
		| "permission"
		| "dead"
		| null;
	completionMarker: string | null;
	runKind: string | null;
}): TaskTransitionTrigger | null {
	const { completionMarker, runKind, runStatus, sessionMetaKind } = params;

	if (sessionMetaKind === "dead") {
		return "run:dead";
	}

	if (sessionMetaKind === "question") {
		return "run:question";
	}

	if (sessionMetaKind === "completed") {
		if (completionMarker === "generated") {
			return "generate:ok";
		}

		if (completionMarker === "done" || completionMarker === "test_ok") {
			return "run:done";
		}
	}

	if (sessionMetaKind === "failed") {
		if (
			isDescriptionImproveRun(runKind) &&
			(completionMarker === "fail" || completionMarker === "test_fail")
		) {
			return "generate:fail";
		}

		if (completionMarker === "fail" || completionMarker === "test_fail") {
			return "run:fail";
		}
	}

	if (sessionMetaKind === "running") {
		return isDescriptionImproveRun(runKind) ? "generate:start" : "run:start";
	}

	if (sessionMetaKind === "permission") {
		return null;
	}

	if (runStatus === "cancelled") {
		return "run:cancelled";
	}

	if (runStatus === "running") {
		return isDescriptionImproveRun(runKind) ? "generate:start" : "run:start";
	}

	if (runStatus === "failed" || runStatus === "timeout") {
		return isDescriptionImproveRun(runKind) ? "generate:fail" : "run:fail";
	}

	return null;
}

export class TaskStateMachine {
	public transition(input: TaskTransitionInput): TaskTransitionResult {
		if (input.isManualStatusGracePeriod) {
			return createSkipResult();
		}

		const nextStatus = this.resolveNextStatus(input);
		if (!nextStatus) {
			return createSkipResult();
		}

		const patch: TaskPatch = {
			...this.buildStatusPatch(input, nextStatus),
			...this.buildStoryPatch(input),
		};
		const compactedPatch = compactPatch(patch);

		if (isPatchEmpty(compactedPatch)) {
			return createSkipResult();
		}

		const effects: TaskEffect[] = [
			{
				type: "publishSse",
				taskId: input.task.id,
				boardId: input.task.boardId,
				projectId: input.board.projectId,
			},
		];

		if (
			(shouldParseStoryContent(input) || shouldExtractCommitMessage(input)) &&
			input.outcomeContent.trim().length > 0 &&
			input.runKind
		) {
			effects.push({
				type: "parseStoryContent",
				content: input.outcomeContent,
				runKind: input.runKind,
			});
		}

		return {
			action: "update",
			patch: compactedPatch,
			effects,
		};
	}

	private resolveNextStatus(input: TaskTransitionInput): TaskStatus | null {
		const currentColumnKey = getWorkflowColumnSystemKey(
			input.board,
			input.task.columnId,
		);

		switch (input.trigger) {
			case "generate:start":
				return this.isBacklogPending(input.task.status, currentColumnKey)
					? "generating"
					: null;
			case "generate:ok":
				return this.isBacklogGenerationState(
					input.task.status,
					currentColumnKey,
				)
					? "pending"
					: null;
			case "generate:fail":
				return this.isBacklogGenerationState(
					input.task.status,
					currentColumnKey,
				)
					? "pending"
					: null;
			case "run:start":
				return this.isReadyPending(input.task.status, currentColumnKey)
					? "running"
					: null;
			case "run:cancelled":
				return "pending";
			case "run:done":
				if (isDescriptionImproveRun(input.runKind)) {
					return this.isDescriptionImproveCompletionState(
						input.task.status,
						currentColumnKey,
					)
						? "pending"
						: null;
				}
				return this.isActiveRunState(input.task.status, currentColumnKey)
					? "done"
					: null;
			case "run:fail":
				return this.isActiveRunState(input.task.status, currentColumnKey)
					? "failed"
					: null;
			case "run:question":
				return this.isActiveRunState(input.task.status, currentColumnKey)
					? "question"
					: null;
			case "run:answer":
				return this.isQuestionState(input.task.status, currentColumnKey)
					? "running"
					: null;
			case "run:dead":
				return this.isActiveRunState(input.task.status, currentColumnKey)
					? "failed"
					: null;
			case "review:approve":
				return this.isReviewState(input.task.status, currentColumnKey)
					? "done"
					: null;
			case "review:reject":
				return this.isReviewState(input.task.status, currentColumnKey)
					? "pending"
					: null;
			case "recover:retry":
				return input.task.status === "failed" ? "pending" : null;
			case "recover:reopen":
				return input.task.status === "done" ? "pending" : null;
			default:
				return null;
		}
	}

	private buildStatusPatch(
		input: TaskTransitionInput,
		nextStatus: TaskStatus,
	): TaskPatch {
		const nextColumnId = this.resolveColumnIdForStatus(input, nextStatus);
		const nextColumnKey = getWorkflowColumnSystemKey(input.board, nextColumnId);
		const reasons = resolveTaskStatusReasons(nextStatus, nextColumnKey);

		return {
			status: nextStatus,
			columnId: nextColumnId,
			blockedReason:
				reasons.blockedReason ?? getBlockedReasonForStatus(nextStatus),
			closedReason:
				reasons.closedReason ?? getClosedReasonForStatus(nextStatus),
		};
	}

	private buildStoryPatch(input: TaskTransitionInput): TaskPatch {
		if (!shouldParseStoryContent(input) && !shouldExtractCommitMessage(input)) {
			return {};
		}

		const parsed = parseUserStoryResponse(input.outcomeContent);
		const patch: TaskPatch = {};

		if (shouldParseStoryContent(input)) {
			patch.description = parsed.description;
			patch.descriptionMd = parsed.description;

			if (parsed.title) {
				patch.title = parsed.title;
			}

			let nextTags =
				parsed.tags && parsed.tags.length > 0
					? parsed.tags
					: readCurrentTaskTags(input.task);
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
		}

		if (parsed.commitMessage) {
			patch.commitMessage = parsed.commitMessage;
		}

		return patch;
	}

	private resolveColumnIdForStatus(
		input: TaskTransitionInput,
		status: TaskStatus,
	): string {
		const currentColumnId = input.task.columnId;
		const currentColumnKey = getWorkflowColumnSystemKey(
			input.board,
			currentColumnId,
		);
		const preferredColumnId = getPreferredColumnIdForStatus(
			input.board,
			status,
		);

		if (currentColumnKey && preferredColumnId) {
			const preferredColumnKey = getWorkflowColumnSystemKey(
				input.board,
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
			for (const column of input.board.columns) {
				const targetColumnKey = getWorkflowColumnSystemKey(
					input.board,
					column.id,
				);
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

	private isBacklogPending(
		status: TaskStatus,
		columnKey: string | null,
	): boolean {
		return status === "pending" && columnKey === "backlog";
	}

	private isBacklogGenerationState(
		status: TaskStatus,
		columnKey: string | null,
	): boolean {
		return (
			columnKey === "backlog" &&
			(status === "generating" || status === "pending")
		);
	}

	private isReadyPending(
		status: TaskStatus,
		columnKey: string | null,
	): boolean {
		return status === "pending" && columnKey === "ready";
	}

	private isActiveRunState(
		status: TaskStatus,
		columnKey: string | null,
	): boolean {
		if (columnKey !== "in_progress" && columnKey !== "blocked") {
			return false;
		}

		return status === "running" || status === "question" || status === "failed";
	}

	private isQuestionState(
		status: TaskStatus,
		columnKey: string | null,
	): boolean {
		return (
			status === "question" &&
			(columnKey === "blocked" || columnKey === "in_progress")
		);
	}

	private isDescriptionImproveCompletionState(
		status: TaskStatus,
		columnKey: string | null,
	): boolean {
		if (this.isActiveRunState(status, columnKey)) {
			return true;
		}

		return columnKey === "backlog" && status === "generating";
	}

	private isReviewState(status: TaskStatus, columnKey: string | null): boolean {
		return status === "done" && columnKey === "review";
	}
}

let taskStateMachine: TaskStateMachine | null = null;

export function getTaskStateMachine(): TaskStateMachine {
	if (!taskStateMachine) {
		taskStateMachine = new TaskStateMachine();
	}

	return taskStateMachine;
}
