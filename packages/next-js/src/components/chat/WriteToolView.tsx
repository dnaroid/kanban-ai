import {
	AlertTriangle,
	FileCode2,
	FilePenLine,
	FilePlus2,
	Info,
	XCircle,
} from "lucide-react";

export interface WriteToolInput {
	filePath: string;
	content: string;
}

type Position = {
	line: number;
	character: number;
};

type Range = {
	start: Position;
	end: Position;
};

type DiagnosticSeverity = 1 | 2 | 3 | 4;

type Diagnostic = {
	range: Range;
	severity?: DiagnosticSeverity;
	code?: number | string;
	source?: string;
	message: string;
};

type DiagnosticMap = Record<string, Diagnostic[]>;

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

function extractDiagnostics(
	metadata?: Record<string, unknown>,
): DiagnosticMap | null {
	if (!metadata?.diagnostics) return null;
	const diag = metadata.diagnostics;
	if (typeof diag === "object" && diag !== null) {
		return diag as DiagnosticMap;
	}
	return null;
}

function extractExists(
	metadata?: Record<string, unknown>,
): boolean | undefined {
	if (!metadata) return undefined;
	if (typeof metadata.exists === "boolean") return metadata.exists;
	return undefined;
}

const severityConfig: Record<
	number,
	{
		label: string;
		icon: typeof XCircle;
		color: string;
		bg: string;
		border: string;
	}
> = {
	1: {
		label: "ERROR",
		icon: XCircle,
		color: "text-red-400",
		bg: "bg-red-500/10",
		border: "border-red-500/20",
	},
	2: {
		label: "WARN",
		icon: AlertTriangle,
		color: "text-amber-400",
		bg: "bg-amber-500/10",
		border: "border-amber-500/20",
	},
	3: {
		label: "INFO",
		icon: Info,
		color: "text-blue-400",
		bg: "bg-blue-500/10",
		border: "border-blue-500/20",
	},
	4: {
		label: "HINT",
		icon: Info,
		color: "text-slate-400",
		bg: "bg-slate-500/10",
		border: "border-slate-500/20",
	},
};

function formatPosition(range: Range): string {
	const line = range.start.line + 1;
	const col = range.start.character + 1;
	return `${line}:${col}`;
}

export function WriteToolView({
	input,
	metadata,
}: {
	input: WriteToolInput;
	metadata?: Record<string, unknown>;
}) {
	const { fileName, directory } = getPathMeta(input.filePath);
	const lines = input.content.split(/\r?\n/);
	const lineCount = lines.length;

	const fileExisted = extractExists(metadata);
	const isNew = fileExisted !== true;

	const badgeConfig = isNew
		? {
				label: "NEW",
				icon: FilePlus2,
				pillClass:
					"bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
			}
		: {
				label: "UPDATED",
				icon: FilePenLine,
				pillClass: "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20",
			};

	const BadgeIcon = badgeConfig.icon;

	const diagnosticsMap = extractDiagnostics(metadata);
	const normalizedFilePath = input.filePath.replace(/\\/g, "/");
	const fileDiagnostics = diagnosticsMap
		? (Object.entries(diagnosticsMap).find(([path]) => {
				const normalized = path.replace(/\\/g, "/");
				return (
					normalized === normalizedFilePath ||
					normalized.endsWith("/" + normalizedFilePath)
				);
			})?.[1] ?? [])
		: [];
	const totalDiagCount = fileDiagnostics.length;

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

				<div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono">
					{totalDiagCount > 0 && (
						<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20">
							{totalDiagCount} {totalDiagCount === 1 ? "issue" : "issues"}
						</span>
					)}
					<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/40">
						{lineCount} {lineCount === 1 ? "line" : "lines"}
					</span>
					<span
						className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${badgeConfig.pillClass}`}
					>
						<BadgeIcon className="w-2.5 h-2.5" />
						{badgeConfig.label}
					</span>
				</div>
			</div>

			<div className="max-h-96 overflow-auto rounded-lg border border-slate-800/60 bg-slate-950/60 custom-scrollbar">
				{!input.content ? (
					<div className="px-3 py-2 text-[11px] text-slate-500 font-mono">
						Empty file written.
					</div>
				) : (
					<div className="font-mono text-[11px] leading-5 min-w-max">
						{lines.map((line, index) => (
							<div
								key={`${index}:${line.slice(0, 20)}`}
								className="bg-slate-950/50 text-slate-300 border-l-2 border-transparent"
							>
								<div className="flex items-start px-2 py-0.5">
									<span className="w-8 text-right pr-3 text-slate-600 select-none shrink-0">
										{index + 1}
									</span>
									<span className="whitespace-pre">{line || " "}</span>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{fileDiagnostics.length > 0 && (
				<div className="rounded-md border border-slate-800/60 bg-slate-950/40 overflow-hidden">
					<div className="space-y-px">
						{fileDiagnostics.map((diag, i) => {
							const sev = diag.severity ?? 1;
							const cfg = severityConfig[sev] ?? severityConfig[1];
							const SevIcon = cfg.icon;
							return (
								<div
									key={`${sev}-${diag.message.slice(0, 30)}-${i}`}
									className={`flex items-start gap-1.5 px-2 py-1 ${cfg.bg}`}
								>
									<SevIcon className={`w-3 h-3 mt-px shrink-0 ${cfg.color}`} />
									<span
										className={`text-[10px] font-mono font-semibold shrink-0 ${cfg.color}`}
									>
										[{formatPosition(diag.range)}]
									</span>
									<span className="text-[10px] font-mono text-slate-300 min-w-0">
										{diag.message}
									</span>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
