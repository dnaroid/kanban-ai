"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTaskModel } from "@/features/task/model/use-task-model";
import { TaskDrawerContent } from "@/components/kanban/drawer/TaskDrawer";

export default function StandaloneTaskPage() {
	const params = useParams();
	const router = useRouter();
	const searchParams = useSearchParams();
	const projectId = params.projectId as string;
	const taskId = params.taskId as string;
	const tabParam = searchParams.get("tab") as
		| "details"
		| "runs"
		| "vcs"
		| "properties"
		| null;

	const { task, columnName, loading, error, handleUpdate } = useTaskModel(
		projectId,
		taskId,
	);

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
			<main className="flex-1 overflow-hidden">
				<TaskDrawerContent
					task={task}
					columnName={columnName}
					onUpdate={handleUpdate}
					onClose={() => router.push(`/board/${projectId}`)}
					defaultTab={tabParam ?? "details"}
				/>
			</main>
		</div>
	);
}
