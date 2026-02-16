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
		"task",
	];
	const difficulties = options.availableDifficulties ?? [
		"easy",
		"medium",
		"hard",
		"epic",
	];

	const tagsLine = tags.length > 0 ? tags.join(", ") : "(нет доступных тегов)";

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

Верни ответ строго в формате:

<META>
{
  "tags": ["tag1", "tag2"],
  "type": "feature",
  "difficulty": "medium"
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
5) Последняя строка ответа должна быть marker-статусом:
   - успех: ${buildOpencodeStatusLine("done")}
   - ошибка: ${buildOpencodeStatusLine("fail")}
   - нужен ответ пользователя: ${buildOpencodeStatusLine("question")}`;
}
