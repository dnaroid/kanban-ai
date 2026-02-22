import { buildOpencodeStatusLine } from "@/lib/opencode-status";

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
	const tagsLine =
		options.availableTags && options.availableTags.length > 0
			? options.availableTags.join(", ")
			: "(нет доступных тегов)";
	const typesLine =
		options.availableTypes && options.availableTypes.length > 0
			? options.availableTypes.join(", ")
			: "feature, bug, chore, improvement";
	const difficultiesLine =
		options.availableDifficulties && options.availableDifficulties.length > 0
			? options.availableDifficulties.join(", ")
			: "easy, medium, hard, epic";
	const rolesLine =
		options.availableRoles && options.availableRoles.length > 0
			? options.availableRoles
					.map((role) => `${role.id} (${role.name})`)
					.join(", ")
			: "(нет доступных ролей)";
	const rolePrompt = options.role?.systemPrompt?.trim() ?? "";
	const roleSkills = (options.role?.skills ?? [])
		.map((skill) => skill.trim())
		.filter((skill) => skill.length > 0);
	const rolePromptLine = rolePrompt.length > 0 ? rolePrompt : "(не задан)";
	const roleSkillsLine =
		roleSkills.length > 0 ? roleSkills.join(", ") : "(не заданы)";

	return `Ты QA-агент. Проведи проверку задачи и результата реализации в текущем проекте.

Контекст задачи:
- Название: ${task.title}
- Описание: ${task.description ?? "(пусто)"}
- Теги: ${(task.tags ?? []).join(", ") || "(пусто)"}
- Тип: ${task.type ?? "(не указан)"}
- Сложность: ${task.difficulty ?? "(не указана)"}

Контекст проекта:
- Путь проекта: ${project.path}
- Название проекта: ${project.name}
- ID проекта: ${project.id}

Доступные значения:
- Теги: ${tagsLine}
- Типы: ${typesLine}
- Сложности: ${difficultiesLine}
- Роли: ${rolesLine}
- Промпт роли агента: ${rolePromptLine}
- Скиллы роли агента: ${roleSkillsLine}

Что нужно сделать:
1) Проверить, что задача реализована в коде согласно описанию и критериям приемки.
2) Запустить релевантные тесты/проверки и зафиксировать результат.
3) Если найдены дефекты или несоответствия - перечислить их с конкретикой.
4) Если информации не хватает для проверки - задать один четкий вопрос.

Формат ответа:
- Краткий отчет в markdown.
- Разделы: "Что проверено", "Результат", "Найденные проблемы" (если есть), "Рекомендации".

Статус marker в последней строке:
- все проверки прошли: ${buildOpencodeStatusLine("test_ok")}
- есть провалы тестов/критичные несоответствия: ${buildOpencodeStatusLine("test_fail")}
- нужен ответ пользователя: ${buildOpencodeStatusLine("question")}`;
}
