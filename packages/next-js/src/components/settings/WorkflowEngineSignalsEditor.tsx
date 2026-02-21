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

import type {
	WorkflowSignalConfig,
	WorkflowSignalRuleConfig,
	WorkflowStatusConfig,
	WorkflowTaskStatus,
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

const TASK_STATUSES: readonly WorkflowTaskStatus[] = [
	"queued",
	"running",
	"question",
	"paused",
	"done",
	"failed",
	"generating",
];

const RUN_STATUSES: readonly WorkflowRunStatus[] = [
	"queued",
	"running",
	"completed",
	"failed",
	"cancelled",
	"timeout",
	"paused",
];

type SignalActiveFilter = "all" | "active" | "inactive";

function isWorkflowTaskStatusValue(value: string): value is WorkflowTaskStatus {
	return (TASK_STATUSES as readonly string[]).includes(value);
}

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

function toTaskStatusOrNull(value: string): WorkflowTaskStatus | null {
	return isWorkflowTaskStatusValue(value) ? value : null;
}

function toTaskStatus(
	value: string,
	fallback: WorkflowTaskStatus,
): WorkflowTaskStatus {
	return isWorkflowTaskStatusValue(value) ? value : fallback;
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
	status: WorkflowTaskStatus,
	statusColorByKey: Map<WorkflowTaskStatus, string>,
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

	const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
	const textColor = luminance > 0.62 ? "#111827" : "#f8fafc";

	return {
		borderColor: color,
		backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`,
		color: textColor,
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

	const statusKeys = useMemo(() => statuses.map((s) => s.status), [statuses]);
	const targetStatuses = statusKeys.filter((status) =>
		isWorkflowTaskStatusValue(status),
	);

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
			toStatus: "queued",
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
		<div className="space-y-10">
			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<div className="rounded-2xl border border-slate-800/50 bg-slate-900/30 p-4">
					<div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
						Signals
					</div>
					<div className="mt-2 text-2xl font-bold text-slate-100">
						{signals.length}
					</div>
					<div className="mt-1 text-xs text-slate-500">
						{activeRunSignals.length} run / {activeUserSignals.length} user
					</div>
				</div>
				<div className="rounded-2xl border border-slate-800/50 bg-slate-900/30 p-4">
					<div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
						Rules
					</div>
					<div className="mt-2 text-2xl font-bold text-slate-100">
						{signalRules.length}
					</div>
					<div className="mt-1 text-xs text-slate-500">
						status mapping rules
					</div>
				</div>
				<div
					className={cn(
						"rounded-2xl border p-4 col-span-full md:col-span-2",
						summaryErrors.length === 0
							? "border-emerald-500/10 bg-emerald-500/5"
							: "border-amber-500/10 bg-amber-500/5",
					)}
				>
					<div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
						Engine Status
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
						{summaryErrors.length === 0 ? (
							<div className="flex items-center gap-2 text-emerald-400 font-bold">
								<Check className="h-4 w-4" />
								Configuration OK
							</div>
						) : (
							summaryErrors.map((err) => (
								<div
									key={err}
									className="flex items-center gap-2 text-amber-500 text-xs font-semibold"
								>
									<AlertCircle className="h-3.5 w-3.5" />
									{err}
								</div>
							))
						)}
					</div>
				</div>
			</div>

			{/* Signals Section */}
			<section className="space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
							<Activity className="h-5 w-5" />
						</div>
						<div>
							<h3 className="text-base font-bold text-slate-100">
								Workflow Signals
							</h3>
							<p className="text-xs text-slate-500">
								Events that trigger workflow transitions
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={handleAddSignal}
						className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20"
					>
						<Plus className="h-4 w-4" />
						Add Signal
					</button>
				</div>

				<div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/40 bg-slate-900/20 p-3">
					<div className="relative flex-1 min-w-[200px]">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
						<input
							type="text"
							placeholder="Search signals..."
							value={signalSearch}
							onChange={(e) => setSignalSearch(e.target.value)}
							className="w-full rounded-lg border border-slate-800 bg-slate-950/50 py-1.5 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-blue-500/50"
						/>
					</div>
					<div className="flex items-center gap-2">
						<Filter className="h-4 w-4 text-slate-500" />
						<select
							value={signalScopeFilter}
							onChange={(e) =>
								setSignalScopeFilter(toSignalScopeFilter(e.target.value))
							}
							className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-1.5 text-xs font-semibold text-slate-300 outline-none focus:border-blue-500/50"
						>
							<option value="all">All Scopes</option>
							<option value="run">Run</option>
							<option value="user_action">User Action</option>
						</select>
						<select
							value={signalActiveFilter}
							onChange={(e) =>
								setSignalActiveFilter(toSignalActiveFilter(e.target.value))
							}
							className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-1.5 text-xs font-semibold text-slate-300 outline-none focus:border-blue-500/50"
						>
							<option value="all">All Status</option>
							<option value="active">Active</option>
							<option value="inactive">Inactive</option>
						</select>
					</div>
				</div>

				<div className="overflow-hidden rounded-2xl border border-slate-800/50 bg-slate-900/20">
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead className="border-b border-slate-800/50 bg-slate-800/30">
								<tr>
									<th className="px-4 py-3 font-bold text-slate-400">
										Signal Key
									</th>
									<th className="px-4 py-3 font-bold text-slate-400">Title</th>
									<th className="px-4 py-3 font-bold text-slate-400">Scope</th>
									<th className="px-4 py-3 font-bold text-slate-400">Status</th>
									<th className="px-4 py-3 text-right font-bold text-slate-400">
										Actions
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-800/30">
								{filteredSignals.length === 0 ? (
									<tr>
										<td colSpan={5} className="px-4 py-12 text-center">
											<div className="flex flex-col items-center gap-2 text-slate-500">
												<Search className="h-8 w-8 opacity-20" />
												<p>No signals found matching your filters</p>
											</div>
										</td>
									</tr>
								) : (
									filteredSignals.map((signal, index) => (
										<tr
											key={signal.key}
											className="group hover:bg-slate-800/20 transition-colors"
										>
											<td className="px-4 py-3 font-mono text-xs text-slate-300">
												{signal.key}
											</td>
											<td className="px-4 py-3">
												<div className="font-semibold text-slate-100">
													{signal.title}
												</div>
												<div className="text-xs text-slate-500 truncate max-w-[200px]">
													{signal.description}
												</div>
											</td>
											<td className="px-4 py-3">
												<span
													className={cn(
														"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
														signal.scope === "run"
															? "bg-cyan-500/10 text-cyan-400"
															: "bg-purple-500/10 text-purple-400",
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
											<td className="px-4 py-3">
												<span
													className={cn(
														"inline-flex h-2 w-2 rounded-full mr-2",
														signal.isActive
															? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
															: "bg-slate-700",
													)}
												/>
												<span className="text-xs font-medium text-slate-400">
													{signal.isActive ? "Active" : "Inactive"}
												</span>
											</td>
											<td className="px-4 py-3">
												<div className="flex items-center justify-end gap-1">
													<div className="flex flex-col mr-2">
														<button
															type="button"
															onClick={() =>
																handleReorderSignal(signal.key, "up")
															}
															disabled={index === 0}
															className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-0"
														>
															<ChevronUp className="h-3.5 w-3.5" />
														</button>
														<button
															type="button"
															onClick={() =>
																handleReorderSignal(signal.key, "down")
															}
															disabled={index === filteredSignals.length - 1}
															className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-0"
														>
															<ChevronDown className="h-3.5 w-3.5" />
														</button>
													</div>
													<button
														type="button"
														onClick={() => handleEditSignal(signal)}
														className="rounded-lg p-2 text-slate-500 hover:bg-slate-700 hover:text-blue-400 transition-colors"
													>
														<Edit2 className="h-4 w-4" />
													</button>
													<button
														type="button"
														onClick={() => handleDeleteSignal(signal.key)}
														className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
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
			<section className="space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
							<Zap className="h-5 w-5" />
						</div>
						<div>
							<h3 className="text-base font-bold text-slate-100">
								Signal Rules
							</h3>
							<p className="text-xs text-slate-500">
								How signals map to task status changes
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={handleAddRule}
						className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-500 transition-all shadow-lg shadow-cyan-600/20"
					>
						<Plus className="h-4 w-4" />
						Add Rule
					</button>
				</div>

				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{signalRules.length === 0 ? (
						<div className="col-span-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-800 p-12 text-center">
							<div className="rounded-full bg-slate-900 p-4 mb-4">
								<Zap className="h-8 w-8 text-slate-700" />
							</div>
							<h4 className="text-lg font-bold text-slate-400">
								No Rules Configured
							</h4>
							<p className="text-sm text-slate-600 mt-1 max-w-sm">
								Rules define how signals change the status of your tasks. Create
								your first rule to get started.
							</p>
							<button
								type="button"
								onClick={handleAddRule}
								className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800"
							>
								<Plus className="h-4 w-4" />
								Add Rule
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
									className="group relative overflow-hidden rounded-2xl border border-slate-800/50 bg-slate-900/40 p-5 hover:border-cyan-500/30 transition-all"
								>
									<div className="mb-4 flex items-start justify-between">
										<div>
											<div className="flex items-center gap-2">
												<span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-tighter">
													{rule.key}
												</span>
											</div>
											<h4 className="mt-1 font-bold text-slate-100">
												{signal?.title || rule.signalKey}
											</h4>
										</div>
										<div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
											<button
												type="button"
												onClick={() => handleDuplicateRule(rule)}
												className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-cyan-400"
												title="Duplicate"
											>
												<Copy className="h-3.5 w-3.5" />
											</button>
											<button
												type="button"
												onClick={() => handleEditRule(rule)}
												className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-blue-400"
												title="Edit"
											>
												<Edit2 className="h-3.5 w-3.5" />
											</button>
											<button
												type="button"
												onClick={() => handleDeleteRule(rule.key)}
												className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
												title="Delete"
											>
												<Trash2 className="h-3.5 w-3.5" />
											</button>
										</div>
									</div>

									<div className="space-y-3">
										<div className="flex items-center gap-3">
											<div className="flex flex-col items-center">
												<div
													className={cn(
														"rounded border px-2 py-1 text-[10px] font-bold uppercase",
														rule.fromStatus
															? ""
															: "bg-blue-500/10 text-blue-400",
													)}
													style={fromStatusStyle}
												>
													{rule.fromStatus || "ANY"}
												</div>
												<div className="h-4 w-px bg-slate-800 my-0.5" />
												<div
													className={cn(
														"rounded border px-2 py-1 text-[10px] font-bold uppercase",
														!toStatusStyle &&
															"border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
													)}
													style={toStatusStyle}
												>
													{rule.toStatus}
												</div>
											</div>
											<div className="flex-1 space-y-1">
												<div className="text-[10px] font-bold text-slate-500 uppercase">
													Selectors
												</div>
												<div className="flex flex-wrap gap-1">
													{rule.runKind && (
														<span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-slate-300">
															Kind: {rule.runKind}
														</span>
													)}
													{rule.runStatus && (
														<span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-slate-300">
															Status: {rule.runStatus}
														</span>
													)}
													{!rule.runKind && !rule.runStatus && (
														<span className="text-[9px] italic text-slate-600">
															No extra selectors
														</span>
													)}
												</div>
											</div>
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>
			</section>

			{/* Signal Modal */}
			{(isAddingSignal || editingSignalKey) && signalForm && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
					<div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-200">
						<div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
							<h3 className="text-lg font-bold text-slate-100">
								{isAddingSignal ? "Create New Signal" : "Edit Signal"}
							</h3>
							<button
								type="button"
								onClick={() => {
									setIsAddingSignal(false);
									setEditingSignalKey(null);
								}}
								className="text-slate-500 hover:text-slate-300"
							>
								<X className="h-5 w-5" />
							</button>
						</div>
						<div className="p-6 space-y-5">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-1.5">
									<div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
										Unique Key
									</div>
									<input
										type="text"
										value={signalForm.key}
										onChange={(e) =>
											setSignalForm({ ...signalForm, key: e.target.value })
										}
										placeholder="e.g. run_started"
										disabled={!isAddingSignal}
										className={cn(
											"w-full rounded-xl border bg-slate-950 px-4 py-2.5 text-sm text-slate-200 outline-none transition-all",
											formErrors.key
												? "border-red-500/50 focus:border-red-500"
												: "border-slate-800 focus:border-blue-500",
											!isAddingSignal && "opacity-50 cursor-not-allowed",
										)}
									/>
									{formErrors.key && (
										<p className="text-[10px] font-bold text-red-400 uppercase">
											{formErrors.key}
										</p>
									)}
								</div>
								<div className="space-y-1.5">
									<div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
										Scope
									</div>
									<select
										value={signalForm.scope}
										onChange={(e) =>
											setSignalForm({
												...signalForm,
												scope: toSignalScope(e.target.value),
											})
										}
										className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500"
									>
										<option value="run">Run</option>
										<option value="user_action">User Action</option>
									</select>
								</div>
							</div>
							<div className="space-y-1.5">
								<div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
									Display Title
								</div>
								<input
									type="text"
									value={signalForm.title}
									onChange={(e) =>
										setSignalForm({ ...signalForm, title: e.target.value })
									}
									placeholder="e.g. AI Started Working"
									className={cn(
										"w-full rounded-xl border bg-slate-950 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500",
										formErrors.title ? "border-red-500/50" : "border-slate-800",
									)}
								/>
							</div>
							<div className="space-y-1.5">
								<div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
									Description
								</div>
								<textarea
									value={signalForm.description}
									onChange={(e) =>
										setSignalForm({
											...signalForm,
											description: e.target.value,
										})
									}
									rows={2}
									className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500"
								/>
							</div>
							<div className="flex items-center justify-between rounded-xl bg-slate-950/50 p-4">
								<div className="flex items-center gap-3">
									<div
										className={cn(
											"h-3 w-3 rounded-full",
											signalForm.isActive ? "bg-emerald-500" : "bg-slate-700",
										)}
									/>
									<div>
										<div className="text-sm font-bold text-slate-200">
											Active Status
										</div>
										<div className="text-[10px] text-slate-500 uppercase">
											Enable or disable this signal
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
										"relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
										signalForm.isActive ? "bg-blue-600" : "bg-slate-700",
									)}
								>
									<span
										className={cn(
											"inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
											signalForm.isActive ? "translate-x-5" : "translate-x-0",
										)}
									/>
								</button>
							</div>
						</div>
						<div className="flex items-center justify-end gap-3 border-t border-slate-800 px-6 py-4 bg-slate-800/20">
							<button
								type="button"
								onClick={() => {
									setIsAddingSignal(false);
									setEditingSignalKey(null);
								}}
								className="rounded-xl px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSaveSignal}
								className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-50 transition-all shadow-lg shadow-blue-600/20 hover:text-blue-600"
							>
								Save Signal
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Rule Modal */}
			{(isAddingRule || editingRuleKey) && ruleForm && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
					<div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-200">
						<div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
							<h3 className="text-lg font-bold text-slate-100">
								{isAddingRule ? "Add Transition Rule" : "Edit Rule"}
							</h3>
							<button
								type="button"
								onClick={() => {
									setIsAddingRule(false);
									setEditingRuleKey(null);
								}}
								className="text-slate-500 hover:text-slate-300"
							>
								<X className="h-5 w-5" />
							</button>
						</div>
						<div className="p-6 space-y-6">
							<div className="space-y-1.5">
								<div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
									Signal Trigger
								</div>
								<select
									value={ruleForm.signalKey}
									onChange={(e) =>
										setRuleForm({ ...ruleForm, signalKey: e.target.value })
									}
									className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500"
								>
									{signals.map((s) => (
										<option key={s.key} value={s.key}>
											{s.title} ({s.key})
										</option>
									))}
								</select>
							</div>

							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-1.5">
									<div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
										From Status
									</div>
									<select
										value={ruleForm.fromStatus || ""}
										onChange={(e) =>
											setRuleForm({
												...ruleForm,
												fromStatus: toTaskStatusOrNull(e.target.value),
											})
										}
										className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500"
									>
										<option value="">Any Status</option>
										{targetStatuses.map((s) => (
											<option key={s} value={s}>
												{s.toUpperCase()}
											</option>
										))}
									</select>
								</div>
								<div className="space-y-1.5">
									<div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
										To Status
									</div>
									<select
										value={ruleForm.toStatus}
										onChange={(e) =>
											setRuleForm({
												...ruleForm,
												toStatus: toTaskStatus(
													e.target.value,
													ruleForm.toStatus,
												),
											})
										}
										className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500"
									>
										{targetStatuses.map((s) => (
											<option key={s} value={s}>
												{s.toUpperCase()}
											</option>
										))}
									</select>
								</div>
							</div>

							<div className="space-y-4 rounded-2xl bg-slate-950/40 p-4 border border-slate-800/50">
								<div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
									<Info className="h-3 w-3" />
									Advanced Selectors (Run Scope Only)
								</div>

								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-1.5">
										<div className="text-[10px] font-bold text-slate-500 uppercase">
											Run Kind
										</div>
										<input
											type="text"
											value={ruleForm.runKind || ""}
											onChange={(e) =>
												setRuleForm({
													...ruleForm,
													runKind: e.target.value || null,
												})
											}
											placeholder="Optional kind filter"
											disabled={
												signals.find((s) => s.key === ruleForm.signalKey)
													?.scope === "user_action"
											}
											className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500 disabled:opacity-30"
										/>
									</div>
									<div className="space-y-1.5">
										<div className="text-[10px] font-bold text-slate-500 uppercase">
											Run Status
										</div>
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
											className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500 disabled:opacity-30"
										>
											<option value="">Any Run Status</option>
											{RUN_STATUSES.map((s) => (
												<option key={s} value={s}>
													{s.toUpperCase()}
												</option>
											))}
										</select>
									</div>
								</div>
								{signals.find((s) => s.key === ruleForm.signalKey)?.scope ===
									"user_action" && (
									<p className="text-[9px] font-bold text-amber-500/80 uppercase leading-tight">
										Selectors are disabled because this signal is user-scoped.
									</p>
								)}
							</div>

							{formErrors.selector && (
								<div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-400">
									<AlertCircle className="h-4 w-4 shrink-0" />
									{formErrors.selector}
								</div>
							)}
						</div>
						<div className="flex items-center justify-end gap-3 border-t border-slate-800 px-6 py-4 bg-slate-800/20">
							<button
								type="button"
								onClick={() => {
									setIsAddingRule(false);
									setEditingRuleKey(null);
								}}
								className="rounded-xl px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSaveRule}
								className="rounded-xl bg-cyan-600 px-6 py-2 text-sm font-bold text-white hover:bg-cyan-50 shadow-lg shadow-cyan-600/20 transition-all hover:text-cyan-600"
							>
								Save Rule
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
