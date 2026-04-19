"use client";

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { FilePenLine, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { LightMarkdown } from "@/components/LightMarkdown";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { FileSystemPicker } from "@/components/common/FileSystemPicker";
import { api, uploadClipboardFiles } from "@/lib/api-client";

interface RichMarkdownEditorProps {
	value: string | null;
	onSave: (value: string) => void;
	onFilesSelected?: (files: File[]) => void;
	projectId?: string;
	placeholder?: string;
	emptyText?: string;
	autoEditWhenEmpty?: boolean;
	toolbarExtra?: React.ReactNode;
	saveOnBlur?: boolean;
}

type AttachmentItem = {
	name: string;
	url?: string;
	type?: string;
	size?: number;
};

export function RichMarkdownEditor({
	value,
	onSave,
	onFilesSelected,
	projectId,
	placeholder = "Add content...",
	emptyText = "No content provided. Click to add...",
	autoEditWhenEmpty = false,
	toolbarExtra,
	saveOnBlur = true,
}: RichMarkdownEditorProps) {
	const [isEditing, setIsEditing] = useState(
		autoEditWhenEmpty && !value?.trim(),
	);
	const [editValue, setEditValue] = useState(value ?? "");
	const [liveTranscript, setLiveTranscript] = useState("");
	const [isDragging, setIsDragging] = useState(false);
	const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
	const [projectPath, setProjectPath] = useState<string | undefined>(undefined);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const overlayRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setEditValue(value ?? "");
	}, [value]);

	useEffect(() => {
		if (autoEditWhenEmpty && !value?.trim()) {
			setIsEditing(true);
		}
	}, [autoEditWhenEmpty, value]);

	useEffect(() => {
		if (!isEditing || !textareaRef.current) return;
		textareaRef.current.focus();
	}, [isEditing]);

	useEffect(() => {
		if (!isFilePickerOpen || !projectId) return;

		const fetchProjectPath = async () => {
			try {
				const projects = await api.project.getAll();
				const project = projects.find((item) => item.id === projectId);
				if (project) {
					setProjectPath(project.path);
				}
			} catch (error) {
				console.error("Failed to fetch project path:", error);
			}
		};

		void fetchProjectPath();
	}, [isFilePickerOpen, projectId]);

	const currentValue = isEditing ? editValue : (value ?? "");

	const handleScroll = () => {
		if (textareaRef.current && overlayRef.current) {
			overlayRef.current.scrollTop = textareaRef.current.scrollTop;
		}
	};

	const handleStartEditing = () => {
		setEditValue(value ?? "");
		setIsEditing(true);
	};

	const handleSave = (nextValue = editValue) => {
		if (nextValue !== value) {
			onSave(nextValue);
		}
		setIsEditing(false);
	};

	const handleVoiceDelta = (delta: string) => {
		setLiveTranscript(delta);
	};

	const handleVoiceTranscript = (transcript: string) => {
		const trimmed = transcript.trim();
		if (!trimmed) {
			setLiveTranscript("");
			return;
		}

		const currentText = editValue;
		const hasExistingText = currentText.trim().length > 0;
		const prefixNewline =
			hasExistingText && !currentText.endsWith("\n") ? "\n" : "";
		const suffixNewlines = hasExistingText ? "\n\n" : "\n";
		const newText = currentText + prefixNewline + trimmed + suffixNewlines;

		setEditValue(newText);
		setLiveTranscript("");
		setIsEditing(true);

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
		const nextValue = buildDescriptionWithAttachments(editValue, items);
		setEditValue(nextValue);
		onSave(nextValue);
		setIsEditing(true);
	};

	const isFileDrag = (e: React.DragEvent) =>
		Array.from(e.dataTransfer.types || []).includes("Files");

	const extractClipboardFiles = (clipboardData: DataTransfer): File[] => {
		const directFiles = Array.from(clipboardData.files ?? []);
		const itemFiles = Array.from(clipboardData.items ?? [])
			.filter((item) => item.kind === "file")
			.map((item) => item.getAsFile())
			.filter((file): file is File => file !== null);

		const uniqueFiles = new Map<string, File>();
		for (const file of [...directFiles, ...itemFiles]) {
			const key = `${file.name}:${file.size}:${file.type}`;
			uniqueFiles.set(key, file);
		}

		return Array.from(uniqueFiles.values());
	};

	const handleRemoveLink = (url: string) => {
		const nextValue = editValue
			.split("\n")
			.filter((line) => !line.includes(`](${url})`))
			.join("\n");

		setEditValue(nextValue);
		onSave(nextValue);
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

	const handlePaste = async (event: ClipboardEvent<HTMLElement>) => {
		const files = extractClipboardFiles(event.clipboardData);
		if (files.length === 0) return;

		event.preventDefault();

		const textPath = event.clipboardData.getData("text/plain")?.trim();

		if (textPath) {
			const items: AttachmentItem[] = files.map((f) => {
				const normalized = textPath.replace(/\\/g, "/");
				return {
					name: f.name || normalized.split("/").pop() || textPath,
					url: buildFileUrlFromPath(textPath),
				};
			});
			appendAttachmentItemsToDescription(items);
			return;
		}

		const uploadedFiles = await uploadClipboardFiles(files);
		if (uploadedFiles.length === 0) return;

		const items: AttachmentItem[] = uploadedFiles.map((u) => ({
			name: u.name,
			url: buildFileUrlFromPath(u.path),
		}));

		appendAttachmentItemsToDescription(items);
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
				"flex flex-col flex-1 min-h-0 space-y-3 transition-all duration-200 relative",
				isDragging &&
					"bg-blue-500/5 ring-2 ring-inset ring-blue-500/20 rounded-2xl px-4",
			)}
			aria-label="Markdown editor"
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			onPasteCapture={handlePaste}
		>
			{isDragging && (
				<div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
					<div className="bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 animate-bounce">
						<Paperclip className="w-3.5 h-3.5" />
						Drop to attach files
					</div>
				</div>
			)}

			<div className="flex items-center justify-end gap-1">
				{!isEditing && (
					<button
						type="button"
						onClick={handleStartEditing}
						className="w-8 h-8 flex items-center justify-center bg-slate-500/10 hover:bg-slate-500 text-slate-400 hover:text-white rounded-lg transition-all border border-slate-500/20 hover:border-slate-500"
						title="Edit"
					>
						<FilePenLine className="w-4 h-4" />
					</button>
				)}

				{toolbarExtra}

				<VoiceInputButton
					onDelta={handleVoiceDelta}
					onTranscript={handleVoiceTranscript}
				/>

				<button
					type="button"
					onClick={() => setIsFilePickerOpen(true)}
					className="w-8 h-8 flex items-center justify-center bg-slate-500/10 hover:bg-slate-500 text-slate-400 hover:text-white rounded-lg transition-all border border-slate-500/20 hover:border-slate-500"
					title="Attach files"
				>
					<Paperclip className="w-4 h-4" />
				</button>
			</div>

			<div className="relative flex-1 min-h-0">
				{isEditing ? (
					<div className="relative w-full h-full overflow-hidden">
						<textarea
							ref={textareaRef}
							value={editValue}
							onChange={(e) => setEditValue(e.target.value)}
							onScroll={handleScroll}
							onBlur={saveOnBlur ? () => handleSave() : undefined}
							placeholder={placeholder}
							className="w-full h-full bg-[#161B26] border border-slate-800/60 rounded-xl p-4 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none font-mono"
						/>
						{liveTranscript && (
							<div
								ref={overlayRef}
								className="absolute inset-0 pointer-events-none p-4 text-sm font-mono whitespace-pre-wrap break-words overflow-y-scroll scrollbar-none [&::-webkit-scrollbar]:hidden"
							>
								<span className="opacity-0">{editValue}</span>
								<span className="text-blue-400/50 italic animate-pulse">
									{editValue.length > 0 &&
									!editValue.endsWith(" ") &&
									!editValue.endsWith("\n")
										? " "
										: ""}
									{liveTranscript}
								</span>
							</div>
						)}
					</div>
				) : (
					<div className="relative w-full h-full bg-[#161B26]/50 border border-transparent rounded-xl p-4 text-sm text-slate-300 overflow-y-auto transition-colors">
						{currentValue ? (
							<>
								<LightMarkdown
									text={currentValue}
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
							<span className="text-slate-600 italic">{emptyText}</span>
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
