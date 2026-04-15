import type {
	WorkflowColumnConfig,
	WorkflowColumnSystemKey,
	WorkflowConfig,
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
	generating: "backlog",
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
	backlog: ["pending", "generating"],
	ready: ["pending"],
	deferred: ["pending"],
	in_progress: ["running"],
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
};

export function useWorkflowDisplayConfig(): WorkflowConfig | null {
	return WORKFLOW_DISPLAY_CONFIG;
}

export function resetWorkflowDisplayConfigCacheForTests(): void {}
