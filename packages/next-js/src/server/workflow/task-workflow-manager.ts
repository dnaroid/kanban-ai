import type { Board } from "@/server/types";
import type { RunStatus } from "@/types/ipc";
import type { BlockedReason, ClosedReason } from "@/types/kanban";
import type { WorkflowIconKey } from "@/types/workflow";
import { normalizeWorkflowIconKey } from "@/types/workflow";

export const WORKFLOW_COLUMN_SYSTEM_KEYS = [
	"backlog",
	"ready",
	"deferred",
	"in_progress",
	"blocked",
	"review",
	"closed",
] as const;

export type WorkflowColumnSystemKey = string;

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
	fromColumnSystemKey?: WorkflowColumnSystemKey | null;
	fromStatus: WorkflowTaskStatus | null;
	toStatus: WorkflowTaskStatus;
}

export interface WorkflowConfig {
	statuses: WorkflowStatusConfig[];
	columns: WorkflowColumnConfig[];
	statusTransitions: Record<WorkflowTaskStatus, WorkflowTaskStatus[]>;
	columnTransitions: Record<string, string[]>;
	signals: WorkflowSignalConfig[];
	signalRules: WorkflowSignalRuleConfig[];
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

function createSignal(
	key: string,
	scope: WorkflowSignalScope,
	title: string,
	description: string,
	orderIndex: number,
	isActive = true,
): WorkflowSignalConfig {
	return { key, scope, title, description, orderIndex, isActive };
}

function createSignalRule(
	key: string,
	signalKey: string,
	toStatus: WorkflowTaskStatus,
	options: {
		runKind?: string | null;
		runStatus?: WorkflowRunStatus | null;
		fromColumnSystemKey?: WorkflowColumnSystemKey | null;
		fromStatus?: WorkflowTaskStatus | null;
	} = {},
): WorkflowSignalRuleConfig {
	return {
		key,
		signalKey,
		runKind: options.runKind ?? null,
		runStatus: options.runStatus ?? null,
		fromColumnSystemKey: options.fromColumnSystemKey ?? null,
		fromStatus: options.fromStatus ?? null,
		toStatus,
	};
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

const WORKFLOW_SIGNALS_FALLBACK: readonly WorkflowSignalConfig[] = [
	createSignal("run_started", "run", "Run Started", "Execution run started", 0),
	createSignal(
		"generation_started",
		"run",
		"Generation Started",
		"User story generation run started",
		1,
	),
	createSignal(
		"testing_started",
		"run",
		"Testing Started",
		"QA testing run started",
		2,
	),
	createSignal(
		"generated",
		"run",
		"Generated",
		"Generation output produced",
		3,
	),
	createSignal("done", "run", "Done", "Run completed successfully", 4),
	createSignal("fail", "run", "Fail", "Run failed", 5),
	createSignal(
		"question",
		"run",
		"Question",
		"Run paused waiting for user input",
		6,
	),
	createSignal("test_ok", "run", "Test OK", "Tests passed", 7),
	createSignal("test_fail", "run", "Test Fail", "Tests failed", 8),
	createSignal("timeout", "run", "Timeout", "Run timed out", 9),
	createSignal("cancelled", "run", "Cancelled", "Run cancelled", 10),
	createSignal(
		"start_generation",
		"user_action",
		"Start Generation",
		"User starts generation flow",
		20,
	),
	createSignal(
		"start_execution",
		"user_action",
		"Start Execution",
		"User starts execution flow",
		21,
	),
	createSignal(
		"pause_run",
		"user_action",
		"Pause Run",
		"User pauses execution",
		22,
	),
	createSignal(
		"resume_run",
		"user_action",
		"Resume Run",
		"User resumes execution",
		23,
	),
	createSignal(
		"cancel_run",
		"user_action",
		"Cancel Run",
		"User cancels execution",
		24,
	),
	createSignal(
		"retry_run",
		"user_action",
		"Retry Run",
		"User retries execution",
		25,
	),
	createSignal(
		"approve_generation",
		"user_action",
		"Approve Generation",
		"User approves generated story",
		26,
	),
	createSignal(
		"reject_generation",
		"user_action",
		"Reject Generation",
		"User rejects generated story",
		27,
	),
	createSignal(
		"request_changes",
		"user_action",
		"Request Changes",
		"User requests changes",
		28,
	),
	createSignal(
		"mark_test_ok",
		"user_action",
		"Mark Test OK",
		"User marks tests as passed",
		29,
	),
	createSignal(
		"mark_test_fail",
		"user_action",
		"Mark Test Fail",
		"User marks tests as failed",
		30,
	),
	createSignal(
		"answer_question",
		"user_action",
		"Answer Question",
		"User answers run question",
		31,
	),
	createSignal(
		"reopen_task",
		"user_action",
		"Reopen Task",
		"User reopens task",
		32,
	),
	createSignal(
		"queue_ready_pending",
		"user_action",
		"Queue Ready Pending",
		"User queues tasks for execution using rule selectors",
		33,
	),
];

const WORKFLOW_SIGNAL_RULES_FALLBACK: readonly WorkflowSignalRuleConfig[] = [
	createSignalRule("rule-run-started-default", "run_started", "running", {
		runStatus: "running",
	}),
	createSignalRule(
		"rule-generation-started",
		"generation_started",
		"generating",
		{ runKind: "task-description-improve", runStatus: "running" },
	),
	createSignalRule("rule-testing-started", "testing_started", "running", {
		runKind: "task-qa-testing",
		runStatus: "running",
	}),
	createSignalRule("rule-generated-default", "generated", "pending", {
		runKind: "task-description-improve",
		runStatus: "completed",
	}),
	createSignalRule("rule-done-generated", "done", "pending", {
		runKind: "task-description-improve",
		runStatus: "completed",
	}),
	createSignalRule("rule-done-default", "done", "done", {
		runStatus: "completed",
	}),
	createSignalRule("rule-fail-default", "fail", "failed", {
		runStatus: "failed",
	}),
	createSignalRule("rule-test-ok-default", "test_ok", "done", {
		runStatus: "completed",
	}),
	createSignalRule("rule-test-fail-default", "test_fail", "failed", {
		runStatus: "failed",
	}),
	createSignalRule("rule-question-generated", "question", "question", {
		runKind: "task-description-improve",
		runStatus: "paused",
	}),
	createSignalRule("rule-question-default", "question", "paused", {
		runStatus: "paused",
	}),
	createSignalRule("rule-timeout-default", "timeout", "failed", {
		runStatus: "timeout",
	}),
	createSignalRule("rule-cancelled-default", "cancelled", "pending", {
		runStatus: "cancelled",
	}),
	createSignalRule(
		"rule-user-start-generation",
		"start_generation",
		"generating",
	),
	createSignalRule("rule-user-start-execution", "start_execution", "running"),
	createSignalRule("rule-user-pause-run", "pause_run", "paused"),
	createSignalRule("rule-user-resume-run", "resume_run", "running"),
	createSignalRule("rule-user-cancel-run", "cancel_run", "pending"),
	createSignalRule("rule-user-retry-run", "retry_run", "pending"),
	createSignalRule(
		"rule-user-approve-generation",
		"approve_generation",
		"pending",
	),
	createSignalRule(
		"rule-user-reject-generation",
		"reject_generation",
		"failed",
	),
	createSignalRule("rule-user-request-changes", "request_changes", "question"),
	createSignalRule("rule-user-mark-test-ok", "mark_test_ok", "done"),
	createSignalRule("rule-user-mark-test-fail", "mark_test_fail", "failed"),
	createSignalRule("rule-user-answer-question", "answer_question", "pending"),
	createSignalRule("rule-user-reopen-task", "reopen_task", "pending"),
	createSignalRule(
		"rule-user-queue-ready-pending",
		"queue_ready_pending",
		"running",
		{ fromColumnSystemKey: "ready", fromStatus: "pending" },
	),
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
		signals: WORKFLOW_SIGNALS_FALLBACK.map(function cloneSignalConfig(signal) {
			return { ...signal };
		}),
		signalRules: WORKFLOW_SIGNAL_RULES_FALLBACK.map(
			function cloneSignalRule(rule) {
				return { ...rule };
			},
		),
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
		signalByKey: new Map(
			config.signals.map(function toEntry(signal) {
				return [signal.key, signal] as const;
			}),
		),
		signalRulesBySignalKey: buildSignalRuleIndex(config.signalRules),
	};
}

function buildSignalRuleIndex(
	rules: readonly WorkflowSignalRuleConfig[],
): ReadonlyMap<string, readonly WorkflowSignalRuleConfig[]> {
	const index = new Map<string, WorkflowSignalRuleConfig[]>();
	for (const rule of rules) {
		const bucket = index.get(rule.signalKey);
		if (bucket) bucket.push({ ...rule });
		else index.set(rule.signalKey, [{ ...rule }]);
	}
	return index;
}

function getRuntimeConfig(): WorkflowRuntimeConfig {
	if (!runtimeConfig) runtimeConfig = createRuntimeConfig();
	return runtimeConfig;
}

export interface ResolveTaskStatusBySignalInput {
	signalKey: string;
	currentStatus: WorkflowTaskStatus;
	runKind?: string | null;
	runStatus?: WorkflowRunStatus | null;
	currentColumnSystemKey?: WorkflowColumnSystemKey | null;
	scope?: WorkflowSignalScope;
}

export function resolveTaskStatusBySignal(
	input: ResolveTaskStatusBySignalInput,
): WorkflowTaskStatus | null {
	const runtime = getRuntimeConfig();
	const signal = runtime.signalByKey.get(input.signalKey);
	if (!signal || !signal.isActive) return null;
	if (input.scope && signal.scope !== input.scope) return null;

	const rules = runtime.signalRulesBySignalKey.get(input.signalKey);
	if (!rules || rules.length === 0) return null;

	const runKind = input.runKind ?? null;
	const runStatus = input.runStatus ?? null;
	const currentColumnSystemKey = input.currentColumnSystemKey ?? null;
	let selectedRule: WorkflowSignalRuleConfig | null = null;
	let selectedScore = Number.NEGATIVE_INFINITY;

	for (const rule of rules) {
		const ruleFromColumnSystemKey = rule.fromColumnSystemKey ?? null;
		if (
			ruleFromColumnSystemKey !== null &&
			ruleFromColumnSystemKey !== currentColumnSystemKey
		)
			continue;
		if (rule.runKind !== null && rule.runKind !== runKind) continue;
		if (rule.runStatus !== null && rule.runStatus !== runStatus) continue;
		if (rule.fromStatus !== null && rule.fromStatus !== input.currentStatus)
			continue;

		const score =
			(ruleFromColumnSystemKey !== null ? 8 : 0) +
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

export function isWorkflowSignalScope(
	value: string,
): value is WorkflowSignalScope {
	return (WORKFLOW_SIGNAL_SCOPES as readonly string[]).includes(value);
}

export function isWorkflowRunStatus(value: string): value is WorkflowRunStatus {
	return (RUN_STATUS_VALUES as readonly string[]).includes(value);
}

export function resetWorkflowRuntimeConfigForTests(): void {
	runtimeConfig = null;
}
