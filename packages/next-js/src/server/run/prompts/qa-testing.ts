interface QaTestingPromptTask {
	title: string;
	description: string | null;
	tags?: string[];
	type?: string;
	difficulty?: string;
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

	return `${rolePromptLine}
You may use skills: ${roleSkillsLine}

Review the task and its implementation result in the current project.

Task context:
- Title: ${task.title}
- Description: ${task.description ?? "(empty)"}
- Tags: ${(task.tags ?? []).join(", ") || "(empty)"}
- Type: ${task.type ?? "(not specified)"}
- Difficulty: ${task.difficulty ?? "(not specified)"}

Project context:
- Project path: ${project.path}
- Project name: ${project.name}
- Project ID: ${project.id}

What to do:
1) Verify that the task is implemented in code according to the description and acceptance criteria.
2) Run relevant tests/checks and record the results.
3) If defects or discrepancies are found — list them with specifics.
4) If there is not enough information to verify — ask one clear question.

Response format:
- A brief markdown report.
- Sections: "What was checked", "Result", "Issues found" (if any), "Recommendations".

Do not output textual status markers or special control tokens.
If you can proceed with a reasonable assumption, do so and state it briefly.
If you cannot continue without user input, ask one specific question.
`;
}
