import { buildOpencodeStatusLine } from "@/lib/opencode-status";

interface TaskPromptInput {
	title: string;
	description: string | null;
}

interface TaskPromptProject {
	id: string;
	path: string;
}

export function buildTaskPrompt(
	task: TaskPromptInput,
	project: TaskPromptProject,
): string {
	return [
		`ЗАДАЧА: ${task.title}`,
		"",
		`Описание: ${task.description ?? "Нет описания"}`,
		"",
		"Контекст проекта:",
		`- Путь проекта: ${project.path}`,
		`- ID проекта: ${project.id}`,
		"",
		"Требования:",
		"1. Выполни задачу в директории проекта.",
		`2. В конце ответа обязательно выведи одну итоговую строку статуса: ${buildOpencodeStatusLine("done")} или ${buildOpencodeStatusLine("fail")} или ${buildOpencodeStatusLine("question")}`,
		"3. Если не удалось выполнить, укажи причину перед итоговой строкой со статусом fail.",
		"4. Если нужен ответ пользователя, задай конкретный вопрос перед итоговой строкой со статусом question.",
	].join("\n");
}
