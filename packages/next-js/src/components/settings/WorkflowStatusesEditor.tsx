"use client";

import {
	ChevronDown,
	ChevronUp,
	Clock,
	ShieldAlert,
	Archive,
} from "lucide-react";
import type {
	WorkflowColumnConfig,
	WorkflowStatusConfig,
	WorkflowTaskStatus,
	WorkflowBlockedReason,
	WorkflowClosedReason,
} from "@/lib/api-client";
import {
	blockedReasonConfig,
	closedReasonConfig,
} from "@/components/kanban/TaskPropertyConfigs";
import { PillSelect } from "@/components/common/PillSelect";
import {
	createColumnPillOptions,
	createStatusPillOptions,
} from "@/components/kanban/workflow-display";
import { ColorPalettePicker } from "@/components/settings/ColorPalettePicker";
import { IconPicker } from "@/components/settings/IconPicker";

interface WorkflowStatusesEditorProps {
	statuses: WorkflowStatusConfig[];
	columns: WorkflowColumnConfig[];
	onChange: (statuses: WorkflowStatusConfig[]) => void;
}

export function WorkflowStatusesEditor({
	statuses,
	columns,
	onChange,
}: WorkflowStatusesEditorProps) {
	const sortedStatuses = [...statuses].sort(
		(a, b) => a.orderIndex - b.orderIndex,
	);
	const statusOptions = createStatusPillOptions(statuses);
	const columnOptions = createColumnPillOptions(columns);

	const updateStatus = (
		statusKey: WorkflowTaskStatus,
		updates: Partial<WorkflowStatusConfig>,
	) => {
		const newStatuses = statuses.map((s) =>
			s.status === statusKey ? { ...s, ...updates } : s,
		);
		onChange(newStatuses);
	};

	const moveStatus = (index: number, direction: "up" | "down") => {
		const newIndex = direction === "up" ? index - 1 : index + 1;
		if (newIndex < 0 || newIndex >= sortedStatuses.length) return;

		const updatedStatuses = [...sortedStatuses];
		const temp = updatedStatuses[index].orderIndex;
		updatedStatuses[index].orderIndex = updatedStatuses[newIndex].orderIndex;
		updatedStatuses[newIndex].orderIndex = temp;

		onChange(updatedStatuses);
	};

	const blockedReasonOptions = {
		none: {
			icon: ShieldAlert,
			color: "text-slate-500",
			bg: "bg-slate-900",
			border: "border-slate-800",
			label: "None",
		},
		...blockedReasonConfig,
	} as const;

	const closedReasonOptions = {
		none: {
			icon: Archive,
			color: "text-slate-500",
			bg: "bg-slate-900",
			border: "border-slate-800",
			label: "None",
		},
		...closedReasonConfig,
	} as const;

	return (
		<div className="space-y-6">
			{sortedStatuses.map((s, idx) => {
				const currentStatusOption = statusOptions[s.status];
				const StatusIcon = currentStatusOption?.icon || Clock;

				return (
					<div
						key={s.status}
						className="group relative flex flex-col rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 transition-all hover:border-slate-700/60 hover:bg-[#0B0E14]/50 overflow-hidden"
					>
						{/* Background accent */}
						<div
							className="absolute left-0 top-0 h-full w-1 opacity-[0.15] group-hover:opacity-[0.3] transition-opacity"
							style={currentStatusOption?.style}
						/>

						{/* Card Header */}
						<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/60 bg-slate-900/20 px-6 py-4">
							<div className="flex items-center gap-5">
								<div className="flex items-center gap-4">
									<div
										className="flex h-12 w-12 items-center justify-center rounded-xl border bg-slate-900/40 transition-transform group-hover:scale-105 shadow-inner"
										style={currentStatusOption?.style}
									>
										<StatusIcon
											className="h-6 w-6"
											style={currentStatusOption?.iconStyle}
										/>
									</div>
									<div className="space-y-1">
										<h4 className="text-base font-black text-slate-100 uppercase tracking-tight">
											{s.status.replace(/_/g, " ")}
										</h4>
										<div className="flex items-center gap-2">
											<span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-800/40 border border-slate-800/40">
												ID: {s.status}
											</span>
											<span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
												Index: {s.orderIndex}
											</span>
										</div>
									</div>
								</div>
							</div>

							<div className="flex items-center gap-3 ml-auto sm:ml-0">
								<span className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] mr-2">Reorder</span>
								<div className="flex items-center gap-1 p-1 rounded-lg bg-slate-800/20 border border-slate-800/40">
									<button
										type="button"
										onClick={() => moveStatus(idx, "up")}
										disabled={idx === 0}
										className="p-1.5 rounded-md text-slate-500 hover:text-slate-100 hover:bg-slate-700/60 disabled:opacity-10 transition-all"
										title="Move Up"
									>
										<ChevronUp className="h-4 w-4" />
									</button>
									<div className="w-[1px] h-4 bg-slate-800/60 mx-0.5" />
									<button
										type="button"
										onClick={() => moveStatus(idx, "down")}
										disabled={idx === sortedStatuses.length - 1}
										className="p-1.5 rounded-md text-slate-500 hover:text-slate-100 hover:bg-slate-700/60 disabled:opacity-10 transition-all"
										title="Move Down"
									>
										<ChevronDown className="h-4 w-4" />
									</button>
								</div>
							</div>
						</div>

						{/* Card Body */}
						<div className="p-6">
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
								{/* Section: Appearance */}
								<div className="space-y-5">
									<div className="flex items-center gap-2 mb-1">
										<div className="h-px flex-1 bg-slate-800/60" />
										<h5 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">
											Visual Appearance
										</h5>
										<div className="h-px flex-1 bg-slate-800/60" />
									</div>
									<IconPicker
										label="Status Icon"
										value={s.icon}
										tone={s.color}
										onChange={(icon) => updateStatus(s.status, { icon })}
									/>
									<ColorPalettePicker
										label="Color Signature"
										value={s.color}
										onChange={(color) => updateStatus(s.status, { color })}
									/>
									<PillSelect
										label="Preferred Column"
										value={s.preferredColumnSystemKey}
										options={columnOptions}
										onChange={(val) =>
											updateStatus(s.status, {
												preferredColumnSystemKey: val,
											})
										}
									/>
								</div>

								{/* Section: Logic */}
								<div className="space-y-5">
									<div className="flex items-center gap-2 mb-1">
										<div className="h-px flex-1 bg-slate-800/60" />
										<h5 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">
											Behavioral Logic
										</h5>
										<div className="h-px flex-1 bg-slate-800/60" />
									</div>
									<PillSelect
										label="Blocked Mapping"
										value={s.blockedReason || "none"}
										options={blockedReasonOptions}
										onChange={(val) =>
											updateStatus(s.status, {
												blockedReason:
													val === "none" ? null : (val as WorkflowBlockedReason),
											})
										}
									/>
									<PillSelect
										label="Closed Mapping"
										value={s.closedReason || "none"}
										options={closedReasonOptions}
										onChange={(val) =>
											updateStatus(s.status, {
												closedReason:
													val === "none" ? null : (val as WorkflowClosedReason),
											})
										}
									/>
								</div>

								{/* Section: Guidance */}
								<div className="flex flex-col justify-end lg:pl-6">
									<div className="rounded-2xl bg-slate-900/40 border border-slate-800/40 p-5 space-y-3">
										<div className="flex items-center gap-2 text-slate-400">
											<Clock className="h-3.5 w-3.5" />
											<span className="text-[10px] font-bold uppercase tracking-widest">Guidance</span>
										</div>
										<p className="text-[11px] leading-relaxed text-slate-500 italic">
											Mappings define how this status affects task lifecycle logic.
											<br /><br />
											<span className="text-slate-400 not-italic font-medium">Blocked:</span> Prevents task from progressing and adds a warning indicator.
											<br />
											<span className="text-slate-400 not-italic font-medium">Closed:</span> Marks the task as completed and removes it from active counts.
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
