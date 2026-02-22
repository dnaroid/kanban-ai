import { useEffect, useRef, useState } from "react";
import {
	AlertTriangle,
	FilePenLine,
	Loader2,
	Play,
	Wand2,
	X,
	Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KanbanTask } from "@/types/kanban";
import { LightMarkdown } from "@/components/LightMarkdown";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { FileSystemPicker } from "@/components/common/FileSystemPicker";
import { api } from "@/lib/api-client";

interface TaskDetailsDescriptionProps {
	task: KanbanTask;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
	onStartRun?: () => void;
	onFilesSelected?: (files: File[]) => void;
	columnName?: string;
	isActive?: boolean;
	headerLeft?: React.ReactNode;
}

type AttachmentItem = {
	name: string;
	url?: string;
	type?: string;
	size?: number;
};

export function TaskDetailsDescription({
	task,
	onUpdate,
	onStartRun,
	onFilesSelected,
	columnName,
	headerLeft,
}: TaskDetailsDescriptionProps) {
	const [editedDescription, setEditedDescription] = useState(
		task.description || "",
	);
	const [isGeneratingStory, setIsGeneratingStory] = useState(false);
	const [generationError, setGenerationError] = useState<string | null>(null);
	const [isEditing, setIsEditing] = useState(!task.description?.trim());
	const [liveTranscript, setLiveTranscript] = useState("");
	const [isDragging, setIsDragging] = useState(false);
	const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
	const [projectPath, setProjectPath] = useState<string | undefined>(undefined);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const overlayRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!isEditing || !textareaRef.current) return;
		textareaRef.current.focus();
	}, [isEditing]);

	useEffect(() => {
		if (isFilePickerOpen && task.projectId) {
			const fetchProjectPath = async () => {
				try {
					const projects = await api.project.getAll();
					const project = projects.find((p) => p.id === task.projectId);
					if (project) {
						setProjectPath(project.path);
					}
				} catch (error) {
					console.error("Failed to fetch project path:", error);
				}
			};
			void fetchProjectPath();
		}
	}, [isFilePickerOpen, task.projectId]);

	const handleScroll = () => {
		if (textareaRef.current && overlayRef.current) {
			overlayRef.current.scrollTop = textareaRef.current.scrollTop;
		}
	};

	const handleSaveDescription = () => {
		if (editedDescription !== task.description) {
			onUpdate?.(task.id, { description: editedDescription });
		}
		setIsEditing(false);
	};

	const handleImproveDescription = async () => {
		setIsGeneratingStory(true);
		setGenerationError(null);

		try {
			await api.opencode.generateUserStory({ taskId: task.id });
		} catch (error) {
			console.error("Failed to generate user story:", error);
			setGenerationError("Failed to generate user story. Please try again.");
		} finally {
			setIsGeneratingStory(false);
		}
	};

	const currentDescription = isEditing
		? editedDescription
		: (task.description ?? "");

	const handleVoiceDelta = (delta: string) => {
		setLiveTranscript(delta);
	};

	const handleVoiceTranscript = (transcript: string) => {
		const trimmed = transcript.trim();
		if (!trimmed) {
			setLiveTranscript("");
			return;
		}

		const currentText = editedDescription;
		const hasExistingText = currentText.trim().length > 0;
		const prefixNewline =
			hasExistingText && !currentText.endsWith("\n") ? "\n" : "";
		const suffixNewlines = hasExistingText ? "\n\n" : "\n";
		const newText = currentText + prefixNewline + trimmed + suffixNewlines;

		setEditedDescription(newText);
		setLiveTranscript("");

		if (!isEditing) {
			setIsEditing(true);
		}

		if (textareaRef.current) {
			setTimeout(() => {
				if (textareaRef.current) {
					textareaRef.current.focus();
					textareaRef.current.setSelectionRange(newText.length, newText.length);
					textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
				}
			}, 0);
		}
	};

	const buildFileUrlFromPath = (filePath: string) => {
		const normalizedPath = filePath.replace(/\\/g, "/");
		const withPrefix = /^[A-Za-z]:\//.test(normalizedPath)
			? `/${normalizedPath}`
			: normalizedPath;
		return `file://${encodeURI(withPrefix)}`;
	};

	const buildFileUrl = (file: File) => {
		const filePath = (file as File & { path?: string }).path;
		if (!filePath) return null;
		return buildFileUrlFromPath(filePath);
	};

	const buildAttachmentLine = (attachment: AttachmentItem) => {
		if (!attachment.url) return attachment.name;
		return `[${attachment.name}](${attachment.url})`;
	};

	const buildDescriptionWithAttachments = (
		baseText: string,
		items: AttachmentItem[],
	) => {
		const lines = items.map(buildAttachmentLine);
		const cleanBase = baseText.trimEnd();
		const prefix = cleanBase.length > 0 ? "\n" : "";
		return `${cleanBase}${prefix}${lines.join("\n")}\n`;
	};

	const appendAttachmentItemsToDescription = (items: AttachmentItem[]) => {
		const nextDescription = buildDescriptionWithAttachments(
			editedDescription,
			items,
		);
		setEditedDescription(nextDescription);
		onUpdate?.(task.id, { description: nextDescription });

		if (!isEditing) {
			setIsEditing(true);
		}
	};

	const isFileDrag = (e: React.DragEvent) =>
		Array.from(e.dataTransfer.types || []).includes("Files");

	const handleRemoveLink = (url: string) => {
		const lines = editedDescription.split("\n");
		const nextLines = lines.filter((line) => {
			const isMatch = line.includes(`](${url})`);
			return !isMatch;
		});

		const nextDescription = nextLines.join("\n");
		setEditedDescription(nextDescription);
		onUpdate?.(task.id, { description: nextDescription });
	};

	const handleDragOver = (e: React.DragEvent) => {
		if (!isFileDrag(e)) return;
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		if (!isFileDrag(e)) return;
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		if (!isFileDrag(e)) return;
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);

		if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
			const files = Array.from(e.dataTransfer.files);
			const items: AttachmentItem[] = files.map((file) => ({
				name: file.name,
				url: buildFileUrl(file) ?? undefined,
				type: file.type,
				size: file.size,
			}));
			onFilesSelected?.(files);
			appendAttachmentItemsToDescription(items);
		}
	};

	const handlePickFiles = () => {
		setIsFilePickerOpen(true);
	};

	const handleFilesSelect = (paths: string[]) => {
		if (!paths || paths.length === 0) return;
		setIsFilePickerOpen(false);

		const items: AttachmentItem[] = paths.map((filePath) => {
			const normalized = filePath.replace(/\\/g, "/");
			const name = normalized.split("/").pop() || filePath;
			return {
				name,
				url: buildFileUrlFromPath(filePath),
			};
		});

		appendAttachmentItemsToDescription(items);
	};

	return (
		<section
			className={cn(
				"flex flex-col flex-1 min-h-0 space-y-3 px-6 transition-all duration-200 relative",
				isDragging &&
					"bg-blue-500/5 ring-2 ring-inset ring-blue-500/20 rounded-2xl mx-2 px-4",
			)}
			aria-label="Task description"
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			{isDragging && (
				<div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
					<div className="bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 animate-bounce">
						<Paperclip className="w-3.5 h-3.5" />
						Drop to attach files
					</div>
				</div>
			)}

			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{headerLeft || <div />}
					{columnName ? (
						<span className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase rounded-md bg-slate-800/70 border border-slate-700/60 text-slate-300">
							{columnName}
						</span>
					) : null}
				</div>
				<div className="flex items-center gap-1">
					{!isEditing && (
						<button
							type="button"
							onClick={() => {
								setEditedDescription(task.description || "");
								setIsEditing(true);
							}}
							className="w-8 h-8 flex items-center justify-center bg-slate-500/10 hover:bg-slate-500 text-slate-400 hover:text-white rounded-lg transition-all border border-slate-500/20 hover:border-slate-500"
							title="Edit description"
						>
							<FilePenLine className="w-4 h-4" />
						</button>
					)}

					{task.description && task.description.trim().length > 0 && (
						<button
							type="button"
							onClick={onStartRun}
							className="w-8 h-8 flex items-center justify-center bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg transition-all border border-blue-500/20 hover:border-blue-500 shadow-lg shadow-blue-500/5 animate-pulse-subtle mr-1"
							title="Run task"
						>
							<Play className="w-3.5 h-3.5 fill-current" />
						</button>
					)}

					<VoiceInputButton
						onDelta={handleVoiceDelta}
						onTranscript={handleVoiceTranscript}
					/>

					<button
						type="button"
						onClick={handlePickFiles}
						className="w-8 h-8 flex items-center justify-center bg-slate-500/10 hover:bg-slate-500 text-slate-400 hover:text-white rounded-lg transition-all border border-slate-500/20 hover:border-slate-500"
						title="Attach files"
					>
						<Paperclip className="w-4 h-4" />
					</button>

					<button
						type="button"
						onClick={handleImproveDescription}
						disabled={isGeneratingStory}
						className={cn(
							"w-8 h-8 flex items-center justify-center bg-violet-600/10 hover:bg-violet-600 text-violet-400 hover:text-white rounded-lg transition-all border border-violet-500/20 hover:border-violet-500",
							isGeneratingStory && "opacity-50 cursor-not-allowed",
						)}
						title="Improve with AI"
					>
						{isGeneratingStory ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							<Wand2 className="w-4 h-4" />
						)}
					</button>
				</div>
			</div>

			{generationError && (
				<div className="text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
					<AlertTriangle className="w-3 h-3 shrink-0" />
					<span className="flex-1">{generationError}</span>
					<button
						type="button"
						onClick={() => setGenerationError(null)}
						className="p-0.5 hover:bg-red-400/20 rounded-lg transition-colors"
					>
						<X className="w-3 h-3" />
					</button>
				</div>
			)}

			<div className="relative flex-1 min-h-0">
				{isEditing ? (
					<div className="relative w-full h-full overflow-hidden">
						<textarea
							ref={textareaRef}
							value={editedDescription}
							onChange={(e) => setEditedDescription(e.target.value)}
							onScroll={handleScroll}
							onBlur={handleSaveDescription}
							disabled={isGeneratingStory}
							placeholder="Add a description..."
							className={cn(
								"w-full h-full bg-[#161B26] border border-slate-800/60 rounded-xl p-4 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none font-mono",
								isGeneratingStory && "opacity-50 cursor-not-allowed",
							)}
						/>
						{liveTranscript && (
							<div
								ref={overlayRef}
								className="absolute inset-0 pointer-events-none p-4 text-sm font-mono whitespace-pre-wrap break-words overflow-y-scroll scrollbar-none [&::-webkit-scrollbar]:hidden"
							>
								<span className="opacity-0">{editedDescription}</span>
								<span className="text-blue-400/50 italic animate-pulse">
									{editedDescription.length > 0 &&
									!editedDescription.endsWith(" ") &&
									!editedDescription.endsWith("\n")
										? " "
										: ""}
									{liveTranscript}
								</span>
							</div>
						)}
					</div>
				) : (
					<div className="relative w-full h-full bg-[#161B26]/50 border border-transparent rounded-xl p-4 text-sm text-slate-300 overflow-y-auto transition-colors">
						{currentDescription ? (
							<>
								<LightMarkdown
									text={currentDescription}
									onRemoveLink={handleRemoveLink}
								/>
								{liveTranscript && (
									<div className="text-blue-400/50 italic animate-pulse mt-2 border-t border-slate-800/60 pt-2">
										{liveTranscript}
									</div>
								)}
							</>
						) : liveTranscript ? (
							<span className="text-blue-400/50 italic animate-pulse">
								{liveTranscript}
							</span>
						) : (
							<span className="text-slate-600 italic">
								No description provided. Click to add...
							</span>
						)}
					</div>
				)}
			</div>

			<FileSystemPicker
				isOpen={isFilePickerOpen}
				mode="files"
				initialPath={projectPath}
				title="Select Files to Attach"
				selectLabel="Attach Files"
				onSelect={handleFilesSelect}
				onClose={() => setIsFilePickerOpen(false)}
			/>
		</section>
	);
}
