import type { Board } from "@/server/types";
import type { BlockedReason, ClosedReason, TaskStatus } from "@/types/kanban";
import type Database from "better-sqlite3";

import { dbManager } from "../db";

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

const DEFAULT_WORKFLOW_COLUMNS_FALLBACK: readonly WorkflowColumnTemplate[] = [
	{ name: "Backlog", systemKey: "backlog", color: "#6366f1" },
	{ name: "Ready", systemKey: "ready", color: "#0ea5e9" },
	{ name: "Deferred", systemKey: "deferred", color: "#6b7280" },
	{ name: "In Progress", systemKey: "in_progress", color: "#f59e0b" },
	{ name: "Blocked", systemKey: "blocked", color: "#ef4444" },
	{ name: "Review / QA", systemKey: "review", color: "#8b5cf6" },
	{ name: "Closed", systemKey: "closed", color: "#10b981" },
];

export const DEFAULT_WORKFLOW_COLUMNS = DEFAULT_WORKFLOW_COLUMNS_FALLBACK;

const WORKFLOW_TABLE_NAMES = [
	"workflow_statuses",
	"workflow_column_templates",
	"workflow_column_allowed_statuses",
	"workflow_status_transitions",
	"workflow_column_transitions",
] as const;

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

const BLOCKED_REASON_BY_STATUS_FALLBACK: Record<
	TaskStatus,
	BlockedReason | null
> = {
	queued: null,
	running: null,
	question: "question",
	paused: "paused",
	done: null,
	failed: "failed",
	generating: null,
};

const CLOSED_REASON_BY_STATUS_FALLBACK: Record<
	TaskStatus,
	ClosedReason | null
> = {
	queued: null,
	running: null,
	question: null,
	paused: null,
	done: "done",
	failed: "failed",
	generating: null,
};

const STATUS_TO_WORKFLOW_COLUMN_FALLBACK: Record<
	TaskStatus,
	WorkflowColumnSystemKey
> = {
	queued: "ready",
	running: "in_progress",
	question: "blocked",
	paused: "blocked",
	done: "review",
	failed: "blocked",
	generating: "in_progress",
};

const COLUMN_DEFAULT_STATUS_FALLBACK: Record<
	WorkflowColumnSystemKey,
	TaskStatus
> = {
	backlog: "queued",
	ready: "queued",
	deferred: "queued",
	in_progress: "running",
	blocked: "paused",
	review: "done",
	closed: "done",
};

const COLUMN_ALLOWED_STATUSES_FALLBACK: Record<
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

const STATUS_TRANSITIONS_FALLBACK: Record<TaskStatus, readonly TaskStatus[]> = {
	queued: ["running", "generating", "done", "failed", "paused", "question"],
	running: ["queued", "paused", "question", "failed", "done"],
	question: ["queued", "running", "paused", "failed", "done"],
	paused: ["queued", "running", "question", "failed", "done"],
	done: ["queued", "running", "failed"],
	failed: ["queued", "running", "paused"],
	generating: ["queued", "paused", "question", "failed", "done"],
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
	statusToColumn: Record<TaskStatus, WorkflowColumnSystemKey>;
	columnDefaultStatus: Record<WorkflowColumnSystemKey, TaskStatus>;
	columnAllowedStatuses: Record<WorkflowColumnSystemKey, readonly TaskStatus[]>;
	statusTransitions: Record<TaskStatus, readonly TaskStatus[]>;
	columnTransitions: Record<
		WorkflowColumnSystemKey,
		readonly WorkflowColumnSystemKey[]
	>;
	blockedReasonByStatus: Record<TaskStatus, BlockedReason | null>;
	closedReasonByStatus: Record<TaskStatus, ClosedReason | null>;
}

let runtimeConfig: WorkflowRuntimeConfig | null = null;

function createFallbackRuntimeConfig(): WorkflowRuntimeConfig {
	return {
		defaultColumns: DEFAULT_WORKFLOW_COLUMNS_FALLBACK,
		statusToColumn: STATUS_TO_WORKFLOW_COLUMN_FALLBACK,
		columnDefaultStatus: COLUMN_DEFAULT_STATUS_FALLBACK,
		columnAllowedStatuses: COLUMN_ALLOWED_STATUSES_FALLBACK,
		statusTransitions: STATUS_TRANSITIONS_FALLBACK,
		columnTransitions: COLUMN_TRANSITIONS_FALLBACK,
		blockedReasonByStatus: BLOCKED_REASON_BY_STATUS_FALLBACK,
		closedReasonByStatus: CLOSED_REASON_BY_STATUS_FALLBACK,
	};
}

const FALLBACK_RUNTIME_CONFIG = createFallbackRuntimeConfig();

function hasWorkflowConfigTables(db: Database.Database): boolean {
	const existingTables = db
		.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${WORKFLOW_TABLE_NAMES.map(() => "?").join(", ")})`,
		)
		.all(...WORKFLOW_TABLE_NAMES) as Array<{ name: string }>;

	return existingTables.length === WORKFLOW_TABLE_NAMES.length;
}

type WorkflowStatusRow = {
	status: string;
	preferredColumnSystemKey: string;
	blockedReason: string | null;
	closedReason: string | null;
};

type WorkflowColumnTemplateRow = {
	systemKey: string;
	name: string;
	color: string;
	defaultStatus: string;
};

type WorkflowAllowedStatusRow = {
	systemKey: string;
	status: string;
};

type WorkflowStatusTransitionRow = {
	fromStatus: string;
	toStatus: string;
};

type WorkflowColumnTransitionRow = {
	fromSystemKey: string;
	toSystemKey: string;
};

function loadRuntimeConfigFromDb(): WorkflowRuntimeConfig | null {
	let db: Database.Database;
	try {
		db = dbManager.connect();
	} catch {
		return null;
	}

	if (!hasWorkflowConfigTables(db)) {
		return null;
	}

	const statusRows = db
		.prepare(
			`SELECT
         status,
         preferred_column_system_key AS preferredColumnSystemKey,
         blocked_reason AS blockedReason,
         closed_reason AS closedReason
       FROM workflow_statuses
       ORDER BY order_index ASC`,
		)
		.all() as WorkflowStatusRow[];

	const templateRows = db
		.prepare(
			`SELECT
         system_key AS systemKey,
         name,
         color,
         default_status AS defaultStatus
       FROM workflow_column_templates
       ORDER BY order_index ASC`,
		)
		.all() as WorkflowColumnTemplateRow[];

	if (
		statusRows.length !== TASK_STATUS_VALUES.length ||
		templateRows.length !== WORKFLOW_COLUMN_SYSTEM_KEYS.length
	) {
		return null;
	}

	const statusToColumn: Record<TaskStatus, WorkflowColumnSystemKey> = {
		...STATUS_TO_WORKFLOW_COLUMN_FALLBACK,
	};
	const blockedReasonByStatus: Record<TaskStatus, BlockedReason | null> = {
		...BLOCKED_REASON_BY_STATUS_FALLBACK,
	};
	const closedReasonByStatus: Record<TaskStatus, ClosedReason | null> = {
		...CLOSED_REASON_BY_STATUS_FALLBACK,
	};

	for (const row of statusRows) {
		if (!isTaskStatus(row.status)) {
			return null;
		}

		if (!isWorkflowColumnSystemKey(row.preferredColumnSystemKey)) {
			return null;
		}

		const blockedReason =
			row.blockedReason && isBlockedReason(row.blockedReason)
				? row.blockedReason
				: null;
		const closedReason =
			row.closedReason && isClosedReason(row.closedReason)
				? row.closedReason
				: null;

		statusToColumn[row.status] = row.preferredColumnSystemKey;
		blockedReasonByStatus[row.status] = blockedReason;
		closedReasonByStatus[row.status] = closedReason;
	}

	const defaultColumns: WorkflowColumnTemplate[] = [];
	const columnDefaultStatus: Record<WorkflowColumnSystemKey, TaskStatus> = {
		...COLUMN_DEFAULT_STATUS_FALLBACK,
	};

	for (const row of templateRows) {
		if (
			!isWorkflowColumnSystemKey(row.systemKey) ||
			!isTaskStatus(row.defaultStatus)
		) {
			return null;
		}

		defaultColumns.push({
			name: row.name,
			systemKey: row.systemKey,
			color: row.color,
		});
		columnDefaultStatus[row.systemKey] = row.defaultStatus;
	}

	const columnAllowedStatusesMutable: Record<
		WorkflowColumnSystemKey,
		TaskStatus[]
	> = {
		backlog: [],
		ready: [],
		deferred: [],
		in_progress: [],
		blocked: [],
		review: [],
		closed: [],
	};

	const allowedStatusRows = db
		.prepare(
			`SELECT
         system_key AS systemKey,
         status
       FROM workflow_column_allowed_statuses`,
		)
		.all() as WorkflowAllowedStatusRow[];

	for (const row of allowedStatusRows) {
		if (
			!isWorkflowColumnSystemKey(row.systemKey) ||
			!isTaskStatus(row.status)
		) {
			return null;
		}

		columnAllowedStatusesMutable[row.systemKey].push(row.status);
	}

	const statusTransitionsMutable: Record<TaskStatus, TaskStatus[]> = {
		queued: [],
		running: [],
		question: [],
		paused: [],
		done: [],
		failed: [],
		generating: [],
	};

	const statusTransitionRows = db
		.prepare(
			`SELECT
         from_status AS fromStatus,
         to_status AS toStatus
       FROM workflow_status_transitions`,
		)
		.all() as WorkflowStatusTransitionRow[];

	for (const row of statusTransitionRows) {
		if (!isTaskStatus(row.fromStatus) || !isTaskStatus(row.toStatus)) {
			return null;
		}

		statusTransitionsMutable[row.fromStatus].push(row.toStatus);
	}

	const columnTransitionsMutable: Record<
		WorkflowColumnSystemKey,
		WorkflowColumnSystemKey[]
	> = {
		backlog: [],
		ready: [],
		deferred: [],
		in_progress: [],
		blocked: [],
		review: [],
		closed: [],
	};

	const columnTransitionRows = db
		.prepare(
			`SELECT
         from_system_key AS fromSystemKey,
         to_system_key AS toSystemKey
       FROM workflow_column_transitions`,
		)
		.all() as WorkflowColumnTransitionRow[];

	for (const row of columnTransitionRows) {
		if (
			!isWorkflowColumnSystemKey(row.fromSystemKey) ||
			!isWorkflowColumnSystemKey(row.toSystemKey)
		) {
			return null;
		}

		columnTransitionsMutable[row.fromSystemKey].push(row.toSystemKey);
	}

	const columnAllowedStatuses: Record<
		WorkflowColumnSystemKey,
		readonly TaskStatus[]
	> = {
		backlog: columnAllowedStatusesMutable.backlog,
		ready: columnAllowedStatusesMutable.ready,
		deferred: columnAllowedStatusesMutable.deferred,
		in_progress: columnAllowedStatusesMutable.in_progress,
		blocked: columnAllowedStatusesMutable.blocked,
		review: columnAllowedStatusesMutable.review,
		closed: columnAllowedStatusesMutable.closed,
	};

	const statusTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
		queued: statusTransitionsMutable.queued,
		running: statusTransitionsMutable.running,
		question: statusTransitionsMutable.question,
		paused: statusTransitionsMutable.paused,
		done: statusTransitionsMutable.done,
		failed: statusTransitionsMutable.failed,
		generating: statusTransitionsMutable.generating,
	};

	const columnTransitions: Record<
		WorkflowColumnSystemKey,
		readonly WorkflowColumnSystemKey[]
	> = {
		backlog: columnTransitionsMutable.backlog,
		ready: columnTransitionsMutable.ready,
		deferred: columnTransitionsMutable.deferred,
		in_progress: columnTransitionsMutable.in_progress,
		blocked: columnTransitionsMutable.blocked,
		review: columnTransitionsMutable.review,
		closed: columnTransitionsMutable.closed,
	};

	return {
		defaultColumns,
		statusToColumn,
		columnDefaultStatus,
		columnAllowedStatuses,
		statusTransitions,
		columnTransitions,
		blockedReasonByStatus,
		closedReasonByStatus,
	};
}

function getRuntimeConfig(): WorkflowRuntimeConfig {
	if (runtimeConfig) {
		return runtimeConfig;
	}

	runtimeConfig = loadRuntimeConfigFromDb() ?? FALLBACK_RUNTIME_CONFIG;
	return runtimeConfig;
}

export function getDefaultWorkflowColumns(): readonly WorkflowColumnTemplate[] {
	return getRuntimeConfig().defaultColumns;
}

export function resetWorkflowRuntimeConfigForTests(): void {
	runtimeConfig = null;
}

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

	return getRuntimeConfig().statusTransitions[from].includes(to);
}

export function canTransitionColumn(
	from: WorkflowColumnSystemKey,
	to: WorkflowColumnSystemKey,
): boolean {
	if (from === to) {
		return true;
	}

	return getRuntimeConfig().columnTransitions[from].includes(to);
}

export function isStatusAllowedInWorkflowColumn(
	status: TaskStatus,
	systemKey: WorkflowColumnSystemKey,
): boolean {
	return getRuntimeConfig().columnAllowedStatuses[systemKey].includes(status);
}

export function getDefaultStatusForWorkflowColumn(
	systemKey: WorkflowColumnSystemKey,
	currentStatus?: TaskStatus,
): TaskStatus {
	const runtime = getRuntimeConfig();
	if (
		currentStatus &&
		runtime.columnAllowedStatuses[systemKey].includes(currentStatus)
	) {
		return currentStatus;
	}

	return runtime.columnDefaultStatus[systemKey];
}

export function getPreferredColumnIdForStatus(
	board: Board,
	status: TaskStatus,
): string | null {
	const systemKey = getRuntimeConfig().statusToColumn[status];
	return getWorkflowColumnIdBySystemKey(board, systemKey);
}

export function getBlockedReasonForStatus(
	status: TaskStatus,
): BlockedReason | null {
	return getRuntimeConfig().blockedReasonByStatus[status];
}

export function getClosedReasonForStatus(
	status: TaskStatus,
): ClosedReason | null {
	return getRuntimeConfig().closedReasonByStatus[status];
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
