"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, MoreVertical, Trash2, X } from "lucide-react";
import type { KanbanTask } from "@/types/kanban";
import { cn } from "@/lib/utils";
import { TaskDrawerProperties } from "./TaskDrawerProperties";
import { TaskDrawerDetails } from "./TaskDrawerDetails";
import { TaskDrawerRuns } from "./TaskDrawerRuns";
import { TaskDrawerVcs } from "./TaskDrawerVcs";

interface TaskDrawerProps {
	task: KanbanTask | null;
	isOpen: boolean;
	onClose: () => void;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
	columnName?: string;
}

export function TaskDrawer({
	task,
	isOpen,
	onClose,
	onUpdate,
	columnName,
}: TaskDrawerProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	if (!isOpen || !task) return null;

	return (
		<>
			<button
				type="button"
				className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 w-full h-full cursor-default"
				onClick={onClose}
				onKeyDown={(e) => e.key === "Escape" && onClose()}
				aria-label="Close drawer"
			/>
			<div
				className={cn(
					"fixed inset-y-0 right-0 bg-[#0B0E14] border-l border-slate-800/60 shadow-2xl transform transition-all duration-300 z-50 flex flex-col",
					isExpanded ? "left-[var(--sidebar-width)]" : "w-[600px]",
				)}
			>
				<TaskDrawerContent
					task={task}
					onClose={onClose}
					onUpdate={onUpdate}
					columnName={columnName}
					isExpanded={isExpanded}
					onToggleExpand={() => setIsExpanded((prev) => !prev)}
					showExpandButton={true}
				/>
			</div>
		</>
	);
}

interface TaskDrawerContentProps {
	task: KanbanTask;
	onClose: () => void;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
	columnName?: string;
	isExpanded?: boolean;
	onToggleExpand?: () => void;
	showExpandButton?: boolean;
	defaultTab?: "details" | "runs" | "vcs" | "properties";
}

export function TaskDrawerContent({
	task,
	onClose,
	onUpdate,
	columnName,
	isExpanded = false,
	onToggleExpand,
	showExpandButton = false,
	defaultTab = "details",
}: TaskDrawerContentProps) {
	const [activeTab, setActiveTab] = useState<
		"details" | "runs" | "vcs" | "properties"
	>(task.opencodeWebUrl ? "runs" : defaultTab);
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editedTitle, setEditedTitle] = useState(task.title || "");
	const titleInputRef = useRef<HTMLInputElement>(null);
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	useEffect(() => {
		if (isEditingTitle && titleInputRef.current) {
			titleInputRef.current.focus();
		}
	}, [isEditingTitle]);

	const handleSaveTitle = () => {
		if (task && editedTitle !== task.title) {
			onUpdate?.(task.id, { title: editedTitle });
		}
		setIsEditingTitle(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleSaveTitle();
		} else if (e.key === "Escape") {
			setIsEditingTitle(false);
			setEditedTitle(task?.title || "");
		}
	};

	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !isEditingTitle) {
				onClose();
			}
		};

		window.addEventListener("keydown", handleGlobalKeyDown);

		return () => {
			window.removeEventListener("keydown", handleGlobalKeyDown);
		};
	}, [isEditingTitle, onClose]);

	const tabs = [
		{ id: "details" as const, label: "Details" },
		{ id: "runs" as const, label: "Runs" },
		{ id: "vcs" as const, label: "VCS" },
		{ id: "properties" as const, label: "Properties" },
	];

	return (
		<div className="flex flex-col h-full bg-[#0B0E14]">
			<div className="h-14 border-b border-slate-800/60 flex items-center justify-between px-4 bg-[#11151C] shrink-0">
				<div className="flex items-center gap-2 flex-1 min-w-0 mr-4">
					{isEditingTitle ? (
						<input
							ref={titleInputRef}
							value={editedTitle}
							onChange={(e) => setEditedTitle(e.target.value)}
							onBlur={handleSaveTitle}
							onKeyDown={handleKeyDown}
							className="flex-1 bg-slate-900 border border-blue-500/50 text-sm font-semibold text-white px-2 py-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50"
						/>
					) : (
						<button
							type="button"
							className="flex-1 min-w-0 group cursor-pointer text-left"
							onClick={() => {
								setEditedTitle(task.title || "");
								setIsEditingTitle(true);
							}}
						>
							<h2 className="text-sm font-semibold text-slate-200 truncate group-hover:text-blue-400 transition-colors">
								{task.title}
							</h2>
						</button>
					)}
				</div>
				<div className="flex items-center gap-1">
					{showExpandButton && onToggleExpand && (
						<button
							type="button"
							onClick={onToggleExpand}
							className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
							title={isExpanded ? "Collapse" : "Expand"}
						>
							{isExpanded ? (
								<Minimize2 className="w-4 h-4" />
							) : (
								<Maximize2 className="w-4 h-4" />
							)}
						</button>
					)}
					<div className="relative">
						<button
							type="button"
							onClick={() => setIsMenuOpen(!isMenuOpen)}
							className={cn(
								"p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors",
								isMenuOpen && "text-slate-300 bg-slate-800",
							)}
						>
							<MoreVertical className="w-4 h-4" />
						</button>

						{isMenuOpen && (
							<>
								<button
									type="button"
									className="fixed inset-0 z-10 w-full h-full cursor-default"
									onClick={() => setIsMenuOpen(false)}
									onKeyDown={(e) => e.key === "Escape" && setIsMenuOpen(false)}
									aria-label="Close menu"
								/>
								<div className="absolute right-0 top-full mt-1 w-48 bg-[#161B26] border border-slate-700/60 rounded-xl shadow-xl z-20 py-1 animate-in fade-in zoom-in-95 duration-200">
									<button
										type="button"
										onClick={() => {
											setIsMenuOpen(false);
										}}
										className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
									>
										<Trash2 className="w-3.5 h-3.5" />
										Delete Task
									</button>
								</div>
							</>
						)}
					</div>
					<div className="w-px h-4 bg-slate-800/60 mx-1" />
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 text-slate-500 hover:text-white hover:bg-red-500/10 hover:border-red-500/20 border border-transparent rounded-lg transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>

			<div className="flex items-center px-4 border-b border-slate-800/60 bg-[#11151C] shrink-0">
				{tabs.map((tab) => (
					<button
						type="button"
						key={tab.id}
						onClick={() => setActiveTab(tab.id)}
						className={cn(
							"px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors relative",
							activeTab === tab.id
								? "text-blue-400 border-blue-500 bg-blue-500/5"
								: "text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/50",
						)}
					>
						{tab.label}
					</button>
				))}
			</div>

			<div className="flex-1 overflow-hidden relative bg-[#0B0E14]">
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
						onStartRun={() => setActiveTab("runs")}
					/>
				</div>

				<div
					className={cn(
						"absolute inset-0 flex flex-col",
						activeTab !== "runs" && "hidden",
					)}
				>
					<TaskDrawerRuns task={task} isActive={activeTab === "runs"} />
				</div>

				<div
					className={cn(
						"absolute inset-0 flex flex-col",
						activeTab !== "properties" && "hidden",
					)}
				>
					<TaskDrawerProperties task={task} onUpdate={onUpdate} />
				</div>

				<div
					className={cn(
						"absolute inset-0 flex flex-col",
						activeTab !== "vcs" && "hidden",
					)}
				>
					<TaskDrawerVcs
						task={task}
						isActive={activeTab === "vcs"}
						onOpenRuns={() => setActiveTab("runs")}
					/>
				</div>
			</div>
		</div>
	);
}
