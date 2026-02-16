import type { LmdBlock, LmdDoc, LmdInline, LmdListItem } from "./types";

const LIMITS = {
	maxChars: 200000,
	maxLines: 10000,
	maxDepth: 3,
	maxListItems: 2000,
} as const;

function isAllowedUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return ["http:", "https:", "mailto:", "artifact:", "file:"].includes(
			parsed.protocol,
		);
	} catch {
		return false;
	}
}

function toSafeText(text: string): string {
	if (text.length > LIMITS.maxChars) {
		return text.slice(0, LIMITS.maxChars);
	}
	return text;
}

export function parseInline(text: string, depth = 0): LmdInline[] {
	const input = toSafeText(text);
	if (!input) return [];
	if (depth >= LIMITS.maxDepth) {
		return [{ type: "text", text: input }];
	}

	const result: LmdInline[] = [];
	let i = 0;

	while (i < input.length) {
		if (input[i] === "`") {
			const end = input.indexOf("`", i + 1);
			if (end > i + 1) {
				result.push({ type: "code", text: input.slice(i + 1, end) });
				i = end + 1;
				continue;
			}
		}

		if (input[i] === "[") {
			const closeText = input.indexOf("]", i + 1);
			const openUrl = closeText >= 0 ? input.indexOf("(", closeText + 1) : -1;
			const closeUrl = openUrl >= 0 ? input.indexOf(")", openUrl + 1) : -1;
			if (
				closeText > i + 1 &&
				openUrl === closeText + 1 &&
				closeUrl > openUrl + 1
			) {
				const label = input.slice(i + 1, closeText);
				const url = input.slice(openUrl + 1, closeUrl).trim();
				if (isAllowedUrl(url)) {
					result.push({ type: "link", text: label, url });
					i = closeUrl + 1;
					continue;
				}
			}
		}

		if (input[i] === "*" && input[i + 1] === "*") {
			const end = input.indexOf("**", i + 2);
			if (end > i + 2) {
				const inner = input.slice(i + 2, end);
				result.push({ type: "bold", children: parseInline(inner, depth + 1) });
				i = end + 2;
				continue;
			}
		}

		if (input[i] === "*") {
			const end = input.indexOf("*", i + 1);
			if (end > i + 1) {
				const inner = input.slice(i + 1, end);
				result.push({
					type: "italic",
					children: parseInline(inner, depth + 1),
				});
				i = end + 1;
				continue;
			}
		}

		let next = i + 1;
		while (next < input.length && !"`[*".includes(input[next])) {
			next += 1;
		}
		result.push({ type: "text", text: input.slice(i, next) });
		i = next;
	}

	return result;
}

function parseList(lines: string[], start: number): [LmdBlock, number] {
	const first = lines[start] ?? "";
	const ordered = /^\s*\d+\.\s+/.test(first);
	const items: LmdListItem[] = [];

	let i = start;
	while (i < lines.length && items.length < LIMITS.maxListItems) {
		const line = lines[i] ?? "";
		const match = ordered
			? line.match(/^\s*\d+\.\s+(.*)$/)
			: line.match(/^\s*[-*+]\s+(.*)$/);
		if (!match) break;

		const raw = match[1] ?? "";
		const checkbox = raw.match(/^\[( |x|X)\]\s+(.*)$/);
		if (checkbox) {
			items.push({
				checked: checkbox[1].toLowerCase() === "x",
				blocks: [
					{ type: "paragraph", inlines: parseInline(checkbox[2] ?? "") },
				],
			});
		} else {
			items.push({
				blocks: [{ type: "paragraph", inlines: parseInline(raw) }],
			});
		}
		i += 1;
	}

	return [{ type: "list", ordered, items }, i];
}

export function parseLightMd(text: string): LmdDoc {
	const safe = toSafeText(text);
	const lines = safe.split(/\r?\n/).slice(0, LIMITS.maxLines);
	const blocks: LmdBlock[] = [];

	for (let i = 0; i < lines.length; ) {
		const line = lines[i] ?? "";
		const trimmed = line.trim();

		if (!trimmed) {
			i += 1;
			continue;
		}

		if (trimmed === "---") {
			blocks.push({ type: "hr" });
			i += 1;
			continue;
		}

		if (/^```/.test(trimmed)) {
			const lang = trimmed.slice(3).trim() || undefined;
			const codeLines: string[] = [];
			i += 1;
			while (i < lines.length && !/^```/.test((lines[i] ?? "").trim())) {
				codeLines.push(lines[i] ?? "");
				i += 1;
			}
			if (i < lines.length) i += 1;
			blocks.push({ type: "code", lang, text: codeLines.join("\n") });
			continue;
		}

		const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
		if (heading) {
			blocks.push({
				type: "heading",
				level: heading[1].length as 1 | 2 | 3,
				inlines: parseInline(heading[2] ?? ""),
			});
			i += 1;
			continue;
		}

		if (/^>\s?/.test(trimmed)) {
			const quoteLines: string[] = [];
			while (i < lines.length && /^>\s?/.test((lines[i] ?? "").trim())) {
				quoteLines.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
				i += 1;
			}
			const nested = parseLightMd(quoteLines.join("\n"));
			blocks.push({ type: "blockquote", blocks: nested.blocks });
			continue;
		}

		if (/^\s*(\d+\.|[-*+])\s+/.test(line)) {
			const [listBlock, nextIndex] = parseList(lines, i);
			blocks.push(listBlock);
			i = nextIndex;
			continue;
		}

		const para: string[] = [trimmed];
		i += 1;
		while (i < lines.length) {
			const next = (lines[i] ?? "").trim();
			if (!next) break;
			if (
				next === "---" ||
				/^```/.test(next) ||
				/^(#{1,3})\s+/.test(next) ||
				/^>\s?/.test(next) ||
				/^\s*(\d+\.|[-*+])\s+/.test(next)
			) {
				break;
			}
			para.push(next);
			i += 1;
		}

		blocks.push({ type: "paragraph", inlines: parseInline(para.join(" ")) });
	}

	return { blocks };
}
