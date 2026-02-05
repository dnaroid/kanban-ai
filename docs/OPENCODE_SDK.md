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
import { createOpencodeClient } from '@opencode-ai/sdk/v2'

// Создаём клиент
const client = createOpencodeClient({
  baseUrl: 'http://localhost:4096', // URL запущенного opencode serve
  throwOnError: true, // Бросать ошибки вместо логирования
})
```

---

## Основные операции

### 1. Создание сессии

```typescript
const session = await client.session.create({
  title: 'Название задачи/сессии',
  directory: '/путь/к/проекту', // Рабочая директория
})

// Дополнительные опции
const sessionWithOptions = await client.session.create({
  title: 'Task Name',
  directory: '/path/to/project',
  parentID: 'parent_session_id', // Если нужно создать форк
})
```

### 2. Отправка задачи

```typescript
// Синхронная отправка (с ожиданием ответа)
const message = await client.session.prompt({
  sessionID: 'session_id',
  message: {
    role: 'user',
    content: 'Реализуй feature X',
  },
})

// Асинхронная отправка (без ожидания)
await client.session.promptAsync({
  sessionID: 'session_id',
  message: {
    role: 'user',
    content: 'Запусти тесты',
  },
})

// Отправка команды
const commandResult = await client.session.command({
  sessionID: 'session_id',
  command: 'npm test',
})

// Выполнение shell команды
const shellResult = await client.session.shell({
  sessionID: 'session_id',
  command: 'ls -la',
})
```

### 3. Получение логов сообщений

```typescript
// Все сообщения в сессии
const messages = await client.session.messages({
  sessionID: 'session_id',
})

// С ограничением количества
const recentMessages = await client.session.messages({
  sessionID: 'session_id',
  limit: 10,
})

// Конкретное сообщение
const specificMessage = await client.session.message({
  sessionID: 'session_id',
  messageID: 'message_id',
})

// Структура сообщения
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  // ... другие поля
}
```

### 4. Закрытие сессии

```typescript
// Полное удаление сессии и всех данных
await client.session.delete({
  sessionID: 'session_id',
})

// Прерывание активной сессии
await client.session.abort({
  sessionID: 'session_id',
})

// Архивация сессии (удаление, но с возможностью восстановления)
await client.session.update({
  sessionID: 'session_id',
  updates: {
    time: { archived: Date.now() },
  },
})
```

---

## Полный пример: Менеджер сессий

```typescript
import { createOpencodeClient } from '@opencode-ai/sdk/v2'

interface SessionInfo {
  id: string
  title: string
  projectPath: string
}

class SessionManager {
  private client = createOpencodeClient({
    baseUrl: 'http://localhost:4096',
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
      message: { role: 'user', content: prompt },
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
    return await this.client.session.get({ sessionID })
  }

  // Закрыть сессию
  async closeSession(sessionID: string) {
    await this.client.session.delete({ sessionID })
    this.activeSessions.delete(sessionID)
  }

  // Прервать активную сессию
  async abortSession(sessionID: string) {
    await this.client.session.abort({ sessionID })
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
const taskSession = await manager.createTaskSession(
  'TASK-001: Fix authentication bug',
  '/path/to/project'
)

// Отправить запрос
await manager.sendPrompt(taskSession.id, 'Как исправить ошибку авторизации?')

// Получить сообщения
const messages = await manager.getMessages(taskSession.id)
console.log('История сообщений:', messages)
```

---

## Дополнительные возможности

### Fork сессии

Создание копии сессии с определённой точки:

```typescript
const forkedSession = await client.session.fork({
  sessionID: 'original_session_id',
  messageID: 'message_id', // С какой точки создать копию
})
```

### Управление todo списками

```typescript
// Получить todo задачи сессии
const todos = await client.session.todo({ sessionID: 'session_id' })

// Структура todo:
interface Todo {
  id: string // Уникальный ID todo элемента
  content: string // Краткое описание задачи
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' // Текущий статус
  priority: 'high' | 'medium' | 'low' // Уровень приоритета
}

// Пример использования:
const todos = await client.session.todo({ sessionID: 'my-session-id' })
console.log(`Всего задач: ${todos.length}`)
console.log(`Выполнено: ${todos.filter((t) => t.status === 'completed').length}`)

// Фильтрация по статусу
const pendingTodos = todos.filter((t) => t.status === 'pending')
const inProgressTodos = todos.filter((t) => t.status === 'in_progress')
const completedTodos = todos.filter((t) => t.status === 'completed')

// Группировка по приоритету
const highPriorityTodos = todos.filter((t) => t.priority === 'high')
const mediumPriorityTodos = todos.filter((t) => t.priority === 'medium')
const lowPriorityTodos = todos.filter((t) => t.priority === 'low')
```

#### Где искать todo в сообщениях

Todo список может быть частью сообщения (tool part):

```typescript
interface TodoPart {
  type: 'tool'
  tool: 'todowrite' // или другое имя инструмента
  state: {
    status: 'pending' | 'running' | 'completed' | 'error'
    input: {
      todos: Todo[] // Массив todo задач
    }
    output?: string
    title?: string
  }
}
```

#### Реализация в чате

При получении сообщений через SSE или API, todo список доступен в:

1. **Tool part с todowrite**: `part.state.input.todos` или `part.metadata?.todos`
2. **Входные параметры**: `props.input.todos`
3. **Метаданные**: `props.metadata?.todos`

### Подписка на события (SSE)

```typescript
// SDK поддерживает SSE для real-time обновлений
// client.event.subscribe возвращает Promise<{ stream: AsyncGenerator<Event> }>
const response = await client.event.subscribe({
  directory: '/path/to/project',
})

// Извлечь async generator из response
const stream = response.stream

// Итерировать по событиям
for await (const event of stream) {
  console.log('Event type:', event.type)

  switch (event.type) {
    case 'message.updated':
      // Новое сообщение или обновление метаданных
      console.log('Message:', event.properties.info)
      break

    case 'message.part.updated':
      // Инкрементальное обновление части сообщения (streaming)
      const part = event.properties.part
      const delta = event.properties.delta // Новый текст
      console.log('Part updated:', part.id, delta)
      break

    case 'message.removed':
      // Сообщение удалено
      console.log('Message removed:', event.properties.messageID)
      break

    case 'message.part.removed':
      // Часть сообщения удалена
      console.log('Part removed:', event.properties.partID)
      break
  }
}
```

#### Типы событий

```typescript
interface Event {
  type: 'message.updated' | 'message.removed' | 'message.part.updated' | 'message.part.removed'
  properties: {
    info?: Message // для message.updated
    messageID?: string // для message.removed, message.part.removed
    part?: Part // для message.part.updated
    delta?: string // для message.part.updated (инкрементальный текст)
    partID?: string // для message.part.removed
  }
}
```

#### Пример: Real-time чат с накоплением parts

```typescript
const messages = new Map<string, { role: string; parts: Part[] }>()

const response = await client.event.subscribe({ directory: projectPath })

for await (const event of response.stream) {
  if (event.type === 'message.updated') {
    const msg = event.properties.info
    if (!messages.has(msg.id)) {
      messages.set(msg.id, { role: msg.role, parts: [] })
    }
  }

  if (event.type === 'message.part.updated') {
    const { part, delta } = event.properties
    const msg = messages.get(part.messageID)
    if (!msg) {
      messages.set(part.messageID, { role: 'assistant', parts: [part] })
    } else {
      const existingPartIndex = msg.parts.findIndex((p) => p.id === part.id)
      if (existingPartIndex === -1) {
        msg.parts.push(part)
      } else {
        msg.parts[existingPartIndex] = part
      }
    }

    // Обновить UI с новым контентом
    updateChatUI(part.messageID, msg)
  }
}
```

#### Важно

- События `message.part.updated` приходят инкрементально во время генерации ответа
- Каждое событие содержит полный обновленный `part` и `delta` (новый текст)
- Нужно накапливать parts в сообщении, а не заменять их
- После завершения генерации приходит финальное `message.updated` с метаданными
- При обработке финального `message.updated` нужно сохранять накопленные parts

### Живые vs Файловые сообщения

#### Живые сообщения (Active/Live Sessions)

**Характеристики:**

- Сессия активна в `activeSessions`
- Подписка через SSE: `client.event.subscribe({ directory })`
- События приходят в real-time через SSE stream
- Аватар ассистента пульсирует во время генерации
- Parts накапливаются по мере поступления `message.part.updated`
- Сообщение создается при первом `message.part.updated` (без предварительного `message.updated`)

**Как работает:**

```typescript
// 1. Создается SSE stream
const response = await client.event.subscribe({ directory: projectPath })
const stream = response.stream

// 2. Итерируем по событиям
for await (const event of stream) {
  if (event.type === 'message.part.updated') {
    // Инкрементальное обновление
    const part = event.properties.part
    const delta = event.properties.delta // Новый текст
    // Накапливаем part в сообщении
    updateMessagePart(event.properties.messageID, part)
  }

  if (event.type === 'message.updated') {
    // Финальное обновление метаданных
    // Сохраняем накопленные parts!
    updateMessageMetadata(event.properties.info, existingParts)
  }
}
```

**UI поведение:**

- Сообщение появляется сразу при первом part
- Контент растет постепенно по мере поступления parts
- Аватар пульсирует `animate-pulse`
- После завершения генерации - аватар статичный, контент сохраняется

#### Файловые сообщения (Historical/Static Sessions)

**Характеристики:**

- Сессия НЕ в `activeSessions`
- Нет SSE подписки
- Сообщения загружаются из файлов или через `client.session.messages.get()`
- Аватар статичный (без пульсации)
- Parts уже загружены полностью
- Загрузка происходит при открытии исторической сессии

**Как работает:**

```typescript
// 1. Загружаем сообщения из файлов
const messages = await client.session.messages.get({
  sessionID: sessionId,
})

// 2. Или читаем напрямую из filesystem
const sessionData = await readSessionFile(sessionID)
const messages = sessionData.messages

// 3. Отображаем с загруженными parts
messages.forEach((msg) => {
  renderMessage({
    role: msg.role,
    parts: msg.parts, // Уже загружены полностью
    content: msg.content,
  })
})
```

**UI поведение:**

- Сообщения появляются сразу с полным контентом
- Никакой анимации пульсации
- Контент статичный

#### Как определить тип сообщения

**В коде:**

```typescript
// 1. Проверяем активную сессию
const isActive = activeSessions.has(sessionID)

// 2. Проверяем наличие SSE stream
const hasStream = sessionStreams.has(sessionID)

// 3. По типу событий
// Живое: получаем `message.part.updated` → streaming
// Файловое: получаем только `message.updated` → static

// 4. По timestamp
// Недавно создано (< 1 минута) → возможно живое
// Старое (> 1 минута) → файловое
```

**В UI:**

```typescript
// Отслеживаем активные сообщения через timeout
const [streamingMessageIds, setStreamingMessageIds] = useState<Set<string>>(new Set())

// При получении message.part.updated
setStreamingMessageIds(prev => new Set(prev).add(messageID))

// Сбрасываем через 2 секунды без активности
setTimeout(() => {
  setStreamingMessageIds(prev => {
    const next = new Set(prev)
    next.delete(messageID)
    return next
  })
}, 2000)

// Применяем анимацию только для streaming сообщений
<div className={cn(
  'avatar',
  isStreaming && 'animate-pulse'
)} />
```

#### Рекомендации

1. **Для живых сообщений:**
   - Использовать SSE подписку для real-time обновлений
   - Накапливать parts по мере поступления
   - Показывать анимацию пульсации аватара
   - Сохранять parts при финальном `message.updated`

2. **Для файловых сообщений:**
   - Загружать из filesystem или через SDK
   - Отображать сразу с полным контентом
   - Не показывать анимацию пульсации
   - Не пытаться подключать SSE

3. **Обработка событий:**
   - `message.part.updated` → всегда обновлять/добавлять part
   - `message.updated` → обновлять метаданные, сохранять существующие parts
   - `message.removed` → удалять сообщение
   - `message.part.removed` → удалять part из сообщения

````

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
````

---

## Обработка ошибок

```typescript
import { SessionNotFoundError, ConnectionError } from '@opencode-ai/sdk/v2'

try {
  const session = await client.session.create({ title: 'Test' })
} catch (error) {
  if (error instanceof SessionNotFoundError) {
    showError('Сессия не найдена')
  } else if (error instanceof ConnectionError) {
    showError('Ошибка соединения с сервером')
  } else {
    showError('Неизвестная ошибка:', error)
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
  status: 'active' | 'idle' | 'completed'
}

// Message
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  parts: MessagePart[]
}

// Todo
interface Todo {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
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
