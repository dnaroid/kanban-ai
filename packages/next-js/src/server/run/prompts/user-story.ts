import { buildOpencodeStatusLine } from "@/lib/opencode-status";
import { ENABLE_SKILLS_IN_PROMPTS } from "./task";

interface UserStoryPromptTask {
	title: string;
	description: string | null;
	tags?: string[];
	type?: string;
	difficulty?: string;
}

interface UserStoryPromptProject {
	id: string;
	name: string;
	path: string;
}

type StoryLanguage = string;

interface UserStoryPromptOptions {
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
	language?: StoryLanguage;
}

export function buildUserStoryPrompt(
	task: UserStoryPromptTask,
	project: UserStoryPromptProject,
	options: UserStoryPromptOptions = {},
): string {
	const tags = options.availableTags ?? [];
	const types = options.availableTypes ?? [
		"feature",
		"bug",
		"chore",
		"improvement",
	];
	const difficulties = options.availableDifficulties ?? [
		"easy",
		"medium",
		"hard",
		"epic",
	];

	const tagsLine = tags.length > 0 ? tags.join(", ") : "(no available tags)";
	const availableRoles = options.availableRoles ?? [];
	const rolesLine =
		availableRoles.length > 0
			? availableRoles.map((role) => `${role.id} (${role.name})`).join(", ")
			: "(no available roles)";
	const rolePrompt = options.role?.systemPrompt?.trim() ?? "";
	const roleSkills = ENABLE_SKILLS_IN_PROMPTS
		? (options.role?.skills ?? [])
				.map((skill) => skill.trim())
				.filter((skill) => skill.length > 0)
		: [];
	const rolePromptLine = rolePrompt.length > 0 ? rolePrompt : "(not set)";
	const roleSkillsLine =
		roleSkills.length > 0 ? roleSkills.join(", ") : "(not set)";

	const language = options.language ?? "en";
	const languageName =
		new Intl.DisplayNames(["en"], { type: "language" }).of(language) ??
		language;
	const languageInstruction =
		language === "en"
			? "Generate the ENTIRE user story (title, goal, requirements, acceptance criteria, expected outcome and all text fields inside <STORY>) in English."
			: `Generate the ENTIRE user story (title, goal, requirements, acceptance criteria, expected outcome and all text fields inside <STORY>) in ${languageName}.`;

	return `You are generating a user story for a CODE-EXECUTOR.
The generator role (if specified below) should NOT automatically become the executor.

Your task: rewrite the task description into user story format for an AI agent (code executor), so that work can be launched immediately from it.

Create a **technically accurate, complete, and unambiguous task description**, but **without implementation**.

Current task context:
- Title: ${task.title}
- Current description: ${task.description ?? "(empty)"}
- Current tags: ${(task.tags ?? []).join(", ") || "(empty)"}
- Current type: ${task.type ?? "(not specified)"}
- Current difficulty: ${task.difficulty ?? "(not specified)"}

Project context:
- Project path: ${project.path}
- Project name: ${project.name}
- Project ID: ${project.id}

Generator role context (for phrasing quality, NOT for choosing executor):
- Generator role ID: ${options.role?.id ?? "(not set)"}
- Generator role name: ${options.role?.name ?? "(not set)"}
- Generator role system prompt: ${rolePromptLine}
- Generator role skills: ${roleSkillsLine}

Allowed values:
- Tags: ${tagsLine}
- Type: ${types.join(", ")}
- Difficulty: ${difficulties.join(", ")}
- Available execution agents (ids): ${rolesLine}

Return the response strictly in this format:

<META>
{
  "tags": ["tag1", "tag2"],
  "type": "feature",
  "difficulty": "medium",
  "agentRoleId": "executor",
  "commitMessage": "feat(scope): short description of the change"
}
</META>

<STORY>
## Title
...

## Goal
...

## Project Context
...

## Scope
### In scope
- ...

### Out of scope
- ...

## Requirements
1. ...

## Constraints
- ...

## Acceptance Criteria
- [ ] ...

## Expected Outcome
...
</STORY>

Rules:
1) Write concisely but completely.
2) Do not describe implementation at the code level.
3) Return only <META> and <STORY> blocks, no extra text.
4) In <META>, do not use markdown code blocks, only JSON.
5) In agentRoleId, specify one id from the list of available roles. Choose the role strictly based on the task nature — who should be the primary executor.
6) Never choose agentRoleId just because the generator is running under that role.
7) Choose the ba role only for analysis/requirements/documentation tasks without code changes. If the task involves implementation — choose a specialized executor.
8) In commitMessage, provide a conventional commit message in English (up to 200 characters), based on the task title and type. Format: \`<type>(<scope>): <description>\`. Type: feat for feature, fix for bug, chore for chore, refactor for improvement. Scope — optional, from task tags. Description — brief English summary. Example: \`feat(auth): add user login flow\`.
9) If commitMessage exceeds 200 characters — shorten the description, do not modify type and scope.
10) Choose the fe (frontend) role ONLY if the task is focused on UI/UX: components, styles, animations, layouts, design systems, responsiveness, interactivity. Tasks involving logic, API, architecture, DB, configuration, infrastructure, testing — are NOT frontend tasks even if they indirectly affect UI. For such tasks, choose be, tl, or another specialized executor.
11) The executing agent may delegate part of the work to another agent (including fe) during execution. Do not assign fe "just in case" — if the task is not focused on UI, assign tl or be.
12) For tasks without clear specialization (architecture, refactoring, mixed logic), choose tl as the universal executor.
13) ${languageInstruction}
14) The last line of the response must be a status marker:
    - success: ${buildOpencodeStatusLine("generated")}
    - error: ${buildOpencodeStatusLine("fail")}
    - need user input: ${buildOpencodeStatusLine("question")}`;
}
