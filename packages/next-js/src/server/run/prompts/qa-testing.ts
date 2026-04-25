interface QaTestingPromptTask {
	title: string;
	description: string | null;
	tags?: string[];
	type?: string;
	difficulty?: string;
	qaReport?: string | null;
}

interface QaTestingPromptProject {
	id: string;
	name: string;
	path: string;
}

interface QaTestingPromptOptions {
	availableTags?: string[];
	availableTypes?: string[];
	availableDifficulties?: string[];
	availableRoles?: Array<{ id: string; name: string; description: string }>;
	role?: {
		id: string;
		name: string;
		systemPrompt?: string | null;
		skills?: string[] | null;
	};
}

type QaTaskSectionKey =
	| "goal"
	| "projectContext"
	| "scope"
	| "inScope"
	| "outOfScope"
	| "requirements"
	| "constraints"
	| "acceptanceCriteria"
	| "expectedOutcome";

const QA_TASK_SECTION_LABELS: Array<{
	key: QaTaskSectionKey;
	labels: string[];
}> = [
	{ key: "goal", labels: ["goal"] },
	{ key: "projectContext", labels: ["project context"] },
	{ key: "scope", labels: ["scope"] },
	{ key: "inScope", labels: ["in scope"] },
	{ key: "outOfScope", labels: ["out of scope"] },
	{ key: "requirements", labels: ["requirements"] },
	{ key: "constraints", labels: ["constraints"] },
	{
		key: "acceptanceCriteria",
		labels: ["acceptance criteria", "acceptance criterion"],
	},
	{ key: "expectedOutcome", labels: ["expected outcome"] },
];

function normalizeSectionLabel(line: string): string {
	return line
		.trim()
		.replace(/^#{1,6}\s*/, "")
		.replace(/^>\s*/, "")
		.replace(/^\*\*(.+)\*\*$/u, "$1")
		.replace(/^__(.+)__$/u, "$1")
		.replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "")
		.replace(/[:：]\s*$/u, "")
		.replace(/\s+/gu, " ")
		.toLowerCase();
}

function createEmptySectionBuckets(): Record<QaTaskSectionKey, string[]> {
	return {
		goal: [],
		projectContext: [],
		scope: [],
		inScope: [],
		outOfScope: [],
		requirements: [],
		constraints: [],
		acceptanceCriteria: [],
		expectedOutcome: [],
	};
}

function finalizeSection(lines: string[]): string | null {
	const content = lines.join("\n").trim();
	return content.length > 0 ? content : null;
}

function parseTaskDescription(description: string | null | undefined): {
	overview: string | null;
	sections: Record<QaTaskSectionKey, string | null>;
} {
	const rawDescription = description?.trim();
	const buckets = createEmptySectionBuckets();
	const overviewLines: string[] = [];

	if (!rawDescription) {
		return {
			overview: null,
			sections: {
				goal: null,
				projectContext: null,
				scope: null,
				inScope: null,
				outOfScope: null,
				requirements: null,
				constraints: null,
				acceptanceCriteria: null,
				expectedOutcome: null,
			},
		};
	}

	let currentSection: QaTaskSectionKey | null = null;

	for (const line of rawDescription.split(/\r?\n/u)) {
		const normalizedLabel = normalizeSectionLabel(line);
		const matchedSection = QA_TASK_SECTION_LABELS.find((section) =>
			section.labels.includes(normalizedLabel),
		);

		if (matchedSection) {
			currentSection = matchedSection.key;
			continue;
		}

		if (currentSection) {
			buckets[currentSection].push(line);
		} else {
			overviewLines.push(line);
		}
	}

	return {
		overview: finalizeSection(overviewLines),
		sections: {
			goal: finalizeSection(buckets.goal),
			projectContext: finalizeSection(buckets.projectContext),
			scope: finalizeSection(buckets.scope),
			inScope: finalizeSection(buckets.inScope),
			outOfScope: finalizeSection(buckets.outOfScope),
			requirements: finalizeSection(buckets.requirements),
			constraints: finalizeSection(buckets.constraints),
			acceptanceCriteria: finalizeSection(buckets.acceptanceCriteria),
			expectedOutcome: finalizeSection(buckets.expectedOutcome),
		},
	};
}

export function buildQaTestingPrompt(
	task: QaTestingPromptTask,
	project: QaTestingPromptProject,
	options: QaTestingPromptOptions = {},
): string {
	const rolePrompt = options.role?.systemPrompt?.trim() ?? "";
	const roleSkills = (options.role?.skills ?? [])
		.map((skill) => skill.trim())
		.filter((skill) => skill.length > 0);
	const rolePromptLine = rolePrompt.length > 0 ? rolePrompt : "(not set)";
	const roleSkillsLine =
		roleSkills.length > 0 ? roleSkills.join(", ") : "(not set)";
	const parsedDescription = parseTaskDescription(task.description);
	const acceptanceCriteria =
		parsedDescription.sections.acceptanceCriteria ??
		parsedDescription.sections.requirements ??
		parsedDescription.overview;

	return `${rolePromptLine}
You may use skills: ${roleSkillsLine}

You are a QA engineer performing verification for a task implementation.
Your job is to validate the delivered result against the acceptance criteria.

Task: ${task.title}

Acceptance Criteria:
${acceptanceCriteria ?? "(extract from task description below)"}

${task.qaReport ? `Previous QA report (issues to re-verify):\n${task.qaReport}\n` : ""}
Project: ${project.name} (${project.path})

Instructions:
1. Read the acceptance criteria above.
2. Inspect the implementation in code. Run tests, scripts, or manual checks needed to validate each criterion.
3. For each criterion, determine PASS or FAIL with specific evidence (files inspected, commands run, observed outcomes).
4. If defects are found, describe them precisely with reproduction details.

CRITICAL: Your entire QA report MUST be wrapped in <QA REPORT> tags like this:

<QA REPORT>
## Test Scope
[What you verified]

## Acceptance Criteria Check
- Criterion 1: PASS — [evidence]
- Criterion 2: FAIL — [evidence, expected vs actual]

## Issues Found
[Detailed list or "None"]

## Recommendation
[PASS / FAIL with summary]
</QA REPORT>

Do NOT output anything outside the <QA REPORT> block EXCEPT the final REPORT line.
Do NOT ask questions — make reasonable assumptions and state them.
Be concise and evidence-based.

CRITICAL FINAL LINE:
After </QA REPORT>, your VERY LAST line MUST be exactly one REPORT tag:
- <REPORT>test_ok</REPORT> — all tests/verification passed.
- <REPORT>test_fail</REPORT> — tests/verification failed.

Example:
</QA REPORT>
<REPORT>test_ok</REPORT>

Do not output multiple REPORT tags.
`;
}
