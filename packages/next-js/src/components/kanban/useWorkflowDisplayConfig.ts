import type {
	WorkflowColumnConfig,
	WorkflowColumnSystemKey,
	WorkflowConfig,
	WorkflowSignalConfig,
	WorkflowSignalRuleConfig,
	WorkflowStatusConfig,
	WorkflowTaskStatus,
} from "@/server/workflow/task-workflow-manager";
import { WORKFLOW_COLUMN_SYSTEM_KEYS } from "@/server/workflow/task-workflow-manager";
import type { BlockedReason, ClosedReason } from "@/types/kanban";
import type { WorkflowIconKey } from "@/types/workflow";
import { normalizeWorkflowIconKey } from "@/types/workflow";

const TASK_STATUSES: readonly WorkflowTaskStatus[] = [
	"pending",
	"running",
	"question",
	"paused",
	"done",
	"failed",
	"generating",
];

const BLOCKED_REASON_BY_STATUS: Record<
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

const CLOSED_REASON_BY_STATUS: Record<WorkflowTaskStatus, ClosedReason | null> =
	{
		pending: null,
		running: null,
		question: null,
		paused: null,
		done: "done",
		failed: "failed",
		generating: null,
	};

const STATUS_VISUALS: Record<
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

const STATUS_TO_COLUMN: Record<WorkflowTaskStatus, WorkflowColumnSystemKey> = {
	pending: "ready",
	running: "in_progress",
	question: "blocked",
	paused: "blocked",
	done: "review",
	failed: "blocked",
	generating: "in_progress",
};

const COLUMN_TEMPLATES: Record<
	WorkflowColumnSystemKey,
	{ name: string; color: string; icon: WorkflowIconKey }
> = {
	backlog: { name: "Backlog", color: "#6366f1", icon: "list" },
	ready: { name: "Ready", color: "#0ea5e9", icon: "check-circle" },
	deferred: { name: "Deferred", color: "#6b7280", icon: "clock" },
	in_progress: { name: "In Progress", color: "#f59e0b", icon: "play" },
	blocked: { name: "Blocked", color: "#ef4444", icon: "shield-alert" },
	review: { name: "Review / QA", color: "#8b5cf6", icon: "eye" },
	closed: { name: "Closed", color: "#10b981", icon: "archive" },
};

const COLUMN_DEFAULT_STATUS: Record<
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

const COLUMN_ALLOWED_STATUSES: Record<
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

const STATUS_TRANSITIONS: Record<
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

const SIGNALS: readonly WorkflowSignalConfig[] = [
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
		key: "testing_started",
		scope: "run",
		title: "Testing Started",
		description: "QA testing run started",
		orderIndex: 2,
		isActive: true,
	},
	{
		key: "generated",
		scope: "run",
		title: "Generated",
		description: "Generation output produced",
		orderIndex: 3,
		isActive: true,
	},
	{
		key: "done",
		scope: "run",
		title: "Done",
		description: "Run completed successfully",
		orderIndex: 4,
		isActive: true,
	},
	{
		key: "fail",
		scope: "run",
		title: "Fail",
		description: "Run failed",
		orderIndex: 5,
		isActive: true,
	},
	{
		key: "question",
		scope: "run",
		title: "Question",
		description: "Run paused waiting for user input",
		orderIndex: 6,
		isActive: true,
	},
	{
		key: "test_ok",
		scope: "run",
		title: "Test OK",
		description: "Tests passed",
		orderIndex: 7,
		isActive: true,
	},
	{
		key: "test_fail",
		scope: "run",
		title: "Test Fail",
		description: "Tests failed",
		orderIndex: 8,
		isActive: true,
	},
	{
		key: "timeout",
		scope: "run",
		title: "Timeout",
		description: "Run timed out",
		orderIndex: 9,
		isActive: true,
	},
	{
		key: "cancelled",
		scope: "run",
		title: "Cancelled",
		description: "Run cancelled",
		orderIndex: 10,
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
	{
		key: "queue_ready_pending",
		scope: "user_action",
		title: "Queue Ready Pending",
		description: "User queues tasks for execution using rule selectors",
		orderIndex: 33,
		isActive: true,
	},
];

const SIGNAL_RULES: readonly WorkflowSignalRuleConfig[] = [
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
		key: "rule-testing-started",
		signalKey: "testing_started",
		runKind: "task-qa-testing",
		runStatus: "running",
		fromStatus: null,
		toStatus: "running",
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
	{
		key: "rule-user-queue-ready-pending",
		signalKey: "queue_ready_pending",
		runKind: null,
		runStatus: null,
		fromColumnSystemKey: "ready",
		fromStatus: "pending",
		toStatus: "running",
	},
];

function buildWorkflowStatuses(): WorkflowStatusConfig[] {
	return TASK_STATUSES.map(function mapStatus(status, orderIndex) {
		const visual = STATUS_VISUALS[status];
		return {
			status,
			orderIndex,
			preferredColumnSystemKey: STATUS_TO_COLUMN[status],
			blockedReason: BLOCKED_REASON_BY_STATUS[status],
			closedReason: CLOSED_REASON_BY_STATUS[status],
			color: visual.color,
			icon: normalizeWorkflowIconKey(visual.icon) ?? "list",
		};
	});
}

function buildWorkflowColumns(): WorkflowColumnConfig[] {
	return WORKFLOW_COLUMN_SYSTEM_KEYS.map(
		function mapColumn(systemKey, orderIndex) {
			const template = COLUMN_TEMPLATES[systemKey];
			return {
				systemKey,
				name: template?.name ?? systemKey,
				color: template?.color ?? "#6b7280",
				icon: normalizeWorkflowIconKey(template?.icon ?? "list") ?? "list",
				orderIndex,
				defaultStatus: COLUMN_DEFAULT_STATUS[systemKey],
				allowedStatuses: [...COLUMN_ALLOWED_STATUSES[systemKey]],
			};
		},
	);
}

function buildStatusTransitions(): Record<string, string[]> {
	const result: Record<string, string[]> = {};
	for (const status of TASK_STATUSES) {
		result[status] = [...STATUS_TRANSITIONS[status]];
	}
	return result;
}

function buildColumnTransitions(): Record<string, string[]> {
	const result: Record<string, string[]> = {};
	for (const [from, to] of Object.entries(COLUMN_TRANSITIONS)) {
		result[from] = [...to];
	}
	return result;
}

const WORKFLOW_DISPLAY_CONFIG: WorkflowConfig = {
	statuses: buildWorkflowStatuses(),
	columns: buildWorkflowColumns(),
	statusTransitions: buildStatusTransitions(),
	columnTransitions: buildColumnTransitions(),
	signals: SIGNALS.map(function clone(s) {
		return { ...s };
	}),
	signalRules: SIGNAL_RULES.map(function clone(r) {
		return { ...r };
	}),
};

export function useWorkflowDisplayConfig(): WorkflowConfig | null {
	return WORKFLOW_DISPLAY_CONFIG;
}

export function resetWorkflowDisplayConfigCacheForTests(): void {}
