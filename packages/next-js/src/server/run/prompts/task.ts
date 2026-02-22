import { buildOpencodeStatusLine } from "@/lib/opencode-status";

interface TaskPromptInput {
	title: string;
	description: string | null;
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

export function buildTaskPrompt(
	task: TaskPromptInput,
	project: TaskPromptProject,
	role?: TaskPromptRole,
): string {
	const rolePrompt = role?.systemPrompt?.trim();
	const roleSkills = (role?.skills ?? [])
		.map((skill) => skill.trim())
		.filter((skill) => skill.length > 0);

	return [
		`ЗАДАЧА: ${task.title}`,
		"",
		`Описание: ${task.description ?? "Нет описания"}`,
		"",
		`Назначенный агент: ${role?.name ?? role?.id ?? "(не указан)"}`,
		rolePrompt ? `Промпт агента: ${rolePrompt}` : "Промпт агента: (не задан)",
		`Скиллы агента: ${roleSkills.length > 0 ? roleSkills.join(", ") : "(не заданы)"}`,
		"",
		"Контекст проекта:",
		`- Путь проекта: ${project.path}`,
		`- ID проекта: ${project.id}`,
		"",
		"Требования:",
		"1. Выполни задачу в директории проекта.",
		`2. В конце ответа обязательно выведи одну итоговую строку статуса: ${buildOpencodeStatusLine("done")} или ${buildOpencodeStatusLine("fail")} или ${buildOpencodeStatusLine("question")} или ${buildOpencodeStatusLine("test_ok")} или ${buildOpencodeStatusLine("test_fail")}`,
		"3. Если не удалось выполнить, укажи причину перед итоговой строкой со статусом fail.",
		"4. Если нужен ответ пользователя, задай конкретный вопрос перед итоговой строкой со статусом question.",
	].join("\n");
}
