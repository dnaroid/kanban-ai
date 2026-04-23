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

function formatPromptSection(title: string, content: string | null): string {
	return `${title}:\n${content ?? "(not specified)"}`;
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

You are performing manual QA verification for a task implementation in the current project.
Your job is to validate the delivered result against the task brief and especially against the acceptance criteria.

Task snapshot:
- Title: ${task.title}
- Tags: ${(task.tags ?? []).join(", ") || "(empty)"}
- Type: ${task.type ?? "(not specified)"}
- Difficulty: ${task.difficulty ?? "(not specified)"}

Structured task brief:
${formatPromptSection("Overview", parsedDescription.overview)}

${formatPromptSection("Goal", parsedDescription.sections.goal)}

${formatPromptSection("Project Context", parsedDescription.sections.projectContext)}

${formatPromptSection("Scope", parsedDescription.sections.scope)}

${formatPromptSection("In Scope", parsedDescription.sections.inScope)}

${formatPromptSection("Out of Scope", parsedDescription.sections.outOfScope)}

${formatPromptSection("Requirements", parsedDescription.sections.requirements)}

${formatPromptSection("Constraints", parsedDescription.sections.constraints)}

${formatPromptSection("Acceptance Criteria", acceptanceCriteria)}

${formatPromptSection("Expected Outcome", parsedDescription.sections.expectedOutcome)}

Previous QA report:
${task.qaReport?.trim() || "(none)"}

Original task description:
${task.description ?? "(empty)"}

Project context:
- Project path: ${project.path}
- Project name: ${project.name}
- Project ID: ${project.id}

What to do:
1) Read the task brief and extract the concrete user-visible behaviors that must be verified.
2) Inspect the implementation in code and run the relevant manual checks, scripts, tests, or app flows needed to validate the task.
3) Compare the actual result against each acceptance criterion one by one.
4) Record specific evidence: files inspected, commands run, UI paths checked, and observed outcomes.
5) If defects or discrepancies are found, list them precisely with reproduction details and expected vs actual behavior.
6) If information is missing, make the smallest reasonable assumption and state it briefly. Only ask one question if you truly cannot continue.

Response format:
- A concise markdown QA report.
- Sections:
  1. "Test Scope"
  2. "Acceptance Criteria Check" — evaluate each criterion with PASS / FAIL / PARTIAL / BLOCKED
  3. "Evidence / Checks Performed"
  4. "Issues Found" (if any)
  5. "Recommendation"

Do not output textual status markers or special control tokens.
Prefer concrete verification over generic commentary.
`;
}
