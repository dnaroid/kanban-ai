"use client";

import { useState, useRef, useEffect } from "react";
import {
	ChevronLeft,
	MoreVertical,
	Trash2,
	Maximize2,
	Minimize2,
} from "lucide-react";
import Link from "next/link";
import type { KanbanTask } from "@/types/kanban";
import { cn } from "@/lib/utils";
import { TaskDrawerDetails } from "@/components/kanban/drawer/TaskDrawerDetails";
import { TaskDrawerProperties } from "@/components/kanban/drawer/TaskDrawerProperties";

interface TaskPageContentProps {
	task: KanbanTask;
	columnName?: string;
	onUpdate: (id: string, patch: Partial<KanbanTask>) => void;
	projectId: string;
}

export function TaskPageContent({
	task,
	columnName,
	onUpdate,
	projectId,
}: TaskPageContentProps) {
	const [activeTab, setActiveTab] = useState<"details" | "properties">(
		"details",
	);
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editedTitle, setEditedTitle] = useState(task.title);
	const titleInputRef = useRef<HTMLInputElement>(null);
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	useEffect(() => {
		setEditedTitle(task.title);
	}, [task.title]);

	useEffect(() => {
		if (isEditingTitle && titleInputRef.current) {
			titleInputRef.current.focus();
		}
	}, [isEditingTitle]);

	const handleSaveTitle = () => {
		if (editedTitle !== task.title) {
			onUpdate(task.id, { title: editedTitle });
		}
		setIsEditingTitle(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleSaveTitle();
		} else if (e.key === "Escape") {
			setIsEditingTitle(false);
			setEditedTitle(task.title);
		}
	};

	const tabs = [
		{ id: "details" as const, label: "Details" },
		{ id: "properties" as const, label: "Properties" },
	];

	return (
		<div className="flex flex-col h-full bg-[#0B0E14]">
			<div className="h-16 border-b border-slate-800/60 flex items-center justify-between px-6 bg-[#11151C] shrink-0">
				<div className="flex items-center gap-4 flex-1 min-w-0">
					<Link
						href={`/board/${projectId}`}
						className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
					>
						<ChevronLeft className="w-5 h-5" />
					</Link>
					<div className="flex items-center gap-2 flex-1 min-w-0">
						{isEditingTitle ? (
							<input
								ref={titleInputRef}
								value={editedTitle}
								onChange={(e) => setEditedTitle(e.target.value)}
								onBlur={handleSaveTitle}
								onKeyDown={handleKeyDown}
								className="flex-1 max-w-2xl bg-slate-900 border border-blue-500/50 text-lg font-bold text-white px-3 py-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50"
							/>
						) : (
							<button
								type="button"
								className="text-left"
								onClick={() => setIsEditingTitle(true)}
							>
								<h1 className="text-lg font-bold text-slate-200 truncate hover:text-blue-400 transition-colors">
									{task.title}
								</h1>
							</button>
						)}
					</div>
				</div>

				<div className="flex items-center gap-2">
					<div className="relative">
						<button
							type="button"
							onClick={() => setIsMenuOpen(!isMenuOpen)}
							className={cn(
								"p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors",
								isMenuOpen && "text-slate-300 bg-slate-800",
							)}
						>
							<MoreVertical className="w-5 h-5" />
						</button>

						{isMenuOpen && (
							<>
								<button
									type="button"
									className="fixed inset-0 z-10 bg-transparent cursor-default"
									onClick={() => setIsMenuOpen(false)}
									aria-label="Close menu"
								/>
								<div className="absolute right-0 top-full mt-2 w-48 bg-[#161B26] border border-slate-700/60 rounded-xl shadow-xl z-20 py-1 animate-in fade-in zoom-in-95 duration-200">
									<button
										type="button"
										onClick={() => {
											setIsMenuOpen(false);
										}}
										className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
									>
										<Trash2 className="w-4 h-4" />
										Delete Task
									</button>
								</div>
							</>
						)}
					</div>
				</div>
			</div>

			<div className="flex items-center px-6 border-b border-slate-800/60 bg-[#11151C] shrink-0">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setActiveTab(tab.id)}
						className={cn(
							"px-6 py-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors relative",
							activeTab === tab.id
								? "text-blue-400 border-blue-500 bg-blue-500/5"
								: "text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/50",
						)}
					>
						{tab.label}
					</button>
				))}
			</div>

			<div className="flex-1 overflow-hidden relative">
				<div
					className={cn(
						"absolute inset-0 flex flex-col",
						activeTab !== "details" && "hidden",
					)}
				>
					<TaskDrawerDetails
						task={task}
						onUpdate={onUpdate}
						columnName={columnName}
						isActive={activeTab === "details"}
					/>
				</div>

				<div
					className={cn(
						"absolute inset-0 flex flex-col",
						activeTab !== "properties" && "hidden",
					)}
				>
					<TaskDrawerProperties task={task} />
				</div>
			</div>
		</div>
	);
}
