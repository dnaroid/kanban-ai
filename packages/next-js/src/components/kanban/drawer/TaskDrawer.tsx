"use client";

import { useEffect, useRef, useState } from "react";
import {
	Check,
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

interface TaskDrawerProps {
	task: KanbanTask | null;
	isOpen: boolean;
	onClose: () => void;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
	onRefreshTask?: () => Promise<void> | void;
	columnName?: string;
	mode?: "create" | "edit";
	onCreateTask?: (data: {
		title: string;
		description?: string;
	}) => Promise<KanbanTask>;
}

export function TaskDrawer({
	task,
	isOpen,
	onClose,
	onUpdate,
	onRefreshTask,
	columnName,
	mode = "edit",
	onCreateTask,
}: TaskDrawerProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	if (!isOpen) return null;
	if (mode === "edit" && !task) return null;

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
					mode === "create" && !task
						? "left-[var(--sidebar-width)]"
						: isExpanded
							? "left-[var(--sidebar-width)]"
							: "w-[600px]",
				)}
			>
				{mode === "create" && !task ? (
					<TaskDrawerCreateForm
						onClose={onClose}
						onCreateTask={onCreateTask}
						onTaskCreated={(createdTask) => {
							onUpdate?.(createdTask.id, createdTask);
						}}
					/>
				) : task ? (
					<TaskDrawerContent
						task={task}
						onClose={onClose}
						onUpdate={onUpdate}
						onRefreshTask={onRefreshTask}
						columnName={columnName}
						isExpanded={isExpanded}
						onToggleExpand={() => setIsExpanded((prev) => !prev)}
						showExpandButton={true}
					/>
				) : null}
			</div>
		</>
	);
}

interface TaskDrawerContentProps {
	task: KanbanTask;
	onClose: () => void;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
	onRefreshTask?: () => Promise<void> | void;
	columnName?: string;
	isExpanded?: boolean;
	onToggleExpand?: () => void;
	showExpandButton?: boolean;
	defaultTab?: "details" | "runs" | "qa" | "vcs" | "properties" | "artifacts";
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
		"details" | "runs" | "qa" | "vcs" | "properties" | "artifacts"
	>(defaultTab);
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
		{ id: "runs" as const, label: "Run" },
		...(task.qaReport ? [{ id: "qa" as const, label: "QA" }] : []),
		{ id: "artifacts" as const, label: "Artifacts" },
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
						<QaReportPanel task={task} onUpdate={onUpdate} />
					</div>
				)}

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
}: {
	task: KanbanTask;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
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
			/>
		</div>
	);
}

interface TaskDrawerCreateFormProps {
	onClose: () => void;
	onCreateTask?: (data: {
		title: string;
		description?: string;
	}) => Promise<KanbanTask>;
	onTaskCreated?: (task: KanbanTask) => void;
}

function TaskDrawerCreateForm({
	onClose,
	onCreateTask,
	onTaskCreated,
}: TaskDrawerCreateFormProps) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const titleInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		titleInputRef.current?.focus();
	}, []);

	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handleGlobalKeyDown);
		return () => window.removeEventListener("keydown", handleGlobalKeyDown);
	}, [onClose]);

	const handleCreate = async () => {
		const trimmedTitle = title.trim();
		if (!trimmedTitle || !onCreateTask || isCreating) return;

		setIsCreating(true);
		try {
			const createdTask = await onCreateTask({
				title: trimmedTitle,
				description: description.trim() || undefined,
			});
			onTaskCreated?.(createdTask);
		} catch {
			// Error toast handled by ApiClient.onError.
		} finally {
			setIsCreating(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleCreate();
		}
	};

	const canCreate = title.trim().length > 0 && !isCreating;

	return (
		<div className="flex flex-col h-full bg-[#0B0E14]">
			<div className="h-14 border-b border-slate-800/60 flex items-center justify-between px-4 bg-[#11151C] shrink-0">
				<div className="flex items-center gap-2 flex-1 min-w-0 mr-4">
					<h2 className="text-sm font-semibold text-slate-200">New Task</h2>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => void handleCreate()}
						disabled={!canCreate}
						className={cn(
							"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
							canCreate
								? "bg-blue-600 text-white hover:bg-blue-500 cursor-pointer"
								: "bg-slate-800 text-slate-500 cursor-not-allowed",
						)}
					>
						<Check className="w-3.5 h-3.5" />
						{isCreating ? "Creating..." : "Create Task"}
					</button>
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

			<div className="flex-1 overflow-y-auto">
				<div className="p-6 flex flex-col gap-5">
					<div className="flex flex-col gap-2">
						<label
							htmlFor="new-task-title"
							className="text-xs font-bold uppercase tracking-widest text-slate-500"
						>
							Title
						</label>
						<input
							id="new-task-title"
							ref={titleInputRef}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Enter task title..."
							className="w-full bg-slate-900/50 border border-slate-700/50 text-sm text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 placeholder:text-slate-600"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<label
							htmlFor="new-task-description"
							className="text-xs font-bold uppercase tracking-widest text-slate-500"
						>
							Description
						</label>
						<textarea
							id="new-task-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Describe the task... (optional)"
							rows={6}
							className="w-full bg-slate-900/50 border border-slate-700/50 text-sm text-slate-200 px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 placeholder:text-slate-600 resize-none"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
