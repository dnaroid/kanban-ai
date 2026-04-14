import {
	CheckCircle,
	Clock,
	GitMerge,
	Sparkles,
	type LucideIcon,
} from "lucide-react";

export type ContextActionSystemKey =
	| "backlog"
	| "ready"
	| "deferred"
	| "review";

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
		icon: Clock,
		label: "Defer Task",
	},
	deferred: {
		icon: CheckCircle,
		label: "Move to Ready",
	},
	review: {
		icon: GitMerge,
		label: "Commit & Close",
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
