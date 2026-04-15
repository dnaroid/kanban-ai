import type { Board } from "@/server/types";
import type { RunStatus } from "@/types/ipc";
import type { BlockedReason, ClosedReason } from "@/types/kanban";
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
	ready: ["pending"],
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
	pending: ["running", "generating", "done", "failed", "paused", "question"],
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

let runtimeConfig: WorkflowRuntimeConfig | null = null;

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

function createRuntimeConfig(): WorkflowRuntimeConfig {
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

function getRuntimeConfig(): WorkflowRuntimeConfig {
	if (!runtimeConfig) runtimeConfig = createRuntimeConfig();
	return runtimeConfig;
}

export function canTransitionStatus(
	from: WorkflowTaskStatus,
	to: WorkflowTaskStatus,
): boolean {
	if (!isWorkflowTaskStatus(from) || !isWorkflowTaskStatus(to)) return false;
	if (from === to) return true;
	return (getRuntimeConfig().statusTransitions[from] ?? []).includes(to);
}

export function canTransitionColumn(
	from: WorkflowColumnSystemKey,
	to: WorkflowColumnSystemKey,
): boolean {
	if (from === to) return true;
	return (getRuntimeConfig().columnTransitions[from] ?? []).includes(to);
}

export function getDefaultWorkflowColumns(): readonly WorkflowColumnTemplate[] {
	return getRuntimeConfig().defaultColumns;
}

export function getPreferredColumnIdForStatus(
	board: Board,
	status: WorkflowTaskStatus,
): string | null {
	const systemKey = getRuntimeConfig().statusToColumn[status];
	return systemKey ? getWorkflowColumnIdBySystemKey(board, systemKey) : null;
}

export function getBlockedReasonForStatus(
	status: WorkflowTaskStatus,
): BlockedReason | null {
	return getRuntimeConfig().blockedReasonByStatus[status] ?? null;
}

export function getClosedReasonForStatus(
	status: WorkflowTaskStatus,
): ClosedReason | null {
	return getRuntimeConfig().closedReasonByStatus[status] ?? null;
}

export function resolveTaskStatusReasons(
	status: WorkflowTaskStatus,
	columnSystemKey: WorkflowColumnSystemKey | null,
): { blockedReason: BlockedReason | null; closedReason: ClosedReason | null } {
	if (columnSystemKey === "blocked")
		return {
			blockedReason: getBlockedReasonForStatus(status),
			closedReason: null,
		};
	if (columnSystemKey === "closed")
		return {
			blockedReason: null,
			closedReason: getClosedReasonForStatus(status),
		};
	return { blockedReason: null, closedReason: null };
}

export function isStatusAllowedInWorkflowColumn(
	status: WorkflowTaskStatus,
	systemKey: WorkflowColumnSystemKey,
): boolean {
	return (getRuntimeConfig().columnAllowedStatuses[systemKey] ?? []).includes(
		status,
	);
}

export function getDefaultStatusForWorkflowColumn(
	systemKey: WorkflowColumnSystemKey,
	currentStatus?: WorkflowTaskStatus,
): WorkflowTaskStatus {
	const runtime = getRuntimeConfig();
	if (
		currentStatus &&
		(runtime.columnAllowedStatuses[systemKey] ?? []).includes(currentStatus)
	)
		return currentStatus;
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
	const runtime = getRuntimeConfig();
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
	runtimeConfig = null;
}
