import * as LucideIcons from "lucide-react";

export type WorkflowIconKey = string;

const LEGACY_WORKFLOW_ICON_ALIASES: Record<string, string[]> = {
	"check-circle": ["check-circle-2", "circle-check-big", "circle-check"],
	"x-circle": ["circle-x"],
	"help-circle": ["circle-help"],
};

function toKebabCase(value: string): string {
	return value
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([a-zA-Z])([0-9])/g, "$1-$2")
		.replace(/([0-9])([a-zA-Z])/g, "$1-$2")
		.toLowerCase();
}

const rawWorkflowIconKeys = Object.entries(LucideIcons)
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
	.map(([name]) => toKebabCase(name));

export const WORKFLOW_ICON_KEYS: WorkflowIconKey[] = [
	...new Set(rawWorkflowIconKeys),
].sort((a, b) => a.localeCompare(b));

const WORKFLOW_ICON_KEY_SET = new Set<string>(WORKFLOW_ICON_KEYS);

export function normalizeWorkflowIconKey(
	value: string,
): WorkflowIconKey | null {
	const normalizedValue = value.trim().toLowerCase();
	if (!normalizedValue) {
		return null;
	}

	if (WORKFLOW_ICON_KEY_SET.has(normalizedValue)) {
		return normalizedValue;
	}

	const aliasCandidates = LEGACY_WORKFLOW_ICON_ALIASES[normalizedValue] ?? [];
	for (const candidate of aliasCandidates) {
		if (WORKFLOW_ICON_KEY_SET.has(candidate)) {
			return candidate;
		}
	}

	return null;
}

export function isWorkflowIconKey(value: string): value is WorkflowIconKey {
	return normalizeWorkflowIconKey(value) !== null;
}
