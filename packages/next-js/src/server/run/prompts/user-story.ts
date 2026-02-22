import { buildOpencodeStatusLine } from "@/lib/opencode-status";

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

interface UserStoryPromptOptions {
	availableTags?: string[];
	availableTypes?: string[];
	availableDifficulties?: string[];
	availableRoles?: Array<{ id: string; name: string; description: string }>;
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

	const tagsLine = tags.length > 0 ? tags.join(", ") : "(нет доступных тегов)";
	const availableRoles = options.availableRoles ?? [];
	const rolesLine =
		availableRoles.length > 0
			? availableRoles.map((role) => `${role.id} (${role.name})`).join(", ")
			: "(нет доступных ролей)";

	return `Твоя задача: переписать описание задачи в формат user story для AI-агента (код-исполнителя), чтобы по нему можно было сразу запускать работу.

Сформируй **технически точное, полное и однозначное описание задачи**, но **без реализации**.

Контекст текущей задачи:
- Название: ${task.title}
- Текущее описание: ${task.description ?? "(пусто)"}
- Текущие теги: ${(task.tags ?? []).join(", ") || "(пусто)"}
- Текущий тип: ${task.type ?? "(не указан)"}
- Текущая сложность: ${task.difficulty ?? "(не указана)"}

Контекст проекта:
- Путь проекта: ${project.path}
- Название проекта: ${project.name}
- ID проекта: ${project.id}

Разрешенные значения:
- Теги: ${tagsLine}
- Тип: ${types.join(", ")}
- Сложность: ${difficulties.join(", ")}
- Агент (id): ${rolesLine}

Верни ответ строго в формате:

<META>
{
  "tags": ["tag1", "tag2"],
  "type": "feature",
  "difficulty": "medium",
  "agentRoleId": "executor"
}
</META>

<STORY>
## Название
...

## Цель
...

## Контекст проекта
...

## Скоуп
### Включено
- ...

### Исключено
- ...

## Требования
1. ...

## Ограничения
- ...

## Критерии приемки
- [ ] ...

## Ожидаемый результат
...
</STORY>

Правила:
1) Пиши кратко, но полно.
2) Не расписывай реализацию на уровне кода.
3) Возвращай только блоки <META> и <STORY>, без доп. текста.
4) В <META> не используй markdown-код-блок, только JSON.
5) В поле agentRoleId укажи один id из списка доступных ролей. Выбирай роль по смыслу задачи (кто должен исполнять).
6) Последняя строка ответа должна быть marker-статусом:
   - успех: ${buildOpencodeStatusLine("generated")}
   - ошибка: ${buildOpencodeStatusLine("fail")}
   - нужен ответ пользователя: ${buildOpencodeStatusLine("question")}`;
}
