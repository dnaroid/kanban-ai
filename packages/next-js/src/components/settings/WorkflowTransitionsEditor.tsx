"use client";

import { Check, Square } from "lucide-react";
import type {
	WorkflowColumnConfig,
	WorkflowStatusConfig,
	WorkflowTaskStatus,
	WorkflowColumnSystemKey,
} from "@/lib/api-client";
import {
	createColumnPillOptions,
	createStatusPillOptions,
} from "@/components/kanban/workflow-display";
import { cn } from "@/lib/utils";

interface WorkflowTransitionsEditorProps {
	statusTransitions: Record<WorkflowTaskStatus, WorkflowTaskStatus[]>;
	columnTransitions: Record<WorkflowColumnSystemKey, WorkflowColumnSystemKey[]>;
	statuses: WorkflowStatusConfig[];
	columns: WorkflowColumnConfig[];
	onStatusTransitionsChange: (
		transitions: Record<WorkflowTaskStatus, WorkflowTaskStatus[]>,
	) => void;
	onColumnTransitionsChange: (
		transitions: Record<WorkflowColumnSystemKey, WorkflowColumnSystemKey[]>,
	) => void;
}

export function WorkflowTransitionsEditor({
	statusTransitions,
	columnTransitions,
	statuses,
	columns,
	onStatusTransitionsChange,
	onColumnTransitionsChange,
}: WorkflowTransitionsEditorProps) {
	const availableStatuses = statuses.map((status) => status.status);
	const availableColumns = columns.map((column) => column.systemKey);
	const statusOptions = createStatusPillOptions(statuses);
	const columnOptions = createColumnPillOptions(columns);

	const toggleStatusTransition = (
		from: WorkflowTaskStatus,
		to: WorkflowTaskStatus,
	) => {
		const current = statusTransitions[from] || [];
		const next = current.includes(to)
			? current.filter((s) => s !== to)
			: [...current, to].sort();

		onStatusTransitionsChange({ ...statusTransitions, [from]: next });
	};

	const toggleAllStatusTransitions = (
		from: WorkflowTaskStatus,
		enabled: boolean,
	) => {
		onStatusTransitionsChange({
			...statusTransitions,
			[from]: enabled ? [...availableStatuses].sort() : [],
		});
	};

	const toggleColumnTransition = (
		from: WorkflowColumnSystemKey,
		to: WorkflowColumnSystemKey,
	) => {
		const current = columnTransitions[from] || [];
		const next = current.includes(to)
			? current.filter((s) => s !== to)
			: [...current, to].sort();

		onColumnTransitionsChange({ ...columnTransitions, [from]: next });
	};

	const toggleAllColumnTransitions = (
		from: WorkflowColumnSystemKey,
		enabled: boolean,
	) => {
		onColumnTransitionsChange({
			...columnTransitions,
			[from]: enabled ? [...availableColumns].sort() : [],
		});
	};

	return (
		<div className="space-y-12">
			{/* Status Transitions */}
			<section className="space-y-5">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-lg font-bold text-slate-100">
							Status Transitions
						</h3>
						<p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">
							Define allowed movements between task statuses
						</p>
					</div>
				</div>

				<div className="overflow-x-auto rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30">
					<table className="w-full border-collapse">
						<thead>
							<tr className="border-b border-slate-800/60">
								<th className="p-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-[#0B0E14]/40">
									From \ To
								</th>
								{availableStatuses.map((s) => (
									<th
										key={s}
										className="p-4 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-[#0B0E14]/40 whitespace-nowrap"
									>
										<div className="flex flex-col items-center gap-1">
											{statusOptions[s] && (
												<div
													className="rounded-lg border p-1.5"
													style={statusOptions[s].style}
												>
													{(() => {
														const Icon = statusOptions[s].icon;
														return (
															<Icon
																className="h-3.5 w-3.5"
																style={statusOptions[s].iconStyle}
															/>
														);
													})()}
												</div>
											)}
											<span>{s}</span>
										</div>
									</th>
								))}
								<th className="p-4 bg-[#0B0E14]/40"></th>
							</tr>
						</thead>
						<tbody>
							{availableStatuses.map((from) => {
								const current = statusTransitions[from] || [];
								const isAll = current.length === availableStatuses.length;

								return (
									<tr
										key={from}
										className="border-b border-slate-800/60 transition-colors hover:bg-slate-800/20"
									>
										<td className="p-4">
											<div className="flex items-center gap-3">
												{statusOptions[from] && (
													<div
														className="rounded-lg border p-1.5"
														style={statusOptions[from].style}
													>
														{(() => {
															const Icon = statusOptions[from].icon;
															return (
																<Icon
																	className="h-3.5 w-3.5"
																	style={statusOptions[from].iconStyle}
																/>
															);
														})()}
													</div>
												)}
												<span className="text-sm font-bold text-slate-200">
													{from}
												</span>
											</div>
										</td>
										{availableStatuses.map((to) => {
											const isAllowed = current.includes(to);
											return (
												<td key={to} className="p-2 text-center">
													<button
														type="button"
														onClick={() => toggleStatusTransition(from, to)}
														className={cn(
															"group mx-auto flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
															isAllowed
																? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)]"
																: "border-slate-800 bg-slate-900/50 text-slate-600 hover:border-slate-600 hover:text-slate-400",
														)}
													>
														{isAllowed ? (
															<Check className="h-4 w-4" />
														) : (
															<Square className="h-4 w-4 opacity-30 group-hover:opacity-100" />
														)}
													</button>
												</td>
											);
										})}
										<td className="p-4 text-center">
											<button
												type="button"
												onClick={() => toggleAllStatusTransitions(from, !isAll)}
												className="text-[10px] font-bold uppercase tracking-widest text-blue-500 hover:text-blue-400 transition-colors"
											>
												{isAll ? "None" : "All"}
											</button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>

			{/* Column Transitions */}
			<section className="space-y-5">
				<div>
					<h3 className="text-lg font-bold text-slate-100">
						Column Transitions
					</h3>
					<p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">
						Define allowed movements between columns on the board
					</p>
				</div>

				<div className="overflow-x-auto rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30">
					<table className="w-full border-collapse">
						<thead>
							<tr className="border-b border-slate-800/60">
								<th className="p-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-[#0B0E14]/40">
									From \ To
								</th>
								{availableColumns.map((c) => (
									<th
										key={c}
										className="p-4 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-[#0B0E14]/40"
									>
										<div className="flex flex-col items-center gap-1">
											{columnOptions[c] ? (
												<div
													className="rounded-lg border p-1.5"
													style={columnOptions[c].style}
												>
													{(() => {
														const Icon = columnOptions[c].icon;
														return (
															<Icon
																className="h-3.5 w-3.5"
																style={columnOptions[c].iconStyle}
															/>
														);
													})()}
												</div>
											) : null}
											<span>{columnOptions[c]?.label ?? c}</span>
										</div>
									</th>
								))}
								<th className="p-4 bg-[#0B0E14]/40"></th>
							</tr>
						</thead>
						<tbody>
							{availableColumns.map((from) => {
								const current = columnTransitions[from] || [];
								const isAll = current.length === availableColumns.length;

								return (
									<tr
										key={from}
										className="border-b border-slate-800/60 transition-colors hover:bg-slate-800/20"
									>
										<td className="p-4">
											<div className="flex items-center gap-3">
												{columnOptions[from] ? (
													<div
														className="rounded-lg border p-1.5"
														style={columnOptions[from].style}
													>
														{(() => {
															const Icon = columnOptions[from].icon;
															return (
																<Icon
																	className="h-3.5 w-3.5"
																	style={columnOptions[from].iconStyle}
																/>
															);
														})()}
													</div>
												) : null}
												<span className="text-sm font-bold text-slate-200 uppercase tracking-tight">
													{columnOptions[from]?.label ?? from}
												</span>
											</div>
										</td>
										{availableColumns.map((to) => {
											const isAllowed = current.includes(to);
											return (
												<td key={to} className="p-2 text-center">
													<button
														type="button"
														onClick={() => toggleColumnTransition(from, to)}
														className={cn(
															"group mx-auto flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
															isAllowed
																? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)]"
																: "border-slate-800 bg-slate-900/50 text-slate-600 hover:border-slate-600 hover:text-slate-400",
														)}
													>
														{isAllowed ? (
															<Check className="h-4 w-4" />
														) : (
															<Square className="h-4 w-4 opacity-30 group-hover:opacity-100" />
														)}
													</button>
												</td>
											);
										})}
										<td className="p-4 text-center">
											<button
												type="button"
												onClick={() => toggleAllColumnTransitions(from, !isAll)}
												className="text-[10px] font-bold uppercase tracking-widest text-blue-500 hover:text-blue-400 transition-colors"
											>
												{isAll ? "None" : "All"}
											</button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
