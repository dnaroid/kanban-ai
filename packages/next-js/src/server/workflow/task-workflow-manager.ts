import type { Board } from "@/server/types";
import type { BlockedReason, ClosedReason, TaskStatus } from "@/types/kanban";
import type { WorkflowIconKey } from "@/types/workflow";
import { isWorkflowIconKey } from "@/types/workflow";
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
	icon: WorkflowIconKey;
}

export interface WorkflowStatusConfig {
	status: TaskStatus;
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
	defaultStatus: TaskStatus;
	allowedStatuses: TaskStatus[];
}

export interface WorkflowConfig {
	statuses: WorkflowStatusConfig[];
	columns: WorkflowColumnConfig[];
	statusTransitions: Record<TaskStatus, TaskStatus[]>;
	columnTransitions: Record<WorkflowColumnSystemKey, WorkflowColumnSystemKey[]>;
}

const DEFAULT_WORKFLOW_COLUMNS_FALLBACK: readonly WorkflowColumnTemplate[] = [
	{ name: "Backlog", systemKey: "backlog", color: "#6366f1", icon: "list" },
	{
		name: "Ready",
		systemKey: "ready",
		color: "#0ea5e9",
		icon: "check-circle",
	},
	{
		name: "Deferred",
		systemKey: "deferred",
		color: "#6b7280",
		icon: "clock",
	},
	{
		name: "In Progress",
		systemKey: "in_progress",
		color: "#f59e0b",
		icon: "play",
	},
	{
		name: "Blocked",
		systemKey: "blocked",
		color: "#ef4444",
		icon: "shield-alert",
	},
	{
		name: "Review / QA",
		systemKey: "review",
		color: "#8b5cf6",
		icon: "eye",
	},
	{
		name: "Closed",
		systemKey: "closed",
		color: "#10b981",
		icon: "archive",
	},
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

const STATUS_VISUALS_FALLBACK: Record<
	TaskStatus,
	{ color: string; icon: WorkflowIconKey }
> = {
	queued: { color: "#f59e0b", icon: "clock" },
	running: { color: "#3b82f6", icon: "play" },
	question: { color: "#f97316", icon: "help-circle" },
	paused: { color: "#eab308", icon: "pause" },
	done: { color: "#10b981", icon: "check-circle" },
	failed: { color: "#ef4444", icon: "x-circle" },
	generating: { color: "#8b5cf6", icon: "sparkles" },
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
	color: string;
	icon: string;
};

type WorkflowColumnTemplateRow = {
	systemKey: string;
	name: string;
	color: string;
	icon: string;
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

type WorkflowStatusRowWithOrder = WorkflowStatusRow & {
	orderIndex: number;
};

type WorkflowColumnTemplateRowWithOrder = WorkflowColumnTemplateRow & {
	orderIndex: number;
};

function toWorkflowConfig(
	statusRows: WorkflowStatusRowWithOrder[],
	templateRows: WorkflowColumnTemplateRowWithOrder[],
	allowedStatusRows: WorkflowAllowedStatusRow[],
	statusTransitionRows: WorkflowStatusTransitionRow[],
	columnTransitionRows: WorkflowColumnTransitionRow[],
): WorkflowConfig | null {
	const statuses: WorkflowStatusConfig[] = [];
	for (const row of statusRows) {
		if (!isTaskStatus(row.status)) {
			return null;
		}

		if (!isWorkflowColumnSystemKey(row.preferredColumnSystemKey)) {
			return null;
		}

		if (!Number.isInteger(row.orderIndex) || row.orderIndex < 0) {
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
		if (!row.color.trim() || !isWorkflowIconKey(row.icon)) {
			return null;
		}

		statuses.push({
			status: row.status,
			orderIndex: row.orderIndex,
			preferredColumnSystemKey: row.preferredColumnSystemKey,
			blockedReason,
			closedReason,
			color: row.color,
			icon: row.icon,
		});
	}

	const allowedStatusesByColumn: Record<WorkflowColumnSystemKey, TaskStatus[]> =
		{
			backlog: [],
			ready: [],
			deferred: [],
			in_progress: [],
			blocked: [],
			review: [],
			closed: [],
		};

	for (const row of allowedStatusRows) {
		if (
			!isWorkflowColumnSystemKey(row.systemKey) ||
			!isTaskStatus(row.status)
		) {
			return null;
		}
		allowedStatusesByColumn[row.systemKey].push(row.status);
	}

	const columns: WorkflowColumnConfig[] = [];
	for (const row of templateRows) {
		if (
			!isWorkflowColumnSystemKey(row.systemKey) ||
			!isTaskStatus(row.defaultStatus) ||
			!isWorkflowIconKey(row.icon)
		) {
			return null;
		}

		if (!Number.isInteger(row.orderIndex) || row.orderIndex < 0) {
			return null;
		}

		columns.push({
			systemKey: row.systemKey,
			name: row.name,
			color: row.color,
			icon: row.icon,
			orderIndex: row.orderIndex,
			defaultStatus: row.defaultStatus,
			allowedStatuses: [...allowedStatusesByColumn[row.systemKey]],
		});
	}

	const statusTransitions: Record<TaskStatus, TaskStatus[]> = {
		queued: [],
		running: [],
		question: [],
		paused: [],
		done: [],
		failed: [],
		generating: [],
	};

	for (const row of statusTransitionRows) {
		if (!isTaskStatus(row.fromStatus) || !isTaskStatus(row.toStatus)) {
			return null;
		}

		statusTransitions[row.fromStatus].push(row.toStatus);
	}

	const columnTransitions: Record<
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

	for (const row of columnTransitionRows) {
		if (
			!isWorkflowColumnSystemKey(row.fromSystemKey) ||
			!isWorkflowColumnSystemKey(row.toSystemKey)
		) {
			return null;
		}

		columnTransitions[row.fromSystemKey].push(row.toSystemKey);
	}

	return {
		statuses,
		columns,
		statusTransitions,
		columnTransitions,
	};
}

function buildFallbackWorkflowConfig(): WorkflowConfig {
	const statuses = TASK_STATUS_VALUES.map((status, orderIndex) => ({
		status,
		orderIndex,
		preferredColumnSystemKey: STATUS_TO_WORKFLOW_COLUMN_FALLBACK[status],
		blockedReason: BLOCKED_REASON_BY_STATUS_FALLBACK[status],
		closedReason: CLOSED_REASON_BY_STATUS_FALLBACK[status],
		color: STATUS_VISUALS_FALLBACK[status].color,
		icon: STATUS_VISUALS_FALLBACK[status].icon,
	}));

	const columns = WORKFLOW_COLUMN_SYSTEM_KEYS.map((systemKey, orderIndex) => {
		const fallbackColumn = DEFAULT_WORKFLOW_COLUMNS_FALLBACK.find(
			(item) => item.systemKey === systemKey,
		);

		return {
			systemKey,
			name: fallbackColumn?.name ?? systemKey,
			color: fallbackColumn?.color ?? "#6b7280",
			icon: fallbackColumn?.icon ?? "list",
			orderIndex,
			defaultStatus: COLUMN_DEFAULT_STATUS_FALLBACK[systemKey],
			allowedStatuses: [...COLUMN_ALLOWED_STATUSES_FALLBACK[systemKey]],
		};
	});

	const statusTransitions: Record<TaskStatus, TaskStatus[]> = {
		queued: [...STATUS_TRANSITIONS_FALLBACK.queued],
		running: [...STATUS_TRANSITIONS_FALLBACK.running],
		question: [...STATUS_TRANSITIONS_FALLBACK.question],
		paused: [...STATUS_TRANSITIONS_FALLBACK.paused],
		done: [...STATUS_TRANSITIONS_FALLBACK.done],
		failed: [...STATUS_TRANSITIONS_FALLBACK.failed],
		generating: [...STATUS_TRANSITIONS_FALLBACK.generating],
	};

	const columnTransitions: Record<
		WorkflowColumnSystemKey,
		WorkflowColumnSystemKey[]
	> = {
		backlog: [...COLUMN_TRANSITIONS_FALLBACK.backlog],
		ready: [...COLUMN_TRANSITIONS_FALLBACK.ready],
		deferred: [...COLUMN_TRANSITIONS_FALLBACK.deferred],
		in_progress: [...COLUMN_TRANSITIONS_FALLBACK.in_progress],
		blocked: [...COLUMN_TRANSITIONS_FALLBACK.blocked],
		review: [...COLUMN_TRANSITIONS_FALLBACK.review],
		closed: [...COLUMN_TRANSITIONS_FALLBACK.closed],
	};

	return {
		statuses,
		columns,
		statusTransitions,
		columnTransitions,
	};
}

function loadWorkflowConfigFromDb(
	db: Database.Database,
): WorkflowConfig | null {
	if (!hasWorkflowConfigTables(db)) {
		return null;
	}

	const statusRows = db
		.prepare(
			`SELECT
         status,
         order_index AS orderIndex,
         preferred_column_system_key AS preferredColumnSystemKey,
         blocked_reason AS blockedReason,
         closed_reason AS closedReason,
         color,
         icon
       FROM workflow_statuses
       ORDER BY order_index ASC`,
		)
		.all() as WorkflowStatusRowWithOrder[];

	const templateRows = db
		.prepare(
			`SELECT
         system_key AS systemKey,
         name,
         color,
         icon,
         order_index AS orderIndex,
         default_status AS defaultStatus
       FROM workflow_column_templates
       ORDER BY order_index ASC`,
		)
		.all() as WorkflowColumnTemplateRowWithOrder[];

	if (
		statusRows.length !== TASK_STATUS_VALUES.length ||
		templateRows.length !== WORKFLOW_COLUMN_SYSTEM_KEYS.length
	) {
		return null;
	}

	const allowedStatusRows = db
		.prepare(
			`SELECT
         system_key AS systemKey,
         status
       FROM workflow_column_allowed_statuses`,
		)
		.all() as WorkflowAllowedStatusRow[];

	const statusTransitionRows = db
		.prepare(
			`SELECT
         from_status AS fromStatus,
         to_status AS toStatus
       FROM workflow_status_transitions`,
		)
		.all() as WorkflowStatusTransitionRow[];

	const columnTransitionRows = db
		.prepare(
			`SELECT
         from_system_key AS fromSystemKey,
         to_system_key AS toSystemKey
       FROM workflow_column_transitions`,
		)
		.all() as WorkflowColumnTransitionRow[];

	return toWorkflowConfig(
		statusRows,
		templateRows,
		allowedStatusRows,
		statusTransitionRows,
		columnTransitionRows,
	);
}

function validateWorkflowConfig(config: WorkflowConfig): void {
	if (config.statuses.length !== TASK_STATUS_VALUES.length) {
		throw new Error("Workflow config must include all task statuses");
	}

	if (config.columns.length !== WORKFLOW_COLUMN_SYSTEM_KEYS.length) {
		throw new Error("Workflow config must include all workflow columns");
	}

	const seenStatuses = new Set<TaskStatus>();
	const statusOrderIndexes = new Set<number>();
	for (const row of config.statuses) {
		if (!isTaskStatus(row.status)) {
			throw new Error(`Invalid status: ${String(row.status)}`);
		}
		if (!isWorkflowColumnSystemKey(row.preferredColumnSystemKey)) {
			throw new Error(
				`Invalid preferred column for status ${row.status}: ${row.preferredColumnSystemKey}`,
			);
		}
		if (row.blockedReason && !isBlockedReason(row.blockedReason)) {
			throw new Error(`Invalid blocked reason for status ${row.status}`);
		}
		if (row.closedReason && !isClosedReason(row.closedReason)) {
			throw new Error(`Invalid closed reason for status ${row.status}`);
		}
		if (!row.color.trim()) {
			throw new Error(`Status ${row.status} color cannot be empty`);
		}
		if (!isWorkflowIconKey(row.icon)) {
			throw new Error(`Invalid icon for status ${row.status}: ${row.icon}`);
		}
		if (!Number.isInteger(row.orderIndex) || row.orderIndex < 0) {
			throw new Error(`Invalid status order index for status ${row.status}`);
		}

		if (seenStatuses.has(row.status)) {
			throw new Error(`Duplicate status row: ${row.status}`);
		}
		seenStatuses.add(row.status);

		if (statusOrderIndexes.has(row.orderIndex)) {
			throw new Error(`Duplicate status order index: ${row.orderIndex}`);
		}
		statusOrderIndexes.add(row.orderIndex);
	}

	for (const status of TASK_STATUS_VALUES) {
		if (!seenStatuses.has(status)) {
			throw new Error(`Missing status row: ${status}`);
		}
	}

	const seenColumns = new Set<WorkflowColumnSystemKey>();
	const columnOrderIndexes = new Set<number>();
	for (const row of config.columns) {
		if (!isWorkflowColumnSystemKey(row.systemKey)) {
			throw new Error(`Invalid column system key: ${String(row.systemKey)}`);
		}
		if (!row.name.trim()) {
			throw new Error(`Column ${row.systemKey} name cannot be empty`);
		}
		if (!row.color.trim()) {
			throw new Error(`Column ${row.systemKey} color cannot be empty`);
		}
		if (!isWorkflowIconKey(row.icon)) {
			throw new Error(`Invalid icon for column ${row.systemKey}: ${row.icon}`);
		}
		if (!isTaskStatus(row.defaultStatus)) {
			throw new Error(`Invalid default status for column ${row.systemKey}`);
		}
		if (!Number.isInteger(row.orderIndex) || row.orderIndex < 0) {
			throw new Error(`Invalid column order index for ${row.systemKey}`);
		}
		if (
			!Array.isArray(row.allowedStatuses) ||
			row.allowedStatuses.length === 0
		) {
			throw new Error(`Column ${row.systemKey} must include allowed statuses`);
		}

		if (seenColumns.has(row.systemKey)) {
			throw new Error(`Duplicate column row: ${row.systemKey}`);
		}
		seenColumns.add(row.systemKey);

		if (columnOrderIndexes.has(row.orderIndex)) {
			throw new Error(`Duplicate column order index: ${row.orderIndex}`);
		}
		columnOrderIndexes.add(row.orderIndex);

		const allowedSet = new Set<TaskStatus>();
		for (const status of row.allowedStatuses) {
			if (!isTaskStatus(status)) {
				throw new Error(
					`Invalid allowed status '${String(status)}' for column ${row.systemKey}`,
				);
			}
			if (allowedSet.has(status)) {
				throw new Error(
					`Duplicate allowed status '${status}' for column ${row.systemKey}`,
				);
			}
			allowedSet.add(status);
		}

		if (!allowedSet.has(row.defaultStatus)) {
			throw new Error(
				`Default status '${row.defaultStatus}' is not allowed in column ${row.systemKey}`,
			);
		}
	}

	for (const systemKey of WORKFLOW_COLUMN_SYSTEM_KEYS) {
		if (!seenColumns.has(systemKey)) {
			throw new Error(`Missing column row: ${systemKey}`);
		}
	}

	for (const fromStatus of TASK_STATUS_VALUES) {
		const nextStatuses = config.statusTransitions[fromStatus];
		if (!Array.isArray(nextStatuses)) {
			throw new Error(`Missing status transition row for ${fromStatus}`);
		}
		const nextStatusSet = new Set<TaskStatus>();
		for (const toStatus of nextStatuses) {
			if (!isTaskStatus(toStatus)) {
				throw new Error(
					`Invalid status transition target '${String(toStatus)}' from ${fromStatus}`,
				);
			}
			if (nextStatusSet.has(toStatus)) {
				throw new Error(
					`Duplicate status transition ${fromStatus} -> ${toStatus}`,
				);
			}
			nextStatusSet.add(toStatus);
		}
	}

	for (const fromKey of WORKFLOW_COLUMN_SYSTEM_KEYS) {
		const nextKeys = config.columnTransitions[fromKey];
		if (!Array.isArray(nextKeys)) {
			throw new Error(`Missing column transition row for ${fromKey}`);
		}
		const nextKeySet = new Set<WorkflowColumnSystemKey>();
		for (const toKey of nextKeys) {
			if (!isWorkflowColumnSystemKey(toKey)) {
				throw new Error(
					`Invalid column transition target '${String(toKey)}' from ${fromKey}`,
				);
			}
			if (nextKeySet.has(toKey)) {
				throw new Error(`Duplicate column transition ${fromKey} -> ${toKey}`);
			}
			nextKeySet.add(toKey);
		}
	}
}

function parseStatusList(value: unknown): TaskStatus[] | null {
	if (!Array.isArray(value)) {
		return null;
	}

	const statuses: TaskStatus[] = [];
	for (const item of value) {
		if (typeof item !== "string" || !isTaskStatus(item)) {
			return null;
		}
		statuses.push(item);
	}

	return statuses;
}

function parseColumnKeyList(value: unknown): WorkflowColumnSystemKey[] | null {
	if (!Array.isArray(value)) {
		return null;
	}

	const systemKeys: WorkflowColumnSystemKey[] = [];
	for (const item of value) {
		if (typeof item !== "string" || !isWorkflowColumnSystemKey(item)) {
			return null;
		}
		systemKeys.push(item);
	}

	return systemKeys;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseWorkflowConfig(value: unknown): WorkflowConfig | null {
	if (!isRecord(value)) {
		return null;
	}

	const statusesValue = value.statuses;
	const columnsValue = value.columns;
	const statusTransitionsValue = value.statusTransitions;
	const columnTransitionsValue = value.columnTransitions;

	if (
		!Array.isArray(statusesValue) ||
		!Array.isArray(columnsValue) ||
		!isRecord(statusTransitionsValue) ||
		!isRecord(columnTransitionsValue)
	) {
		return null;
	}

	const statuses: WorkflowStatusConfig[] = [];
	for (const item of statusesValue) {
		if (!isRecord(item)) {
			return null;
		}

		const {
			status,
			orderIndex,
			preferredColumnSystemKey,
			blockedReason,
			closedReason,
			color,
			icon,
		} = item;

		if (
			typeof status !== "string" ||
			!isTaskStatus(status) ||
			typeof preferredColumnSystemKey !== "string" ||
			!isWorkflowColumnSystemKey(preferredColumnSystemKey) ||
			typeof color !== "string" ||
			!color.trim() ||
			typeof icon !== "string" ||
			!isWorkflowIconKey(icon) ||
			typeof orderIndex !== "number" ||
			!Number.isInteger(orderIndex) ||
			orderIndex < 0
		) {
			return null;
		}

		if (
			blockedReason !== null &&
			blockedReason !== undefined &&
			(typeof blockedReason !== "string" || !isBlockedReason(blockedReason))
		) {
			return null;
		}

		if (
			closedReason !== null &&
			closedReason !== undefined &&
			(typeof closedReason !== "string" || !isClosedReason(closedReason))
		) {
			return null;
		}

		statuses.push({
			status,
			orderIndex,
			preferredColumnSystemKey,
			blockedReason:
				typeof blockedReason === "string" && isBlockedReason(blockedReason)
					? blockedReason
					: null,
			closedReason:
				typeof closedReason === "string" && isClosedReason(closedReason)
					? closedReason
					: null,
			color,
			icon,
		});
	}

	const columns: WorkflowColumnConfig[] = [];
	for (const item of columnsValue) {
		if (!isRecord(item)) {
			return null;
		}

		const {
			systemKey,
			name,
			color,
			icon,
			orderIndex,
			defaultStatus,
			allowedStatuses,
		} = item;

		if (
			typeof systemKey !== "string" ||
			!isWorkflowColumnSystemKey(systemKey) ||
			typeof name !== "string" ||
			typeof color !== "string" ||
			!color.trim() ||
			typeof icon !== "string" ||
			!isWorkflowIconKey(icon) ||
			typeof orderIndex !== "number" ||
			!Number.isInteger(orderIndex) ||
			orderIndex < 0 ||
			typeof defaultStatus !== "string" ||
			!isTaskStatus(defaultStatus)
		) {
			return null;
		}

		const parsedAllowedStatuses = parseStatusList(allowedStatuses);
		if (!parsedAllowedStatuses) {
			return null;
		}

		columns.push({
			systemKey,
			name,
			color,
			icon,
			orderIndex,
			defaultStatus,
			allowedStatuses: parsedAllowedStatuses,
		});
	}

	const statusTransitions: Record<TaskStatus, TaskStatus[]> = {
		queued: [],
		running: [],
		question: [],
		paused: [],
		done: [],
		failed: [],
		generating: [],
	};

	for (const status of TASK_STATUS_VALUES) {
		const parsedStatuses = parseStatusList(statusTransitionsValue[status]);
		if (!parsedStatuses) {
			return null;
		}
		statusTransitions[status] = parsedStatuses;
	}

	const columnTransitions: Record<
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

	for (const systemKey of WORKFLOW_COLUMN_SYSTEM_KEYS) {
		const parsedSystemKeys = parseColumnKeyList(
			columnTransitionsValue[systemKey],
		);
		if (!parsedSystemKeys) {
			return null;
		}
		columnTransitions[systemKey] = parsedSystemKeys;
	}

	return {
		statuses,
		columns,
		statusTransitions,
		columnTransitions,
	};
}

export function getWorkflowConfig(): WorkflowConfig {
	let db: Database.Database;
	try {
		db = dbManager.connect();
	} catch {
		return buildFallbackWorkflowConfig();
	}

	return loadWorkflowConfigFromDb(db) ?? buildFallbackWorkflowConfig();
}

export function updateWorkflowConfig(config: WorkflowConfig): void {
	validateWorkflowConfig(config);

	const db = dbManager.connect();

	const replaceConfig = db.transaction(() => {
		db.prepare(`DELETE FROM workflow_column_allowed_statuses`).run();
		db.prepare(`DELETE FROM workflow_status_transitions`).run();
		db.prepare(`DELETE FROM workflow_column_transitions`).run();
		db.prepare(`DELETE FROM workflow_statuses`).run();
		db.prepare(`DELETE FROM workflow_column_templates`).run();

		const insertStatus = db.prepare(
			`INSERT INTO workflow_statuses (
         status,
         order_index,
         preferred_column_system_key,
         blocked_reason,
         closed_reason,
         color,
         icon
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		);
		for (const row of config.statuses) {
			insertStatus.run(
				row.status,
				row.orderIndex,
				row.preferredColumnSystemKey,
				row.blockedReason,
				row.closedReason,
				row.color,
				row.icon,
			);
		}

		const insertTemplate = db.prepare(
			`INSERT INTO workflow_column_templates (
         system_key,
         name,
         color,
         icon,
         order_index,
         default_status
       ) VALUES (?, ?, ?, ?, ?, ?)`,
		);
		for (const row of config.columns) {
			insertTemplate.run(
				row.systemKey,
				row.name,
				row.color,
				row.icon,
				row.orderIndex,
				row.defaultStatus,
			);
		}

		const insertAllowedStatus = db.prepare(
			`INSERT INTO workflow_column_allowed_statuses (system_key, status)
       VALUES (?, ?)`,
		);
		for (const row of config.columns) {
			for (const status of row.allowedStatuses) {
				insertAllowedStatus.run(row.systemKey, status);
			}
		}

		const insertStatusTransition = db.prepare(
			`INSERT INTO workflow_status_transitions (from_status, to_status)
       VALUES (?, ?)`,
		);
		for (const fromStatus of TASK_STATUS_VALUES) {
			for (const toStatus of config.statusTransitions[fromStatus]) {
				insertStatusTransition.run(fromStatus, toStatus);
			}
		}

		const insertColumnTransition = db.prepare(
			`INSERT INTO workflow_column_transitions (from_system_key, to_system_key)
       VALUES (?, ?)`,
		);
		for (const fromSystemKey of WORKFLOW_COLUMN_SYSTEM_KEYS) {
			for (const toSystemKey of config.columnTransitions[fromSystemKey]) {
				insertColumnTransition.run(fromSystemKey, toSystemKey);
			}
		}
	});

	replaceConfig();
	runtimeConfig = null;
}

function loadRuntimeConfigFromDb(): WorkflowRuntimeConfig | null {
	let db: Database.Database;
	try {
		db = dbManager.connect();
	} catch {
		return null;
	}

	const workflowConfig = loadWorkflowConfigFromDb(db);
	if (!workflowConfig) {
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

	for (const row of workflowConfig.statuses) {
		statusToColumn[row.status] = row.preferredColumnSystemKey;
		blockedReasonByStatus[row.status] = row.blockedReason;
		closedReasonByStatus[row.status] = row.closedReason;
	}

	const defaultColumns: WorkflowColumnTemplate[] = [];
	const columnDefaultStatus: Record<WorkflowColumnSystemKey, TaskStatus> = {
		...COLUMN_DEFAULT_STATUS_FALLBACK,
	};
	const columnAllowedStatuses: Record<
		WorkflowColumnSystemKey,
		readonly TaskStatus[]
	> = {
		backlog: [],
		ready: [],
		deferred: [],
		in_progress: [],
		blocked: [],
		review: [],
		closed: [],
	};

	for (const row of workflowConfig.columns) {
		defaultColumns.push({
			name: row.name,
			systemKey: row.systemKey,
			color: row.color,
			icon: row.icon,
		});
		columnDefaultStatus[row.systemKey] = row.defaultStatus;
		columnAllowedStatuses[row.systemKey] = row.allowedStatuses;
	}

	return {
		defaultColumns,
		statusToColumn,
		columnDefaultStatus,
		columnAllowedStatuses,
		statusTransitions: workflowConfig.statusTransitions,
		columnTransitions: workflowConfig.columnTransitions,
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
