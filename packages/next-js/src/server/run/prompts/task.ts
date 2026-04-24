/**
 * When true, role skills are included in generated task prompts.
 * Default: false — skills are not injected into prompts.
 */
export const ENABLE_SKILLS_IN_PROMPTS = false;

interface TaskPromptInput {
	title: string;
	description: string | null;
	qaReport?: string | null;
}

interface TaskPromptRole {
	id: string;
	name: string;
	systemPrompt?: string;
	skills?: string[];
}

interface TaskPromptProject {
	id: string;
	path: string;
}

function normalizeText(text: string | null | undefined): string {
	if (!text) return "";
	return text.trim().replace(/\s+/g, " ");
}

export function buildTaskPrompt(
	task: TaskPromptInput,
	project: TaskPromptProject,
	role?: TaskPromptRole,
): string {
	const rolePrompt = role?.systemPrompt?.trim();
	const roleSkills = ENABLE_SKILLS_IN_PROMPTS
		? (role?.skills ?? [])
				.map((skill) => skill.trim())
				.filter((skill) => skill.length > 0)
		: [];

	const normalizedTitle = normalizeText(task.title);
	const normalizedDescription = normalizeText(task.description);
	const descriptionDiffersFromTitle =
		normalizedDescription.length > 0 &&
		normalizedDescription !== normalizedTitle;

	const descriptionLine = descriptionDiffersFromTitle
		? `Description: ${task.description}`
		: "";
	const qaReport = normalizeText(task.qaReport);
	const qaSection = qaReport
		? [
				"",
				"This task is being resumed after QA rejection.",
				"Address every issue from this QA report before continuing:",
				task.qaReport,
			].join("\n")
		: "";

	return [
		rolePrompt,
		roleSkills.length > 0 ? `You may use skills: ${roleSkills.join(", ")}` : "",
		"",
		`TASK: ${task.title}`,
		"",
		descriptionLine,
		qaSection,
		"",
		"Project context:",
		`- Project path: ${project.path}`,
		`- Project ID: ${project.id}`,
		"",
		"EXECUTE IMMEDIATELY. Do NOT create implementation plans, outlines, or step-by-step breakdowns.",
		"Start writing code, editing files, and making changes right now.",
		"",
		"Requirements:",
		"1. Implement the task directly — write code, modify files, run commands. No planning phase.",
		"2. When finished, summarize what was done.",
		"3. If the task failed, state the reason clearly.",
		"4. If you need user input, ask a specific question.",
		"",
		"If you can proceed with a reasonable assumption, do so and state it briefly.",
		"If you cannot continue without user input, ask one specific question.",
		"",
		"CRITICAL FINAL MESSAGE FORMAT:",
		"Your LAST line MUST be exactly one REPORT tag:",
		"- <REPORT>done</REPORT> — task finished successfully.",
		"- <REPORT>fail</REPORT> — task failed or cannot be completed.",
		"- <REPORT>question</REPORT> — cannot continue without user input.",
		"Put your summary, failure reason, or question BEFORE the REPORT tag.",
		"Do not output multiple REPORT tags.",
	].join("\n");
}
