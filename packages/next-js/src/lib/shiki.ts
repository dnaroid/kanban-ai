import { createHighlighter, type Highlighter } from "shiki";

const LANGUAGES = [
	"javascript",
	"typescript",
	"python",
	"go",
	"rust",
	"java",
	"bash",
	"json",
	"css",
	"html",
	"sql",
	"yaml",
	"tsx",
	"jsx",
	"markdown",
	"c",
	"cpp",
	"csharp",
	"ruby",
	"php",
	"swift",
	"kotlin",
	"diff",
	"plaintext",
] as const;

const THEME = "github-dark";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: [THEME],
			langs: [...LANGUAGES],
		});
	}
	return highlighterPromise;
}

const LANG_ALIASES: Record<string, string> = {
	js: "javascript",
	ts: "typescript",
	py: "python",
	sh: "bash",
	shell: "bash",
	zsh: "bash",
	rb: "ruby",
	cs: "csharp",
	md: "markdown",
	yml: "yaml",
};

function resolveLang(
	lang: string | undefined,
	loaded: readonly string[],
): string {
	if (!lang) return "plaintext";
	const lower = lang.toLowerCase();
	const resolved = LANG_ALIASES[lower] ?? lower;
	if (loaded.includes(resolved)) return resolved;
	return "plaintext";
}

export async function highlightCode(
	code: string,
	lang?: string,
): Promise<string> {
	const highlighter = await getHighlighter();
	const resolvedLang = resolveLang(lang, highlighter.getLoadedLanguages());
	return highlighter.codeToHtml(code, { lang: resolvedLang, theme: THEME });
}

const EXT_TO_LANG: Record<string, string> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	mjs: "javascript",
	cjs: "javascript",
	py: "python",
	pyw: "python",
	go: "go",
	rs: "rust",
	java: "java",
	kt: "kotlin",
	kts: "kotlin",
	swift: "swift",
	rb: "ruby",
	php: "php",
	cs: "csharp",
	c: "c",
	h: "c",
	cpp: "cpp",
	cc: "cpp",
	hpp: "cpp",
	hxx: "cpp",
	cxx: "cpp",
	css: "css",
	scss: "css",
	less: "css",
	html: "html",
	htm: "html",
	svg: "html",
	xml: "html",
	sql: "sql",
	json: "json",
	jsonc: "json",
	yaml: "yaml",
	yml: "yaml",
	toml: "yaml",
	md: "markdown",
	mdx: "markdown",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	fish: "bash",
	diff: "diff",
	patch: "diff",
	dockerfile: "bash",
	makefile: "bash",
};

export function langFromPath(filePath: string): string {
	const name = filePath.replace(/\\/g, "/").split("/").pop() ?? "";
	const base = name.toLowerCase().replace(/^\./, "");
	if (base === "dockerfile" || base === "makefile") {
		return EXT_TO_LANG[base] ?? "plaintext";
	}
	const ext = base.includes(".") ? (base.split(".").pop() ?? "") : base;
	return EXT_TO_LANG[ext] ?? "plaintext";
}
