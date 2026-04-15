import { useCallback, useEffect, useState } from "react";
import { FileCode2, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DiffFile, DiffLine } from "@/types/ipc";

interface RunDiffPanelProps {
	runId: string;
}

type DiffState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "loaded"; files: DiffFile[] }
	| { status: "empty" }
	| { status: "too_large" }
	| { status: "error"; message: string };

const LINE_STYLES: Record<DiffLine["type"], string> = {
	added: "bg-emerald-500/10 text-emerald-200 border-l-2 border-emerald-400/50",
	removed: "bg-red-500/10 text-red-200 border-l-2 border-red-400/50",
	context: "bg-slate-950/50 text-slate-300 border-l-2 border-transparent",
};

const LINE_PREFIX: Record<DiffLine["type"], string> = {
	added: "+",
	removed: "-",
	context: " ",
};

function getFilePathMeta(filePath: string) {
	const normalized = filePath.replace(/\\/g, "/");
	const segments = normalized.split("/").filter(Boolean);
	const fileName = segments[segments.length - 1] || "unknown";
	const directory =
		segments.length > 1 ? segments.slice(0, -1).join("/") : undefined;
	return { fileName, directory };
}

export function RunDiffPanel({ runId }: RunDiffPanelProps) {
	const [state, setState] = useState<DiffState>({ status: "idle" });
	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

	const fetchDiff = useCallback(async () => {
		setState({ status: "loading" });
		try {
			const result = await api.run.diff({ runId });
			if (result === null) {
				setState({ status: "too_large" });
				return;
			}
			if (result.files.length === 0) {
				setState({ status: "empty" });
				return;
			}
			setExpandedFiles(new Set(result.files.map((f) => f.path)));
			setState({ status: "loaded", files: result.files });
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load diff";
			setState({ status: "error", message });
		}
	}, [runId]);

	useEffect(() => {
		void fetchDiff();
	}, [fetchDiff]);

	const toggleFile = (filePath: string) => {
		setExpandedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(filePath)) {
				next.delete(filePath);
			} else {
				next.add(filePath);
			}
			return next;
		});
	};

	if (state.status === "idle" || state.status === "loading") {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="w-5 h-5 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
			</div>
		);
	}

	if (state.status === "empty") {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
				<p className="text-sm text-slate-400">No changes detected</p>
				<p className="text-xs text-slate-500">
					There are no file differences between the base and head commits.
				</p>
			</div>
		);
	}

	if (state.status === "too_large") {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
				<p className="text-sm text-amber-300">Diff is too large to display</p>
				<p className="text-xs text-slate-500">
					The changes exceed the 500KB display limit.
				</p>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
				<p className="text-sm text-red-300">Failed to load diff</p>
				<p className="text-xs text-slate-500">{state.message}</p>
			</div>
		);
	}

	const { files } = state;
	const totalAdded = files.reduce((s, f) => s + f.addedLines, 0);
	const totalRemoved = files.reduce((s, f) => s + f.removedLines, 0);

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="shrink-0 px-4 py-2 border-b border-slate-800/50 bg-[#11151C]/25 flex items-center justify-between">
				<p className="text-xs text-slate-400">
					{files.length} file{files.length === 1 ? "" : "s"} changed
				</p>
				<div className="flex items-center gap-2 text-[11px] font-mono">
					<span className="text-emerald-400">+{totalAdded}</span>
					<span className="text-red-400">-{totalRemoved}</span>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
				{files.map((file) => {
					const isExpanded = expandedFiles.has(file.path);
					const { fileName, directory } = getFilePathMeta(file.path);

					return (
						<div
							key={file.path}
							className="rounded-lg border border-slate-800/60 overflow-hidden"
						>
							<button
								type="button"
								onClick={() => toggleFile(file.path)}
								className="w-full flex items-center gap-2 px-3 py-2 bg-slate-900/40 hover:bg-slate-800/60 transition-colors"
							>
								{isExpanded ? (
									<ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
								) : (
									<ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
								)}
								<FileCode2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
								<div className="min-w-0 flex-1 text-left">
									<p className="text-xs text-slate-200 font-medium truncate">
										{fileName}
									</p>
									{directory && (
										<p className="text-[10px] text-slate-500 font-mono truncate">
											{directory}
										</p>
									)}
								</div>
								<div className="flex items-center gap-1 text-[10px] font-mono shrink-0">
									<span className="px-1 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20">
										-{file.removedLines}
									</span>
									<span className="px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
										+{file.addedLines}
									</span>
								</div>
							</button>

							{isExpanded && (
								<div className="overflow-x-auto custom-scrollbar bg-slate-950/60">
									{file.hunks.length === 0 ? (
										<div className="px-3 py-2 text-[11px] text-slate-500 font-mono">
											Binary file or no textual changes.
										</div>
									) : (
										<div className="font-mono text-[11px] leading-5 min-w-max">
											{file.hunks.map((hunk, hunkIdx) => (
												<div key={`${file.path}-hunk-${hunkIdx}`}>
													<div className="px-3 py-0.5 text-[10px] text-slate-500 bg-slate-900/40 border-l-2 border-slate-700 select-none">
														{hunk.header}
													</div>
													{hunk.lines.map((line, lineIdx) => (
														<div
															key={`${file.path}-${hunkIdx}-${lineIdx}`}
															className={cn(LINE_STYLES[line.type])}
														>
															<div className="flex items-start gap-2 px-2 py-0.5">
																<span className="w-4 text-slate-500 select-none shrink-0 text-center">
																	{LINE_PREFIX[line.type]}
																</span>
																<span className="whitespace-pre">
																	{line.content || " "}
																</span>
															</div>
														</div>
													))}
												</div>
											))}
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
