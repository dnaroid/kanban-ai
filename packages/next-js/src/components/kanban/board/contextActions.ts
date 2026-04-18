import {
	CheckCircle,
	GitMerge,
	Play,
	Square,
	Sparkles,
	XCircle,
	type LucideIcon,
} from "lucide-react";

export type ContextActionSystemKey =
	| "backlog"
	| "ready"
	| "deferred"
	| "review"
	| "review_reject"
	| "in_progress";

export interface ContextActionConfig {
	icon: LucideIcon;
	label: string;
}

export const CONTEXT_ACTION_MAP: Record<
	ContextActionSystemKey,
	ContextActionConfig
> = {
	backlog: {
		icon: Sparkles,
		label: "Generate User Story",
	},
	ready: {
		icon: Play,
		label: "Run",
	},
	deferred: {
		icon: CheckCircle,
		label: "Move to Ready",
	},
	review: {
		icon: GitMerge,
		label: "Commit & Close",
	},
	review_reject: {
		icon: XCircle,
		label: "Reject",
	},
	in_progress: {
		icon: Square,
		label: "Cancel",
	},
};

export const INACTIVE_CONTEXT_ACTION_STATUSES: ReadonlySet<string> = new Set([
	"running",
	"generating",
	"in_progress",
]);

export function getContextActionConfig(
	systemKey?: string,
): ContextActionConfig | null {
	if (!systemKey || !(systemKey in CONTEXT_ACTION_MAP)) {
		return null;
	}

	return CONTEXT_ACTION_MAP[systemKey as ContextActionSystemKey];
}

export function getSecondaryContextActionConfig(
	systemKey?: string,
): ContextActionConfig | null {
	if (systemKey === "review") {
		return CONTEXT_ACTION_MAP["review_reject"];
	}
	return null;
}
