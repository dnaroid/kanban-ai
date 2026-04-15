import { useCallback, useEffect, useRef, useState } from "react";
import { FileCode2, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DiffFile, DiffLine } from "@/types/ipc";

interface VcsDiffViewerProps {
	runId: string | null;
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

export function VcsDiffViewer({ runId }: VcsDiffViewerProps) {
	const [state, setState] = useState<DiffState>({ status: "idle" });
	const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
	const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());

	const fetchDiff = useCallback(async () => {
		if (!runId) {
			setState({ status: "idle" });
			return;
		}

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
		setCollapsedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(filePath)) {
				next.delete(filePath);
			} else {
				next.add(filePath);
			}
			return next;
		});
	};

	const scrollTo = (filePath: string) => {
		const element = fileRefs.current.get(filePath);
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	};

	if (state.status === "idle" || state.status === "loading") {
		return (
			<div className="rounded-2xl border border-slate-800 bg-[#161B26] p-4">
				<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">
					Changes
				</p>
				<div className="flex items-center justify-center py-6">
					<div className="w-4 h-4 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
				</div>
			</div>
		);
	}

	if (state.status === "empty") {
		return null;
	}

	if (state.status === "too_large") {
		return (
			<div className="rounded-2xl border border-slate-800 bg-[#161B26] p-4">
				<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">
					Changes
				</p>
				<div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-center">
					<p className="text-xs text-amber-200">Diff is too large to display</p>
					<p className="text-[10px] text-amber-300/60 mt-1">
						The changes exceed the 500KB display limit
					</p>
				</div>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="rounded-2xl border border-slate-800 bg-[#161B26] p-4">
				<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">
					Changes
				</p>
				<div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
					<p className="text-xs text-red-200">Failed to load diff</p>
					<p className="text-[10px] text-red-300/60 mt-1">{state.message}</p>
				</div>
			</div>
		);
	}

	const { files } = state;
	const totalAdded = files.reduce((sum, f) => sum + f.addedLines, 0);
	const totalRemoved = files.reduce((sum, f) => sum + f.removedLines, 0);

	return (
		<div className="rounded-2xl border border-slate-800 bg-[#161B26] p-4 space-y-3">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
						Changes
					</p>
					<p className="text-xs text-slate-500">
						{files.length} file{files.length === 1 ? "" : "s"} changed
					</p>
				</div>
				<div className="flex items-center gap-1.5 text-[10px] font-mono">
					<span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
						+{totalAdded}
					</span>
					<span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20">
						-{totalRemoved}
					</span>
				</div>
			</div>

			<div className="space-y-1">
				{files.map((file) => {
					const { fileName, directory } = getFilePathMeta(file.path);
					return (
						<button
							type="button"
							key={file.path}
							onClick={() => scrollTo(file.path)}
							className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800/60 transition-colors text-left"
						>
							<FileCode2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
							<div className="min-w-0 flex-1">
								<p className="text-xs text-slate-200 truncate">{fileName}</p>
								{directory && (
									<p className="text-[10px] text-slate-500 font-mono truncate">
										{directory}
									</p>
								)}
							</div>
							<div className="flex items-center gap-1 text-[10px] font-mono shrink-0">
								<span className="px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-300">
									+{file.addedLines}
								</span>
								<span className="px-1 py-0.5 rounded bg-red-500/10 text-red-300">
									-{file.removedLines}
								</span>
							</div>
						</button>
					);
				})}
			</div>

			<div className="space-y-3">
				{files.map((file) => {
					const isCollapsed = collapsedFiles.has(file.path);
					const { fileName, directory } = getFilePathMeta(file.path);

					return (
						<div
							key={file.path}
							ref={(el) => {
								if (el) {
									fileRefs.current.set(file.path, el);
								} else {
									fileRefs.current.delete(file.path);
								}
							}}
							className="rounded-lg border border-slate-800/60 overflow-hidden"
						>
							<button
								type="button"
								onClick={() => toggleFile(file.path)}
								className="w-full flex items-center gap-2 px-3 py-2 bg-slate-900/40 hover:bg-slate-800/60 transition-colors"
							>
								{isCollapsed ? (
									<ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
								) : (
									<ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
								)}
								<FileCode2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
								<div className="min-w-0 flex-1">
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

							{!isCollapsed && (
								<div className="max-h-96 overflow-auto custom-scrollbar bg-slate-950/60">
									{file.hunks.length === 0 ? (
										<div className="px-3 py-2 text-[11px] text-slate-500 font-mono">
											No textual changes to display.
										</div>
									) : (
										<div className="font-mono text-[11px] leading-5 min-w-max">
											{file.hunks.map((hunk, hunkIndex) => (
												<div key={hunkIndex}>
													<div className="px-2 py-0.5 text-[10px] text-slate-500 bg-slate-900/40 border-l-2 border-slate-700">
														{hunk.header}
													</div>
													{hunk.lines.map((line, lineIndex) => (
														<div
															key={`${hunkIndex}-${lineIndex}`}
															className={LINE_STYLES[line.type]}
														>
															<div className="flex items-start gap-2 px-2 py-0.5">
																<span className="w-4 text-slate-500 select-none shrink-0">
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
