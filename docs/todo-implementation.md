# Реализация Todo List в Kanban-AI

Полное руководство по интеграции и реализации todo списков из OpenCode в проект Kanban-AI.

---

## Обзор

Todo в OpenCode — это отдельная сущность, привязанная к сессии, которая:

1. **Хранится отдельно** от сообщений в Storage
2. **Может получаться** напрямую без загрузки всего чата
3. **Обновляется через SSE события** для real-time синхронизации
4. **Отображается в чате** как tool part (опционально)

---

## 1. Структура данных

### Todo

```typescript
// /packages/opencode/src/session/todo.ts
interface Todo {
  id: string // Уникальный ID элемента
  content: string // Краткое описание задачи
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' // Статус
  priority: 'high' | 'medium' | 'low' // Приоритет
}
```

### События Todo

```typescript
// Публикуется при обновлении todo
interface TodoUpdatedEvent {
  type: 'todo.updated'
  properties: {
    sessionID: string
    todos: Todo[] // Полный обновлённый список
  }
}
```

---

## 2. Хранение и API

### Storage API (внутренний)

```typescript
// Получение todo из хранилища
const todos = await Storage.read<Todo[]>(['todo', sessionID])
  .then((x) => x || [])
  .catch(() => [])

// Запись todo в хранилище
await Storage.write(['todo', sessionID], todos)
```

### HTTP API

```
GET /session/:sessionID/todo
→ Возвращает: Todo[]
→ Получает todo напрямую из Storage без сообщений
```

**Пример:**

```typescript
fetch(`http://localhost:4096/session/${sessionID}/todo`)
  .then((r) => r.json())
  .then((todos) => {
    console.log('Todos:', todos)
    // → [{id: "1", content: "Task 1", status: "pending", priority: "high"}, ...]
  })
```

---

## 3. SDK методы

### Получение Todo

```typescript
import { createOpencodeClient } from '@opencode-ai/sdk/v2'

const client = createOpencodeClient({
  baseUrl: 'http://localhost:4096',
})

// Получить todo для сессии
const todos = await client.session.todo({ sessionID: 'session-id' })
console.log(todos)
// → Todo[]
```

### Интеграция в SessionManager

```typescript
class SessionManager {
  private client = createOpencodeClient({ baseUrl: 'http://localhost:4096' })

  // Получить todo
  async getTodos(sessionID: string): Promise<Todo[]> {
    return await this.client.session.todo({ sessionID })
  }

  // Получить статистику прогресса
  async getProgress(sessionID: string): Promise<{ completed: number; total: number }> {
    const todos = await this.getTodos(sessionID)
    return {
      completed: todos.filter((t) => t.status === 'completed').length,
      total: todos.length,
    }
  }
}
```

---

## 4. Отдельный рендеринг Todo (без чата)

Todo можно рендерить как отдельный компонент, не связанный с чатом.

### React пример

```tsx
import { useState, useEffect } from 'react'
import { createOpencodeClient } from '@opencode-ai/sdk/v2'

const client = createOpencodeClient({ baseUrl: 'http://localhost:4096' })

interface TodoPanelProps {
  sessionID: string
}

export function TodoPanel({ sessionID }: TodoPanelProps) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)

  // Загружаем todo при монтировании
  useEffect(() => {
    const loadTodos = async () => {
      try {
        setLoading(true)
        const data = await client.session.todo({ sessionID })
        setTodos(data)
      } catch (error) {
        console.error('Failed to load todos:', error)
      } finally {
        setLoading(false)
      }
    }

    loadTodos()
  }, [sessionID])

  const completedCount = todos.filter((t) => t.status === 'completed').length
  const totalCount = todos.length

  if (loading) {
    return <div className="todo-panel loading">Loading...</div>
  }

  return (
    <div className="todo-panel">
      <div className="todo-header">
        <h3>Todos</h3>
        <span className="todo-progress">
          {completedCount}/{totalCount}
        </span>
      </div>

      <div className="todo-list">
        {todos.length === 0 ? (
          <div className="todo-empty">Нет задач</div>
        ) : (
          todos.map((todo) => <TodoItem key={todo.id} todo={todo} />)
        )}
      </div>
    </div>
  )
}

function TodoItem({ todo }: { todo: Todo }) {
  const isCompleted = todo.status === 'completed'

  return (
    <label className={`todo-item ${isCompleted ? 'completed' : ''}`}>
      <input type="checkbox" checked={isCompleted} readOnly className="todo-checkbox" />
      <span className="todo-content" data-completed={isCompleted}>
        {todo.content}
      </span>
      {todo.priority && <span className={`todo-priority ${todo.priority}`}>{todo.priority}</span>}
    </label>
  )
}
```

### SolidJS пример

```tsx
import { createSignal, onMount, createMemo, For } from 'solid-js'
import { createOpencodeClient } from '@opencode-ai/sdk/v2'

const client = createOpencodeClient({ baseUrl: 'http://localhost:4096' })

export function SolidTodoPanel(props: { sessionID: string }) {
  const [todos, setTodos] = createSignal<Todo[]>([])
  const [loading, setLoading] = createSignal(true)

  onMount(async () => {
    try {
      setLoading(true)
      const data = await client.session.todo({ sessionID: props.sessionID })
      setTodos(data)
    } catch (error) {
      console.error('Failed to load todos:', error)
    } finally {
      setLoading(false)
    }
  })

  const progress = createMemo(() => {
    const list = todos()
    return `${list.filter((t) => t.status === 'completed').length}/${list.length}`
  })

  return (
    <div className="todo-panel">
      <div className="todo-header">
        <h3>Todos</h3>
        <span className="todo-progress">{progress()}</span>
      </div>

      <Show when={loading()}>
        <div className="todo-panel loading">Loading...</div>
      </Show>

      <Show when={!loading()}>
        <div className="todo-list">
          <Show when={todos().length === 0}>
            <div className="todo-empty">Нет задач</div>
          </Show>

          <For each={todos()}>{(todo: Todo) => <TodoItem todo={todo} />}</For>
        </div>
      </Show>
    </div>
  )
}

function TodoItem(props: { todo: Todo }) {
  const isCompleted = () => props.todo.status === 'completed'

  return (
    <label class={`todo-item ${isCompleted() ? 'completed' : ''}`}>
      <input type="checkbox" checked={isCompleted()} readOnly class="todo-checkbox" />
      <span class="todo-content" data-completed={isCompleted()}>
        {props.todo.content}
      </span>
      <Show when={props.todo.priority}>
        <span class={`todo-priority ${props.todo.priority}`}>{props.todo.priority}</span>
      </Show>
    </label>
  )
}
```

---

## 5. Real-time обновления через SSE

### Подписка только на todo события

```typescript
import { createOpencodeClient } from '@opencode-ai/sdk/v2'

export function useRealtimeTodos(sessionID: string) {
  const [todos, setTodos] = useState<Todo[]>([])

  useEffect(() => {
    let stream: AsyncGenerator<any, void, unknown> | null = null

    const subscribe = async () => {
      try {
        const response = await client.event.subscribe({
          directory: '/path/to/project', // или используйте sessionID если доступно
        })

        stream = response.stream

        for await (const event of stream) {
          // Обрабатываем только todo события
          if (event.type === 'todo.updated') {
            const { sessionID: updatedSessionID, todos } = event.properties

            // Обновляем только если todo для нашей сессии
            if (updatedSessionID === sessionID) {
              setTodos(todos)
            }
          }

          // Игнорируем message.* события для экономии ресурсов
        }
      } catch (error) {
        console.error('SSE subscription error:', error)
      }
    }

    subscribe()

    // Cleanup
    return () => {
      // Закрываем stream если API поддерживает
      stream?.return?.()
    }
  }, [sessionID])

  return todos
}
```

### Компонент с real-time обновлениями

```tsx
export function TodoPanelRealtime({ sessionID }: TodoPanelProps) {
  const todos = useRealtimeTodos(sessionID)

  const completedCount = todos.filter((t) => t.status === 'completed').length
  const totalCount = todos.length

  return (
    <div className="todo-panel">
      <div className="todo-header">
        <h3>Todos</h3>
        <span className="todo-progress">
          {completedCount}/{totalCount}
        </span>
      </div>

      <div className="todo-list">
        {todos.map((todo) => (
          <TodoItem key={todo.id} todo={todo} />
        ))}
      </div>
    </div>
  )
}
```

---

## 6. Интеграция с Kanban-ai

### Использование в TaskDrawer

Если у вас есть `TaskDrawer` компонент:

```tsx
import { TodoPanel } from './TodoPanel'

function TaskDrawer({ sessionID, ...props }: TaskDrawerProps) {
  return (
    <div className="task-drawer">
      {/* Другие секции */}
      <TaskDetails {...props} />

      {/* Todo панель */}
      <TodoPanel sessionID={sessionID} />
    </div>
  )
}
```

### Добавление в SessionContext

```typescript
// contexts/SessionContext.tsx
interface SessionContextValue {
  sessionID: string
  getTodos: () => Promise<Todo[]>
  onTodoUpdate: (todos: Todo[]) => void
}

export function SessionProvider({ children, sessionID }) {
  const [todos, setTodos] = useState<Todo[]>([])

  const getTodos = useCallback(async () => {
    const data = await client.session.todo({sessionID})
    setTodos(data)
    return data
  }, [sessionID])

  const value: SessionContextValue = {
    sessionID,
    getTodos,
    onTodoUpdate: setTodos,
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
```

### Использование в других компонентах

```tsx
import { useSession } from './contexts/SessionContext'

function MyComponent() {
  const { sessionID, getTodos } = useSession()

  const handleRefreshTodos = async () => {
    await getTodos()
  }

  return (
    <div>
      <button onClick={handleRefreshTodos}>Обновить Todo</button>
    </div>
  )
}
```

---

## 7. Стили

```css
/* Todo Panel */
.todo-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: white;
}

.todo-panel.loading {
  opacity: 0.6;
  pointer-events: none;
}

.todo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f3f4f6;
}

.todo-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.todo-progress {
  font-size: 13px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 500;
}

/* Todo List */
.todo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.todo-empty {
  text-align: center;
  padding: 24px;
  color: #9ca3af;
  font-size: 14px;
}

/* Todo Item */
.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 6px;
  transition: background-color 0.2s;
  cursor: default;
}

.todo-item:hover {
  background: #f9fafb;
}

.todo-item.completed {
  opacity: 0.7;
}

.todo-checkbox {
  margin-top: 3px;
  width: 16px;
  height: 16px;
  cursor: default;
}

.todo-content {
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
  color: #374151;
}

.todo-content[data-completed='true'] {
  text-decoration: line-through;
  color: #9ca3af;
}

/* Todo Priority */
.todo-priority {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.todo-priority.high {
  background: #fee2e2;
  color: #dc2626;
}

.todo-priority.medium {
  background: #fef3c7;
  color: #d97706;
}

.todo-priority.low {
  background: #dcfce7;
  color: #166534;
}
```

---

## 8. Отображение в чате (опционально)

Todo может также отображаться внутри сообщений как tool part:

```tsx
// В renderParts
case 'tool':
  if (part.tool === 'todowrite') {
    return <TodoPart key={idx} tool={part} />
  }
  return <ToolPart key={idx} tool={part} />

// TodoPart для сообщений
function TodoPart({ tool }: { tool: Extract<Part, { type: 'tool' }> }) {
  const todos = (tool.state.input?.todos || tool.metadata?.todos || []) as Todo[]

  return (
    <details className="todo-tool-part" open>
      <summary className="todo-tool-summary">
        <div className="todo-tool-title">
          <span>✓</span>
          <span>Todos</span>
        </div>
        <span className="todo-progress-badge">
          {todos.filter(t => t.status === "completed").length}/{todos.length}
        </span>
      </summary>

      <div className="todo-tool-content">
        {todos.map(todo => <TodoItem key={todo.id} todo={todo} />)}
      </div>
    </details>
  )
}
```

---

## 9. Проверки и валидация

### Типизация

```typescript
// Проверка структуры todo
function isValidTodo(todo: any): todo is Todo {
  return (
    typeof todo.id === 'string' &&
    typeof todo.content === 'string' &&
    ['pending', 'in_progress', 'completed', 'cancelled'].includes(todo.status) &&
    ['high', 'medium', 'low'].includes(todo.priority)
  )
}
```

### Обработка ошибок

```typescript
async function safeGetTodos(sessionID: string): Promise<Todo[]> {
  try {
    const todos = await client.session.todo({ sessionID })
    return todos.filter(isValidTodo)
  } catch (error) {
    console.error('Failed to fetch todos:', error)
    return [] // Возвращаем пустой массив вместо抛ки ошибки
  }
}
```

---

## 10. Производительность

### Дебаунсинг обновлений

```typescript
import { debounce } from 'lodash-es'

const updateTodos = debounce((todos: Todo[]) => {
  setTodos(todos)
}, 300) // 300ms debounce

useEffect(() => {
  // Используем debounced версию
  updateTodos(newTodos)
}, [newTodos])
```

### Memoизация

```typescript
import { useMemo } from 'react'

const groupedTodos = useMemo(
  () => ({
    pending: todos.filter((t) => t.status === 'pending'),
    inProgress: todos.filter((t) => t.status === 'in_progress'),
    completed: todos.filter((t) => t.status === 'completed'),
    cancelled: todos.filter((t) => t.status === 'cancelled'),
  }),
  [todos]
)
```

---

## 11. Тестирование

### Моки для тестов

```typescript
const mockTodos: Todo[] = [
  {
    id: '1',
    content: 'Implement feature X',
    status: 'completed',
    priority: 'high',
  },
  {
    id: '2',
    content: 'Fix bug in Y',
    status: 'in_progress',
    priority: 'medium',
  },
]
```

### Тест компонента

```typescript
import { render, screen } from '@testing-library/react'

test('TodoPanel renders todos', async () => {
  jest.spyOn(client.session, 'todo').mockResolvedValue(mockTodos)

  render(<TodoPanel sessionID="test-session" />)

  await waitFor(() => {
    expect(screen.getByText('Todos')).toBeInTheDocument()
    expect(screen.getByText('Implement feature X')).toBeInTheDocument()
    expect(screen.getByText('Fix bug in Y')).toBeInTheDocument()
  })
})
```

---

## Итог

1. **Todo — отдельная сущность**, не зависящая от сообщений
2. **Можно получать напрямую** через `client.session.todo()`
3. **Поддерживает real-time** через SSE события `todo.updated`
4. **Можно рендерить отдельно** в любой части UI
5. **Опционально отображается** в чате как tool part
6. **Полная типизация** через TypeScript interfaces

---

## Полезные ссылки

- OpenCode SDK: `/Volumes/128GBSSD/Projects/opencode/packages/sdk/js/src/v2/gen/client.gen.ts`
- Todo Storage: `/Volumes/128GBSSD/Projects/opencode/packages/opencode/src/session/todo.ts`
- Todo API: `/Volumes/128GBSSD/Projects/opencode/packages/opencode/src/server/routes/session.ts` (строки 156-184)
- Рендеринг: `/Volumes/128GBSSD/Projects/opencode/packages/ui/src/components/message-part.tsx`
