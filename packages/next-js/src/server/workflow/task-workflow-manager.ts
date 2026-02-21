import type { Board } from "@/server/types";
import type { RunStatus } from "@/types/ipc";
import type { BlockedReason, ClosedReason } from "@/types/kanban";
import type { WorkflowIconKey } from "@/types/workflow";
import { normalizeWorkflowIconKey } from "@/types/workflow";
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

export const WORKFLOW_SIGNAL_SCOPES = ["run", "user_action"] as const;

export type WorkflowSignalScope = (typeof WORKFLOW_SIGNAL_SCOPES)[number];

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

export interface WorkflowSignalConfig {
	key: string;
	scope: WorkflowSignalScope;
	title: string;
	description: string;
	orderIndex: number;
	isActive: boolean;
}

export interface WorkflowSignalRuleConfig {
	key: string;
	signalKey: string;
	runKind: string | null;
	runStatus: WorkflowRunStatus | null;
	fromStatus: WorkflowTaskStatus | null;
	toStatus: WorkflowTaskStatus;
}

export interface WorkflowConfig {
	statuses: WorkflowStatusConfig[];
	columns: WorkflowColumnConfig[];
	statusTransitions: Record<WorkflowTaskStatus, WorkflowTaskStatus[]>;
	columnTransitions: Record<WorkflowColumnSystemKey, WorkflowColumnSystemKey[]>;
	signals: WorkflowSignalConfig[];
	signalRules: WorkflowSignalRuleConfig[];
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

const WORKFLOW_SIGNAL_TABLE_NAMES = [
	"workflow_signals",
	"workflow_signal_rules",
] as const;

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
	generating: "in_progress",
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
	backlog: ["pending"],
	ready: ["pending"],
	deferred: ["pending"],
	in_progress: ["running", "generating"],
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

const WORKFLOW_SIGNALS_FALLBACK: readonly WorkflowSignalConfig[] = [
	{
		key: "run_started",
		scope: "run",
		title: "Run Started",
		description: "Execution run started",
		orderIndex: 0,
		isActive: true,
	},
	{
		key: "generation_started",
		scope: "run",
		title: "Generation Started",
		description: "User story generation run started",
		orderIndex: 1,
		isActive: true,
	},
	{
		key: "generated",
		scope: "run",
		title: "Generated",
		description: "Generation output produced",
		orderIndex: 2,
		isActive: true,
	},
	{
		key: "done",
		scope: "run",
		title: "Done",
		description: "Run completed successfully",
		orderIndex: 3,
		isActive: true,
	},
	{
		key: "fail",
		scope: "run",
		title: "Fail",
		description: "Run failed",
		orderIndex: 4,
		isActive: true,
	},
	{
		key: "question",
		scope: "run",
		title: "Question",
		description: "Run paused waiting for user input",
		orderIndex: 5,
		isActive: true,
	},
	{
		key: "test_ok",
		scope: "run",
		title: "Test OK",
		description: "Tests passed",
		orderIndex: 6,
		isActive: true,
	},
	{
		key: "test_fail",
		scope: "run",
		title: "Test Fail",
		description: "Tests failed",
		orderIndex: 7,
		isActive: true,
	},
	{
		key: "timeout",
		scope: "run",
		title: "Timeout",
		description: "Run timed out",
		orderIndex: 8,
		isActive: true,
	},
	{
		key: "cancelled",
		scope: "run",
		title: "Cancelled",
		description: "Run cancelled",
		orderIndex: 9,
		isActive: true,
	},
	{
		key: "start_generation",
		scope: "user_action",
		title: "Start Generation",
		description: "User starts generation flow",
		orderIndex: 20,
		isActive: true,
	},
	{
		key: "start_execution",
		scope: "user_action",
		title: "Start Execution",
		description: "User starts execution flow",
		orderIndex: 21,
		isActive: true,
	},
	{
		key: "pause_run",
		scope: "user_action",
		title: "Pause Run",
		description: "User pauses execution",
		orderIndex: 22,
		isActive: true,
	},
	{
		key: "resume_run",
		scope: "user_action",
		title: "Resume Run",
		description: "User resumes execution",
		orderIndex: 23,
		isActive: true,
	},
	{
		key: "cancel_run",
		scope: "user_action",
		title: "Cancel Run",
		description: "User cancels execution",
		orderIndex: 24,
		isActive: true,
	},
	{
		key: "retry_run",
		scope: "user_action",
		title: "Retry Run",
		description: "User retries execution",
		orderIndex: 25,
		isActive: true,
	},
	{
		key: "approve_generation",
		scope: "user_action",
		title: "Approve Generation",
		description: "User approves generated story",
		orderIndex: 26,
		isActive: true,
	},
	{
		key: "reject_generation",
		scope: "user_action",
		title: "Reject Generation",
		description: "User rejects generated story",
		orderIndex: 27,
		isActive: true,
	},
	{
		key: "request_changes",
		scope: "user_action",
		title: "Request Changes",
		description: "User requests changes",
		orderIndex: 28,
		isActive: true,
	},
	{
		key: "mark_test_ok",
		scope: "user_action",
		title: "Mark Test OK",
		description: "User marks tests as passed",
		orderIndex: 29,
		isActive: true,
	},
	{
		key: "mark_test_fail",
		scope: "user_action",
		title: "Mark Test Fail",
		description: "User marks tests as failed",
		orderIndex: 30,
		isActive: true,
	},
	{
		key: "answer_question",
		scope: "user_action",
		title: "Answer Question",
		description: "User answers run question",
		orderIndex: 31,
		isActive: true,
	},
	{
		key: "reopen_task",
		scope: "user_action",
		title: "Reopen Task",
		description: "User reopens task",
		orderIndex: 32,
		isActive: true,
	},
];

const WORKFLOW_SIGNAL_RULES_FALLBACK: readonly WorkflowSignalRuleConfig[] = [
	{
		key: "rule-run-started-default",
		signalKey: "run_started",
		runKind: null,
		runStatus: "running",
		fromStatus: null,
		toStatus: "running",
	},
	{
		key: "rule-generation-started",
		signalKey: "generation_started",
		runKind: "task-description-improve",
		runStatus: "running",
		fromStatus: null,
		toStatus: "generating",
	},
	{
		key: "rule-generated-default",
		signalKey: "generated",
		runKind: "task-description-improve",
		runStatus: "completed",
		fromStatus: null,
		toStatus: "pending",
	},
	{
		key: "rule-done-generated",
		signalKey: "done",
		runKind: "task-description-improve",
		runStatus: "completed",
		fromStatus: null,
		toStatus: "pending",
	},
	{
		key: "rule-done-default",
		signalKey: "done",
		runKind: null,
		runStatus: "completed",
		fromStatus: null,
		toStatus: "done",
	},
	{
		key: "rule-fail-default",
		signalKey: "fail",
		runKind: null,
		runStatus: "failed",
		fromStatus: null,
		toStatus: "failed",
	},
	{
		key: "rule-test-ok-default",
		signalKey: "test_ok",
		runKind: null,
		runStatus: "completed",
		fromStatus: null,
		toStatus: "done",
	},
	{
		key: "rule-test-fail-default",
		signalKey: "test_fail",
		runKind: null,
		runStatus: "failed",
		fromStatus: null,
		toStatus: "failed",
	},
	{
		key: "rule-question-generated",
		signalKey: "question",
		runKind: "task-description-improve",
		runStatus: "paused",
		fromStatus: null,
		toStatus: "question",
	},
	{
		key: "rule-question-default",
		signalKey: "question",
		runKind: null,
		runStatus: "paused",
		fromStatus: null,
		toStatus: "paused",
	},
	{
		key: "rule-timeout-default",
		signalKey: "timeout",
		runKind: null,
		runStatus: "timeout",
		fromStatus: null,
		toStatus: "failed",
	},
	{
		key: "rule-cancelled-default",
		signalKey: "cancelled",
		runKind: null,
		runStatus: "cancelled",
		fromStatus: null,
		toStatus: "pending",
	},
	{
		key: "rule-user-start-generation",
		signalKey: "start_generation",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "generating",
	},
	{
		key: "rule-user-start-execution",
		signalKey: "start_execution",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "running",
	},
	{
		key: "rule-user-pause-run",
		signalKey: "pause_run",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "paused",
	},
	{
		key: "rule-user-resume-run",
		signalKey: "resume_run",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "running",
	},
	{
		key: "rule-user-cancel-run",
		signalKey: "cancel_run",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "pending",
	},
	{
		key: "rule-user-retry-run",
		signalKey: "retry_run",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "pending",
	},
	{
		key: "rule-user-approve-generation",
		signalKey: "approve_generation",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "pending",
	},
	{
		key: "rule-user-reject-generation",
		signalKey: "reject_generation",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "failed",
	},
	{
		key: "rule-user-request-changes",
		signalKey: "request_changes",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "question",
	},
	{
		key: "rule-user-mark-test-ok",
		signalKey: "mark_test_ok",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "done",
	},
	{
		key: "rule-user-mark-test-fail",
		signalKey: "mark_test_fail",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "failed",
	},
	{
		key: "rule-user-answer-question",
		signalKey: "answer_question",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "pending",
	},
	{
		key: "rule-user-reopen-task",
		signalKey: "reopen_task",
		runKind: null,
		runStatus: null,
		fromStatus: null,
		toStatus: "pending",
	},
];

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
	signalByKey: ReadonlyMap<string, WorkflowSignalConfig>;
	signalRulesBySignalKey: ReadonlyMap<
		string,
		readonly WorkflowSignalRuleConfig[]
	>;
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
		signalByKey: new Map(
			WORKFLOW_SIGNALS_FALLBACK.map((signal) => [signal.key, { ...signal }]),
		),
		signalRulesBySignalKey: buildSignalRuleIndex(
			WORKFLOW_SIGNAL_RULES_FALLBACK,
		),
	};
}

function buildSignalRuleIndex(
	rules: readonly WorkflowSignalRuleConfig[],
): ReadonlyMap<string, readonly WorkflowSignalRuleConfig[]> {
	const index = new Map<string, WorkflowSignalRuleConfig[]>();
	for (const rule of rules) {
		const bucket = index.get(rule.signalKey);
		if (bucket) {
			bucket.push({ ...rule });
			continue;
		}
		index.set(rule.signalKey, [{ ...rule }]);
	}

	for (const [signalKey, bucket] of index.entries()) {
		index.set(signalKey, bucket);
	}

	return index;
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

function hasWorkflowSignalTables(db: Database.Database): boolean {
	const existingTables = db
		.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${WORKFLOW_SIGNAL_TABLE_NAMES.map(() => "?").join(", ")})`,
		)
		.all(...WORKFLOW_SIGNAL_TABLE_NAMES) as Array<{ name: string }>;

	return existingTables.length === WORKFLOW_SIGNAL_TABLE_NAMES.length;
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

type WorkflowSignalRowWithOrder = {
	key: string;
	scope: string;
	title: string;
	description: string;
	orderIndex: number;
	isActive: number;
};

type WorkflowSignalRuleRow = {
	key: string;
	signalKey: string;
	runKind: string | null;
	runStatus: string | null;
	fromStatus: string | null;
	toStatus: string;
};

function toWorkflowConfig(
	statusRows: WorkflowStatusRowWithOrder[],
	templateRows: WorkflowColumnTemplateRowWithOrder[],
	allowedStatusRows: WorkflowAllowedStatusRow[],
	statusTransitionRows: WorkflowStatusTransitionRow[],
	columnTransitionRows: WorkflowColumnTransitionRow[],
	signalRows: WorkflowSignalRowWithOrder[],
	signalRuleRows: WorkflowSignalRuleRow[],
): WorkflowConfig | null {
	const statuses: WorkflowStatusConfig[] = [];
	for (const row of statusRows) {
		if (typeof row.status !== "string" || !row.status.trim()) {
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
		const statusIcon = normalizeWorkflowIconKey(row.icon);
		if (!row.color.trim() || !statusIcon) {
			return null;
		}

		statuses.push({
			status: row.status,
			orderIndex: row.orderIndex,
			preferredColumnSystemKey: row.preferredColumnSystemKey,
			blockedReason,
			closedReason,
			color: row.color,
			icon: statusIcon,
		});
	}

	const statusKeySet = new Set(statuses.map((row) => row.status));

	const allowedStatusesByColumn: Record<
		WorkflowColumnSystemKey,
		WorkflowTaskStatus[]
	> = {
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
			!statusKeySet.has(row.status)
		) {
			return null;
		}
		allowedStatusesByColumn[row.systemKey].push(row.status);
	}

	const columns: WorkflowColumnConfig[] = [];
	for (const row of templateRows) {
		const columnIcon = normalizeWorkflowIconKey(row.icon);
		if (
			!isWorkflowColumnSystemKey(row.systemKey) ||
			!statusKeySet.has(row.defaultStatus) ||
			!columnIcon
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
			icon: columnIcon,
			orderIndex: row.orderIndex,
			defaultStatus: row.defaultStatus,
			allowedStatuses: [...allowedStatusesByColumn[row.systemKey]],
		});
	}

	const statusTransitions: Record<WorkflowTaskStatus, WorkflowTaskStatus[]> =
		{};
	for (const status of statusKeySet) {
		statusTransitions[status] = [];
	}

	for (const row of statusTransitionRows) {
		if (!statusKeySet.has(row.fromStatus) || !statusKeySet.has(row.toStatus)) {
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

	const signals: WorkflowSignalConfig[] = [];
	for (const row of signalRows) {
		if (!isWorkflowSignalScope(row.scope)) {
			return null;
		}

		if (!Number.isInteger(row.orderIndex) || row.orderIndex < 0) {
			return null;
		}

		signals.push({
			key: row.key,
			scope: row.scope,
			title: row.title,
			description: row.description,
			orderIndex: row.orderIndex,
			isActive: row.isActive === 1,
		});
	}

	const normalizedSignals =
		signals.length > 0
			? signals
			: WORKFLOW_SIGNALS_FALLBACK.map((signal) => ({ ...signal }));
	const signalKeySet = new Set(normalizedSignals.map((signal) => signal.key));

	const signalRules: WorkflowSignalRuleConfig[] = [];
	for (const row of signalRuleRows) {
		if (!signalKeySet.has(row.signalKey)) {
			return null;
		}

		if (row.runStatus !== null && !isWorkflowRunStatus(row.runStatus)) {
			return null;
		}

		if (row.fromStatus !== null && !statusKeySet.has(row.fromStatus)) {
			return null;
		}

		if (!statusKeySet.has(row.toStatus)) {
			return null;
		}

		signalRules.push({
			key: row.key,
			signalKey: row.signalKey,
			runKind: row.runKind,
			runStatus: row.runStatus,
			fromStatus: row.fromStatus,
			toStatus: row.toStatus,
		});
	}

	const normalizedSignalRules =
		signalRules.length > 0
			? signalRules
			: WORKFLOW_SIGNAL_RULES_FALLBACK.map((rule) => ({ ...rule }));

	return {
		statuses,
		columns,
		statusTransitions,
		columnTransitions,
		signals: normalizedSignals,
		signalRules: normalizedSignalRules,
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

	const statusTransitions: Record<WorkflowTaskStatus, WorkflowTaskStatus[]> =
		{};
	for (const status of TASK_STATUS_VALUES) {
		statusTransitions[status] = [...STATUS_TRANSITIONS_FALLBACK[status]];
	}

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
		signals: WORKFLOW_SIGNALS_FALLBACK.map((signal) => ({ ...signal })),
		signalRules: WORKFLOW_SIGNAL_RULES_FALLBACK.map((rule) => ({ ...rule })),
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

	if (statusRows.length === 0) {
		return null;
	}

	if (templateRows.length !== WORKFLOW_COLUMN_SYSTEM_KEYS.length) {
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

	const signalRows = hasWorkflowSignalTables(db)
		? (db
				.prepare(
					`SELECT
         key,
         scope,
         title,
         description,
         order_index AS orderIndex,
         is_active AS isActive
       FROM workflow_signals
       ORDER BY order_index ASC`,
				)
				.all() as WorkflowSignalRowWithOrder[])
		: [];

	const signalRuleRows = hasWorkflowSignalTables(db)
		? (db
				.prepare(
					`SELECT
         key,
         signal_key AS signalKey,
         run_kind AS runKind,
         run_status AS runStatus,
         from_status AS fromStatus,
         to_status AS toStatus
       FROM workflow_signal_rules
       ORDER BY rowid ASC`,
				)
				.all() as WorkflowSignalRuleRow[])
		: [];

	return toWorkflowConfig(
		statusRows,
		templateRows,
		allowedStatusRows,
		statusTransitionRows,
		columnTransitionRows,
		signalRows,
		signalRuleRows,
	);
}

function validateWorkflowConfig(config: WorkflowConfig): void {
	if (config.statuses.length === 0) {
		throw new Error("Workflow config must include at least one status");
	}

	if (config.columns.length !== WORKFLOW_COLUMN_SYSTEM_KEYS.length) {
		throw new Error("Workflow config must include all workflow columns");
	}

	const seenStatuses = new Set<WorkflowTaskStatus>();
	const statusOrderIndexes = new Set<number>();
	for (const row of config.statuses) {
		const statusIcon = normalizeWorkflowIconKey(row.icon);
		if (!row.status.trim()) {
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
		if (!statusIcon) {
			throw new Error(`Invalid icon for status ${row.status}: ${row.icon}`);
		}
		row.icon = statusIcon;
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

	const seenColumns = new Set<WorkflowColumnSystemKey>();
	const columnOrderIndexes = new Set<number>();
	for (const row of config.columns) {
		const columnIcon = normalizeWorkflowIconKey(row.icon);
		if (!isWorkflowColumnSystemKey(row.systemKey)) {
			throw new Error(`Invalid column system key: ${String(row.systemKey)}`);
		}
		if (!row.name.trim()) {
			throw new Error(`Column ${row.systemKey} name cannot be empty`);
		}
		if (!row.color.trim()) {
			throw new Error(`Column ${row.systemKey} color cannot be empty`);
		}
		if (!columnIcon) {
			throw new Error(`Invalid icon for column ${row.systemKey}: ${row.icon}`);
		}
		row.icon = columnIcon;
		if (!seenStatuses.has(row.defaultStatus)) {
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

		const allowedSet = new Set<WorkflowTaskStatus>();
		for (const status of row.allowedStatuses) {
			if (!seenStatuses.has(status)) {
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

	for (const fromStatus of Object.keys(config.statusTransitions)) {
		if (!seenStatuses.has(fromStatus)) {
			throw new Error(
				`Unknown status transition source '${String(fromStatus)}'`,
			);
		}
	}

	for (const fromStatus of seenStatuses) {
		const nextStatuses = config.statusTransitions[fromStatus];
		if (!Array.isArray(nextStatuses)) {
			throw new Error(`Missing status transition row for ${fromStatus}`);
		}
		const nextStatusSet = new Set<WorkflowTaskStatus>();
		for (const toStatus of nextStatuses) {
			if (!seenStatuses.has(toStatus)) {
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

	if (!Array.isArray(config.signals) || config.signals.length === 0) {
		throw new Error("Workflow config must include at least one signal");
	}

	if (!Array.isArray(config.signalRules) || config.signalRules.length === 0) {
		throw new Error("Workflow config must include at least one signal rule");
	}

	const seenSignalKeys = new Set<string>();
	const seenSignalOrderIndexes = new Set<number>();
	const activeScopes = new Set<WorkflowSignalScope>();
	const signalByKey = new Map<string, WorkflowSignalConfig>();

	for (const signal of config.signals) {
		if (!signal.key.trim()) {
			throw new Error("Signal key cannot be empty");
		}
		if (!isWorkflowSignalScope(signal.scope)) {
			throw new Error(
				`Invalid signal scope for ${signal.key}: ${signal.scope}`,
			);
		}
		if (!signal.title.trim()) {
			throw new Error(`Signal ${signal.key} title cannot be empty`);
		}
		if (!Number.isInteger(signal.orderIndex) || signal.orderIndex < 0) {
			throw new Error(`Invalid signal order index for ${signal.key}`);
		}
		if (typeof signal.isActive !== "boolean") {
			throw new Error(`Signal ${signal.key} isActive must be boolean`);
		}
		if (seenSignalKeys.has(signal.key)) {
			throw new Error(`Duplicate signal key: ${signal.key}`);
		}
		if (seenSignalOrderIndexes.has(signal.orderIndex)) {
			throw new Error(`Duplicate signal order index: ${signal.orderIndex}`);
		}

		seenSignalKeys.add(signal.key);
		seenSignalOrderIndexes.add(signal.orderIndex);
		signalByKey.set(signal.key, signal);
		if (signal.isActive) {
			activeScopes.add(signal.scope);
		}
	}

	for (const scope of WORKFLOW_SIGNAL_SCOPES) {
		if (!activeScopes.has(scope)) {
			throw new Error(
				`Workflow config must include active signal scope: ${scope}`,
			);
		}
	}

	const seenRuleKeys = new Set<string>();
	const seenRuleSelectors = new Set<string>();
	for (const rule of config.signalRules) {
		if (!rule.key.trim()) {
			throw new Error("Signal rule key cannot be empty");
		}
		if (seenRuleKeys.has(rule.key)) {
			throw new Error(`Duplicate signal rule key: ${rule.key}`);
		}
		seenRuleKeys.add(rule.key);

		const signal = signalByKey.get(rule.signalKey);
		if (!signal) {
			throw new Error(`Signal rule ${rule.key} references unknown signal`);
		}

		if (rule.runStatus !== null && !isWorkflowRunStatus(rule.runStatus)) {
			throw new Error(`Invalid run status in signal rule ${rule.key}`);
		}

		if (rule.fromStatus !== null && !seenStatuses.has(rule.fromStatus)) {
			throw new Error(`Invalid fromStatus in signal rule ${rule.key}`);
		}

		if (!seenStatuses.has(rule.toStatus)) {
			throw new Error(`Invalid toStatus in signal rule ${rule.key}`);
		}

		if (
			signal.scope !== "run" &&
			(rule.runStatus !== null || rule.runKind !== null)
		) {
			throw new Error(
				`Signal rule ${rule.key} can use run selectors only for run signals`,
			);
		}

		const selectorKey = [
			rule.signalKey,
			rule.runKind ?? "",
			rule.runStatus ?? "",
			rule.fromStatus ?? "",
		].join("|");
		if (seenRuleSelectors.has(selectorKey)) {
			throw new Error(
				`Duplicate signal rule selector for signal ${rule.signalKey}`,
			);
		}
		seenRuleSelectors.add(selectorKey);
	}
}

function parseStatusList(value: unknown): WorkflowTaskStatus[] | null {
	if (!Array.isArray(value)) {
		return null;
	}

	const statuses: WorkflowTaskStatus[] = [];
	for (const item of value) {
		if (typeof item !== "string" || !item.trim()) {
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
	const signalsValue = value.signals;
	const signalRulesValue = value.signalRules;

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
		const statusIcon =
			typeof icon === "string" ? normalizeWorkflowIconKey(icon) : null;

		if (
			typeof status !== "string" ||
			!status.trim() ||
			typeof preferredColumnSystemKey !== "string" ||
			!isWorkflowColumnSystemKey(preferredColumnSystemKey) ||
			typeof color !== "string" ||
			!color.trim() ||
			!statusIcon ||
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
			icon: statusIcon,
		});
	}

	const statusKeySet = new Set(statuses.map((row) => row.status));

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
		const columnIcon =
			typeof icon === "string" ? normalizeWorkflowIconKey(icon) : null;

		if (
			typeof systemKey !== "string" ||
			!isWorkflowColumnSystemKey(systemKey) ||
			typeof name !== "string" ||
			typeof color !== "string" ||
			!color.trim() ||
			!columnIcon ||
			typeof orderIndex !== "number" ||
			!Number.isInteger(orderIndex) ||
			orderIndex < 0 ||
			typeof defaultStatus !== "string" ||
			!statusKeySet.has(defaultStatus)
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
			icon: columnIcon,
			orderIndex,
			defaultStatus,
			allowedStatuses: parsedAllowedStatuses,
		});
	}

	const statusTransitions: Record<WorkflowTaskStatus, WorkflowTaskStatus[]> =
		{};

	for (const status of statusKeySet) {
		const parsedStatuses = parseStatusList(statusTransitionsValue[status]);
		if (!parsedStatuses) {
			return null;
		}
		for (const parsedStatus of parsedStatuses) {
			if (!statusKeySet.has(parsedStatus)) {
				return null;
			}
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

	let signals = WORKFLOW_SIGNALS_FALLBACK.map((signal) => ({ ...signal }));
	if (signalsValue !== undefined) {
		if (!Array.isArray(signalsValue)) {
			return null;
		}

		signals = [];
		for (const item of signalsValue) {
			if (!isRecord(item)) {
				return null;
			}

			const { key, scope, title, description, orderIndex, isActive } = item;
			if (
				typeof key !== "string" ||
				!key.trim() ||
				typeof scope !== "string" ||
				!isWorkflowSignalScope(scope) ||
				typeof title !== "string" ||
				!title.trim() ||
				typeof description !== "string" ||
				typeof orderIndex !== "number" ||
				!Number.isInteger(orderIndex) ||
				orderIndex < 0 ||
				typeof isActive !== "boolean"
			) {
				return null;
			}

			signals.push({
				key,
				scope,
				title,
				description,
				orderIndex,
				isActive,
			});
		}
	}

	let signalRules = WORKFLOW_SIGNAL_RULES_FALLBACK.map((rule) => ({ ...rule }));
	if (signalRulesValue !== undefined) {
		if (!Array.isArray(signalRulesValue)) {
			return null;
		}

		signalRules = [];
		for (const item of signalRulesValue) {
			if (!isRecord(item)) {
				return null;
			}

			const { key, signalKey, runKind, runStatus, fromStatus, toStatus } = item;
			if (
				typeof key !== "string" ||
				!key.trim() ||
				typeof signalKey !== "string" ||
				!signalKey.trim() ||
				(runKind !== null &&
					runKind !== undefined &&
					typeof runKind !== "string") ||
				(runStatus !== null &&
					runStatus !== undefined &&
					(typeof runStatus !== "string" || !isWorkflowRunStatus(runStatus))) ||
				(fromStatus !== null &&
					fromStatus !== undefined &&
					(typeof fromStatus !== "string" || !statusKeySet.has(fromStatus))) ||
				typeof toStatus !== "string" ||
				!statusKeySet.has(toStatus)
			) {
				return null;
			}

			signalRules.push({
				key,
				signalKey,
				runKind: typeof runKind === "string" ? runKind : null,
				runStatus:
					typeof runStatus === "string" && isWorkflowRunStatus(runStatus)
						? runStatus
						: null,
				fromStatus:
					typeof fromStatus === "string" && statusKeySet.has(fromStatus)
						? fromStatus
						: null,
				toStatus,
			});
		}
	}

	return {
		statuses,
		columns,
		statusTransitions,
		columnTransitions,
		signals,
		signalRules,
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
	const shouldPersistSignals = hasWorkflowSignalTables(db);

	const replaceConfig = db.transaction(() => {
		if (shouldPersistSignals) {
			db.prepare(`DELETE FROM workflow_signal_rules`).run();
			db.prepare(`DELETE FROM workflow_signals`).run();
		}

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
		for (const [fromStatus, toStatuses] of Object.entries(
			config.statusTransitions,
		)) {
			for (const toStatus of toStatuses) {
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

		if (shouldPersistSignals) {
			const insertSignal = db.prepare(
				`INSERT INTO workflow_signals (
         key,
         scope,
         title,
         description,
         order_index,
         is_active
       ) VALUES (?, ?, ?, ?, ?, ?)`,
			);
			for (const signal of config.signals) {
				insertSignal.run(
					signal.key,
					signal.scope,
					signal.title,
					signal.description,
					signal.orderIndex,
					signal.isActive ? 1 : 0,
				);
			}

			const insertSignalRule = db.prepare(
				`INSERT INTO workflow_signal_rules (
         key,
         signal_key,
         run_kind,
         run_status,
         from_status,
         to_status
       ) VALUES (?, ?, ?, ?, ?, ?)`,
			);
			for (const rule of config.signalRules) {
				insertSignalRule.run(
					rule.key,
					rule.signalKey,
					rule.runKind,
					rule.runStatus,
					rule.fromStatus,
					rule.toStatus,
				);
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

	const statusToColumn: Record<WorkflowTaskStatus, WorkflowColumnSystemKey> = {
		...STATUS_TO_WORKFLOW_COLUMN_FALLBACK,
	};
	const blockedReasonByStatus: Record<
		WorkflowTaskStatus,
		BlockedReason | null
	> = {
		...BLOCKED_REASON_BY_STATUS_FALLBACK,
	};
	const closedReasonByStatus: Record<WorkflowTaskStatus, ClosedReason | null> =
		{
			...CLOSED_REASON_BY_STATUS_FALLBACK,
		};

	for (const row of workflowConfig.statuses) {
		statusToColumn[row.status] = row.preferredColumnSystemKey;
		blockedReasonByStatus[row.status] = row.blockedReason;
		closedReasonByStatus[row.status] = row.closedReason;
	}

	const defaultColumns: WorkflowColumnTemplate[] = [];
	const columnDefaultStatus: Record<
		WorkflowColumnSystemKey,
		WorkflowTaskStatus
	> = {
		...COLUMN_DEFAULT_STATUS_FALLBACK,
	};
	const columnAllowedStatuses: Record<
		WorkflowColumnSystemKey,
		readonly WorkflowTaskStatus[]
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
		signalByKey: new Map(
			workflowConfig.signals.map((signal) => [signal.key, signal]),
		),
		signalRulesBySignalKey: buildSignalRuleIndex(workflowConfig.signalRules),
	};
}

export interface ResolveTaskStatusBySignalInput {
	signalKey: string;
	currentStatus: WorkflowTaskStatus;
	runKind?: string | null;
	runStatus?: WorkflowRunStatus | null;
	scope?: WorkflowSignalScope;
}

export function resolveTaskStatusBySignal(
	input: ResolveTaskStatusBySignalInput,
): WorkflowTaskStatus | null {
	const runtime = getRuntimeConfig();
	const signal = runtime.signalByKey.get(input.signalKey);
	if (!signal || !signal.isActive) {
		return null;
	}

	if (input.scope && signal.scope !== input.scope) {
		return null;
	}

	const rules = runtime.signalRulesBySignalKey.get(input.signalKey);
	if (!rules || rules.length === 0) {
		return null;
	}

	const runKind = input.runKind ?? null;
	const runStatus = input.runStatus ?? null;

	let selectedRule: WorkflowSignalRuleConfig | null = null;
	let selectedScore = Number.NEGATIVE_INFINITY;

	for (const rule of rules) {
		if (rule.runKind !== null && rule.runKind !== runKind) {
			continue;
		}

		if (rule.runStatus !== null && rule.runStatus !== runStatus) {
			continue;
		}

		if (rule.fromStatus !== null && rule.fromStatus !== input.currentStatus) {
			continue;
		}

		const score =
			(rule.fromStatus !== null ? 4 : 0) +
			(rule.runStatus !== null ? 2 : 0) +
			(rule.runKind !== null ? 1 : 0);

		if (score > selectedScore) {
			selectedRule = rule;
			selectedScore = score;
		}
	}

	return selectedRule?.toStatus ?? null;
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

export function isWorkflowSignalScope(
	value: string,
): value is WorkflowSignalScope {
	return (WORKFLOW_SIGNAL_SCOPES as readonly string[]).includes(value);
}

export function isWorkflowRunStatus(value: string): value is WorkflowRunStatus {
	return (RUN_STATUS_VALUES as readonly string[]).includes(value);
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

export function canTransitionStatus(
	from: WorkflowTaskStatus,
	to: WorkflowTaskStatus,
): boolean {
	if (!isWorkflowTaskStatus(from) || !isWorkflowTaskStatus(to)) {
		return false;
	}

	if (from === to) {
		return true;
	}

	return (getRuntimeConfig().statusTransitions[from] ?? []).includes(to);
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
	status: WorkflowTaskStatus,
	systemKey: WorkflowColumnSystemKey,
): boolean {
	return getRuntimeConfig().columnAllowedStatuses[systemKey].includes(status);
}

export function getDefaultStatusForWorkflowColumn(
	systemKey: WorkflowColumnSystemKey,
	currentStatus?: WorkflowTaskStatus,
): WorkflowTaskStatus {
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
	status: WorkflowTaskStatus,
): string | null {
	const systemKey = getRuntimeConfig().statusToColumn[status];
	if (!systemKey) {
		return null;
	}
	return getWorkflowColumnIdBySystemKey(board, systemKey);
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
