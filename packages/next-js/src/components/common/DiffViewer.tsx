"use client";

import { useState, useMemo } from "react";
import { Columns2, Rows4 } from "lucide-react";
import { cn } from "@/lib/utils";

export type DiffViewerLineType = "added" | "removed" | "context" | "separator";

export type DiffViewerLine = {
	type: DiffViewerLineType;
	content: string;
};

export interface DiffViewerProps {
	lines: DiffViewerLine[];
	defaultSideBySide?: boolean;
	maxHeight?: string;
	className?: string;
}

type PairedRow =
	| { type: "separator"; content: string; id: string }
	| {
			type: "change";
			id: string;
			left: {
				lineNum: number | null;
				content: string;
				type: DiffViewerLineType;
			} | null;
			right: {
				lineNum: number | null;
				content: string;
				type: DiffViewerLineType;
			} | null;
	  };

export function DiffViewer({
	lines,
	defaultSideBySide = true,
	maxHeight,
	className,
}: DiffViewerProps) {
	const [isSideBySide, setIsSideBySide] = useState(defaultSideBySide);

	const pairedRows = useMemo(() => {
		const rows: PairedRow[] = [];
		let oldLineNum = 1;
		let newLineNum = 1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			if (line.type === "separator") {
				rows.push({ type: "separator", content: line.content, id: `sep-${i}` });
				continue;
			}

			if (line.type === "context") {
				rows.push({
					type: "change",
					id: `ctx-${i}`,
					left: {
						lineNum: oldLineNum++,
						content: line.content,
						type: "context",
					},
					right: {
						lineNum: newLineNum++,
						content: line.content,
						type: "context",
					},
				});
				continue;
			}

			const removedGroup: DiffViewerLine[] = [];
			const addedGroup: DiffViewerLine[] = [];
			const startIdx = i;

			while (
				i < lines.length &&
				(lines[i].type === "removed" || lines[i].type === "added")
			) {
				if (lines[i].type === "removed") {
					removedGroup.push(lines[i]);
				} else {
					addedGroup.push(lines[i]);
				}
				i++;
			}
			i--;

			const maxLength = Math.max(removedGroup.length, addedGroup.length);
			for (let j = 0; j < maxLength; j++) {
				const removed = removedGroup[j];
				const added = addedGroup[j];

				rows.push({
					type: "change",
					id: `chg-${startIdx}-${j}`,
					left: removed
						? {
								lineNum: oldLineNum++,
								content: removed.content,
								type: "removed",
							}
						: null,
					right: added
						? { lineNum: newLineNum++, content: added.content, type: "added" }
						: null,
				});
			}
		}
		return rows;
	}, [lines]);

	const unifiedLines = useMemo(() => {
		let oldLineNum = 1;
		let newLineNum = 1;
		return lines.map((line, idx) => {
			let displayLineNum: number | null = null;
			if (line.type === "context") {
				displayLineNum = oldLineNum;
				oldLineNum++;
				newLineNum++;
			} else if (line.type === "removed") {
				displayLineNum = oldLineNum++;
			} else if (line.type === "added") {
				displayLineNum = newLineNum++;
			}
			return { ...line, lineNum: displayLineNum, id: `uni-${idx}` };
		});
	}, [lines]);

	const LINE_STYLES: Record<DiffViewerLineType, string> = {
		added:
			"bg-emerald-500/10 text-emerald-200 border-l-2 border-emerald-400/50",
		removed: "bg-red-500/10 text-red-200 border-l-2 border-red-400/50",
		context: "bg-slate-950/50 text-slate-300 border-l-2 border-transparent",
		separator:
			"bg-slate-900/40 text-slate-500 border-l-2 border-slate-700 select-none",
	};

	const LINE_PREFIX: Record<DiffViewerLineType, string> = {
		added: "+",
		removed: "-",
		context: " ",
		separator: "",
	};

	return (
		<div
			className={cn(
				"relative group/diff border border-slate-800/60 bg-slate-950/60 font-mono text-[11px] leading-5 overflow-hidden",
				className,
			)}
			style={maxHeight ? { maxHeight } : undefined}
		>
			<div className="absolute top-2 right-2 z-10">
				<button
					type="button"
					onClick={() => setIsSideBySide(!isSideBySide)}
					className="p-1 rounded bg-slate-800/50 hover:bg-slate-700/80 text-slate-400 hover:text-slate-200 transition-colors shadow-sm"
					title={
						isSideBySide
							? "Switch to Unified View"
							: "Switch to Side-by-Side View"
					}
				>
					{isSideBySide ? (
						<Rows4 className="w-3.5 h-3.5" />
					) : (
						<Columns2 className="w-3.5 h-3.5" />
					)}
				</button>
			</div>

			<div className="overflow-auto custom-scrollbar h-full">
				{isSideBySide ? (
					<div className="grid grid-cols-[1fr_1px_1fr] min-w-max">
						{pairedRows.map((row) => {
							if (row.type === "separator") {
								return (
									<div
										key={row.id}
										className={cn(
											"col-span-3 px-3 py-0.5",
											LINE_STYLES.separator,
										)}
									>
										{row.content}
									</div>
								);
							}

							return (
								<div key={row.id} className="contents">
									<div
										className={cn(
											"flex items-start",
											row.left ? LINE_STYLES[row.left.type] : "bg-slate-900/20",
										)}
									>
										<div className="w-10 shrink-0 text-right pr-2 text-slate-500 select-none opacity-50 border-r border-slate-800/30">
											{row.left?.lineNum ?? ""}
										</div>
										<div className="px-2 whitespace-pre min-w-0 flex-1">
											{row.left?.content ?? " "}
										</div>
									</div>

									<div className="bg-slate-800/60 w-[1px]" />

									<div
										className={cn(
											"flex items-start",
											row.right
												? LINE_STYLES[row.right.type]
												: "bg-slate-900/20",
										)}
									>
										<div className="w-10 shrink-0 text-right pr-2 text-slate-500 select-none opacity-50 border-r border-slate-800/30">
											{row.right?.lineNum ?? ""}
										</div>
										<div className="px-2 whitespace-pre min-w-0 flex-1">
											{row.right?.content ?? " "}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="min-w-max">
						{unifiedLines.map((line) => (
							<div
								key={line.id}
								className={cn(
									"flex items-start",
									LINE_STYLES[line.type],
									line.type === "separator" && "px-3 py-0.5",
								)}
							>
								{line.type !== "separator" && (
									<>
										<div className="w-10 shrink-0 text-right pr-2 text-slate-500 select-none opacity-50 border-r border-slate-800/30">
											{line.lineNum}
										</div>
										<div className="w-4 shrink-0 text-center text-slate-500 select-none">
											{LINE_PREFIX[line.type]}
										</div>
									</>
								)}
								<div
									className={cn(
										"whitespace-pre flex-1",
										line.type !== "separator" && "px-2",
									)}
								>
									{line.content || " "}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
