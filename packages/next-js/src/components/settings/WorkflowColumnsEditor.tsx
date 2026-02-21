"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type {
	WorkflowColumnConfig,
	WorkflowStatusConfig,
	WorkflowTaskStatus,
	WorkflowColumnSystemKey,
} from "@/lib/api-client";
import { PillSelect } from "@/components/common/PillSelect";
import { createStatusPillOptions } from "@/components/kanban/workflow-display";
import { ColorPalettePicker } from "@/components/settings/ColorPalettePicker";
import { cn } from "@/lib/utils";

interface WorkflowColumnsEditorProps {
	columns: WorkflowColumnConfig[];
	statuses: WorkflowStatusConfig[];
	onChange: (columns: WorkflowColumnConfig[]) => void;
}

export function WorkflowColumnsEditor({
	columns,
	statuses,
	onChange,
}: WorkflowColumnsEditorProps) {
	const sortedColumns = [...columns].sort(
		(a, b) => a.orderIndex - b.orderIndex,
	);
	const statusOptions = createStatusPillOptions(statuses);
	const availableStatuses = statuses.map((status) => status.status);

	const updateColumn = (
		systemKey: WorkflowColumnSystemKey,
		updates: Partial<WorkflowColumnConfig>,
	) => {
		const newColumns = columns.map((col) =>
			col.systemKey === systemKey ? { ...col, ...updates } : col,
		);
		onChange(newColumns);
	};

	const moveColumn = (index: number, direction: "up" | "down") => {
		const newIndex = direction === "up" ? index - 1 : index + 1;
		if (newIndex < 0 || newIndex >= sortedColumns.length) return;

		const updatedColumns = [...sortedColumns];
		const temp = updatedColumns[index].orderIndex;
		updatedColumns[index].orderIndex = updatedColumns[newIndex].orderIndex;
		updatedColumns[newIndex].orderIndex = temp;

		onChange(updatedColumns);
	};

	const toggleStatus = (
		systemKey: WorkflowColumnSystemKey,
		status: WorkflowTaskStatus,
	) => {
		const col = columns.find((c) => c.systemKey === systemKey);
		if (!col) return;

		let newAllowed = [...col.allowedStatuses];
		if (newAllowed.includes(status)) {
			// Don't remove if it's the default status
			if (col.defaultStatus === status) return;
			newAllowed = newAllowed.filter((s) => s !== status);
		} else {
			newAllowed.push(status);
		}

		updateColumn(systemKey, { allowedStatuses: newAllowed });
	};

	return (
		<div className="space-y-4">
			{sortedColumns.map((col, idx) => (
				<div
					key={col.systemKey}
					className="group relative overflow-hidden flex flex-col gap-6 rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 p-6 transition-all hover:border-slate-700/60 hover:bg-[#0B0E14]/50"
				>
					{/* Background accent */}
					<div
						className="absolute left-0 top-0 h-full w-1 opacity-[0.05] group-hover:opacity-[0.1]"
						style={{ backgroundColor: col.color }}
					/>

					<div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
						{/* Left: Identity & Order */}
						<div className="flex items-center gap-5">
							<div className="flex flex-col gap-1.5 p-1 rounded-lg bg-slate-800/20 border border-slate-800/40">
								<button
									type="button"
									onClick={() => moveColumn(idx, "up")}
									disabled={idx === 0}
									className="p-1 rounded text-slate-600 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20 transition-all"
									title="Move Up"
								>
									<ChevronUp className="h-4 w-4" />
								</button>
								<button
									type="button"
									onClick={() => moveColumn(idx, "down")}
									disabled={idx === sortedColumns.length - 1}
									className="p-1 rounded text-slate-600 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20 transition-all"
									title="Move Down"
								>
									<ChevronDown className="h-4 w-4" />
								</button>
							</div>

							<div className="space-y-1">
								<h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
									System Key:{" "}
									<span className="text-slate-400 font-mono">
										{col.systemKey}
									</span>
								</h4>
								<div className="relative group/input">
									<input
										type="text"
										value={col.name}
										onChange={(e) =>
											updateColumn(col.systemKey, { name: e.target.value })
										}
										className="bg-transparent text-xl font-bold text-slate-100 outline-none border-b-2 border-transparent focus:border-blue-500/50 transition-all w-full max-w-md"
										placeholder="Column Name"
									/>
								</div>
							</div>
						</div>

						{/* Right: Color Config */}
						<div className="w-full lg:max-w-xs">
							<ColorPalettePicker
								label="Column Accent Color"
								value={col.color}
								onChange={(color) => updateColumn(col.systemKey, { color })}
							/>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-8 border-t border-slate-800/60 pt-6 md:grid-cols-2">
						{/* Default Status */}
						<div className="space-y-4">
							<div className="flex flex-col gap-1">
								<PillSelect
									label="Default Task Status"
									value={col.defaultStatus}
									options={statusOptions}
									onChange={(val) =>
										updateColumn(col.systemKey, {
											defaultStatus: val as WorkflowTaskStatus,
										})
									}
								/>
								<p className="text-[10px] text-slate-500 italic mt-1">
									Tasks created in or moved to this column will receive this
									status if not specified.
								</p>
							</div>
						</div>

						{/* Allowed Statuses */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
									Allowed Statuses in Column
								</span>
							</div>
							<div className="flex flex-wrap gap-2">
								{availableStatuses.map((status) => {
									const isAllowed = col.allowedStatuses.includes(status);
									const option = statusOptions[status];
									const Icon = option.icon;
									const isDefault = col.defaultStatus === status;

									return (
										<button
											key={status}
											type="button"
											onClick={() => toggleStatus(col.systemKey, status)}
											disabled={isDefault}
											className={cn(
												"flex items-center gap-2 rounded-xl border px-3 py-2 transition-all hover:scale-105 active:scale-95",
												isAllowed
													? "shadow-sm"
													: "border-slate-800 bg-slate-900/30 text-slate-600 grayscale opacity-40 hover:grayscale-0 hover:opacity-100",
												isDefault && "ring-2 ring-blue-500/40 ring-offset-2 ring-offset-[#0B0E14] cursor-default opacity-100 grayscale-0",
											)}
											style={isAllowed ? option.style : undefined}
											title={isDefault ? "Default status cannot be removed" : ""}
										>
											<Icon
												className="h-3.5 w-3.5"
												style={isAllowed ? option.iconStyle : undefined}
											/>
											<span className="text-[10px] font-black uppercase tracking-widest">
												{status.replace(/_/g, " ")}
											</span>
											{isDefault && (
												<div className="ml-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
											)}
										</button>
									);
								})}
							</div>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
