export const buildUserStoryPrompt = (
  task: any,
  project: any,
  options?: {
    availableTags?: string[]
    availableTypes?: string[]
    availableDifficulties?: string[]
  }
): string => {
  const tagList = options?.availableTags?.length
    ? options.availableTags.join(', ')
    : 'Нет доступных тегов'
  const typeList = options?.availableTypes?.length
    ? options.availableTypes.join(', ')
    : 'feature, bug, chore, improvement'
  const difficultyList = options?.availableDifficulties?.length
    ? options.availableDifficulties.join(', ')
    : 'easy, medium, hard, epic'

  return `
Сформируй техническую user story ДЛЯ КОД-АГЕНТА на русском языке. Это не текст для человека-заказчика, а четкое задание для LLM-исполнителя.

ЗАДАЧА: ${task.title}
Текущее описание: ${task.description || 'Нет описания'}
Текущие теги: ${(task.tags || []).join(', ') || 'Нет'}
Текущий тип задачи: ${task.type || 'task'}
Текущая сложность: ${task.difficulty || 'medium'}

Контекст проекта:
- Путь: ${project.path}
- Название: ${project.name}
- ID проекта: ${project.id}

Выбор тегов, типа и сложности:
- Выбери теги ТОЛЬКО из списка: ${tagList}
- Выбери тип ТОЛЬКО из списка: ${typeList}
- Выбери сложность ТОЛЬКО из списка: ${difficultyList}

Требования к формату (строго придерживайся структуры):
<META>
{"tags":["tag1","tag2"],"type":"feature","difficulty":"medium"}
</META>
<STORY>
**Название:** [кратко и технически точно]

**Цель:** [что именно должно измениться/появиться]

**Контекст проекта:**
- [1-3 пункта о домене/типе проекта, если можно предположить по пути]

**Скоуп:**
- Включено: [2-4 конкретных пункта]
- Исключено: [1-3 пункта, что делать не нужно]

**Требования:**
- [функциональное требование 1]
- [функциональное требование 2]
- [техническое требование 3]

**Ограничения:**
- [ограничение 1]
- [ограничение 2]

**Критерии приемки (проверяемые):**
- [критерий 1]
- [критерий 2]
- [критерий 3]

**Ожидаемый результат:** [конкретный итог, который должен получить агент]
</STORY>

Правила:
1. Пиши коротко, без «воды», ориентируйся на выполнение задачи код-агентом.
2. Не предлагай решения на уровне кода, только требования и критерии.
3. Верни ТОЛЬКО блоки <META> и <STORY>, без любых вступлений/пояснений.
4. В <META> не используй кодовые блоки или Markdown.
`.trim()
}
