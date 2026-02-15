"use client";

import { Clock, FolderKanban, Hash, Settings } from "lucide-react";
import type { KanbanTask } from "@/types/kanban";

interface TaskDrawerPropertiesProps {
	task: KanbanTask;
}

export function TaskDrawerProperties({ task }: TaskDrawerPropertiesProps) {
	const formatDate = (dateString: string | undefined) => {
		if (!dateString) return "—";
		const date = new Date(dateString);
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	return (
		<div className="p-8 space-y-8 animate-in fade-in duration-300 overflow-y-auto">
			<div className="flex items-center gap-3 mb-6">
				<div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
					<Settings className="w-5 h-5" />
				</div>
				<div>
					<h3 className="text-sm font-bold text-white uppercase tracking-wider">
						Task Properties
					</h3>
					<p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">
						Metadata and system information
					</p>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-8">
				<div className="space-y-2">
					<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Hash className="w-2.5 h-2.5" />
						Task ID
					</label>
					<span className="block text-xs text-slate-400 font-mono bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{task.id}
					</span>
				</div>
				<div className="space-y-2">
					<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<FolderKanban className="w-2.5 h-2.5" />
						Column ID
					</label>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{task.columnId}
					</span>
				</div>
				<div className="space-y-2">
					<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Clock className="w-2.5 h-2.5" />
						Created At
					</label>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{formatDate(task.createdAt)}
					</span>
				</div>
				<div className="space-y-2">
					<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Clock className="w-2.5 h-2.5" />
						Last Updated
					</label>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{formatDate(task.updatedAt)}
					</span>
				</div>
				<div className="space-y-2">
					<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
						Position in Column
					</label>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						#{task.orderInColumn + 1}
					</span>
				</div>
				<div className="space-y-2">
					<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
						Project ID
					</label>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner font-mono">
						{task.projectId}
					</span>
				</div>
				<div className="space-y-2">
					<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
						Board ID
					</label>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner font-mono">
						{task.boardId}
					</span>
				</div>
				<div className="space-y-2">
					<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
						Status
					</label>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{task.status}
					</span>
				</div>
			</div>
		</div>
	);
}
