"use client";

import { useState, useEffect } from "react";
import { highlightCode } from "@/lib/shiki";

interface CodeBlockProps {
	code: string;
	lang?: string;
}

export function CodeBlock({ code, lang }: CodeBlockProps) {
	const [html, setHtml] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		highlightCode(code, lang).then((result) => {
			if (!cancelled) setHtml(result);
		});
		return () => {
			cancelled = true;
		};
	}, [code, lang]);

	if (html) {
		return (
			<div
				className="my-3 rounded-lg border border-slate-800 overflow-auto [&_pre]:!bg-[#0D1117] [&_pre]:!p-3 [&_pre]:!m-0 [&_pre]:!rounded-lg [&_code]:!text-xs [&_code]:!font-mono [&_.shiki]:!text-xs"
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		);
	}

	return (
		<pre className="my-3 rounded-lg bg-[#0D1117] border border-slate-800 p-3 overflow-auto text-xs font-mono text-slate-300">
			<code className="whitespace-pre">{code}</code>
		</pre>
	);
}
