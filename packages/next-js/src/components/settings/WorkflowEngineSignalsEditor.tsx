"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
	Check,
	Plus,
	Trash2,
	Edit2,
	Copy,
	ChevronUp,
	ChevronDown,
	Search,
	Filter,
	AlertCircle,
	X,
	Info,
	Settings2,
	Zap,
	Activity,
} from "lucide-react";
import { PillSelect } from "@/components/common/PillSelect";
import { createStatusPillOptions } from "@/components/kanban/workflow-display";

import type {
	WorkflowSignalConfig,
	WorkflowSignalRuleConfig,
	WorkflowStatusConfig,
	WorkflowRunStatus,
	WorkflowSignalScope,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface WorkflowEngineSignalsEditorProps {
	signals: WorkflowSignalConfig[];
	signalRules: WorkflowSignalRuleConfig[];
	statuses: WorkflowStatusConfig[];
	onSignalsChange: (signals: WorkflowSignalConfig[]) => void;
	onSignalRulesChange: (rules: WorkflowSignalRuleConfig[]) => void;
	onErrorChange: (message: string | null) => void;
}

type StatusPillOption = ReturnType<typeof createStatusPillOptions>[string];

const RUN_STATUSES: readonly WorkflowRunStatus[] = [
	"queued",
	"running",
	"completed",
	"failed",
	"cancelled",
	"timeout",
	"paused",
];

const KNOWN_RUN_KINDS: readonly string[] = [
	"task-description-improve",
	"task-run",
];

type SignalActiveFilter = "all" | "active" | "inactive";

function isWorkflowRunStatusValue(value: string): value is WorkflowRunStatus {
	return (RUN_STATUSES as readonly string[]).includes(value);
}

function toSignalScopeFilter(value: string): WorkflowSignalScope | "all" {
	if (value === "run" || value === "user_action" || value === "all") {
		return value;
	}
	return "all";
}

function toSignalActiveFilter(value: string): SignalActiveFilter {
	if (value === "active" || value === "inactive" || value === "all") {
		return value;
	}
	return "all";
}

function toSignalScope(value: string): WorkflowSignalScope {
	return value === "user_action" ? "user_action" : "run";
}

function toTaskStatusOrNull(
	value: string,
	statusKeySet: ReadonlySet<string>,
): string | null {
	return statusKeySet.has(value) ? value : null;
}

function toTaskStatus(
	value: string,
	fallback: string,
	statusKeySet: ReadonlySet<string>,
): string {
	return statusKeySet.has(value) ? value : fallback;
}

function toRunStatusOrNull(value: string): WorkflowRunStatus | null {
	return isWorkflowRunStatusValue(value) ? value : null;
}

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
	const normalized = color.trim().replace(/^#/, "");
	if (normalized.length === 3) {
		const r = Number.parseInt(`${normalized[0]}${normalized[0]}`, 16);
		const g = Number.parseInt(`${normalized[1]}${normalized[1]}`, 16);
		const b = Number.parseInt(`${normalized[2]}${normalized[2]}`, 16);
		if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
			return null;
		}
		return { r, g, b };
	}

	if (normalized.length === 6) {
		const parsed = Number.parseInt(normalized, 16);
		if (Number.isNaN(parsed)) {
			return null;
		}
		return {
			r: (parsed >> 16) & 0xff,
			g: (parsed >> 8) & 0xff,
			b: parsed & 0xff,
		};
	}

	return null;
}

function getStatusBadgeStyle(
	status: string,
	statusColorByKey: Map<string, string>,
): CSSProperties | undefined {
	const color = statusColorByKey.get(status);
	if (!color) {
		return undefined;
	}

	const rgb = hexToRgb(color);
	if (!rgb) {
		return {
			borderColor: color,
			backgroundColor: color,
			color: "#ffffff",
		};
	}

	return {
		borderColor: color,
		backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`,
		color: "#ffffff",
	};
}

export function WorkflowEngineSignalsEditor({
	signals,
	signalRules,
	statuses,
	onSignalsChange,
	onSignalRulesChange,
	onErrorChange,
}: WorkflowEngineSignalsEditorProps) {
	// Search and Filters
	const [signalSearch, setSignalSearch] = useState("");
	const [signalScopeFilter, setSignalScopeFilter] = useState<
		WorkflowSignalScope | "all"
	>("all");
	const [signalActiveFilter, setSignalActiveFilter] =
		useState<SignalActiveFilter>("all");

	// Clear JSON error on mount since we are using visual editor now
	useEffect(() => {
		onErrorChange(null);
	}, [onErrorChange]);

	const activeRunSignals = useMemo(
		() => signals.filter((s) => s.scope === "run" && s.isActive),
		[signals],
	);
	const activeUserSignals = useMemo(
		() => signals.filter((s) => s.scope === "user_action" && s.isActive),
		[signals],
	);

	const summaryErrors = useMemo(() => {
		const errors: string[] = [];
		if (activeRunSignals.length === 0)
			errors.push("At least one active 'run' signal is required.");
		if (activeUserSignals.length === 0)
			errors.push("At least one active 'user_action' signal is required.");
		if (signals.length === 0) errors.push("At least one signal is required.");
		if (signalRules.length === 0)
			errors.push("At least one signal rule is required.");
		return errors;
	}, [activeRunSignals, activeUserSignals, signals, signalRules]);

	// Editing State
	const [editingSignalKey, setEditingSignalKey] = useState<string | null>(null);
	const [editingRuleKey, setEditingRuleKey] = useState<string | null>(null);
	const [isAddingSignal, setIsAddingSignal] = useState(false);
	const [isAddingRule, setIsAddingRule] = useState(false);

	// Form States
	const [signalForm, setSignalForm] = useState<WorkflowSignalConfig | null>(
		null,
	);
	const [ruleForm, setRuleForm] = useState<WorkflowSignalRuleConfig | null>(
		null,
	);

	// Validation Errors (local to editing)
	const [formErrors, setFormErrors] = useState<Record<string, string>>({});

	const statusColorByKey = useMemo(
		() =>
			new Map(statuses.map((status) => [status.status, status.color] as const)),
		[statuses],
	);
	const statusKeySet = useMemo(
		() => new Set(statuses.map((status) => status.status)),
		[statuses],
	);
	const statusPillOptions = useMemo(
		() => createStatusPillOptions(statuses),
		[statuses],
	);
	const fromStatusPillOptions = useMemo<Record<string, StatusPillOption>>(
		() => ({
			any_status: {
				icon: Filter,
				label: "Any status",
				style: {
					color: "#60a5fa",
					backgroundColor: "rgba(59, 130, 246, 0.12)",
					borderColor: "rgba(59, 130, 246, 0.3)",
				},
				iconStyle: { color: "#60a5fa" },
			},
			...statusPillOptions,
		}),
		[statusPillOptions],
	);
	const runKindOptions = useMemo(() => {
		const values = new Set<string>(KNOWN_RUN_KINDS);
		for (const rule of signalRules) {
			if (rule.runKind) {
				values.add(rule.runKind);
			}
		}
		if (ruleForm?.runKind) {
			values.add(ruleForm.runKind);
		}
		return [...values].sort((a, b) => a.localeCompare(b));
	}, [signalRules, ruleForm?.runKind]);

	// Filtered Signals
	const filteredSignals = useMemo(() => {
		return [...signals]
			.sort((a, b) => a.orderIndex - b.orderIndex)
			.filter((s) => {
				const matchesSearch =
					s.key.toLowerCase().includes(signalSearch.toLowerCase()) ||
					s.title.toLowerCase().includes(signalSearch.toLowerCase());
				const matchesScope =
					signalScopeFilter === "all" || s.scope === signalScopeFilter;
				const matchesActive =
					signalActiveFilter === "all" ||
					(signalActiveFilter === "active" && s.isActive) ||
					(signalActiveFilter === "inactive" && !s.isActive);
				return matchesSearch && matchesScope && matchesActive;
			});
	}, [signals, signalSearch, signalScopeFilter, signalActiveFilter]);

	// Validation Logic
	const validateSignal = (
		signal: WorkflowSignalConfig,
		isNew: boolean,
	): boolean => {
		const errors: Record<string, string> = {};
		if (!signal.key.trim()) errors.key = "Key is required";
		else if (isNew && signals.some((s) => s.key === signal.key))
			errors.key = "Duplicate key";

		if (!signal.title.trim()) errors.title = "Title is required";
		if (signal.orderIndex < 0) errors.orderIndex = "Must be non-negative";

		setFormErrors(errors);
		return Object.keys(errors).length === 0;
	};

	const validateRule = (
		rule: WorkflowSignalRuleConfig,
		isNew: boolean,
	): boolean => {
		const errors: Record<string, string> = {};
		if (!rule.key.trim()) errors.key = "Key is required";
		else if (isNew && signalRules.some((r) => r.key === rule.key))
			errors.key = "Duplicate key";

		if (!rule.signalKey) errors.signalKey = "Signal is required";
		if (!rule.toStatus) errors.toStatus = "Target status is required";

		const signal = signals.find((s) => s.key === rule.signalKey);
		if (signal?.scope === "user_action" && (rule.runKind || rule.runStatus)) {
			errors.signalKey = "User action signals cannot have run selectors";
		}

		// Duplicate selector check
		const isDuplicateSelector = signalRules.some(
			(r) =>
				(isNew || r.key !== rule.key) &&
				r.signalKey === rule.signalKey &&
				r.runKind === rule.runKind &&
				r.runStatus === rule.runStatus &&
				r.fromStatus === rule.fromStatus,
		);
		if (isDuplicateSelector) {
			errors.selector = "A rule with this identical selector already exists";
		}

		setFormErrors(errors);
		return Object.keys(errors).length === 0;
	};

	// CRUD Handlers for Signals
	const handleAddSignal = () => {
		const nextIndex =
			signals.length > 0
				? Math.max(...signals.map((s) => s.orderIndex)) + 1
				: 0;
		setSignalForm({
			key: "",
			title: "",
			description: "",
			scope: "run",
			isActive: true,
			orderIndex: nextIndex,
		});
		setIsAddingSignal(true);
		setFormErrors({});
	};

	const handleEditSignal = (signal: WorkflowSignalConfig) => {
		setSignalForm({ ...signal });
		setEditingSignalKey(signal.key);
		setFormErrors({});
	};

	const handleSaveSignal = () => {
		if (!signalForm) return;
		if (!validateSignal(signalForm, isAddingSignal)) return;

		let newSignals: WorkflowSignalConfig[];
		if (isAddingSignal) {
			newSignals = [...signals, signalForm];
		} else {
			newSignals = signals.map((s) =>
				s.key === editingSignalKey ? signalForm : s,
			);
		}

		onSignalsChange(newSignals);
		setIsAddingSignal(false);
		setEditingSignalKey(null);
		setSignalForm(null);
	};

	const handleDeleteSignal = (key: string) => {
		if (
			window.confirm(
				`Are you sure you want to delete signal "${key}"? This will also delete related rules.`,
			)
		) {
			const newSignals = signals.filter((s) => s.key !== key);
			const newRules = signalRules.filter((r) => r.signalKey !== key);
			onSignalsChange(newSignals);
			onSignalRulesChange(newRules);
		}
	};

	const handleReorderSignal = (key: string, direction: "up" | "down") => {
		const newSignals = [...signals].sort((a, b) => a.orderIndex - b.orderIndex);
		const index = newSignals.findIndex((s) => s.key === key);
		if (index === -1) return;

		const targetIndex = direction === "up" ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= newSignals.length) return;

		// Swap orderIndex
		const temp = newSignals[index].orderIndex;
		newSignals[index].orderIndex = newSignals[targetIndex].orderIndex;
		newSignals[targetIndex].orderIndex = temp;

		onSignalsChange(newSignals);
	};

	// CRUD Handlers for Rules
	const handleAddRule = () => {
		setRuleForm({
			key: `rule_${Date.now()}`,
			signalKey: signals[0]?.key || "",
			runKind: null,
			runStatus: null,
			fromStatus: null,
			toStatus: statuses[0]?.status ?? "pending",
		});
		setIsAddingRule(true);
		setFormErrors({});
	};

	const handleEditRule = (rule: WorkflowSignalRuleConfig) => {
		setRuleForm({ ...rule });
		setEditingRuleKey(rule.key);
		setFormErrors({});
	};

	const handleDuplicateRule = (rule: WorkflowSignalRuleConfig) => {
		const newRule = { ...rule, key: `${rule.key}_copy_${Date.now()}` };
		onSignalRulesChange([...signalRules, newRule]);
	};

	const handleSaveRule = () => {
		if (!ruleForm) return;
		if (!validateRule(ruleForm, isAddingRule)) return;

		let newRules: WorkflowSignalRuleConfig[];
		if (isAddingRule) {
			newRules = [...signalRules, ruleForm];
		} else {
			newRules = signalRules.map((r) =>
				r.key === editingRuleKey ? ruleForm : r,
			);
		}

		onSignalRulesChange(newRules);
		setIsAddingRule(false);
		setEditingRuleKey(null);
		setRuleForm(null);
	};

	const handleDeleteRule = (key: string) => {
		if (window.confirm("Are you sure you want to delete this rule?")) {
			onSignalRulesChange(signalRules.filter((r) => r.key !== key));
		}
	};

	return (
		<div className="space-y-12 pb-20">
			{/* Summary Cards */}
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
				<div className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 p-5 transition-all hover:bg-[#0B0E14]/50">
					<div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
						<Activity className="h-10 w-10 text-blue-500" />
					</div>
					<div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
						Signals
					</div>
					<div className="mt-3 text-3xl font-bold text-slate-100">
						{signals.length}
					</div>
					<div className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-tight text-slate-500">
						<span className="text-cyan-400">{activeRunSignals.length} Run</span>
						<span className="h-1 w-1 rounded-full bg-slate-700" />
						<span className="text-purple-400">
							{activeUserSignals.length} User
						</span>
					</div>
				</div>

				<div className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 p-5 transition-all hover:bg-[#0B0E14]/50">
					<div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
						<Zap className="h-10 w-10 text-cyan-500" />
					</div>
					<div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
						Active Rules
					</div>
					<div className="mt-3 text-3xl font-bold text-slate-100">
						{signalRules.length}
					</div>
					<div className="mt-2 text-[10px] font-bold uppercase tracking-tight text-slate-500">
						Status mapping rules
					</div>
				</div>

				<div
					className={cn(
						"group relative overflow-hidden rounded-2xl border p-5 col-span-full md:col-span-2 transition-all",
						summaryErrors.length === 0
							? "border-emerald-500/20 bg-emerald-500/5"
							: "border-amber-500/20 bg-amber-500/5",
					)}
				>
					<div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
						Engine Health
					</div>
					<div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
						{summaryErrors.length === 0 ? (
							<div className="flex items-center gap-3 text-emerald-400 font-bold">
								<div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
									<Check className="h-4 w-4" />
								</div>
								<span>Configuration Fully Valid</span>
							</div>
						) : (
							<div className="space-y-1.5 w-full">
								{summaryErrors.map((err) => (
									<div
										key={err}
										className="flex items-center gap-2 text-amber-500 text-[11px] font-bold uppercase tracking-tight"
									>
										<AlertCircle className="h-3.5 w-3.5" />
										{err}
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Signals Section */}
			<section className="space-y-6">
				<div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/60 pb-4">
					<div className="flex items-center gap-4">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
							<Activity className="h-5 w-5" />
						</div>
						<div>
							<h3 className="text-xl font-bold text-slate-100">
								Workflow Signals
							</h3>
							<p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest font-black">
								Events that trigger workflow transitions
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={handleAddSignal}
						className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
					>
						<Plus className="h-4 w-4" />
						Add New Signal
					</button>
				</div>

				<div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-800/40 bg-slate-900/10 p-4">
					<div className="relative flex-1 min-w-[280px]">
						<Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
						<input
							type="text"
							placeholder="Search signals by key or title..."
							value={signalSearch}
							onChange={(e) => setSignalSearch(e.target.value)}
							className="w-full rounded-xl border border-slate-800 bg-[#0B0E14]/50 py-2.5 pl-10 pr-4 text-sm text-slate-200 outline-none focus:border-blue-500/50 transition-all"
						/>
					</div>
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0B0E14]/50 border border-slate-800">
							<Filter className="h-3.5 w-3.5 text-slate-500" />
							<select
								value={signalScopeFilter}
								onChange={(e) =>
									setSignalScopeFilter(toSignalScopeFilter(e.target.value))
								}
								className="bg-transparent text-[11px] font-bold uppercase tracking-widest text-slate-400 outline-none focus:text-blue-400 cursor-pointer"
							>
								<option value="all">All Scopes</option>
								<option value="run">Run Scope</option>
								<option value="user_action">User Action</option>
							</select>
						</div>
						<div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0B0E14]/50 border border-slate-800">
							<Settings2 className="h-3.5 w-3.5 text-slate-500" />
							<select
								value={signalActiveFilter}
								onChange={(e) =>
									setSignalActiveFilter(toSignalActiveFilter(e.target.value))
								}
								className="bg-transparent text-[11px] font-bold uppercase tracking-widest text-slate-400 outline-none focus:text-blue-400 cursor-pointer"
							>
								<option value="all">All Status</option>
								<option value="active">Active Only</option>
								<option value="inactive">Inactive Only</option>
							</select>
						</div>
					</div>
				</div>

				<div className="overflow-hidden rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 shadow-2xl">
					<div className="overflow-x-auto">
						<table className="w-full text-left">
							<thead className="border-b border-slate-800/60 bg-[#0B0E14]/60">
								<tr>
									<th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
										Signal Identity
									</th>
									<th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
										Classification
									</th>
									<th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
										State
									</th>
									<th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
										Management
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-800/40">
								{filteredSignals.length === 0 ? (
									<tr>
										<td colSpan={4} className="px-6 py-16 text-center">
											<div className="flex flex-col items-center gap-3 text-slate-500">
												<Search className="h-10 w-10 opacity-10" />
												<p className="text-sm font-medium">
													No signals matching your current filters
												</p>
											</div>
										</td>
									</tr>
								) : (
									filteredSignals.map((signal, index) => (
										<tr
											key={signal.key}
											className="group hover:bg-slate-800/10 transition-colors"
										>
											<td className="px-6 py-4">
												<div className="flex flex-col gap-1">
													<div className="font-bold text-slate-100 flex items-center gap-2">
														{signal.title}
														<span className="text-[10px] font-mono bg-slate-800/60 px-1.5 py-0.5 rounded text-slate-500 border border-slate-800/40">
															{signal.key}
														</span>
													</div>
													{signal.description && (
														<div className="text-xs text-slate-500 truncate max-w-xs italic">
															{signal.description}
														</div>
													)}
												</div>
											</td>
											<td className="px-6 py-4">
												<span
													className={cn(
														"inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest",
														signal.scope === "run"
															? "border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
															: "border-purple-500/20 bg-purple-500/10 text-purple-400",
													)}
												>
													{signal.scope === "run" ? (
														<Activity className="h-3 w-3" />
													) : (
														<Settings2 className="h-3 w-3" />
													)}
													{signal.scope.replace("_", " ")}
												</span>
											</td>
											<td className="px-6 py-4">
												<div className="flex items-center gap-3">
													<div
														className={cn(
															"h-2 w-2 rounded-full transition-all",
															signal.isActive
																? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
																: "bg-slate-700 opacity-30",
														)}
													/>
													<span
														className={cn(
															"text-[10px] font-black uppercase tracking-widest",
															signal.isActive
																? "text-slate-300"
																: "text-slate-600",
														)}
													>
														{signal.isActive ? "Active" : "Inactive"}
													</span>
												</div>
											</td>
											<td className="px-6 py-4">
												<div className="flex items-center justify-end gap-2">
													<div className="flex flex-col bg-slate-900/40 rounded-lg p-0.5 border border-slate-800/40">
														<button
															type="button"
															onClick={() =>
																handleReorderSignal(signal.key, "up")
															}
															disabled={index === 0}
															className="p-1 text-slate-600 hover:text-slate-200 disabled:opacity-0 transition-colors"
														>
															<ChevronUp className="h-3.5 w-3.5" />
														</button>
														<button
															type="button"
															onClick={() =>
																handleReorderSignal(signal.key, "down")
															}
															disabled={index === filteredSignals.length - 1}
															className="p-1 text-slate-600 hover:text-slate-200 disabled:opacity-0 transition-colors"
														>
															<ChevronDown className="h-3.5 w-3.5" />
														</button>
													</div>
													<button
														type="button"
														onClick={() => handleEditSignal(signal)}
														className="rounded-xl p-2.5 text-slate-500 hover:bg-blue-500/10 hover:text-blue-400 border border-transparent hover:border-blue-500/20 transition-all"
													>
														<Edit2 className="h-4 w-4" />
													</button>
													<button
														type="button"
														onClick={() => handleDeleteSignal(signal.key)}
														className="rounded-xl p-2.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20 transition-all"
													>
														<Trash2 className="h-4 w-4" />
													</button>
												</div>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			{/* Rules Section */}
			<section className="space-y-6">
				<div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/60 pb-4">
					<div className="flex items-center gap-4">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
							<Zap className="h-5 w-5" />
						</div>
						<div>
							<h3 className="text-xl font-bold text-slate-100">Signal Rules</h3>
							<p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest font-black">
								How signals map to task status changes
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={handleAddRule}
						className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-cyan-500 transition-all shadow-lg shadow-cyan-600/20 active:scale-95"
					>
						<Plus className="h-4 w-4" />
						New Mapping Rule
					</button>
				</div>

				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{signalRules.length === 0 ? (
						<div className="col-span-full flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-800/60 p-20 text-center bg-[#0B0E14]/20">
							<div className="rounded-2xl bg-slate-900/60 p-5 mb-5 border border-slate-800/40">
								<Zap className="h-10 w-10 text-slate-700" />
							</div>
							<h4 className="text-xl font-bold text-slate-400">
								No Automation Rules
							</h4>
							<p className="text-sm text-slate-600 mt-2 max-w-xs leading-relaxed">
								Automation rules connect signals (events) to status changes. Add
								your first rule to define workflow behavior.
							</p>
							<button
								type="button"
								onClick={handleAddRule}
								className="mt-8 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-6 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800 transition-all"
							>
								<Plus className="h-4 w-4" />
								Configure First Rule
							</button>
						</div>
					) : (
						signalRules.map((rule) => {
							const signal = signals.find((s) => s.key === rule.signalKey);
							const fromStatusStyle = rule.fromStatus
								? getStatusBadgeStyle(rule.fromStatus, statusColorByKey)
								: undefined;
							const toStatusStyle = getStatusBadgeStyle(
								rule.toStatus,
								statusColorByKey,
							);
							return (
								<div
									key={rule.key}
									className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 p-6 hover:border-cyan-500/40 hover:bg-[#0B0E14]/50 transition-all shadow-xl"
								>
									{/* Top: Signal Identity */}
									<div className="mb-6 flex items-start justify-between">
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<span className="text-[10px] font-mono font-black text-slate-600 uppercase tracking-tighter bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800/40">
													{rule.key}
												</span>
											</div>
											<h4 className="text-lg font-bold text-slate-100 group-hover:text-cyan-400 transition-colors">
												{signal?.title || rule.signalKey}
											</h4>
										</div>
										<div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 -mr-2">
											<button
												type="button"
												onClick={() => handleDuplicateRule(rule)}
												className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-400 border border-transparent hover:border-cyan-500/20"
												title="Duplicate"
											>
												<Copy className="h-3.5 w-3.5" />
											</button>
											<button
												type="button"
												onClick={() => handleEditRule(rule)}
												className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-blue-400 border border-transparent hover:border-blue-500/20"
												title="Edit"
											>
												<Edit2 className="h-3.5 w-3.5" />
											</button>
											<button
												type="button"
												onClick={() => handleDeleteRule(rule.key)}
												className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20"
												title="Delete"
											>
												<Trash2 className="h-3.5 w-3.5" />
											</button>
										</div>
									</div>

									{/* Middle: Logic Flow */}
									<div className="space-y-5">
										<div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[#0B0E14]/60 border border-slate-800/40 relative overflow-hidden">
											<div className="absolute top-0 left-0 w-1 h-full bg-blue-500/20" />
											<div className="flex flex-col items-center gap-1 shrink-0">
												<div
													className={cn(
														"rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest min-w-[80px] text-center",
														rule.fromStatus
															? "shadow-inner"
															: "border-blue-500/20 bg-blue-500/10 text-blue-400",
													)}
													style={fromStatusStyle}
												>
													{rule.fromStatus || "Any State"}
												</div>
											</div>

											<div className="flex-1 flex flex-col items-center justify-center">
												<div className="h-px w-full bg-slate-800 relative">
													<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0B0E14] px-2">
														<Zap className="h-3 w-3 text-slate-600" />
													</div>
												</div>
											</div>

											<div className="flex flex-col items-center gap-1 shrink-0">
												<div
													className={cn(
														"rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest min-w-[80px] text-center shadow-lg",
														!toStatusStyle &&
															"border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
													)}
													style={toStatusStyle}
												>
													{rule.toStatus}
												</div>
											</div>
										</div>

										{/* Bottom: Conditions/Selectors */}
										{(rule.runKind || rule.runStatus) && (
											<div className="space-y-2">
												<div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
													<Filter className="h-2.5 w-2.5" />
													Execution Conditions
												</div>
												<div className="flex flex-wrap gap-2">
													{rule.runKind && (
														<span className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-2.5 py-1 text-[10px] font-bold text-slate-300">
															<span className="text-slate-500 mr-1 font-black">
																KIND:
															</span>
															{rule.runKind}
														</span>
													)}
													{rule.runStatus && (
														<span className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-2.5 py-1 text-[10px] font-bold text-slate-300">
															<span className="text-slate-500 mr-1 font-black">
																STATUS:
															</span>
															{rule.runStatus.toUpperCase()}
														</span>
													)}
												</div>
											</div>
										)}
									</div>
								</div>
							);
						})
					)}
				</div>
			</section>

			{/* Signal Modal */}
			{(isAddingSignal || editingSignalKey) && signalForm && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300">
					<div className="w-full max-w-lg overflow-hidden rounded-[2.5rem] border border-slate-800/60 bg-[#0B0E14] shadow-[0_0_50px_-12px_rgba(59,130,246,0.3)] animate-in zoom-in-95 duration-300">
						<div className="flex items-center justify-between border-b border-slate-800/60 px-8 py-6 bg-slate-900/20">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
									<Activity className="h-5 w-5" />
								</div>
								<h3 className="text-xl font-bold text-slate-100">
									{isAddingSignal ? "New Signal" : "Edit Signal"}
								</h3>
							</div>
							<button
								type="button"
								onClick={() => {
									setIsAddingSignal(false);
									setEditingSignalKey(null);
								}}
								className="rounded-full p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition-all"
							>
								<X className="h-5 w-5" />
							</button>
						</div>
						<div className="p-8 space-y-6">
							<div className="grid gap-6 sm:grid-cols-2">
								<div className="space-y-2">
									<label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
										Unique Key
									</label>
									<input
										type="text"
										value={signalForm.key}
										onChange={(e) =>
											setSignalForm({ ...signalForm, key: e.target.value })
										}
										placeholder="e.g. run_started"
										disabled={!isAddingSignal}
										className={cn(
											"w-full rounded-2xl border bg-[#0B0E14] px-4 py-3 text-sm text-slate-200 outline-none transition-all focus:ring-2 focus:ring-blue-500/20",
											formErrors.key
												? "border-red-500/50 focus:border-red-500"
												: "border-slate-800 focus:border-blue-500/50",
											!isAddingSignal && "opacity-50 cursor-not-allowed",
										)}
									/>
									{formErrors.key && (
										<p className="text-[10px] font-bold text-red-400 uppercase tracking-tight ml-1">
											{formErrors.key}
										</p>
									)}
								</div>
								<div className="space-y-2">
									<label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
										Scope
									</label>
									<div className="relative">
										<select
											value={signalForm.scope}
											onChange={(e) =>
												setSignalForm({
													...signalForm,
													scope: toSignalScope(e.target.value),
												})
											}
											className="w-full appearance-none rounded-2xl border border-slate-800 bg-[#0B0E14] px-4 py-3 text-sm text-slate-200 outline-none focus:border-blue-500/50 transition-all focus:ring-2 focus:ring-blue-500/20"
										>
											<option value="run">Run Scope</option>
											<option value="user_action">User Action</option>
										</select>
										<ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 pointer-events-none" />
									</div>
								</div>
							</div>
							<div className="space-y-2">
								<label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
									Display Title
								</label>
								<input
									type="text"
									value={signalForm.title}
									onChange={(e) =>
										setSignalForm({ ...signalForm, title: e.target.value })
									}
									placeholder="e.g. AI Started Working"
									className={cn(
										"w-full rounded-2xl border bg-[#0B0E14] px-4 py-3 text-sm text-slate-200 outline-none transition-all focus:ring-2 focus:ring-blue-500/20",
										formErrors.title
											? "border-red-500/50"
											: "border-slate-800 focus:border-blue-500/50",
									)}
								/>
							</div>
							<div className="space-y-2">
								<label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
									Description
								</label>
								<textarea
									value={signalForm.description}
									onChange={(e) =>
										setSignalForm({
											...signalForm,
											description: e.target.value,
										})
									}
									placeholder="Describe when this signal is triggered..."
									rows={3}
									className="w-full rounded-2xl border border-slate-800 bg-[#0B0E14] px-4 py-3 text-sm text-slate-200 outline-none focus:border-blue-500/50 transition-all focus:ring-2 focus:ring-blue-500/20 resize-none"
								/>
							</div>
							<div className="flex items-center justify-between rounded-2xl bg-blue-500/5 border border-blue-500/10 p-5">
								<div className="flex items-center gap-4">
									<div
										className={cn(
											"h-4 w-4 rounded-full border-2",
											signalForm.isActive
												? "bg-emerald-500 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
												: "bg-slate-800 border-slate-700",
										)}
									/>
									<div>
										<div className="text-sm font-bold text-slate-100">
											Signal Active
										</div>
										<div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
											Engine will process this signal
										</div>
									</div>
								</div>
								<button
									type="button"
									onClick={() =>
										setSignalForm({
											...signalForm,
											isActive: !signalForm.isActive,
										})
									}
									className={cn(
										"relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none",
										signalForm.isActive ? "bg-blue-600" : "bg-slate-800",
									)}
								>
									<span
										className={cn(
											"inline-block h-6 w-6 transform rounded-full bg-white shadow-xl transition duration-300 ease-in-out",
											signalForm.isActive ? "translate-x-5" : "translate-x-0",
										)}
									/>
								</button>
							</div>
						</div>
						<div className="flex items-center justify-end gap-3 border-t border-slate-800/60 px-8 py-6 bg-slate-900/20">
							<button
								type="button"
								onClick={() => {
									setIsAddingSignal(false);
									setEditingSignalKey(null);
								}}
								className="rounded-xl px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-300 transition-all"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSaveSignal}
								className="rounded-xl bg-blue-600 px-8 py-2.5 text-sm font-black uppercase tracking-widest text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
							>
								{isAddingSignal ? "Create Signal" : "Update Signal"}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Rule Modal */}
			{(isAddingRule || editingRuleKey) && ruleForm && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300">
					<div className="w-full max-w-lg overflow-hidden rounded-[2.5rem] border border-slate-800/60 bg-[#0B0E14] shadow-[0_0_50px_-12px_rgba(6,182,212,0.3)] animate-in zoom-in-95 duration-300">
						<div className="flex items-center justify-between border-b border-slate-800/60 px-8 py-6 bg-slate-900/20">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
									<Zap className="h-5 w-5" />
								</div>
								<h3 className="text-xl font-bold text-slate-100">
									{isAddingRule
										? "New Transition Rule"
										: "Edit Transition Rule"}
								</h3>
							</div>
							<button
								type="button"
								onClick={() => {
									setIsAddingRule(false);
									setEditingRuleKey(null);
								}}
								className="rounded-full p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition-all"
							>
								<X className="h-5 w-5" />
							</button>
						</div>
						<div className="p-8 space-y-6">
							{(() => {
								const fromStatusValue = ruleForm.fromStatus ?? "any_status";
								const toStatusValue = ruleForm.toStatus;
								const fromStatusDisplay =
									fromStatusPillOptions[fromStatusValue]?.label ?? "Any status";
								const toStatusDisplay =
									statusPillOptions[toStatusValue]?.label ?? toStatusValue;

								return (
									<div className="space-y-6">
										<div className="space-y-2">
											<label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
												Signal Trigger
											</label>
											<div className="relative">
												<select
													value={ruleForm.signalKey}
													onChange={(e) =>
														setRuleForm({
															...ruleForm,
															signalKey: e.target.value,
														})
													}
													className="w-full appearance-none rounded-2xl border border-slate-800 bg-[#0B0E14] px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500/50 transition-all focus:ring-2 focus:ring-cyan-500/20"
												>
													{signals.map((s) => (
														<option key={s.key} value={s.key}>
															{s.title} ({s.key})
														</option>
													))}
												</select>
												<ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 pointer-events-none" />
											</div>
										</div>

										<div className="grid gap-6 sm:grid-cols-2">
											<div className="space-y-1.5">
												<PillSelect
													label="From Status"
													value={fromStatusValue}
													options={fromStatusPillOptions}
													displayValue={fromStatusDisplay}
													className="w-full"
													onChange={(value) =>
														setRuleForm({
															...ruleForm,
															fromStatus:
																value === "any_status"
																	? null
																	: toTaskStatusOrNull(value, statusKeySet),
														})
													}
												/>
											</div>
											<div className="space-y-1.5">
												<PillSelect
													label="Target Status"
													value={toStatusValue}
													options={statusPillOptions}
													displayValue={toStatusDisplay}
													className="w-full"
													onChange={(value) =>
														setRuleForm({
															...ruleForm,
															toStatus: toTaskStatus(
																value,
																ruleForm.toStatus,
																statusKeySet,
															),
														})
													}
												/>
											</div>
										</div>
									</div>
								);
							})()}

							<div className="space-y-4 rounded-3xl bg-slate-900/20 p-6 border border-slate-800/60 relative overflow-hidden group/selectors">
								<div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/20 group-hover/selectors:bg-cyan-500/40 transition-colors" />
								<div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
									<Info className="h-3.5 w-3.5 text-cyan-500" />
									Advanced Selectors (Run Scope)
								</div>

								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
											Run Kind
										</label>
										<div className="relative">
											<select
												value={ruleForm.runKind || ""}
												onChange={(e) =>
													setRuleForm({
														...ruleForm,
														runKind: e.target.value || null,
													})
												}
												disabled={
													signals.find((s) => s.key === ruleForm.signalKey)
														?.scope === "user_action"
												}
												className="w-full appearance-none rounded-xl border border-slate-800 bg-[#0B0E14] px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/50 disabled:opacity-20 transition-all"
											>
												<option value="">Any Run Kind</option>
												{runKindOptions.map((kind) => (
													<option key={kind} value={kind}>
														{kind}
													</option>
												))}
											</select>
											<ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-700 pointer-events-none" />
										</div>
									</div>
									<div className="space-y-2">
										<label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
											Run Status
										</label>
										<div className="relative">
											<select
												value={ruleForm.runStatus || ""}
												onChange={(e) =>
													setRuleForm({
														...ruleForm,
														runStatus: toRunStatusOrNull(e.target.value),
													})
												}
												disabled={
													signals.find((s) => s.key === ruleForm.signalKey)
														?.scope === "user_action"
												}
												className="w-full appearance-none rounded-xl border border-slate-800 bg-[#0B0E14] px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/50 disabled:opacity-20 transition-all"
											>
												<option value="">Any Run Status</option>
												{RUN_STATUSES.map((s) => (
													<option key={s} value={s}>
														{s.toUpperCase()}
													</option>
												))}
											</select>
											<ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-700 pointer-events-none" />
										</div>
									</div>
								</div>
								{signals.find((s) => s.key === ruleForm.signalKey)?.scope ===
									"user_action" && (
									<p className="text-[9px] font-bold text-amber-500/60 uppercase leading-relaxed text-center italic">
										Advanced selectors are only available for run-scoped
										signals.
									</p>
								)}
							</div>

							{formErrors.selector && (
								<div className="flex items-center gap-3 rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-xs font-bold text-red-400 animate-pulse">
									<AlertCircle className="h-4 w-4 shrink-0" />
									{formErrors.selector}
								</div>
							)}
						</div>
						<div className="flex items-center justify-end gap-3 border-t border-slate-800/60 px-8 py-6 bg-slate-900/20">
							<button
								type="button"
								onClick={() => {
									setIsAddingRule(false);
									setEditingRuleKey(null);
								}}
								className="rounded-xl px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-300 transition-all"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSaveRule}
								className="rounded-xl bg-cyan-600 px-8 py-2.5 text-sm font-black uppercase tracking-widest text-white hover:bg-cyan-500 transition-all shadow-lg shadow-cyan-600/20 active:scale-95"
							>
								{isAddingRule ? "Add Rule" : "Update Rule"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
