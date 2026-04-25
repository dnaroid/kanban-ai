/**
 * Execution Report types and parsing utilities.
 *
 * The AI executor is instructed to produce a structured summary before the
 * `<REPORT>` tag.  This module defines the typed model for that summary and
 * provides a parser that extracts sections from the raw markdown content.
 */

export interface ExecutionReportTestResults {
	passed: number;
	failed: number;
	skipped: number;
	details: string;
}

export interface ExecutionReport {
	/** Brief overview of actions taken */
	summary: string;
	/** List of file paths that were modified, created, or deleted */
	changedFiles: string[];
	/** Test outcomes — null when no test section was found */
	testResults: ExecutionReportTestResults | null;
	/** Errors encountered during execution */
	errors: string[];
	/** Warnings encountered during execution */
	warnings: string[];
	/** True when the parser couldn't extract structured sections */
	isUnstructured: boolean;
	/** The raw content (for fallback rendering) */
	rawContent: string;
}

const SECTION_RE = /^#{1,3}\s+(.+)$/;

interface RawSection {
	title: string;
	body: string;
}

function splitSections(content: string): RawSection[] {
	const lines = content.split("\n");
	const sections: RawSection[] = [];
	let current: RawSection | null = null;

	for (const line of lines) {
		const match = SECTION_RE.exec(line);
		if (match) {
			if (current) {
				sections.push(current);
			}
			current = { title: match[1].trim(), body: "" };
		} else if (current) {
			current.body += (current.body ? "\n" : "") + line;
		} else {
			if (line.trim()) {
				if (sections.length > 0 && sections[sections.length - 1].title === "") {
					sections[sections.length - 1].body += "\n" + line;
				} else {
					sections.push({ title: "", body: line });
				}
			}
		}
	}
	if (current) {
		sections.push(current);
	}

	return sections;
}

function normalizeTitle(title: string): string {
	return title.toLowerCase().trim();
}

function matchSection(
	sections: RawSection[],
	keywords: string[],
): RawSection | null {
	for (const section of sections) {
		const normalized = normalizeTitle(section.title);
		if (keywords.some((kw) => normalized.includes(kw))) {
			return section;
		}
	}
	return null;
}

function extractListItems(body: string): string[] {
	return body
		.split("\n")
		.map((line) => line.replace(/^[\s]*[-*•]\s*/, "").trim())
		.filter((line) => line.length > 0);
}

const TEST_COUNT_RE = /(\d+)\s*(?:passed|pass|✓)/gi;
const TEST_FAIL_RE = /(\d+)\s*(?:failed|fail|✗|✘)/gi;
const TEST_SKIP_RE = /(\d+)\s*(?:skipped|skip)/gi;

function sumCounts(matches: RegExpExecArray[]): number {
	return matches.reduce((sum, m) => sum + Number.parseInt(m[1], 10), 0);
}

function parseTestResults(body: string): ExecutionReportTestResults | null {
	const passedMatches = [...body.matchAll(TEST_COUNT_RE)];
	const failedMatches = [...body.matchAll(TEST_FAIL_RE)];
	const skippedMatches = [...body.matchAll(TEST_SKIP_RE)];

	if (
		passedMatches.length === 0 &&
		failedMatches.length === 0 &&
		skippedMatches.length === 0
	) {
		return null;
	}

	return {
		passed: sumCounts(passedMatches),
		failed: sumCounts(failedMatches),
		skipped: sumCounts(skippedMatches),
		details: body.trim(),
	};
}

/**
 * Parse raw AI content into a structured ExecutionReport.
 * Sets `isUnstructured: true` when section headers aren't recognized,
 * falling back to raw markdown in `summary`.
 */
export function parseExecutionReport(rawContent: string): ExecutionReport {
	if (!rawContent || !rawContent.trim()) {
		return {
			summary: "",
			changedFiles: [],
			testResults: null,
			errors: [],
			warnings: [],
			isUnstructured: false,
			rawContent: rawContent ?? "",
		};
	}

	const sections = splitSections(rawContent);

	const hasStructuredSections = sections.some(
		(s) => s.title.length > 0 && s.body.trim().length > 0,
	);

	if (!hasStructuredSections) {
		return {
			summary: rawContent.trim(),
			changedFiles: [],
			testResults: null,
			errors: [],
			warnings: [],
			isUnstructured: true,
			rawContent,
		};
	}

	const summarySection =
		matchSection(sections, ["summary", "overview", "what was done"]) ??
		sections.find((s) => s.title === "");
	const summary = summarySection?.body.trim() ?? "";

	const filesSection = matchSection(sections, [
		"changed file",
		"files changed",
		"modified file",
		"files modified",
	]);
	const changedFiles = filesSection ? extractListItems(filesSection.body) : [];

	const testSection = matchSection(sections, [
		"test result",
		"test outcome",
		"tests",
		"testing",
	]);
	const testResults = testSection ? parseTestResults(testSection.body) : null;

	const errorSection = matchSection(sections, ["error", "issues", "problems"]);
	const errors = errorSection ? extractListItems(errorSection.body) : [];

	const warningSection = matchSection(sections, ["warning", "caution"]);
	const warnings = warningSection ? extractListItems(warningSection.body) : [];

	return {
		summary,
		changedFiles,
		testResults,
		errors,
		warnings,
		isUnstructured: false,
		rawContent,
	};
}

/**
 * Quick check: does this run have execution report content available?
 */
export function hasExecutionReportContent(
	lastExecutionStatus: { kind: string; content?: string } | null | undefined,
): boolean {
	if (!lastExecutionStatus) return false;
	return (lastExecutionStatus.kind === "completed" ||
		lastExecutionStatus.kind === "failed") &&
		typeof lastExecutionStatus.content === "string"
		? lastExecutionStatus.content.trim().length > 0
		: false;
}
