import {
	AlertTriangle,
	ArrowUpRight,
	Bug,
	Check,
	ChevronDown,
	Circle,
	Clock,
	FileText,
	Loader2,
	RefreshCw,
	Sparkles,
	Square,
	XCircle,
	Zap,
} from "lucide-react";

export const difficultyConfig = {
	easy: {
		icon: Check,
		color: "text-emerald-400",
		bg: "bg-emerald-400/10",
		border: "border-emerald-400/20",
	},
	medium: {
		icon: ArrowUpRight,
		color: "text-blue-400",
		bg: "bg-blue-400/10",
		border: "border-blue-400/20",
	},
	hard: {
		icon: AlertTriangle,
		color: "text-amber-400",
		bg: "bg-amber-400/10",
		border: "border-amber-400/20",
	},
	epic: {
		icon: Zap,
		color: "text-purple-400",
		bg: "bg-purple-400/10",
		border: "border-purple-400/20",
	},
} as const;

export const priorityConfig = {
	urgent: {
		icon: AlertTriangle,
		color: "text-red-400",
		bg: "bg-red-400/10",
		border: "border-red-400/20",
	},
	normal: {
		icon: ArrowUpRight,
		color: "text-blue-400",
		bg: "bg-blue-400/10",
		border: "border-blue-400/20",
	},
	low: {
		icon: ChevronDown,
		color: "text-emerald-400",
		bg: "bg-emerald-400/10",
		border: "border-emerald-400/20",
	},
	postpone: {
		icon: Clock,
		color: "text-slate-400",
		bg: "bg-slate-400/10",
		border: "border-slate-400/20",
	},
} as const;

export const typeConfig = {
	feature: {
		icon: Sparkles,
		color: "text-purple-400",
		bg: "bg-purple-400/10",
		border: "border-purple-400/20",
	},
	bug: {
		icon: Bug,
		color: "text-red-400",
		bg: "bg-red-400/10",
		border: "border-red-400/20",
	},
	chore: {
		icon: FileText,
		color: "text-slate-400",
		bg: "bg-slate-400/10",
		border: "border-slate-400/20",
	},
	improvement: {
		icon: ArrowUpRight,
		color: "text-blue-400",
		bg: "bg-blue-400/10",
		border: "border-blue-400/20",
	},
} as const;

export const runStatusConfig = {
	queued: {
		icon: Clock,
		color: "text-amber-400",
		bg: "bg-amber-400/10",
		border: "border-amber-400/20",
	},
	running: {
		icon: RefreshCw,
		color: "text-blue-400",
		bg: "bg-blue-400/10",
		border: "border-blue-400/20",
	},
	succeeded: {
		icon: Check,
		color: "text-emerald-400",
		bg: "bg-emerald-400/10",
		border: "border-emerald-400/20",
	},
	failed: {
		icon: XCircle,
		color: "text-red-400",
		bg: "bg-red-400/10",
		border: "border-red-400/20",
	},
	canceled: {
		icon: Square,
		color: "text-slate-400",
		bg: "bg-slate-400/10",
		border: "border-slate-400/20",
	},
} as const;

export const todoStatusConfig = {
	pending: {
		icon: Circle,
		color: "text-slate-400",
		bg: "bg-slate-400/10",
		border: "border-slate-400/20",
	},
	in_progress: {
		icon: Loader2,
		color: "text-amber-400",
		bg: "bg-amber-400/10",
		border: "border-amber-400/20",
	},
	completed: {
		icon: Check,
		color: "text-emerald-400",
		bg: "bg-emerald-400/10",
		border: "border-emerald-400/20",
	},
	cancelled: {
		icon: XCircle,
		color: "text-slate-400",
		bg: "bg-slate-400/10",
		border: "border-slate-400/20",
	},
} as const;
