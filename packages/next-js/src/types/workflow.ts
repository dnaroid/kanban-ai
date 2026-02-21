export const WORKFLOW_ICON_KEYS = [
	"clock",
	"play",
	"sparkles",
	"help-circle",
	"pause",
	"check-circle",
	"x-circle",
	"list",
	"shield-alert",
	"eye",
	"archive",
	"circle",
] as const;

export type WorkflowIconKey = (typeof WORKFLOW_ICON_KEYS)[number];

export function isWorkflowIconKey(value: string): value is WorkflowIconKey {
	return (WORKFLOW_ICON_KEYS as readonly string[]).includes(value);
}
