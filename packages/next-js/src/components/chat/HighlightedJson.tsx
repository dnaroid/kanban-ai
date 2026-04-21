import React, { useMemo } from "react";

// Regex captures: JSON key (lookahead for colon), string value, number, true, false, null, structural chars (group 1)
const JSON_TOKEN_REGEX =
	/(?:"(?:[^"\\]|\\.)*"(?=\s*:))|(?:"(?:[^"\\]|\\.)*")|(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(?:\btrue\b)|(?:\bfalse\b)|(?:\bnull\b)|([{}[\]:,])/g;

function highlightJson(json: string): React.ReactNode[] {
	const tokens: React.ReactNode[] = [];
	let lastIndex = 0;
	let keyIndex = 0;

	for (const match of json.matchAll(JSON_TOKEN_REGEX)) {
		if (match.index > lastIndex) {
			tokens.push(json.slice(lastIndex, match.index));
		}

		const value = match[0];
		const structural = match[1];

		if (structural) {
			tokens.push(
				<span key={keyIndex++} className="text-slate-500">
					{structural}
				</span>,
			);
		} else if (
			value.startsWith('"') &&
			json[value.length + match.index] === ":"
		) {
			tokens.push(
				<span key={keyIndex++} className="text-sky-400">
					{value}
				</span>,
			);
		} else if (value.startsWith('"')) {
			tokens.push(
				<span key={keyIndex++} className="text-emerald-400">
					{value}
				</span>,
			);
		} else if (/^-?\d/.test(value)) {
			tokens.push(
				<span key={keyIndex++} className="text-amber-400">
					{value}
				</span>,
			);
		} else if (value === "true" || value === "false") {
			tokens.push(
				<span key={keyIndex++} className="text-violet-400">
					{value}
				</span>,
			);
		} else if (value === "null") {
			tokens.push(
				<span key={keyIndex++} className="text-slate-500 italic">
					{value}
				</span>,
			);
		} else {
			tokens.push(value);
		}

		lastIndex = match.index + value.length;
	}

	if (lastIndex < json.length) {
		tokens.push(json.slice(lastIndex));
	}

	return tokens;
}

interface HighlightedJsonProps {
	value: unknown;
	className?: string;
}

export function HighlightedJson({ value, className }: HighlightedJsonProps) {
	const result = useMemo(() => {
		let parsed: unknown;

		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed.length < 2 || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
				return { isJson: false, text: value };
			}
			try {
				parsed = JSON.parse(trimmed) as unknown;
			} catch {
				return { isJson: false, text: value };
			}
		} else {
			parsed = value;
		}

		try {
			const formatted = JSON.stringify(parsed, null, 2);
			return { isJson: true, text: formatted };
		} catch {
			return { isJson: false, text: String(value) };
		}
	}, [value]);

	if (!result.isJson) {
		return <pre className={className}>{result.text}</pre>;
	}

	return <pre className={className}>{highlightJson(result.text)}</pre>;
}
