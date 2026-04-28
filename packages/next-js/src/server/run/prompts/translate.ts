import { ENABLE_SKILLS_IN_PROMPTS } from "./task";

interface TranslatePromptTask {
	title: string;
	description: string | null;
}

interface TranslatePromptProject {
	id: string;
	name: string;
	path: string;
}

interface TranslatePromptOptions {
	role?: {
		id: string;
		name: string;
		systemPrompt?: string | null;
		skills?: string[] | null;
	};
}

export function buildTranslatePrompt(
	task: TranslatePromptTask,
	project: TranslatePromptProject,
	language: string,
	options: TranslatePromptOptions = {},
): string {
	const rolePrompt = options.role?.systemPrompt?.trim() ?? "";
	const roleSkills = ENABLE_SKILLS_IN_PROMPTS
		? (options.role?.skills ?? [])
				.map((skill) => skill.trim())
				.filter((skill) => skill.length > 0)
		: [];
	const rolePromptLine = rolePrompt.length > 0 ? rolePrompt : "(not set)";
	const roleSkillsLine =
		roleSkills.length > 0 ? roleSkills.join(", ") : "(not set)";

	return `You are translating task descriptions for a Kanban project.

Translator role context:
- Translator role ID: ${options.role?.id ?? "(not set)"}
- Translator role name: ${options.role?.name ?? "(not set)"}
- Translator role system prompt: ${rolePromptLine}
- Translator role skills: ${roleSkillsLine}

Task context:
- Title: ${task.title}
- Task description to translate:
${task.description ?? ""}

Project context:
- Project path: ${project.path}
- Project name: ${project.name}
- Project ID: ${project.id}

Target language: ${language}

Instructions:
1) Translate ONLY the task description into the target language.
2) Preserve meaning, technical terms, structure, and markdown formatting.
3) Do NOT add explanations, notes, headers, code fences, XML tags, or status markers.
4) Return ONLY the translated text.`;
}
