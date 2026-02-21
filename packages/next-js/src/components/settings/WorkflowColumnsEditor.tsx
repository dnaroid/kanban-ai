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
					className="group relative flex flex-col gap-4 rounded-2xl border border-slate-800/60 bg-slate-900/20 p-5 transition-all hover:border-slate-700/60 hover:bg-slate-900/40"
				>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="flex flex-col gap-1">
								<button
									type="button"
									onClick={() => moveColumn(idx, "up")}
									disabled={idx === 0}
									className="text-slate-600 hover:text-slate-300 disabled:opacity-30"
								>
									<ChevronUp className="h-4 w-4" />
								</button>
								<button
									type="button"
									onClick={() => moveColumn(idx, "down")}
									disabled={idx === sortedColumns.length - 1}
									className="text-slate-600 hover:text-slate-300 disabled:opacity-30"
								>
									<ChevronDown className="h-4 w-4" />
								</button>
							</div>
							<div>
								<h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
									System Key: {col.systemKey}
								</h4>
								<input
									type="text"
									value={col.name}
									onChange={(e) =>
										updateColumn(col.systemKey, { name: e.target.value })
									}
									className="bg-transparent text-lg font-semibold text-slate-100 outline-none focus:text-blue-400"
								/>
							</div>
						</div>

						<div className="w-full max-w-sm">
							<ColorPalettePicker
								label="Column Color"
								value={col.color}
								onChange={(color) => updateColumn(col.systemKey, { color })}
							/>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
						<div className="space-y-3">
							<PillSelect
								label="Default Status"
								value={col.defaultStatus}
								options={statusOptions}
								onChange={(val) =>
									updateColumn(col.systemKey, {
										defaultStatus: val as WorkflowTaskStatus,
									})
								}
							/>
						</div>

						<div className="space-y-2">
							<span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
								Allowed Statuses
							</span>
							<div className="flex flex-wrap gap-2">
								{availableStatuses.map((status) => {
									const isAllowed = col.allowedStatuses.includes(status);
									const option = statusOptions[status];
									const Icon = option.icon;
									return (
										<button
											key={status}
											type="button"
											onClick={() => toggleStatus(col.systemKey, status)}
											className={cn(
												"flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-all",
												isAllowed
													? undefined
													: "border-slate-800 bg-slate-900/50 text-slate-600 hover:border-slate-700",
											)}
											style={isAllowed ? option.style : undefined}
										>
											<Icon
												className="h-3.5 w-3.5"
												style={isAllowed ? option.iconStyle : undefined}
											/>
											<span className="text-[10px] font-bold uppercase tracking-wider">
												{status}
											</span>
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
