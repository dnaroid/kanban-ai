import { FileCode2 } from "lucide-react";
import { diffLines } from "diff";
import {
	DiffViewer,
	type DiffViewerLine,
} from "@/components/common/DiffViewer";

export interface EditToolInput {
	filePath: string;
	oldString: string;
	newString: string;
}

type DiffLine = {
	kind: "added" | "removed" | "context";
	text: string;
};

function getPathMeta(filePath: string) {
	const normalized = filePath.replace(/\\/g, "/");
	const segments = normalized.split("/").filter(Boolean);
	const fileName = segments[segments.length - 1] || "unknown";
	const directory = segments.slice(0, -1);

	return {
		fileName,
		directory:
			directory.length > 4
				? `…/${directory.slice(-4).join("/")}`
				: directory.join("/"),
	};
}

function buildDiffLines(oldString: string, newString: string): DiffLine[] {
	const changes = diffLines(oldString, newString, {
		newlineIsToken: true,
		ignoreWhitespace: false,
	});

	const lines: DiffLine[] = [];

	for (const change of changes) {
		const kind: DiffLine["kind"] = change.added
			? "added"
			: change.removed
				? "removed"
				: "context";

		const splitLines = change.value.split(/\r?\n/);
		if (splitLines.at(-1) === "") splitLines.pop();

		for (const text of splitLines) {
			lines.push({ kind, text });
		}
	}

	return lines;
}

export function EditToolDiffView({ input }: { input: EditToolInput }) {
	const { fileName, directory } = getPathMeta(input.filePath);
	const diffLinesData = buildDiffLines(input.oldString, input.newString);

	const addedCount = diffLinesData.filter(
		(line) => line.kind === "added",
	).length;
	const removedCount = diffLinesData.filter(
		(line) => line.kind === "removed",
	).length;

	const viewerLines: DiffViewerLine[] = diffLinesData.map((line) => ({
		type: line.kind,
		content: line.text,
	}));

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2 px-1">
				<div className="min-w-0 flex items-start gap-2">
					<FileCode2 className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
					<div className="min-w-0">
						<p className="text-xs text-slate-100 font-medium truncate">
							{fileName}
						</p>
						{directory && (
							<p className="text-[10px] text-slate-500 font-mono truncate">
								{directory}
							</p>
						)}
					</div>
				</div>

				<div className="flex items-center gap-1.5 text-[10px] font-mono shrink-0">
					<span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20">
						-{removedCount}
					</span>
					<span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
						+{addedCount}
					</span>
				</div>
			</div>

			{viewerLines.length === 0 ? (
				<div className="rounded-lg border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-500 font-mono">
					No textual changes to display.
				</div>
			) : (
				<DiffViewer
					lines={viewerLines}
					maxHeight="24rem"
					className="rounded-lg border border-slate-800/60 bg-slate-950/60"
				/>
			)}
		</div>
	);
}
