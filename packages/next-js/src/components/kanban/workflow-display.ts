import * as LucideIcons from "lucide-react";
import { Circle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
	WorkflowColumnConfig,
	WorkflowConfig,
	WorkflowStatusConfig,
} from "@/lib/api-client";
import {
	normalizeWorkflowIconKey,
	type WorkflowIconKey,
} from "@/types/workflow";

export type WorkflowVisualOption = {
	icon: LucideIcon;
	tone: string;
	label?: string;
};

export const FALLBACK_WORKFLOW_STATUS_VISUALS: Record<
	string,
	{ icon: WorkflowIconKey; color: string }
> = {
	pending: { icon: "clock", color: "#f59e0b" },
	running: { icon: "play", color: "#3b82f6" },
	question: { icon: "help-circle", color: "#f97316" },
	paused: { icon: "pause", color: "#eab308" },
	done: { icon: "check-circle", color: "#10b981" },
	failed: { icon: "x-circle", color: "#ef4444" },
	generating: { icon: "sparkles", color: "#8b5cf6" },
};

export const FALLBACK_WORKFLOW_COLUMN_ICONS: Record<string, WorkflowIconKey> = {
	backlog: "list",
	ready: "check-circle",
	deferred: "clock",
	in_progress: "play",
	blocked: "shield-alert",
	review: "eye",
	closed: "archive",
};

function toKebabCase(value: string): string {
	return value
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([a-zA-Z])([0-9])/g, "$1-$2")
		.replace(/([0-9])([a-zA-Z])/g, "$1-$2")
		.toLowerCase();
}

const WORKFLOW_ICONS: Record<string, LucideIcon> = Object.fromEntries(
	Object.entries(LucideIcons)
		.filter(([name, icon]) => {
			return (
				typeof icon === "object" &&
				icon !== null &&
				"render" in icon &&
				/^[A-Z]/.test(name) &&
				!name.endsWith("Icon") &&
				name !== "Icon"
			);
		})
		.map(([name, icon]) => [toKebabCase(name), icon as LucideIcon]),
);

function toHexColor(value: string | undefined | null): string | null {
	if (!value) {
		return null;
	}
	const trimmed = value.trim();
	if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
		return trimmed;
	}
	if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
		return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
	}
	return null;
}

function hexToRgba(hex: string, alpha: number): string {
	const normalized = toHexColor(hex) ?? "#94a3b8";
	const r = Number.parseInt(normalized.slice(1, 3), 16);
	const g = Number.parseInt(normalized.slice(3, 5), 16);
	const b = Number.parseInt(normalized.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getWorkflowIcon(
	icon: WorkflowIconKey | string | null | undefined,
): LucideIcon {
	if (!icon) {
		return Circle;
	}

	const normalizedIcon = normalizeWorkflowIconKey(icon);
	if (!normalizedIcon) {
		return Circle;
	}

	return WORKFLOW_ICONS[normalizedIcon] ?? Circle;
}

export function getWorkflowStatusVisual(
	workflowConfig: WorkflowConfig | null,
	status: string,
): WorkflowVisualOption {
	const statusRow = workflowConfig?.statuses.find(
		(item) => item.status === status,
	);
	const fallback =
		FALLBACK_WORKFLOW_STATUS_VISUALS[status] ??
		FALLBACK_WORKFLOW_STATUS_VISUALS.pending;
	return {
		icon: getWorkflowIcon(statusRow?.icon ?? fallback.icon),
		tone: toHexColor(statusRow?.color) ?? fallback.color,
		label: status,
	};
}

export function createStatusOptions(
	statuses: WorkflowStatusConfig[],
): Record<string, WorkflowVisualOption> {
	const result: Record<string, WorkflowVisualOption> = {};
	for (const status of statuses) {
		result[status.status] = {
			icon: getWorkflowIcon(status.icon),
			tone: toHexColor(status.color) ?? "#94a3b8",
			label: status.status,
		};
	}
	return result;
}

export function createStatusPillOptions(
	statuses: WorkflowStatusConfig[],
): Record<
	string,
	{
		icon: LucideIcon;
		label: string;
		style: { color: string; backgroundColor: string; borderColor: string };
		iconStyle: { color: string };
	}
> {
	const result: Record<
		string,
		{
			icon: LucideIcon;
			label: string;
			style: { color: string; backgroundColor: string; borderColor: string };
			iconStyle: { color: string };
		}
	> = {};
	for (const status of statuses) {
		const tone = toHexColor(status.color) ?? "#94a3b8";
		result[status.status] = {
			icon: getWorkflowIcon(status.icon),
			label: status.status,
			style: toneBadgeStyle(tone),
			iconStyle: toneTextStyle(tone),
		};
	}
	return result;
}

export function createFallbackStatusPillOptions(): Record<
	string,
	{
		icon: LucideIcon;
		label: string;
		style: { color: string; backgroundColor: string; borderColor: string };
		iconStyle: { color: string };
	}
> {
	const result: Record<
		string,
		{
			icon: LucideIcon;
			label: string;
			style: { color: string; backgroundColor: string; borderColor: string };
			iconStyle: { color: string };
		}
	> = {};
	for (const [status, visual] of Object.entries(
		FALLBACK_WORKFLOW_STATUS_VISUALS,
	)) {
		const tone = toHexColor(visual.color) ?? "#94a3b8";
		result[status] = {
			icon: getWorkflowIcon(visual.icon),
			label: status,
			style: toneBadgeStyle(tone),
			iconStyle: toneTextStyle(tone),
		};
	}
	return result;
}

export function createColumnOptions(
	columns: WorkflowColumnConfig[],
): Record<string, WorkflowVisualOption> {
	const result: Record<string, WorkflowVisualOption> = {};
	for (const column of columns) {
		result[column.systemKey] = {
			icon: getWorkflowIcon(column.icon),
			tone: toHexColor(column.color) ?? "#94a3b8",
			label: column.name,
		};
	}
	return result;
}

export function createColumnPillOptions(
	columns: WorkflowColumnConfig[],
): Record<
	string,
	{
		icon: LucideIcon;
		label: string;
		style: { color: string; backgroundColor: string; borderColor: string };
		iconStyle: { color: string };
	}
> {
	const result: Record<
		string,
		{
			icon: LucideIcon;
			label: string;
			style: { color: string; backgroundColor: string; borderColor: string };
			iconStyle: { color: string };
		}
	> = {};
	for (const column of columns) {
		const tone = toHexColor(column.color) ?? "#94a3b8";
		result[column.systemKey] = {
			icon: getWorkflowIcon(column.icon),
			label: column.name,
			style: toneBadgeStyle(tone),
			iconStyle: toneTextStyle(tone),
		};
	}
	return result;
}

export function toneTextStyle(tone: string): { color: string } {
	return { color: toHexColor(tone) ?? "#94a3b8" };
}

export function toneBadgeStyle(tone: string): {
	color: string;
	backgroundColor: string;
	borderColor: string;
} {
	const color = toHexColor(tone) ?? "#94a3b8";
	return {
		color,
		backgroundColor: hexToRgba(color, 0.12),
		borderColor: hexToRgba(color, 0.3),
	};
}

export function toneOverlayStyle(tone: string): { backgroundColor: string } {
	const color = toHexColor(tone) ?? "#94a3b8";
	return {
		backgroundColor: hexToRgba(color, 0.06),
	};
}
