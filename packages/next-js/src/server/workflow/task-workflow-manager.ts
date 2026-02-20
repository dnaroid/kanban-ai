import type { Board } from "@/server/types";
import type { BlockedReason, ClosedReason, TaskStatus } from "@/types/kanban";

export const WORKFLOW_COLUMN_SYSTEM_KEYS = [
	"backlog",
	"ready",
	"deferred",
	"in_progress",
	"blocked",
	"review",
	"closed",
] as const;

export type WorkflowColumnSystemKey =
	(typeof WORKFLOW_COLUMN_SYSTEM_KEYS)[number];

export interface WorkflowColumnTemplate {
	name: string;
	systemKey: WorkflowColumnSystemKey;
	color: string;
}

export const DEFAULT_WORKFLOW_COLUMNS: readonly WorkflowColumnTemplate[] = [
	{ name: "Backlog", systemKey: "backlog", color: "#6366f1" },
	{ name: "Ready", systemKey: "ready", color: "#0ea5e9" },
	{ name: "Deferred", systemKey: "deferred", color: "#6b7280" },
	{ name: "In Progress", systemKey: "in_progress", color: "#f59e0b" },
	{ name: "Blocked", systemKey: "blocked", color: "#ef4444" },
	{ name: "Review / QA", systemKey: "review", color: "#8b5cf6" },
	{ name: "Closed", systemKey: "closed", color: "#10b981" },
];

const TASK_STATUS_VALUES: readonly TaskStatus[] = [
	"queued",
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

const BLOCKED_REASON_BY_STATUS: Record<TaskStatus, BlockedReason | null> = {
	queued: null,
	running: null,
	question: "question",
	paused: "paused",
	done: null,
	failed: "failed",
	generating: null,
};

const CLOSED_REASON_BY_STATUS: Record<TaskStatus, ClosedReason | null> = {
	queued: null,
	running: null,
	question: null,
	paused: null,
	done: "done",
	failed: "failed",
	generating: null,
};

const STATUS_TO_WORKFLOW_COLUMN: Record<TaskStatus, WorkflowColumnSystemKey> = {
	queued: "ready",
	running: "in_progress",
	question: "blocked",
	paused: "blocked",
	done: "review",
	failed: "blocked",
	generating: "in_progress",
};

const COLUMN_DEFAULT_STATUS: Record<WorkflowColumnSystemKey, TaskStatus> = {
	backlog: "queued",
	ready: "queued",
	deferred: "queued",
	in_progress: "running",
	blocked: "paused",
	review: "done",
	closed: "done",
};

const COLUMN_ALLOWED_STATUSES: Record<
	WorkflowColumnSystemKey,
	readonly TaskStatus[]
> = {
	backlog: ["queued"],
	ready: ["queued"],
	deferred: ["queued"],
	in_progress: ["running", "generating"],
	blocked: ["question", "paused", "failed"],
	review: ["done"],
	closed: ["done", "failed"],
};

const STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
	queued: ["running", "generating", "done", "failed", "paused", "question"],
	running: ["queued", "paused", "question", "failed", "done"],
	question: ["queued", "running", "paused", "failed", "done"],
	paused: ["queued", "running", "question", "failed", "done"],
	done: ["queued", "running", "failed"],
	failed: ["queued", "running", "paused"],
	generating: ["queued", "paused", "question", "failed", "done"],
};

const COLUMN_TRANSITIONS: Record<
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

export function isWorkflowColumnSystemKey(
	value: string,
): value is WorkflowColumnSystemKey {
	return (WORKFLOW_COLUMN_SYSTEM_KEYS as readonly string[]).includes(value);
}

export function isTaskStatus(value: string): value is TaskStatus {
	return (TASK_STATUS_VALUES as readonly string[]).includes(value);
}

export function isBlockedReason(value: string): value is BlockedReason {
	return (BLOCKED_REASON_VALUES as readonly string[]).includes(value);
}

export function isClosedReason(value: string): value is ClosedReason {
	return (CLOSED_REASON_VALUES as readonly string[]).includes(value);
}

export function getWorkflowColumnSystemKey(
	board: Board,
	columnId: string,
): WorkflowColumnSystemKey | null {
	const column = board.columns.find((item) => item.id === columnId);
	if (!column) {
		return null;
	}

	return isWorkflowColumnSystemKey(column.systemKey) ? column.systemKey : null;
}

export function getWorkflowColumnIdBySystemKey(
	board: Board,
	systemKey: WorkflowColumnSystemKey,
): string | null {
	const column = board.columns.find((item) => item.systemKey === systemKey);
	return column?.id ?? null;
}

export function canTransitionStatus(from: TaskStatus, to: TaskStatus): boolean {
	if (from === to) {
		return true;
	}

	return STATUS_TRANSITIONS[from].includes(to);
}

export function canTransitionColumn(
	from: WorkflowColumnSystemKey,
	to: WorkflowColumnSystemKey,
): boolean {
	if (from === to) {
		return true;
	}

	return COLUMN_TRANSITIONS[from].includes(to);
}

export function isStatusAllowedInWorkflowColumn(
	status: TaskStatus,
	systemKey: WorkflowColumnSystemKey,
): boolean {
	return COLUMN_ALLOWED_STATUSES[systemKey].includes(status);
}

export function getDefaultStatusForWorkflowColumn(
	systemKey: WorkflowColumnSystemKey,
	currentStatus?: TaskStatus,
): TaskStatus {
	if (systemKey === "in_progress" && currentStatus === "generating") {
		return "generating";
	}

	if (systemKey === "blocked") {
		if (
			currentStatus === "question" ||
			currentStatus === "paused" ||
			currentStatus === "failed"
		) {
			return currentStatus;
		}

		return "paused";
	}

	if (systemKey === "closed") {
		if (currentStatus === "failed") {
			return "failed";
		}

		return "done";
	}

	return COLUMN_DEFAULT_STATUS[systemKey];
}

export function getPreferredColumnIdForStatus(
	board: Board,
	status: TaskStatus,
): string | null {
	const systemKey = STATUS_TO_WORKFLOW_COLUMN[status];
	return getWorkflowColumnIdBySystemKey(board, systemKey);
}

export function getBlockedReasonForStatus(
	status: TaskStatus,
): BlockedReason | null {
	return BLOCKED_REASON_BY_STATUS[status];
}

export function getClosedReasonForStatus(
	status: TaskStatus,
): ClosedReason | null {
	return CLOSED_REASON_BY_STATUS[status];
}

export function resolveTaskStatusReasons(
	status: TaskStatus,
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

	return {
		blockedReason: null,
		closedReason: null,
	};
}
