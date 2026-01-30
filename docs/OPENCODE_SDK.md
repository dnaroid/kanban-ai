# Интеграция OpenCode SDK

Полное руководство по интеграции OpenCode SDK в приложение для управления
задачами (аналог Jira).

---

## Установка

```bash
# npm
npm install @opencode-ai/sdk/v2

# Bun
bun add @opencode-ai/sdk/v2

# Yarn
yarn add @opencode-ai/sdk/v2
```

---

## Быстрый старт

```typescript
import {createOpencodeClient} from "@opencode-ai/sdk/v2"

// Создаём клиент
const client = createOpencodeClient({
  baseUrl: "http://localhost:4096", // URL запущенного opencode serve
  throwOnError: true, // Бросать ошибки вместо логирования
})
```

---

## Основные операции

### 1. Создание сессии

```typescript
const session = await client.session.create({
  title: "Название задачи/сессии",
  directory: "/путь/к/проекту", // Рабочая директория
})

// Дополнительные опции
const sessionWithOptions = await client.session.create({
  title: "Task Name",
  directory: "/path/to/project",
  parentID: "parent_session_id", // Если нужно создать форк
})
```

### 2. Отправка задачи

```typescript
// Синхронная отправка (с ожиданием ответа)
const message = await client.session.prompt({
  sessionID: "session_id",
  message: {
    role: "user",
    content: "Реализуй feature X",
  },
})

// Асинхронная отправка (без ожидания)
await client.session.promptAsync({
  sessionID: "session_id",
  message: {
    role: "user",
    content: "Запусти тесты",
  },
})

// Отправка команды
const commandResult = await client.session.command({
  sessionID: "session_id",
  command: "npm test",
})

// Выполнение shell команды
const shellResult = await client.session.shell({
  sessionID: "session_id",
  command: "ls -la",
})
```

### 3. Получение логов сообщений

```typescript
// Все сообщения в сессии
const messages = await client.session.messages({
  sessionID: "session_id",
})

// С ограничением количества
const recentMessages = await client.session.messages({
  sessionID: "session_id",
  limit: 10,
})

// Конкретное сообщение
const specificMessage = await client.session.message({
  sessionID: "session_id",
  messageID: "message_id",
})

// Структура сообщения
interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  // ... другие поля
}
```

### 4. Закрытие сессии

```typescript
// Полное удаление сессии и всех данных
await client.session.delete({
  sessionID: "session_id",
})

// Прерывание активной сессии
await client.session.abort({
  sessionID: "session_id",
})

// Архивация сессии (удаление, но с возможностью восстановления)
await client.session.update({
  sessionID: "session_id",
  updates: {
    time: {archived: Date.now()},
  },
})
```

---

## Полный пример: Менеджер сессий

```typescript
import {createOpencodeClient} from "@opencode-ai/sdk/v2"

interface SessionInfo {
  id: string
  title: string
  projectPath: string
}

class SessionManager {
  private client = createOpencodeClient({
    baseUrl: "http://localhost:4096",
  })

  private activeSessions = new Map<string, SessionInfo>()

  // Создать сессию для задачи
  async createTaskSession(title: string, projectPath: string): Promise<SessionInfo> {
    const session = await this.client.session.create({
      title,
      directory: projectPath,
    })

    const sessionInfo: SessionInfo = {
      id: session.id,
      title: session.title,
      projectPath,
    }

    this.activeSessions.set(session.id, sessionInfo)
    return sessionInfo
  }

  // Отправить промпт пользователя
  async sendPrompt(sessionID: string, prompt: string) {
    const message = await this.client.session.prompt({
      sessionID,
      message: {role: "user", content: prompt},
    })

    return message
  }

  // Получить историю сообщений
  async getMessages(sessionID: string, limit?: number) {
    return await this.client.session.messages({
      sessionID,
      limit,
    })
  }

  // Получить информацию о сессии
  async getSessionInfo(sessionID: string) {
    return await this.client.session.get({sessionID})
  }

  // Закрыть сессию
  async closeSession(sessionID: string) {
    await this.client.session.delete({sessionID})
    this.activeSessions.delete(sessionID)
  }

  // Прервать активную сессию
  async abortSession(sessionID: string) {
    await this.client.session.abort({sessionID})
    this.activeSessions.delete(sessionID)
  }

  // Получить все активные сессии
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.activeSessions.values())
  }
}

// Использование
const manager = new SessionManager()

// Создать сессию для задачи
const taskSession = await manager.createTaskSession("TASK-001: Fix authentication bug", "/path/to/project")

// Отправить запрос
await manager.sendPrompt(taskSession.id, "Как исправить ошибку авторизации?")

// Получить сообщения
const messages = await manager.getMessages(taskSession.id)
console.log("История сообщений:", messages)
```

---

## Дополнительные возможности

### Fork сессии

Создание копии сессии с определённой точки:

```typescript
const forkedSession = await client.session.fork({
  sessionID: "original_session_id",
  messageID: "message_id", // С какой точки создать копию
})
```

### Управление todo списками

```typescript
// Получить todo задачи сессии
const todos = await client.session.todo({sessionID: "session_id"})

// Структура todo:
interface Todo {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed"
}
```

### Подписка на события

```typescript
// SDK поддерживает SSE для real-time обновлений
const eventStream = await client.event.subscribe({
  onEvent: (event) => {
    if (event.type === "session.message") {
      // Обновить UI при новом сообщении
      updateChatUI(event.data)
    }
  },
})
```

### Аутентификация

Если OpenCode serve защищён паролем:

```typescript
const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  auth: {
    username: "admin",
    password: "secret",
  },
})
```

---

## Обработка ошибок

```typescript
import {SessionNotFoundError, ConnectionError} from "@opencode-ai/sdk/v2"

try {
  const session = await client.session.create({title: "Test"})
} catch (error) {
  if (error instanceof SessionNotFoundError) {
    showError("Сессия не найдена")
  } else if (error instanceof ConnectionError) {
    showError("Ошибка соединения с сервером")
  } else {
    showError("Неизвестная ошибка:", error)
  }
}
```

---

## Рекомендации

1. **Используйте `promptAsync`** для неблокирующей отправки сообщений
2. **Управляйте сессиями** через менеджер для автоматизации очистки ресурсов
3. **Подпишитесь на события** для real-time обновлений UI
4. **Обрабатывайте ошибки** с конкретными типами для лучшего UX
5. **Используйте fork** для создания экспериментальных веток решения

---

## Типы API

```typescript
// Session
interface Session {
  id: string
  title: string
  directory: string
  time: {
    created: number
    updated: number
    archived?: number
  }
  status: "active" | "idle" | "completed"
}

// Message
interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  parts: MessagePart[]
}

// Todo
interface Todo {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed"
}
```

---

## Полезные эндпоинты API

- `POST /session` - Создание сессии
- `GET /session/:id` - Получение информации о сессии
- `POST /session/:id/message` - Отправка сообщения (поток)
- `POST /session/:id/prompt_async` - Асинхронная отправка
- `GET /session/:id/message` - Получение всех сообщений
- `DELETE /session/:id` - Удаление сессии
- `POST /session/:id/abort` - Прерывание сессии
- `GET /session/:id/todo` - Получение todo списка

---

## Документация

исходники opencode - [/Volumes/128GBSSD/Projects/opencode]

- **SDK**: `packages/sdk/js/src/v2/gen/client.gen.ts`
- **API эндпоинты**: `packages/opencode/src/server/routes/session.ts`
- **Сервер**: `packages/opencode/src/server/server.ts`
