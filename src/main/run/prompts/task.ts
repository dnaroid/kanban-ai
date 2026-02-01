export const buildTaskPrompt = (task: any, project: any): string => {
  return `
ЗАДАЧА: ${task.title}

Описание: ${task.description || "Нет описания"}

Контекст проекта:
- Путь: ${project.path}
- ID проекта: ${project.id}

Требования:
1. Выполните задачу в директории проекта: ${project.path}
2. При завершении в последним сообщением выведи в формате:
   STATUS: done|fail|question
3. Если STATUS=fail — опиши причину
4. Если STATUS=question — задай конкретный вопрос пользователю
`.trim()
}
