import { buildOpencodeStatusLine } from '../opencode-session-manager.js'

export const buildTaskPrompt = (task: any, project: any): string => {
  return `
ЗАДАЧА: ${task.title}

Описание: ${task.description || 'Нет описания'}

Контекст проекта:
- Путь: ${project.path}
- ID проекта: ${project.id}

Требования:
1. Выполните задачу в директории проекта: ${project.path}
2. При завершении ПОСЛЕДНИМ СООБЩЕНИЕМ В САМОМ НИЗУ выведи ОТДЕЛЬНОЙ СТРОКОЙ один из статусов в формате:
  ${buildOpencodeStatusLine('done')}
  ${buildOpencodeStatusLine('fail')}
  ${buildOpencodeStatusLine('question')}
3. Если status=fail — опиши причину
4. Если status=question — задай конкретный вопрос пользователю
`.trim()
}
