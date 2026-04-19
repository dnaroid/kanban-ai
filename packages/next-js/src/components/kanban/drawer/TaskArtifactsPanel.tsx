import { useCallback, useEffect, useState } from "react";
import {
	Eye,
	FileCode,
	FileJson,
	Files,
	FileText,
	RefreshCw,
	Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/types/ipc";
import { api } from "@/lib/api";

interface UploadItem {
	id: string;
	taskId: string | null;
	storedName: string;
	originalName: string;
	absolutePath: string;
	mimeType: string;
	size: number;
	createdAt: string;
}

type UnifiedItem =
	| { type: "artifact"; data: Artifact }
	| { type: "upload"; data: UploadItem };

function ArtifactViewer({ artifact }: { artifact: Artifact }) {
	if (artifact.kind === "json") {
		let formatted = artifact.content;
		try {
			formatted = JSON.stringify(JSON.parse(artifact.content), null, 2);
		} catch {
			// ignore
		}

		return (
			<pre className="text-xs font-mono text-blue-300 whitespace-pre-wrap p-4 bg-slate-900/50 rounded-lg border border-slate-800/50 overflow-auto max-h-full custom-scrollbar selection:bg-blue-500/30">
				{formatted}
			</pre>
		);
	}

	if (artifact.kind === "patch") {
		const lines = artifact.content.split("\n");
		return (
			<div className="font-mono text-xs overflow-auto max-h-full custom-scrollbar bg-slate-900/50 rounded-lg border border-slate-800/50 py-2">
				{lines.map((line, i) => {
					let className = "text-slate-400 px-4 py-0.5 block";
					if (line.startsWith("+"))
						className =
							"text-emerald-400 bg-emerald-500/10 px-4 py-0.5 block border-l-2 border-emerald-500/50";
					if (line.startsWith("-"))
						className =
							"text-red-400 bg-red-500/10 px-4 py-0.5 block border-l-2 border-red-500/50";
					if (line.startsWith("@@"))
						className =
							"text-blue-400/70 bg-blue-500/10 px-4 py-0.5 block italic";
					if (
						line.startsWith("diff") ||
						line.startsWith("index") ||
						line.startsWith("---") ||
						line.startsWith("+++")
					)
						className = "text-slate-500 px-4 py-0.5 block font-bold";
					return (
						<span key={`${line.slice(0, 20)}-${i}`} className={className}>
							{line}
						</span>
					);
				})}
			</div>
		);
	}

	return (
		<div className="text-sm text-slate-300 overflow-auto max-h-full custom-scrollbar p-4 bg-slate-900/50 rounded-lg border border-slate-800/50">
			<pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed selection:bg-blue-500/30">
				{artifact.content}
			</pre>
		</div>
	);
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadViewer({ upload }: { upload: UploadItem }) {
	const isImage = upload.mimeType.startsWith("image/");
	const isText =
		upload.mimeType.startsWith("text/") ||
		upload.mimeType === "application/json";

	if (isImage) {
		return (
			<div className="flex items-center justify-center p-4 overflow-auto max-h-full">
				<img
					src={upload.absolutePath}
					alt={upload.originalName}
					className="max-w-full max-h-full object-contain rounded-lg border border-slate-800/50"
				/>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
			<FileText className="w-10 h-10 text-slate-600" />
			<div>
				<p className="text-sm font-medium text-slate-300">
					{upload.originalName}
				</p>
				<p className="text-xs text-slate-500 mt-1">
					{upload.mimeType} &middot; {formatFileSize(upload.size)}
				</p>
			</div>
			{isText ? (
				<p className="text-xs text-slate-500 italic">
					File preview not available in this view
				</p>
			) : null}
		</div>
	);
}

function getItemId(item: UnifiedItem): string {
	return item.type === "artifact" ? `a-${item.data.id}` : `u-${item.data.id}`;
}

function getItemTitle(item: UnifiedItem): string {
	return item.type === "artifact" ? item.data.title : item.data.originalName;
}

function getItemDate(item: UnifiedItem): string {
	return item.data.createdAt;
}

function getRunShortId(item: UnifiedItem): string | null {
	if (item.type === "artifact") {
		return item.data.runId.slice(0, 8);
	}
	return null;
}

interface TaskArtifactsPanelProps {
	taskId: string;
	isActive: boolean;
}

export function TaskArtifactsPanel({
	taskId,
	isActive,
}: TaskArtifactsPanelProps) {
	const [artifacts, setArtifacts] = useState<Artifact[]>([]);
	const [uploads, setUploads] = useState<UploadItem[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(true);

	const fetchAll = useCallback(
		async (isAuto = false) => {
			if (!isAuto) setIsLoading(true);
			try {
				const [artifactsRes, uploadsRes] = await Promise.all([
					api.artifact.listByTask({ taskId }),
					api.upload.listByTask({ taskId }),
				]);
				setArtifacts(artifactsRes.artifacts);
				setUploads(uploadsRes.uploads);
			} catch (error) {
				console.error("Failed to fetch task artifacts/uploads:", error);
			} finally {
				setIsLoading(false);
			}
		},
		[taskId],
	);

	useEffect(() => {
		if (isActive) {
			void fetchAll();
		}
	}, [isActive, taskId]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (!selectedId || !selectedId.startsWith("a-")) {
			setSelectedArtifact(null);
			return;
		}
		const artifactId = selectedId.slice(2);
		let isActive = true;
		const fetchContent = async () => {
			try {
				const response = await api.artifact.get({ artifactId });
				if (!isActive) return;
				setSelectedArtifact(response.artifact);
			} catch (error) {
				console.error("Failed to fetch artifact content:", error);
			}
		};
		void fetchContent();
		return () => {
			isActive = false;
		};
	}, [selectedId]);

	const items: UnifiedItem[] = [
		...artifacts.map((a) => ({ type: "artifact" as const, data: a })),
		...uploads.map((u) => ({ type: "upload" as const, data: u })),
	];

	items.sort(
		(a, b) =>
			new Date(getItemDate(b)).getTime() - new Date(getItemDate(a)).getTime(),
	);

	const selectedItem = selectedId
		? (items.find((item) => getItemId(item) === selectedId) ?? null)
		: null;

	if (isLoading && artifacts.length === 0 && uploads.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full space-y-3 opacity-50">
				<RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
				<p className="text-xs text-slate-400 font-mono uppercase tracking-widest">
					Loading Artifacts...
				</p>
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full space-y-2 opacity-30">
				<Files className="w-8 h-8" />
				<p className="text-xs text-slate-400 font-mono">
					No artifacts or uploads for this task
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full overflow-hidden animate-in fade-in duration-300">
			<div className="w-48 border-r border-slate-800/50 flex flex-col bg-slate-900/10 shrink-0">
				<div className="p-3 border-b border-slate-800/50 bg-slate-800/20 flex items-center justify-between">
					<span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
						<Files className="w-3 h-3" />
						Items ({items.length})
					</span>
					<button
						type="button"
						onClick={() => void fetchAll()}
						className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded transition-colors"
						title="Refresh"
					>
						<RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
					{items.map((item) => {
						const id = getItemId(item);
						const title = getItemTitle(item);
						const isSelected = selectedId === id;
						const isArtifact = item.type === "artifact";

						return (
							<button
								type="button"
								key={id}
								onClick={() => setSelectedId(id)}
								className={cn(
									"w-full text-left px-3 py-2 rounded-lg transition-all group relative overflow-hidden text-[11px]",
									isSelected
										? "bg-blue-600/20 border border-blue-500/30 text-blue-300"
										: "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent",
								)}
							>
								<div className="flex items-center gap-2 relative z-10">
									{isArtifact && item.data.kind === "json" && (
										<FileJson className="w-3 h-3 shrink-0 opacity-70" />
									)}
									{isArtifact && item.data.kind === "patch" && (
										<FileCode className="w-3 h-3 shrink-0 opacity-70" />
									)}
									{isArtifact && item.data.kind === "markdown" && (
										<FileText className="w-3 h-3 shrink-0 opacity-70" />
									)}
									{isArtifact &&
										item.data.kind !== "json" &&
										item.data.kind !== "patch" &&
										item.data.kind !== "markdown" && (
											<Files className="w-3 h-3 shrink-0 opacity-70" />
										)}
									{!isArtifact && (
										<Upload className="w-3 h-3 shrink-0 opacity-70" />
									)}
									<span className="font-medium truncate">{title}</span>
								</div>
								<div className="mt-1 flex items-center gap-1.5">
									{isArtifact ? (
										<span className="text-[9px] font-mono text-slate-600">
											Run {getRunShortId(item)}
										</span>
									) : (
										<span className="text-[9px] font-mono text-slate-600">
											Upload
										</span>
									)}
								</div>
							</button>
						);
					})}
				</div>
			</div>

			<div className="flex-1 overflow-hidden flex flex-col bg-[#0B0E14]/40">
				{selectedItem ? (
					<div className="flex-1 overflow-hidden flex flex-col">
						<div className="px-4 py-2 border-b border-slate-800/30 flex items-center justify-between bg-slate-900/20 backdrop-blur-sm">
							<div className="flex items-center gap-2">
								<span className="text-xs font-semibold text-slate-300">
									{getItemTitle(selectedItem)}
								</span>
								{selectedItem.type === "artifact" ? (
									<>
										<span className="text-[9px] font-mono text-slate-500 uppercase px-1.5 py-0.5 bg-slate-800/50 rounded border border-slate-700/50 tracking-tighter">
											{selectedItem.data.kind}
										</span>
										<span className="text-[9px] font-mono text-blue-500/60">
											Run {selectedItem.data.runId.slice(0, 8)}
										</span>
									</>
								) : (
									<span className="text-[9px] font-mono text-amber-500/60 uppercase px-1.5 py-0.5 bg-amber-500/5 rounded border border-amber-500/20 tracking-tighter">
										Upload
									</span>
								)}
							</div>
							<span className="text-[9px] text-slate-600 font-mono">
								{new Date(getItemDate(selectedItem)).toLocaleTimeString([], {
									hour: "2-digit",
									minute: "2-digit",
								})}
							</span>
						</div>
						<div className="flex-1 overflow-hidden p-4">
							{selectedItem.type === "artifact" && selectedArtifact ? (
								<ArtifactViewer artifact={selectedArtifact} />
							) : selectedItem.type === "artifact" ? (
								<div className="flex flex-col items-center justify-center h-full space-y-2 opacity-50">
									<RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
									<p className="text-xs text-slate-500 font-mono">Loading...</p>
								</div>
							) : selectedItem.type === "upload" ? (
								<UploadViewer upload={selectedItem.data} />
							) : null}
						</div>
					</div>
				) : (
					<div className="flex-1 flex flex-col items-center justify-center space-y-2 opacity-30">
						<Eye className="w-8 h-8 text-slate-700" />
						<p className="text-xs text-slate-500 font-mono italic">
							Select an item to view
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
