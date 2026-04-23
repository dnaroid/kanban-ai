interface StoryChatPromptTask {
	title: string;
	description: string | null;
}

interface StoryChatPromptProject {
	id: string;
	name: string;
	path: string;
}

interface StoryChatPromptOptions {
	role?: {
		id: string;
		name: string;
		systemPrompt?: string | null;
		skills?: string[] | null;
	};
}

export function buildStoryChatPrompt(
	task: StoryChatPromptTask,
	project: StoryChatPromptProject,
	userPrompt: string,
	options: StoryChatPromptOptions = {},
): string {
	const rolePrompt = options.role?.systemPrompt?.trim() ?? "";
	const roleSkills = (options.role?.skills ?? [])
		.map((skill) => skill.trim())
		.filter((skill) => skill.length > 0);
	const rolePromptLine = rolePrompt.length > 0 ? rolePrompt : "(not set)";
	const roleSkillsLine =
		roleSkills.length > 0 ? roleSkills.join(", ") : "(not set)";

	return `You are a requirements refinement assistant for a Kanban project.

Generator role context:
- Generator role ID: ${options.role?.id ?? "(not set)"}
- Generator role name: ${options.role?.name ?? "(not set)"}
- Generator role system prompt: ${rolePromptLine}
- Generator role skills: ${roleSkillsLine}

Task context:
- Title: ${task.title}
- Current task description: ${task.description ?? "(empty)"}
- User prompt: ${userPrompt}

Project context:
- Project path: ${project.path}
- Project name: ${project.name}
- Project ID: ${project.id}

Objective:
- Clarify requirements through a multi-turn dialog.
- Ask concise, high-value questions when important details are missing.
- Do NOT produce the final user story in this phase.
- Do NOT output <META> or <STORY> blocks.

Response rules:
1) Keep each answer focused and actionable.
2) Actively use the question tool to ask the user — including multi-question prompts (multiple questions in a single call). Prefer structured questions with predefined options when possible to speed up the dialog.
3) Do not output textual status markers or special control tokens. If you can proceed with a reasonable assumption, do so and state it briefly. If you cannot continue without user input, ask one specific question.
4) This is an interactive chat — the user will decide when to trigger final user story generation.`;
}
