"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
	ChevronLeft,
	ChevronRight,
	Columns,
	Layout,
	Loader2,
} from "lucide-react";
import { useTaskModel } from "@/features/task/model/use-task-model";
import { TaskPageContent } from "@/features/task/ui/TaskPageContent";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function StandaloneTaskPage() {
	const params = useParams();
	const router = useRouter();
	const projectId = params.projectId as string;
	const taskId = params.taskId as string;

	const { task, columnName, loading, error, handleUpdate, board } =
		useTaskModel(projectId, taskId);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

	if (loading) {
		return (
			<div className="h-full flex items-center justify-center bg-[#0B0E14]">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
					<p className="text-slate-400 font-medium">Loading task details...</p>
				</div>
			</div>
		);
	}

	if (error || !task) {
		return (
			<div className="h-full flex items-center justify-center bg-[#0B0E14]">
				<div className="text-center space-y-4">
					<p className="text-red-400 text-lg font-semibold">
						{error || "Task not found"}
					</p>
					<button
						type="button"
						onClick={() => router.push(`/board/${projectId}`)}
						className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
					>
						Back to Board
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full bg-[#0B0E14] text-slate-200 overflow-hidden">
			<aside
				className={cn(
					"border-r border-slate-800/60 bg-[#11151C] transition-all duration-300 flex flex-col relative shrink-0",
					sidebarCollapsed ? "w-16" : "w-80",
				)}
			>
				<div className="h-16 border-b border-slate-800/60 flex items-center px-4 shrink-0">
					{!sidebarCollapsed ? (
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
								<Layout className="w-4 h-4 text-blue-400" />
							</div>
							<span className="font-bold text-sm tracking-tight truncate">
								Board Overview
							</span>
						</div>
					) : (
						<div className="w-full flex justify-center">
							<Layout className="w-5 h-5 text-slate-500" />
						</div>
					)}
				</div>

				<div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
					{!sidebarCollapsed ? (
						<div className="px-4 space-y-1">
							{board?.columns.map((column) => (
								<div
									key={column.id}
									className={cn(
										"group flex items-center justify-between px-3 py-2.5 rounded-xl transition-all cursor-default border border-transparent",
										task.columnId === column.id
											? "bg-blue-500/10 border-blue-500/20 text-blue-400 shadow-sm"
											: "hover:bg-slate-800/50 text-slate-400 hover:text-slate-200",
									)}
								>
									<div className="flex items-center gap-3 min-w-0">
										<div
											className="w-2 h-2 rounded-full shrink-0 shadow-sm"
											style={{
												backgroundColor: column.color || "#475569",
											}}
										/>
										<span className="text-xs font-bold truncate uppercase tracking-wider">
											{column.name}
										</span>
									</div>
									{task.columnId === column.id && (
										<div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
									)}
								</div>
							))}
						</div>
					) : (
						<div className="flex flex-col items-center gap-4">
							{board?.columns.map((column) => (
								<div
									key={column.id}
									className={cn(
										"w-2 h-2 rounded-full transition-all",
										task.columnId === column.id
											? "scale-150 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
											: "bg-slate-700 hover:bg-slate-500",
									)}
									title={column.name}
								/>
							))}
						</div>
					)}
				</div>

				<div className="p-4 border-t border-slate-800/60">
					<Link
						href={`/board/${projectId}`}
						className={cn(
							"flex items-center gap-3 px-3 py-2 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-all",
							sidebarCollapsed && "justify-center px-0",
						)}
						title="Return to Board"
					>
						<Columns className="w-4 h-4" />
						{!sidebarCollapsed && (
							<span className="text-xs font-bold uppercase tracking-wider">
								Board View
							</span>
						)}
					</Link>
				</div>

				<button
					type="button"
					onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
					className="absolute -right-3 top-20 w-6 h-6 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-xl z-10"
				>
					{sidebarCollapsed ? (
						<ChevronRight className="w-3 h-3" />
					) : (
						<ChevronLeft className="w-3 h-3" />
					)}
				</button>
			</aside>

			<main className="flex-1 overflow-hidden">
				<TaskPageContent
					task={task}
					columnName={columnName}
					onUpdate={handleUpdate}
					projectId={projectId}
				/>
			</main>
		</div>
	);
}
