import { buildOpencodeStatusLine } from "@/lib/opencode-status";

/**
 * When true, role skills are included in generated task prompts.
 * Default: false — skills are not injected into prompts.
 */
export const ENABLE_SKILLS_IN_PROMPTS = false;

interface TaskPromptInput {
	title: string;
	description: string | null;
	qaReport?: string;
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

	return [
		rolePrompt,
		roleSkills.length > 0 ? `You may use skills: ${roleSkills.join(", ")}` : "",
		"",
		`TASK: ${task.title}`,
		"",
		descriptionLine,
		"",
		"Project context:",
		`- Project path: ${project.path}`,
		`- Project ID: ${project.id}`,
		...(task.qaReport
			? [
					"",
					"QA REPORT - This task was previously rejected after review. Address ALL issues below:",
					task.qaReport,
					"",
					"You MUST fix every issue mentioned above. Do NOT skip any item.",
					`After fixing, output exactly one status line: ${buildOpencodeStatusLine("done")} or ${buildOpencodeStatusLine("fail")} or ${buildOpencodeStatusLine("question")}`,
				]
			: []),
		"",
		"Requirements:",
		"1. Complete the task in the project directory.",
		`2. At the end of your response, output exactly one status line: ${buildOpencodeStatusLine("done")} or ${buildOpencodeStatusLine("fail")} or ${buildOpencodeStatusLine("question")} or ${buildOpencodeStatusLine("test_ok")} or ${buildOpencodeStatusLine("test_fail")}`,
		"3. If the task failed, state the reason before the fail status line.",
		"4. If you need user input, ask a specific question before the question status line.",
	].join("\n");
}
