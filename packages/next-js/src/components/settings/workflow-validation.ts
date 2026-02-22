import type {
	WorkflowConfig,
	WorkflowColumnSystemKey,
	WorkflowRunStatus,
	WorkflowSignalScope,
} from "@/lib/api-client";
import { isWorkflowIconKey } from "@/types/workflow";

export interface WorkflowValidationError {
	path: string;
	message: string;
}

export function validateWorkflowConfig(
	config: WorkflowConfig,
): WorkflowValidationError[] {
	const errors: WorkflowValidationError[] = [];
	const allowedSignalScopes = new Set<WorkflowSignalScope>([
		"run",
		"user_action",
	]);
	const allowedRunStatuses = new Set<WorkflowRunStatus>([
		"queued",
		"running",
		"completed",
		"failed",
		"cancelled",
		"timeout",
		"paused",
	]);

	// Validate Columns
	const columnSystemKeys = new Set<WorkflowColumnSystemKey>();
	const columnOrderIndexes = new Set<number>();
	const columnNames = new Set<string>();

	config.columns.forEach((col, index) => {
		const path = `columns[${index}]`;

		if (!col.name.trim()) {
			errors.push({ path: `${path}.name`, message: "Name is required" });
		}
		if (columnNames.has(col.name)) {
			errors.push({ path: `${path}.name`, message: "Duplicate column name" });
		}
		columnNames.add(col.name);

		if (!col.color.trim()) {
			errors.push({ path: `${path}.color`, message: "Color is required" });
		}

		if (!isWorkflowIconKey(col.icon)) {
			errors.push({ path: `${path}.icon`, message: "Invalid icon" });
		}

		if (columnSystemKeys.has(col.systemKey)) {
			errors.push({
				path: `${path}.systemKey`,
				message: `Duplicate system key: ${col.systemKey}`,
			});
		}
		columnSystemKeys.add(col.systemKey);

		if (columnOrderIndexes.has(col.orderIndex)) {
			errors.push({
				path: `${path}.orderIndex`,
				message: `Duplicate order index: ${col.orderIndex}`,
			});
		}
		columnOrderIndexes.add(col.orderIndex);

		if (!col.allowedStatuses.includes(col.defaultStatus)) {
			errors.push({
				path: `${path}.defaultStatus`,
				message: "Default status must be in allowed statuses",
			});
		}

		if (col.allowedStatuses.length === 0) {
			errors.push({
				path: `${path}.allowedStatuses`,
				message: "At least one allowed status is required",
			});
		}
	});

	// Validate Statuses
	const statusKeys = new Set<string>();
	const statusOrderIndexes = new Set<number>();

	config.statuses.forEach((status, index) => {
		const path = `statuses[${index}]`;

		if (statusKeys.has(status.status)) {
			errors.push({
				path: `${path}.status`,
				message: `Duplicate status: ${status.status}`,
			});
		}
		statusKeys.add(status.status);

		if (statusOrderIndexes.has(status.orderIndex)) {
			errors.push({
				path: `${path}.orderIndex`,
				message: `Duplicate order index: ${status.orderIndex}`,
			});
		}
		statusOrderIndexes.add(status.orderIndex);

		if (!columnSystemKeys.has(status.preferredColumnSystemKey)) {
			errors.push({
				path: `${path}.preferredColumnSystemKey`,
				message: `Invalid column system key: ${status.preferredColumnSystemKey}`,
			});
		}

		if (!status.color.trim()) {
			errors.push({ path: `${path}.color`, message: "Color is required" });
		}

		if (!isWorkflowIconKey(status.icon)) {
			errors.push({ path: `${path}.icon`, message: "Invalid icon" });
		}
	});

	// Validate Transitions (Status)
	Object.keys(config.statusTransitions).forEach((fromStatus) => {
		const transitions = config.statusTransitions[fromStatus];
		transitions.forEach((toStatus, idx) => {
			if (!statusKeys.has(toStatus)) {
				errors.push({
					path: `statusTransitions.${fromStatus}[${idx}]`,
					message: `Invalid target status: ${toStatus}`,
				});
			}
		});
	});

	// Validate Transitions (Column)
	Object.keys(config.columnTransitions).forEach((fromCol) => {
		const transitions =
			config.columnTransitions[fromCol as WorkflowColumnSystemKey];
		transitions.forEach((toCol, idx) => {
			if (!columnSystemKeys.has(toCol)) {
				errors.push({
					path: `columnTransitions.${fromCol}[${idx}]`,
					message: `Invalid target column: ${toCol}`,
				});
			}
		});
	});

	const signalKeys = new Set<string>();
	const signalOrderIndexes = new Set<number>();
	const activeSignalScopes = new Set<WorkflowSignalScope>();

	config.signals.forEach((signal, index) => {
		const path = `signals[${index}]`;

		if (!signal.key.trim()) {
			errors.push({ path: `${path}.key`, message: "Key is required" });
		}
		if (signalKeys.has(signal.key)) {
			errors.push({
				path: `${path}.key`,
				message: `Duplicate signal key: ${signal.key}`,
			});
		}
		signalKeys.add(signal.key);

		if (!allowedSignalScopes.has(signal.scope)) {
			errors.push({
				path: `${path}.scope`,
				message: `Invalid signal scope: ${signal.scope}`,
			});
		}

		if (!signal.title.trim()) {
			errors.push({ path: `${path}.title`, message: "Title is required" });
		}

		if (signalOrderIndexes.has(signal.orderIndex)) {
			errors.push({
				path: `${path}.orderIndex`,
				message: `Duplicate signal order index: ${signal.orderIndex}`,
			});
		}
		signalOrderIndexes.add(signal.orderIndex);

		if (signal.isActive) {
			activeSignalScopes.add(signal.scope);
		}
	});

	if (config.signals.length === 0) {
		errors.push({
			path: "signals",
			message: "At least one signal is required",
		});
	}

	for (const scope of allowedSignalScopes) {
		if (!activeSignalScopes.has(scope)) {
			errors.push({
				path: "signals",
				message: `At least one active ${scope} signal is required`,
			});
		}
	}

	const signalScopeByKey = new Map(
		config.signals.map((signal) => [signal.key, signal.scope]),
	);
	const ruleKeys = new Set<string>();
	const selectorKeys = new Set<string>();

	config.signalRules.forEach((rule, index) => {
		const path = `signalRules[${index}]`;

		if (!rule.key.trim()) {
			errors.push({ path: `${path}.key`, message: "Key is required" });
		}
		if (ruleKeys.has(rule.key)) {
			errors.push({
				path: `${path}.key`,
				message: `Duplicate signal rule key: ${rule.key}`,
			});
		}
		ruleKeys.add(rule.key);

		if (!signalKeys.has(rule.signalKey)) {
			errors.push({
				path: `${path}.signalKey`,
				message: `Unknown signal: ${rule.signalKey}`,
			});
		}

		if (rule.runStatus !== null && !allowedRunStatuses.has(rule.runStatus)) {
			errors.push({
				path: `${path}.runStatus`,
				message: `Invalid run status: ${rule.runStatus}`,
			});
		}

		if (rule.fromStatus !== null && !statusKeys.has(rule.fromStatus)) {
			errors.push({
				path: `${path}.fromStatus`,
				message: `Invalid source status: ${rule.fromStatus}`,
			});
		}

		if (!statusKeys.has(rule.toStatus)) {
			errors.push({
				path: `${path}.toStatus`,
				message: `Invalid target status: ${rule.toStatus}`,
			});
		}

		const scope = signalScopeByKey.get(rule.signalKey);
		if (
			scope === "user_action" &&
			(rule.runKind !== null || rule.runStatus !== null)
		) {
			errors.push({
				path,
				message: "Run selectors are allowed only for run-scoped signals",
			});
		}

		const selector = [
			rule.signalKey,
			rule.runKind ?? "",
			rule.runStatus ?? "",
			rule.fromStatus ?? "",
		].join("|");
		if (selectorKeys.has(selector)) {
			errors.push({
				path,
				message: `Duplicate rule selector for signal ${rule.signalKey}`,
			});
		}
		selectorKeys.add(selector);
	});

	if (config.signalRules.length === 0) {
		errors.push({
			path: "signalRules",
			message: "At least one signal rule is required",
		});
	}

	return errors;
}

export function isWorkflowConfigDirty(
	original: WorkflowConfig | null,
	current: WorkflowConfig,
): boolean {
	if (!original) return false;
	return JSON.stringify(original) !== JSON.stringify(current);
}
