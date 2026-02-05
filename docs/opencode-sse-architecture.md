# Архитектура отслеживания обновлений сессий (OpenCode)

## Обзор

Документ описывает, как веб-версия проекта OpenCode отслеживает обновления всех сессий в реальном времени. Эта информация может быть применена в проекте kanban-ai.

---

## Компоненты архитектуры

### 1. Глобальный SDK контекст (`global-sdk.tsx`)

**Файл**: `packages/app/src/context/global-sdk.tsx`

```typescript
// Создает два клиента: один для SSE событий, другой для обычных запросов
const eventSdk = createOpencodeClient({
  baseUrl: server.url,
  signal: abort.signal,
  fetch: platform.fetch,
})

const sdk = createOpencodeClient({
  baseUrl: server.url,
  fetch: platform.fetch,
  throwOnError: true,
})
```

**Ключевая логика SSE** (строки 70-91):

1. Инициализирует SSE соединение:

   ```typescript
   const events = await eventSdk.global.event()
   for await (const event of events.stream) { ... }
   ```

2. **Коалисцирование событий** - быстрые события одного типа объединяются:
   - `session.status:${directory}:${sessionID}`
   - `lsp.updated:${directory}`
   - `message.part.updated:${directory}:${messageID}:${partID}`

3. **Батчинг** - события группируются и отправляются в рамках 16ms кадра для производительности

4. **Backpressure control** - если обработка отстает >8ms, происходит yielding через `setTimeout`

5. **GlobalEmitter** - шина событий для распространения по директориям

---

### 2. Централизованная обработка событий (`global-sync.tsx`)

**Файл**: `packages/app/src/context/global-sync.tsx`

Подписывается на **все** события от глобального emitter'а:

```typescript
const unsub = globalSDK.event.listen((e) => {
  // Обработка всех типов событий
})
```

**Обрабатываемые типы событий** (строки 642-825):

| Тип события                | Описание                                      | Действие                            |
| -------------------------- | --------------------------------------------- | ----------------------------------- |
| `session.created`          | Создана новая сессия                          | Добавляет в store                   |
| `session.updated`          | Обновлены метаданные сессии                   | Обновляет в store через reconcile   |
| `session.deleted`          | Сессия удалена                                | Удаляет из store                    |
| `session.diff`             | Обновлён список измененных файлов (diff)      | Обновляет session_diff в store      |
| `todo.updated`             | Обновлён todo-лист сессии                     | Обновляет todo в store              |
| `session.status`           | Изменился статус сессии (active/error и т.д.) | Обновляет статус в store            |
| `message.updated`          | Добавлено/обновлено сообщение                 | Обновляет message в store           |
| `message.removed`          | Сообщение удалено                             | Удаляет из store                    |
| `message.part.updated`     | Обновлена часть сообщения (текст, код и т.д.) | Обновляет part в store              |
| `message.part.removed`     | Часть сообщения удалена                       | Удаляет из store                    |
| `permission.asked/replied` | Запрос прав / ответ                           | Обрабатывает в permission контексте |
| `question.asked/replied`   | Вопрос пользователю / ответ                   | Обрабатывает вопросы                |
| `vcs.branch.updated`       | Обновлён состояние git ветки                  | Обновляет vcs данные                |
| `lsp.updated`              | Обновлён LSP diagnostics                      | Обновляет lsp данные                |
| `server.instance.disposed` | Инстанс сервера закрыт                        | Очищает данные                      |

**Оптимизации производительности**:

1. **Binary.search()** - O(log n) поиск в отсортированных массивах вместо O(n)
2. **reconcile()** - умный merge данных вместо полной замены массивов
3. **batch(() => { ... })** - один ререндер на группу изменений вместо множества

---

### 3. Локальный sync контекст (`sync.tsx`)

**Файл**: `packages/app/src/context/sync.tsx`

Для конкретной директории предоставляет методы работы с сессиями:

- `sync(sessionID)` - загружает сессию + сообщения по требованию (lazy loading)
- Пагинация сообщений чанками по 400
- Оптимистичные обновления через `addOptimisticMessage()` - обновление UI до ответа сервера

---

## Поток данных

```
┌─────────────────────────────────────────────────────────────────┐
│ Server (OpenCode Backend)                                      │
└───────────────────────┬─────────────────────────────────────┘
                        │ SSE Stream
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ global-sdk.tsx                                                │
│ - eventSdk.global.event()                                       │
│ - for await (const event of events.stream)                     │
│   ├─ Коалисцирование (deduplication)                          │
│   └─ Батчинг (16ms кадр)                                     │
│   - GlobalEmitter.emit(directory, event)                        │
└───────────────────────┬─────────────────────────────────────┘
                        │ События по директориям
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ global-sync.tsx                                               │
│ - globalSDK.event.listen((e) => { ... })                      │
│   ├─ Обработка по типу события                                 │
│   ├─ Binary search + reconcile для больших массивов              │
│   └─ batch(() => { ... }) для атомарности обновлений          │
└───────────────────────┬─────────────────────────────────────┘
                        │ Reactive stores
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ SolidJS Reactive System                                       │
│ - Автоматические ререндеры при изменениях в store              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ↓
                    UI Обновление
```

---

## Ключевые принципы для применения в kanban-ai

### 1. Единый SSE поток на всё приложение

- **Почему экономия соединений**: Вместо N SSE подключений (по одному на сессию) используется один глобальный
- **Реализация**: Один `eventSdk.global.event()` подписывается на все события всех сессий
- **Benefit**: Меньше нагрузка на сервер, меньше открытых соединений

### 2. Коалисцирование высокочастотных событий

- **Проблема**: События типа `message.part.updated` могут приходить десятками в секунду
- **Решение**: Использовать key-based коалисцирование:
  ```typescript
  const key = (directory, payload) => {
    if (payload.type === 'message.part.updated') {
      return `message.part.updated:${directory}:${part.messageID}:${part.id}`
    }
  }
  // Если событие с таким key уже в очереди → заменить старое новым
  ```
- **Benefit**: Обрабатывается только последнее состояние вместо всех промежуточных

### 3. Централизованный обработчик событий

- **Архитектура**: Одно место (`global-sync.tsx`) для обработки ВСЕХ типов событий
- **Benefit**:
  - Единая логика обработки
  - Легко добавить новые типы событий
  - Гарантированный порядок обработки

### 4. Lazy loading с пагинацией

- **Подход**: Не загружать все сообщения сразу, а по требованию чанками
- **Реализация**:
  ```typescript
  const chunk = 400
  async loadMore(sessionID, count = chunk) {
    const currentLimit = meta.limit[key] ?? chunk
    await loadMessages({ limit: currentLimit + count })
  }
  ```
- **Benefit**: Быстрая начальная загрузка, подгрузка по мере прокрутки

### 5. Оптимизации производительности для больших массивов

- **Binary.search()**: O(log n) вместо O(n) для поиска в отсортированных массивах
- **reconcile()**: Умный merge вместо полной замены данных
- **batch()**: Атомарные обновления для предотвращения лишних ререндеров

---

## Типы событий для отслеживания

### Сессионные события

```typescript
// Создание сессии
event: { type: "session.created", properties: { session: Session } }

// Обновление метаданных
event: { type: "session.updated", properties: { session: Session } }

// Удаление сессии
event: { type: "session.deleted", properties: { sessionID: string } }

// Изменение статуса (active/error/completed)
event: { type: "session.status", properties: { sessionID: string, status: SessionStatus } }

// Обновление diff (измененные файлы)
event: { type: "session.diff", properties: { sessionID: string, diff: FileDiff[] } }
```

### Сообщения

```typescript
// Новое/обновленное сообщение
event: { type: "message.updated", properties: { message: Message } }

// Удаление сообщения
event: { type: "message.removed", properties: { messageID: string } }

// Обновление части сообщения (текст, код, файл и т.д.)
event: { type: "message.part.updated", properties: { part: MessagePart } }

// Удаление части сообщения
event: { type: "message.part.removed", properties: { messageID: string, partID: string } }
```

### Todo лист

```typescript
// Обновление todo-листа сессии
event: { type: "todo.updated", properties: { sessionID: string, todos: Todo[] } }
```

---

## Пример интеграции в kanban-ai

### Шаг 1: Создание глобального SDK контекста

```typescript
// context/global-sdk.tsx
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'
import { createGlobalEmitter } from '@solid-primitives/event-bus'

export const GlobalSDKProvider = createSimpleContext({
  name: 'GlobalSDK',
  init: () => {
    const eventSdk = createOpencodeClient({ baseUrl: API_URL })
    const emitter = createGlobalEmitter<{ [key: string]: Event }>()

    // SSE подписка на все события
    void (async () => {
      const events = await eventSdk.global.event()
      for await (const event of events.stream) {
        emitter.emit(event.directory ?? 'global', event.payload)
      }
    })()

    return { client: eventSdk, event: emitter }
  },
})
```

### Шаг 2: Обработчик событий для сессий

```typescript
// context/sessions.tsx
export const SessionsProvider = createSimpleContext({
  name: 'Sessions',
  init: () => {
    const [sessions, setSessions] = createStore<Session[]>([])

    // Подписка на все события сессий
    const unsub = globalSDK.event.listen((e) => {
      batch(() => {
        switch (e.type) {
          case 'session.created':
            setSessions(reconcile([e.properties.session, ...sessions]))
            break
          case 'session.updated':
            setSessions(
              reconcile(
                sessions.map((s) => (s.id === e.properties.session.id ? e.properties.session : s))
              )
            )
            break
          case 'session.deleted':
            setSessions(sessions.filter((s) => s.id !== e.properties.sessionID))
            break
        }
      })
    })

    onCleanup(unsub)
    return { sessions, setSessions }
  },
})
```

---

## Полезные ссылки в коде OpenCode

- `packages/app/src/context/global-sdk.tsx` - Глобальный SDK с SSE
- `packages/app/src/context/global-sync.tsx` - Обработка всех событий
- `packages/app/src/context/sync.tsx` - Локальный sync для директории
- `packages/sdk/js/dist/gen/core/serverSentEvents.gen.d.ts` - Типы SSE клиента
- `OPENCODE_SDK.md` - Документация SDK

---

**Дата создания**: 5 февраля 2026
**Источник**: OpenCode project (`/Volumes/128GBSSD/Projects/opencode`)
