import type {
	WorkflowConfig,
	WorkflowTaskStatus,
	WorkflowColumnSystemKey,
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
	const statusKeys = new Set<WorkflowTaskStatus>();
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
		const transitions =
			config.statusTransitions[fromStatus as WorkflowTaskStatus];
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

	return errors;
}

export function isWorkflowConfigDirty(
	original: WorkflowConfig | null,
	current: WorkflowConfig,
): boolean {
	if (!original) return false;
	return JSON.stringify(original) !== JSON.stringify(current);
}
