"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	Maximize2,
	Minimize2,
	MoreVertical,
	Trash2,
	X,
	XCircle,
} from "lucide-react";
import type { KanbanTask } from "@/types/kanban";
import { cn } from "@/lib/utils";
import { RichMarkdownEditor } from "@/components/common/RichMarkdownEditor";
import { TaskDrawerProperties } from "./TaskDrawerProperties";
import { TaskDrawerDetails } from "./TaskDrawerDetails";
import { TaskDrawerRuns } from "./TaskDrawerRuns";
import { TaskDrawerVcs } from "./TaskDrawerVcs";
import { TaskArtifactsPanel } from "./TaskArtifactsPanel";
import { TaskDrawerExecutionReport } from "./TaskDrawerExecutionReport";

interface TaskDrawerContentProps {
	task: KanbanTask;
	onClose: () => void;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
	onRefreshTask?: () => Promise<void> | void;
	columnName?: string;
	isExpanded?: boolean;
	onToggleExpand?: () => void;
	showExpandButton?: boolean;
	defaultTab?:
		| "details"
		| "runs"
		| "qa"
		| "vcs"
		| "properties"
		| "artifacts"
		| "report";
}

export function TaskDrawerContent({
	task,
	onClose,
	onUpdate,
	onRefreshTask,
	columnName,
	isExpanded = false,
	onToggleExpand,
	showExpandButton = false,
	defaultTab = "details",
}: TaskDrawerContentProps) {
	const [activeTab, setActiveTab] = useState<
		"details" | "runs" | "qa" | "vcs" | "properties" | "artifacts" | "report"
	>(defaultTab);
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editedTitle, setEditedTitle] = useState(task.title || "");
	const titleInputRef = useRef<HTMLInputElement>(null);
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	const handleClose = useCallback(() => {
		// The Run tab owns live streams/polling through nested components. Give React a
		// render turn to deactivate that tab before route navigation unmounts the page.
		// This prevents active Run effects from holding up task-page navigation.
		if (activeTab === "runs") {
			setActiveTab("details");
			window.setTimeout(onClose, 0);
			return;
		}

		onClose();
	}, [activeTab, onClose]);

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
		}
		// Escape is handled by the global keydown listener below
	};

	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				// Skip if a Radix Dialog already handled this Escape (modal open)
				if (e.defaultPrevented) return;

				// Cancel title editing if active, then always navigate back
				if (isEditingTitle) {
					setIsEditingTitle(false);
					setEditedTitle(task?.title || "");
				}
				handleClose();
			}
		};

		window.addEventListener("keydown", handleGlobalKeyDown);

		return () => {
			window.removeEventListener("keydown", handleGlobalKeyDown);
		};
	}, [handleClose, isEditingTitle, task?.title]);

	const tabs = [
		{ id: "details" as const, label: "Details" },
		{ id: "runs" as const, label: "Run" },
		{ id: "report" as const, label: "Report" },
		...(task.qaReport ? [{ id: "qa" as const, label: "QA" }] : []),
		{ id: "artifacts" as const, label: "Artifacts" },
		{ id: "vcs" as const, label: "VCS" },
		{ id: "properties" as const, label: "Properties" },
	];

	return (
		<div
			className="flex flex-col h-full bg-[#0B0E14]"
			data-testid="task-details-panel"
		>
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
							className="flex-1 min-w-0 group cursor-pointer text-left hover:bg-slate-800/30 rounded-lg transition-colors"
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
						onClick={handleClose}
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
						data-testid={`tab-${tab.id}`}
						onClick={() => setActiveTab(tab.id)}
						className={cn(
							"px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors relative",
							activeTab === tab.id
								? tab.id === "qa"
									? "text-red-400 border-red-500 bg-red-500/5"
									: "text-blue-400 border-blue-500 bg-blue-500/5"
								: tab.id === "qa"
									? "text-red-500/60 border-transparent hover:text-red-400 hover:bg-red-500/5"
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
					<TaskDrawerRuns
						task={task}
						isActive={activeTab === "runs"}
						onRefreshTask={onRefreshTask}
					/>
				</div>

				{task.qaReport && (
					<div
						className={cn(
							"absolute inset-0 flex flex-col overflow-y-auto",
							activeTab !== "qa" && "hidden",
						)}
					>
						<QaReportPanel
							task={task}
							onUpdate={onUpdate}
							isActive={activeTab === "qa"}
						/>
					</div>
				)}

				<div
					className={cn(
						"absolute inset-0 flex flex-col",
						activeTab !== "report" && "hidden",
					)}
				>
					<TaskDrawerExecutionReport
						task={task}
						isActive={activeTab === "report"}
					/>
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

				<div
					className={cn(
						"absolute inset-0 flex flex-col",
						activeTab !== "artifacts" && "hidden",
					)}
				>
					<TaskArtifactsPanel
						taskId={task.id}
						descriptionMd={task.description}
						isActive={activeTab === "artifacts"}
					/>
				</div>
			</div>
		</div>
	);
}

function QaReportPanel({
	task,
	onUpdate,
	isActive: isActive = true,
}: {
	task: KanbanTask;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
	isActive?: boolean;
}) {
	return (
		<div className="p-5 flex flex-col gap-4 h-full">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
						<XCircle className="w-4 h-4 text-red-400" />
					</div>
					<h3 className="text-sm font-bold text-slate-200">QA Report</h3>
				</div>
			</div>

			<RichMarkdownEditor
				value={task.qaReport}
				onSave={(value) => {
					const trimmed = value.trim();
					onUpdate?.(task.id, { qaReport: trimmed || null });
				}}
				projectId={task.projectId}
				placeholder="Describe QA issues..."
				emptyText="No QA report. Click to add..."
				autoEditWhenEmpty={true}
				isActive={isActive}
			/>
		</div>
	);
}
