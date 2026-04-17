import type { Board } from "@/server/types";
import type { BlockedReason, ClosedReason, TaskStatus } from "@/types/kanban";
import type { RunStatus } from "@/types/ipc";
import type { WorkflowIconKey } from "@/types/workflow";
import { normalizeWorkflowIconKey } from "@/types/workflow";

export const WORKFLOW_COLUMN_SYSTEM_KEYS = [
	"deferred",
	"backlog",
	"ready",
	"in_progress",
	"blocked",
	"review",
	"closed",
] as const;

export type WorkflowColumnSystemKey = string;
export type WorkflowRunStatus = RunStatus;
export type WorkflowTaskStatus = string;

export interface WorkflowColumnTemplate {
	name: string;
	systemKey: WorkflowColumnSystemKey;
	color: string;
	icon: WorkflowIconKey;
}

export interface WorkflowStatusConfig {
	status: WorkflowTaskStatus;
	orderIndex: number;
	preferredColumnSystemKey: WorkflowColumnSystemKey;
	blockedReason: BlockedReason | null;
	closedReason: ClosedReason | null;
	color: string;
	icon: WorkflowIconKey;
}

export interface WorkflowColumnConfig {
	systemKey: WorkflowColumnSystemKey;
	name: string;
	color: string;
	icon: WorkflowIconKey;
	orderIndex: number;
	defaultStatus: WorkflowTaskStatus;
	allowedStatuses: WorkflowTaskStatus[];
}

export interface WorkflowConfig {
	statuses: WorkflowStatusConfig[];
	columns: WorkflowColumnConfig[];
	statusTransitions: Record<WorkflowTaskStatus, WorkflowTaskStatus[]>;
	columnTransitions: Record<string, string[]>;
}

const WORKFLOW_COLUMN_SYSTEM_KEY_PATTERN = /^[a-z][a-z0-9_-]*$/;

function createColumnTemplate(
	name: string,
	systemKey: WorkflowColumnSystemKey,
	color: string,
	icon: WorkflowIconKey,
): WorkflowColumnTemplate {
	return { name, systemKey, color, icon };
}

const DEFAULT_WORKFLOW_COLUMNS_FALLBACK: readonly WorkflowColumnTemplate[] = [
	createColumnTemplate("Backlog", "backlog", "#6366f1", "list"),
	createColumnTemplate("Ready", "ready", "#0ea5e9", "check-circle"),
	createColumnTemplate("Deferred", "deferred", "#6b7280", "clock"),
	createColumnTemplate("In Progress", "in_progress", "#f59e0b", "play"),
	createColumnTemplate("Blocked", "blocked", "#ef4444", "shield-alert"),
	createColumnTemplate("Review / QA", "review", "#8b5cf6", "eye"),
	createColumnTemplate("Closed", "closed", "#10b981", "archive"),
];

export const DEFAULT_WORKFLOW_COLUMNS = DEFAULT_WORKFLOW_COLUMNS_FALLBACK;

const TASK_STATUS_VALUES: readonly WorkflowTaskStatus[] = [
	"pending",
	"rejected",
	"running",
	"question",
	"paused",
	"done",
	"failed",
	"generating",
];

const BLOCKED_REASON_VALUES: readonly BlockedReason[] = [
	"question",
	"paused",
	"failed",
];

const CLOSED_REASON_VALUES: readonly ClosedReason[] = ["done", "failed"];

const RUN_STATUS_VALUES: readonly WorkflowRunStatus[] = [
	"queued",
	"running",
	"completed",
	"failed",
	"cancelled",
	"timeout",
	"paused",
];

const BLOCKED_REASON_BY_STATUS_FALLBACK: Record<
	WorkflowTaskStatus,
	BlockedReason | null
> = {
	pending: null,
	rejected: null,
	running: null,
	question: "question",
	paused: "paused",
	done: null,
	failed: "failed",
	generating: null,
};

const CLOSED_REASON_BY_STATUS_FALLBACK: Record<
	WorkflowTaskStatus,
	ClosedReason | null
> = {
	pending: null,
	rejected: null,
	running: null,
	question: null,
	paused: null,
	done: "done",
	failed: "failed",
	generating: null,
};

const STATUS_VISUALS_FALLBACK: Record<
	WorkflowTaskStatus,
	{ color: string; icon: WorkflowIconKey }
> = {
	pending: { color: "#f59e0b", icon: "clock" },
	rejected: { color: "#ef4444", icon: "x-circle" },
	running: { color: "#3b82f6", icon: "play" },
	question: { color: "#f97316", icon: "help-circle" },
	paused: { color: "#eab308", icon: "pause" },
	done: { color: "#10b981", icon: "check-circle" },
	failed: { color: "#ef4444", icon: "x-circle" },
	generating: { color: "#8b5cf6", icon: "sparkles" },
};

const STATUS_TO_WORKFLOW_COLUMN_FALLBACK: Record<
	WorkflowTaskStatus,
	WorkflowColumnSystemKey
> = {
	pending: "ready",
	rejected: "ready",
	running: "in_progress",
	question: "blocked",
	paused: "blocked",
	done: "review",
	failed: "blocked",
	generating: "backlog",
};

const COLUMN_DEFAULT_STATUS_FALLBACK: Record<
	WorkflowColumnSystemKey,
	WorkflowTaskStatus
> = {
	backlog: "pending",
	ready: "pending",
	deferred: "pending",
	in_progress: "running",
	blocked: "paused",
	review: "done",
	closed: "done",
};

const COLUMN_ALLOWED_STATUSES_FALLBACK: Record<
	WorkflowColumnSystemKey,
	readonly WorkflowTaskStatus[]
> = {
	backlog: ["pending", "generating"],
	ready: ["pending", "rejected"],
	deferred: ["pending"],
	in_progress: ["running"],
	blocked: ["question", "paused", "failed"],
	review: ["done"],
	closed: ["done", "failed"],
};

const STATUS_TRANSITIONS_FALLBACK: Record<
	WorkflowTaskStatus,
	readonly WorkflowTaskStatus[]
> = {
	pending: [
		"running",
		"generating",
		"done",
		"failed",
		"paused",
		"question",
		"rejected",
	],
	rejected: ["running", "pending", "failed"],
	running: ["pending", "paused", "question", "failed", "done"],
	question: ["pending", "running", "paused", "failed", "done"],
	paused: ["pending", "running", "question", "failed", "done"],
	done: ["pending", "running", "failed"],
	failed: ["pending", "running", "paused"],
	generating: ["pending", "paused", "question", "failed", "done"],
};

const COLUMN_TRANSITIONS_FALLBACK: Record<
	WorkflowColumnSystemKey,
	readonly WorkflowColumnSystemKey[]
> = {
	backlog: ["ready", "deferred", "in_progress"],
	ready: ["backlog", "deferred", "in_progress"],
	deferred: ["backlog", "ready", "in_progress"],
	in_progress: ["blocked", "review", "ready", "deferred", "backlog"],
	blocked: ["in_progress", "review", "ready", "deferred", "backlog", "closed"],
	review: ["in_progress", "blocked", "ready", "closed"],
	closed: ["ready", "review", "backlog"],
};

interface WorkflowRuntimeConfig {
	defaultColumns: readonly WorkflowColumnTemplate[];
	statusToColumn: Record<WorkflowTaskStatus, WorkflowColumnSystemKey>;
	columnDefaultStatus: Record<WorkflowColumnSystemKey, WorkflowTaskStatus>;
	columnAllowedStatuses: Record<
		WorkflowColumnSystemKey,
		readonly WorkflowTaskStatus[]
	>;
	statusTransitions: Record<WorkflowTaskStatus, readonly WorkflowTaskStatus[]>;
	columnTransitions: Record<
		WorkflowColumnSystemKey,
		readonly WorkflowColumnSystemKey[]
	>;
	blockedReasonByStatus: Record<WorkflowTaskStatus, BlockedReason | null>;
	closedReasonByStatus: Record<WorkflowTaskStatus, ClosedReason | null>;
}

let workflowRuntimeConfig: WorkflowRuntimeConfig | null = null;

function cloneStatuses(): WorkflowStatusConfig[] {
	return TASK_STATUS_VALUES.map(function mapStatus(status, orderIndex) {
		const visual = STATUS_VISUALS_FALLBACK[status];
		return {
			status,
			orderIndex,
			preferredColumnSystemKey: STATUS_TO_WORKFLOW_COLUMN_FALLBACK[status],
			blockedReason: BLOCKED_REASON_BY_STATUS_FALLBACK[status],
			closedReason: CLOSED_REASON_BY_STATUS_FALLBACK[status],
			color: visual.color,
			icon: normalizeWorkflowIconKey(visual.icon) ?? "list",
		};
	});
}

function cloneColumns(): WorkflowColumnConfig[] {
	const templates = new Map(
		DEFAULT_WORKFLOW_COLUMNS_FALLBACK.map(function toEntry(column) {
			return [column.systemKey, column] as const;
		}),
	);

	return WORKFLOW_COLUMN_SYSTEM_KEYS.map(
		function mapColumn(systemKey, orderIndex) {
			const template = templates.get(systemKey);
			return {
				systemKey,
				name: template?.name ?? systemKey,
				color: template?.color ?? "#6b7280",
				icon: normalizeWorkflowIconKey(template?.icon ?? "list") ?? "list",
				orderIndex,
				defaultStatus: COLUMN_DEFAULT_STATUS_FALLBACK[systemKey],
				allowedStatuses: [...COLUMN_ALLOWED_STATUSES_FALLBACK[systemKey]],
			};
		},
	);
}

function cloneStatusTransitions(): Record<
	WorkflowTaskStatus,
	WorkflowTaskStatus[]
> {
	const transitions: Record<WorkflowTaskStatus, WorkflowTaskStatus[]> = {};
	for (const status of TASK_STATUS_VALUES)
		transitions[status] = [...STATUS_TRANSITIONS_FALLBACK[status]];
	return transitions;
}

function cloneColumnTransitions(): Record<string, string[]> {
	const transitions: Record<string, string[]> = {};
	for (const [from, to] of Object.entries(COLUMN_TRANSITIONS_FALLBACK))
		transitions[from] = [...to];
	return transitions;
}

function createWorkflowConfig(): WorkflowConfig {
	return {
		statuses: cloneStatuses(),
		columns: cloneColumns(),
		statusTransitions: cloneStatusTransitions(),
		columnTransitions: cloneColumnTransitions(),
	};
}

function createWorkflowRuntimeConfig(): WorkflowRuntimeConfig {
	const config = createWorkflowConfig();
	const statusToColumn = { ...STATUS_TO_WORKFLOW_COLUMN_FALLBACK };
	const columnDefaultStatus = { ...COLUMN_DEFAULT_STATUS_FALLBACK };
	const blockedReasonByStatus = { ...BLOCKED_REASON_BY_STATUS_FALLBACK };
	const closedReasonByStatus = { ...CLOSED_REASON_BY_STATUS_FALLBACK };
	const columnAllowedStatuses: Record<
		WorkflowColumnSystemKey,
		readonly WorkflowTaskStatus[]
	> = {};
	const columnTransitions: Record<
		WorkflowColumnSystemKey,
		readonly WorkflowColumnSystemKey[]
	> = {};

	for (const [systemKey, statuses] of Object.entries(
		COLUMN_ALLOWED_STATUSES_FALLBACK,
	)) {
		columnAllowedStatuses[systemKey] = [...statuses];
	}
	for (const [systemKey, nextKeys] of Object.entries(
		COLUMN_TRANSITIONS_FALLBACK,
	)) {
		columnTransitions[systemKey] = [...nextKeys];
	}
	for (const status of config.statuses) {
		statusToColumn[status.status] = status.preferredColumnSystemKey;
		blockedReasonByStatus[status.status] = status.blockedReason;
		closedReasonByStatus[status.status] = status.closedReason;
	}
	for (const column of config.columns) {
		columnDefaultStatus[column.systemKey] = column.defaultStatus;
		columnAllowedStatuses[column.systemKey] = [...column.allowedStatuses];
	}
	for (const [systemKey, nextKeys] of Object.entries(
		config.columnTransitions,
	)) {
		columnTransitions[systemKey] = [...nextKeys];
	}

	return {
		defaultColumns: config.columns.map(function toTemplate(column) {
			return {
				name: column.name,
				systemKey: column.systemKey,
				color: column.color,
				icon: column.icon,
			};
		}),
		statusToColumn,
		columnDefaultStatus,
		columnAllowedStatuses,
		statusTransitions: config.statusTransitions,
		columnTransitions,
		blockedReasonByStatus,
		closedReasonByStatus,
	};
}

function getWorkflowRuntimeConfig(): WorkflowRuntimeConfig {
	if (!workflowRuntimeConfig)
		workflowRuntimeConfig = createWorkflowRuntimeConfig();
	return workflowRuntimeConfig;
}

export function canTransitionStatus(
	from: WorkflowTaskStatus,
	to: WorkflowTaskStatus,
): boolean {
	if (!isWorkflowTaskStatus(from) || !isWorkflowTaskStatus(to)) return false;
	if (from === to) return true;
	return (getWorkflowRuntimeConfig().statusTransitions[from] ?? []).includes(
		to,
	);
}

export function canTransitionColumn(
	from: WorkflowColumnSystemKey,
	to: WorkflowColumnSystemKey,
): boolean {
	if (from === to) return true;
	return (getWorkflowRuntimeConfig().columnTransitions[from] ?? []).includes(
		to,
	);
}

export function getDefaultWorkflowColumns(): readonly WorkflowColumnTemplate[] {
	return getWorkflowRuntimeConfig().defaultColumns;
}

export function getPreferredColumnIdForStatus(
	board: Board,
	status: WorkflowTaskStatus,
): string | null {
	const systemKey = getWorkflowRuntimeConfig().statusToColumn[status];
	return systemKey ? getWorkflowColumnIdBySystemKey(board, systemKey) : null;
}

export function getBlockedReasonForStatus(
	status: WorkflowTaskStatus,
): BlockedReason | null {
	return getWorkflowRuntimeConfig().blockedReasonByStatus[status] ?? null;
}

export function getClosedReasonForStatus(
	status: WorkflowTaskStatus,
): ClosedReason | null {
	return getWorkflowRuntimeConfig().closedReasonByStatus[status] ?? null;
}

export function resolveTaskStatusReasons(
	status: WorkflowTaskStatus,
	columnSystemKey: WorkflowColumnSystemKey | null,
): { blockedReason: BlockedReason | null; closedReason: ClosedReason | null } {
	if (columnSystemKey === "blocked") {
		return {
			blockedReason: getBlockedReasonForStatus(status),
			closedReason: null,
		};
	}
	if (columnSystemKey === "closed") {
		return {
			blockedReason: null,
			closedReason: getClosedReasonForStatus(status),
		};
	}
	return { blockedReason: null, closedReason: null };
}

export function isStatusAllowedInWorkflowColumn(
	status: WorkflowTaskStatus,
	systemKey: WorkflowColumnSystemKey,
): boolean {
	return (
		getWorkflowRuntimeConfig().columnAllowedStatuses[systemKey] ?? []
	).includes(status);
}

export function getDefaultStatusForWorkflowColumn(
	systemKey: WorkflowColumnSystemKey,
	currentStatus?: WorkflowTaskStatus,
): WorkflowTaskStatus {
	const runtime = getWorkflowRuntimeConfig();
	if (
		currentStatus &&
		(runtime.columnAllowedStatuses[systemKey] ?? []).includes(currentStatus)
	) {
		return currentStatus;
	}
	return runtime.columnDefaultStatus[systemKey] ?? "pending";
}

export function getWorkflowColumnSystemKey(
	board: Board,
	columnId: string,
): WorkflowColumnSystemKey | null {
	const column = board.columns.find(function findColumn(item) {
		return item.id === columnId;
	});
	if (!column) return null;
	return isWorkflowColumnSystemKey(column.systemKey) ? column.systemKey : null;
}

export function getWorkflowColumnIdBySystemKey(
	board: Board,
	systemKey: WorkflowColumnSystemKey,
): string | null {
	return (
		board.columns.find(function findColumn(item) {
			return item.systemKey === systemKey;
		})?.id ?? null
	);
}

export function isWorkflowColumnSystemKey(
	value: string,
): value is WorkflowColumnSystemKey {
	return WORKFLOW_COLUMN_SYSTEM_KEY_PATTERN.test(value);
}

export function isWorkflowTaskStatus(value: string): boolean {
	const runtime = getWorkflowRuntimeConfig();
	return (
		Object.prototype.hasOwnProperty.call(runtime.statusTransitions, value) ||
		Object.prototype.hasOwnProperty.call(runtime.statusToColumn, value)
	);
}

export function isTaskStatus(value: string): boolean {
	return isWorkflowTaskStatus(value);
}

export function isBlockedReason(value: string): value is BlockedReason {
	return (BLOCKED_REASON_VALUES as readonly string[]).includes(value);
}

export function isClosedReason(value: string): value is ClosedReason {
	return (CLOSED_REASON_VALUES as readonly string[]).includes(value);
}

export function isWorkflowRunStatus(value: string): value is WorkflowRunStatus {
	return (RUN_STATUS_VALUES as readonly string[]).includes(value);
}

export function resetWorkflowRuntimeConfigForTests(): void {
	workflowRuntimeConfig = null;
}

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
		isGenerated?: boolean;
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

function hasRequiredStoryContent(input: TaskTransitionInput): boolean {
	if (!shouldParseStoryContent(input)) {
		return true;
	}

	const parsed = parseUserStoryResponse(input.outcomeContent);
	return parsed.description.trim().length > 0;
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

		if (!hasRequiredStoryContent(input)) {
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
					? "rejected"
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
			patch.isGenerated = true;

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
		return (
			(status === "pending" || status === "rejected") && columnKey === "ready"
		);
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
