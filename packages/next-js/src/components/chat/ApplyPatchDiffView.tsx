import { FileCode2, FilePlus2, FilePenLine, FileX2 } from "lucide-react";
import {
	DiffViewer,
	type DiffViewerLine,
} from "@/components/common/DiffViewer";

export interface ApplyPatchToolInput {
	patchText: string;
}

type SectionKind = "add" | "update" | "delete";

type PatchLineKind = "added" | "removed" | "meta" | "context";

type PatchSection = {
	kind: SectionKind;
	filePath: string;
	lines: string[];
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

function parsePatchSections(patchText: string): PatchSection[] {
	const lines = patchText.split(/\r?\n/);
	const sections: PatchSection[] = [];
	let current: PatchSection | null = null;

	const flush = () => {
		if (current) {
			sections.push(current);
			current = null;
		}
	};

	for (const line of lines) {
		if (line.startsWith("*** Add File: ")) {
			flush();
			current = {
				kind: "add",
				filePath: line.replace("*** Add File: ", ""),
				lines: [],
			};
			continue;
		}

		if (line.startsWith("*** Update File: ")) {
			flush();
			current = {
				kind: "update",
				filePath: line.replace("*** Update File: ", ""),
				lines: [],
			};
			continue;
		}

		if (line.startsWith("*** Delete File: ")) {
			flush();
			current = {
				kind: "delete",
				filePath: line.replace("*** Delete File: ", ""),
				lines: [],
			};
			continue;
		}

		if (line.startsWith("*** End Patch")) {
			flush();
			continue;
		}

		if (line.startsWith("*** Move to: ") && current) {
			current.filePath = line.replace("*** Move to: ", "");
			current.lines.push(line);
			continue;
		}

		if (current) {
			current.lines.push(line);
		}
	}

	flush();
	return sections;
}

function getPatchLineKind(line: string): PatchLineKind {
	if (line.startsWith("@@") || line.startsWith("*** ")) return "meta";
	if (line.startsWith("+")) return "added";
	if (line.startsWith("-")) return "removed";
	return "context";
}

const kindConfig: Record<
	SectionKind,
	{
		label: string;
		pillClass: string;
		icon: typeof FileCode2;
	}
> = {
	add: {
		label: "Added",
		pillClass:
			"bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
		icon: FilePlus2,
	},
	update: {
		label: "Updated",
		pillClass: "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20",
		icon: FilePenLine,
	},
	delete: {
		label: "Deleted",
		pillClass: "bg-red-500/10 text-red-300 border border-red-500/20",
		icon: FileX2,
	},
};

export function ApplyPatchDiffView({ input }: { input: ApplyPatchToolInput }) {
	const sections = parsePatchSections(input.patchText);

	if (sections.length === 0) {
		return (
			<div className="rounded-lg border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-500 font-mono">
				No patch sections detected.
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{sections.map((section, sectionIndex) => {
				const { fileName, directory } = getPathMeta(section.filePath);
				const sectionCfg = kindConfig[section.kind];
				const SectionIcon = sectionCfg.icon;
				const addedCount = section.lines.filter(
					(line) => getPatchLineKind(line) === "added",
				).length;
				const removedCount = section.lines.filter(
					(line) => getPatchLineKind(line) === "removed",
				).length;

				const viewerLines: DiffViewerLine[] = section.lines.map((line) => {
					const kind = getPatchLineKind(line);
					if (kind === "meta") {
						return { type: "separator", content: line };
					}
					if (kind === "added") {
						return { type: "added", content: line.slice(1) };
					}
					if (kind === "removed") {
						return { type: "removed", content: line.slice(1) };
					}
					return { type: "context", content: line };
				});

				return (
					<div
						key={`${section.filePath}-${sectionIndex}`}
						className="rounded-lg border border-slate-800/60 bg-slate-950/50 p-2.5 space-y-2"
					>
						<div className="flex items-center justify-between gap-2">
							<div className="min-w-0 flex items-start gap-2">
								<SectionIcon className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
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

							<div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono">
								<span
									className={`px-1.5 py-0.5 rounded ${sectionCfg.pillClass}`}
								>
									{sectionCfg.label}
								</span>
								<span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20">
									-{removedCount}
								</span>
								<span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
									+{addedCount}
								</span>
							</div>
						</div>

						{viewerLines.length === 0 ? (
							<div className="rounded-md border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-500 font-mono">
								No file body changes.
							</div>
						) : (
							<DiffViewer
								lines={viewerLines}
								maxHeight="20rem"
								className="rounded-md border border-slate-800/60 bg-slate-950/60"
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
