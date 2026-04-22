import { useMemo } from "react";
import { FileCode2, FileText } from "lucide-react";
import { CodeBlock } from "@/components/chat/CodeBlock";
import { langFromPath } from "@/lib/shiki";

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

function extractContent(output: unknown): string {
	if (typeof output === "string") {
		const contentMatch = output.match(/<content>\n?([\s\S]*?)\n?<\/content>/);
		if (contentMatch?.[1]) {
			return stripLineNumbers(contentMatch[1]);
		}
		return stripLineNumbers(output);
	}

	if (output && typeof output === "object") {
		const record = output as Record<string, unknown>;
		if (typeof record.content === "string") return record.content;
		if (typeof record.text === "string") return record.text;
	}

	return typeof output === "string" ? output : String(output);
}

function stripLineNumbers(text: string): string {
	return text
		.split("\n")
		.map((line) => {
			const match = line.match(/^\d+:\s?(.*)$/);
			return match ? match[1] : line;
		})
		.join("\n");
}

function isReadToolInput(input: unknown): input is { filePath: string } {
	if (!input || typeof input !== "object") return false;
	const record = input as Record<string, unknown>;
	return typeof record.filePath === "string";
}

export function ReadToolView({
	input,
	output,
}: {
	input: unknown;
	output: unknown;
}) {
	const filePath = isReadToolInput(input) ? input.filePath : "";
	const { fileName, directory } = getPathMeta(filePath);
	const lang = langFromPath(filePath);

	const content = useMemo(() => extractContent(output), [output]);
	const lineCount = content.split("\n").length;

	const Icon = lang === "plaintext" ? FileText : FileCode2;

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2 px-1">
				<div className="min-w-0 flex items-start gap-2">
					<Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
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
				<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/40 text-[10px] font-mono shrink-0">
					{lineCount} {lineCount === 1 ? "line" : "lines"}
				</span>
			</div>

			<div className="max-h-96 overflow-auto rounded-lg border border-slate-800/60 bg-slate-950/60 custom-scrollbar">
				<CodeBlock code={content} lang={lang} />
			</div>
		</div>
	);
}
