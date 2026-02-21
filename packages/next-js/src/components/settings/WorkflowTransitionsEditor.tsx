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
		<div className="space-y-16 pb-20">
			{/* Status Transitions */}
			<section className="space-y-6">
				<div className="flex items-center justify-between border-b border-slate-800/60 pb-4">
					<div className="flex items-center gap-4">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
							<GitCompare className="h-5 w-5" />
						</div>
						<div>
							<h3 className="text-xl font-bold text-slate-100">
								Status Transitions
							</h3>
							<p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest font-black">
								Define allowed movements between task statuses
							</p>
						</div>
					</div>
				</div>

				<div className="overflow-x-auto rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 shadow-2xl">
					<table className="w-full border-collapse">
						<thead>
							<tr className="border-b border-slate-800/60">
								<th className="p-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 bg-[#0B0E14]/60 backdrop-blur-sm sticky left-0 z-10 border-r border-slate-800/40">
									From \ To
								</th>
								{availableStatuses.map((s) => (
									<th
										key={s}
										className="p-5 text-center text-[10px] font-black uppercase tracking-widest text-slate-500 bg-[#0B0E14]/40 whitespace-nowrap"
									>
										<div className="flex flex-col items-center gap-2">
											{statusOptions[s] && (
												<div
													className="rounded-xl border p-2 transition-transform hover:scale-110"
													style={statusOptions[s].style}
												>
													{(() => {
														const Icon = statusOptions[s].icon;
														return (
															<Icon
																className="h-4 w-4"
																style={statusOptions[s].iconStyle}
															/>
														);
													})()}
												</div>
											)}
											<span className="mt-1">{s.replace(/_/g, " ")}</span>
										</div>
									</th>
								))}
								<th className="p-5 bg-[#0B0E14]/40"></th>
							</tr>
						</thead>
						<tbody>
							{availableStatuses.map((from) => {
								const current = statusTransitions[from] || [];
								const isAll = current.length === availableStatuses.length;

								return (
									<tr
										key={from}
										className="border-b border-slate-800/60 transition-colors hover:bg-slate-800/10 group"
									>
										<td className="p-5 sticky left-0 z-10 bg-[#0B0E14]/80 backdrop-blur-md border-r border-slate-800/40">
											<div className="flex items-center gap-4">
												{statusOptions[from] && (
													<div
														className="rounded-xl border p-2 shadow-inner"
														style={statusOptions[from].style}
													>
														{(() => {
															const Icon = statusOptions[from].icon;
															return (
																<Icon
																	className="h-4 w-4"
																	style={statusOptions[from].iconStyle}
																/>
															);
														})()}
													</div>
												)}
												<span className="text-sm font-bold text-slate-200 uppercase tracking-tight">
													{from.replace(/_/g, " ")}
												</span>
											</div>
										</td>
										{availableStatuses.map((to) => {
											const isAllowed = current.includes(to);
											return (
												<td key={to} className="p-3 text-center">
													<button
														type="button"
														onClick={() => toggleStatusTransition(from, to)}
														className={cn(
															"group/btn mx-auto flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-300",
															isAllowed
																? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)] scale-105"
																: "border-slate-800 bg-slate-900/40 text-slate-600 hover:border-slate-600 hover:text-slate-400 hover:scale-105",
														)}
													>
														{isAllowed ? (
															<Check className="h-5 w-5" />
														) : (
															<Square className="h-4 w-4 opacity-10 group-hover/btn:opacity-100" />
														)}
													</button>
												</td>
											);
										})}
										<td className="p-5 text-center">
											<button
												type="button"
												onClick={() => toggleAllStatusTransitions(from, !isAll)}
												className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-500/10 border border-transparent hover:border-blue-500/20"
											>
												{isAll ? "Clear" : "All"}
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
			<section className="space-y-6">
				<div className="flex items-center justify-between border-b border-slate-800/60 pb-4">
					<div className="flex items-center gap-4">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
							<LayoutGrid className="h-5 w-5" />
						</div>
						<div>
							<h3 className="text-xl font-bold text-slate-100">
								Column Transitions
							</h3>
							<p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest font-black">
								Define allowed movements between columns on the board
							</p>
						</div>
					</div>
				</div>

				<div className="overflow-x-auto rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 shadow-2xl">
					<table className="w-full border-collapse">
						<thead>
							<tr className="border-b border-slate-800/60">
								<th className="p-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 bg-[#0B0E14]/60 backdrop-blur-sm sticky left-0 z-10 border-r border-slate-800/40">
									From \ To
								</th>
								{availableColumns.map((c) => (
									<th
										key={c}
										className="p-5 text-center text-[10px] font-black uppercase tracking-widest text-slate-500 bg-[#0B0E14]/40"
									>
										<div className="flex flex-col items-center gap-2">
											{columnOptions[c] ? (
												<div
													className="rounded-xl border p-2 transition-transform hover:scale-110"
													style={columnOptions[c].style}
												>
													{(() => {
														const Icon = columnOptions[c].icon;
														return (
															<Icon
																className="h-4 w-4"
																style={columnOptions[c].iconStyle}
															/>
														);
													})()}
												</div>
											) : null}
											<span className="mt-1">
												{columnOptions[c]?.label ?? c}
											</span>
										</div>
									</th>
								))}
								<th className="p-5 bg-[#0B0E14]/40"></th>
							</tr>
						</thead>
						<tbody>
							{availableColumns.map((from) => {
								const current = columnTransitions[from] || [];
								const isAll = current.length === availableColumns.length;

								return (
									<tr
										key={from}
										className="border-b border-slate-800/60 transition-colors hover:bg-slate-800/10 group"
									>
										<td className="p-5 sticky left-0 z-10 bg-[#0B0E14]/80 backdrop-blur-md border-r border-slate-800/40">
											<div className="flex items-center gap-4">
												{columnOptions[from] ? (
													<div
														className="rounded-xl border p-2 shadow-inner"
														style={columnOptions[from].style}
													>
														{(() => {
															const Icon = columnOptions[from].icon;
															return (
																<Icon
																	className="h-4 w-4"
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
												<td key={to} className="p-3 text-center">
													<button
														type="button"
														onClick={() => toggleColumnTransition(from, to)}
														className={cn(
															"group/btn mx-auto flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-300",
															isAllowed
																? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)] scale-105"
																: "border-slate-800 bg-slate-900/40 text-slate-600 hover:border-slate-600 hover:text-slate-400 hover:scale-105",
														)}
													>
														{isAllowed ? (
															<Check className="h-5 w-5" />
														) : (
															<Square className="h-4 w-4 opacity-10 group-hover/btn:opacity-100" />
														)}
													</button>
												</td>
											);
										})}
										<td className="p-5 text-center">
											<button
												type="button"
												onClick={() => toggleAllColumnTransitions(from, !isAll)}
												className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-500/10 border border-transparent hover:border-blue-500/20"
											>
												{isAll ? "Clear" : "All"}
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
