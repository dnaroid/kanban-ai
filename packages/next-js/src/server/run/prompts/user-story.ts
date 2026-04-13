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
	role?: {
		id: string;
		name: string;
		systemPrompt?: string | null;
		skills?: string[] | null;
	};
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
	const rolePrompt = options.role?.systemPrompt?.trim() ?? "";
	const roleSkills = (options.role?.skills ?? [])
		.map((skill) => skill.trim())
		.filter((skill) => skill.length > 0);
	const rolePromptLine = rolePrompt.length > 0 ? rolePrompt : "(не задан)";
	const roleSkillsLine =
		roleSkills.length > 0 ? roleSkills.join(", ") : "(не заданы)";

	return `Ты формируешь user story для КОД-ИСПОЛНИТЕЛЯ.
Роль генератора (если указана ниже) не должна автоматически становиться исполнителем.

Твоя задача: переписать описание задачи в формат user story для AI-агента (код-исполнителя), чтобы по нему можно было сразу запускать работу.

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

Контекст роли генератора (для качества формулировки, НЕ для выбора исполнителя):
- ID роли генератора: ${options.role?.id ?? "(не задан)"}
- Название роли генератора: ${options.role?.name ?? "(не задано)"}
- System prompt роли генератора: ${rolePromptLine}
- Скиллы роли генератора: ${roleSkillsLine}

Разрешенные значения:
- Теги: ${tagsLine}
- Тип: ${types.join(", ")}
- Сложность: ${difficulties.join(", ")}
- Допустимые агенты для выполнения (ids): ${rolesLine}

Верни ответ строго в формате:

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
5) В поле agentRoleId укажи один id из списка доступных ролей. Выбирай роль строго по сути задачи — кто должен быть основным исполнителем реализации.
6) Никогда не выбирай agentRoleId только потому, что генератор запущен в этой роли.
7) Роль ba выбирай только для задач анализа/требований/документации без изменений кода. Если задача предполагает реализацию — выбирай профильного исполнителя.
8) В поле commitMessage укажи conventional commit message на английском языке (до 200 символов), основанный на названии и типе задачи. Формат: \`<type>(<scope>): <description>\`. Type: feat для feature, fix для bug, chore для chore, refactor для improvement. Scope — опционально, из тегов задачи. Description — краткое резюме на английском. Пример: \`feat(auth): add user login flow\`.
9) Если commitMessage превышает 200 символов — сократи description, не трогай type и scope.
10) Роль fe (фронтенд) выбирай ТОЛЬКО если задача сфокусирована на UI/UX: компоненты, стили, анимации, верстка, дизайн-система, адаптивность, интерактивность интерфейса. Задачи, связанные с логикой, API, архитектурой, БД, конфигурацией, инфраструктурой, тестами — НЕ являются фронтенд-задачами, даже если они косвенно влияют на UI. Для таких задач выбирай be, tl или другого профильного исполнителя.
11) Агент-исполнитель может сам делегировать часть работы другому агенту (в т.ч. fe) в процессе выполнения. Не назначай fe «на всякий случай» — если задача не сфокусирована на UI, назначь tl или be.
12) Для задач без чёткой специализации (архитектура, рефакторинг, смешанная логика) выбирай tl как универсального исполнителя.
13) Последняя строка ответа должна быть marker-статусом:
   - успех: ${buildOpencodeStatusLine("generated")}
   - ошибка: ${buildOpencodeStatusLine("fail")}
   - нужен ответ пользователя: ${buildOpencodeStatusLine("question")}`;
}
