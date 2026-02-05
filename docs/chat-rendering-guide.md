# Chat Rendering Guide - OpenCode Message System

Этот документ объясняет, как рендерить массив сообщений OpenCode в виде обычного чата с примерами кода.

---

## 1. Структура данных

### Message (info)

```typescript
// /packages/opencode/src/session/message-v2.ts
type MessageInfo = {
  id: string // Уникальный ID сообщения
  sessionID: string // ID сессии
  role: 'user' | 'assistant' // Кто отправил

  // Для user
  time: { created: number }
  agent: string
  model: { providerID: string; modelID: string }
  summary?: { title?: string; body?: string; diffs?: FileDiff[] }

  // Для assistant
  parentID?: string // ID родительского user сообщения
  modelID: string
  providerID: string
  path: { cwd: string; root: string }
  cost: number
  tokens: { input: number; output: number; reasoning: number }
  error?: ErrorInfo
  finish?: string
  time: { created: number; completed?: number }
}
```

### Part (составляющая сообщения)

```typescript
type Part =
  | { type: 'text'; text: string; synthetic?: boolean; ignored?: boolean }
  | { type: 'reasoning'; text: string; metadata?: Record<string, any> }
  | { type: 'file'; url: string; mime: string; filename?: string; source?: FileSource }
  | { type: 'agent'; name: string; source?: { value: string; start: number; end: number } }
  | { type: 'tool'; callID: string; tool: string; state: ToolState; metadata?: any }

type ToolState =
  | { status: 'pending'; input: Record<string, any>; raw: string }
  | { status: 'running'; input: Record<string, any>; title?: string; time: { start: number } }
  | {
      status: 'completed'
      input: Record<string, any>
      output: string
      title: string
      attachments?: FilePart[]
    }
  | { status: 'error'; input: Record<string, any>; error: string; metadata?: any }
```

---

## 2. Концепция Turn'ов

В OpenCode сообщения группируются в **Turn'ы**:

- **Turn** = пара: (User message) + (Assistant response)
- Каждый user message имеет `parentID`, который ссылается на предыдущий assistant message
- Это позволяет создавать дерево диалога, но для простого чата можно рендерить линейно

```typescript
// Пример структуры данных
const messages: Array<{ info: MessageInfo; parts: Part[] }> = [
  {
    info: { id: "msg-1", role: "user", time: { created: 1234567890 }, ... },
    parts: [{ type: "text", text: "Привет, как дела?" }]
  },
  {
    info: { id: "msg-2", role: "assistant", parentID: "msg-1", time: { created: 1234567891 }, ... },
    parts: [{ type: "text", text: "Привет! У меня всё отлично." }]
  },
  // ... и т.д.
]
```

---

## 3. Простой чат (React)

### 3.1 Базовый компонент чата

```tsx
import React from 'react'

type ChatMessage = { info: MessageInfo; parts: Part[] }

export function SimpleChat({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="chat-container">
      {messages.map((msg) => (
        <MessageBubble key={msg.info.id} message={msg} />
      ))}
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.info.role === 'user'

  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-content">{renderParts(message.parts, message.info.role)}</div>
      <div className="message-time">
        {new Date(message.info.time.created * 1000).toLocaleTimeString()}
      </div>
    </div>
  )
}

function renderParts(parts: Part[], role: 'user' | 'assistant'): React.ReactNode {
  return parts
    .map((part, idx) => {
      switch (part.type) {
        case 'text':
          // Пропускаем ignored тексты (служебные)
          if (part.ignored) return null
          return <TextPart key={idx} text={part.text} />

        case 'file':
          return <FilePart key={idx} file={part} />

        case 'agent':
          return <AgentPart key={idx} agent={part} />

        case 'tool':
          return <ToolPart key={idx} tool={part} />

        case 'reasoning':
          // Reasoning можно скрыть по умолчанию или показывать для assistant
          if (role === 'assistant') {
            return <ReasoningPart key={idx} reasoning={part} />
          }
          return null

        default:
          return null
      }
    })
    .filter(Boolean)
}
```

### 3.2 Рендеринг частей сообщения

```tsx
function TextPart({ text }: { text: string }) {
  return <div className="text-part">{text}</div>
}

function FilePart({ file }: { file: Extract<Part, { type: 'file' }> }) {
  const isImage = file.mime?.startsWith('image/')

  if (isImage) {
    return (
      <div className="file-part image">
        <img src={file.url} alt={file.filename || 'Attachment'} />
      </div>
    )
  }

  return (
    <div className="file-part">
      <a href={file.url} download={file.filename} target="_blank" rel="noopener">
        {file.filename || 'File'}
      </a>
    </div>
  )
}

function AgentPart({ agent }: { agent: Extract<Part, { type: 'agent' }> }) {
  return (
    <div className="agent-part">
      <span className="agent-badge">{agent.name}</span>
    </div>
  )
}

function ToolPart({ tool }: { tool: Extract<Part, { type: 'tool' }> }) {
  return (
    <div className="tool-part">
      <div className="tool-header">
        <span className="tool-name">{tool.tool}</span>
        <span className={`tool-status ${tool.state.status}`}>{tool.state.status}</span>
      </div>

      {tool.state.status !== 'pending' && (
        <div className="tool-details">
          <details>
            <summary>Input</summary>
            <pre>{JSON.stringify(tool.state.input, null, 2)}</pre>
          </details>

          {tool.state.status === 'completed' && (
            <>
              <div className="tool-output">{tool.state.output}</div>
              {tool.state.attachments && tool.state.attachments.length > 0 && (
                <div className="tool-attachments">
                  {tool.state.attachments.map((att, i) => (
                    <FilePart key={i} file={att} />
                  ))}
                </div>
              )}
            </>
          )}

          {tool.state.status === 'error' && <div className="tool-error">{tool.state.error}</div>}
        </div>
      )}
    </div>
  )
}

function ReasoningPart({ reasoning }: { reasoning: Extract<Part, { type: 'reasoning' }> }) {
  return (
    <details className="reasoning-part">
      <summary>Reasoning</summary>
      <pre>{reasoning.text}</pre>
    </details>
  )
}
```

### 3.3 Рендеринг Todo списков

Todo списки в OpenCode реализуются как tool part с типом `todowrite`:

```typescript
interface Todo {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
}
```

#### Базовый компонент для Todo

```tsx
interface TodoPartProps {
  tool: Extract<Part, { type: 'tool' }>
}

function TodoPart({ tool }: TodoPartProps) {
  // Получаем список todos из input или metadata
  const todos = (tool.state.input?.todos || tool.metadata?.todos || []) as Todo[]

  // Подсчитываем прогресс
  const completedCount = todos.filter((t) => t.status === 'completed').length
  const totalCount = todos.length
  const progress = totalCount > 0 ? `${completedCount}/${totalCount}` : '0/0'

  return (
    <div className="todo-part">
      <div className="todo-header">
        <span className="todo-icon">✓</span>
        <span className="todo-title">Todos</span>
        <span className="todo-progress">{progress}</span>
      </div>

      <div className="todo-list">
        {todos.map((todo, idx) => (
          <TodoItem key={todo.id || idx} todo={todo} />
        ))}
      </div>
    </div>
  )
}

function TodoItem({ todo }: { todo: Todo }) {
  const isCompleted = todo.status === 'completed'

  return (
    <label className={`todo-item ${isCompleted ? 'completed' : ''}`}>
      <input
        type="checkbox"
        checked={isCompleted}
        readOnly // Только для отображения статуса
        className="todo-checkbox"
      />
      <span className="todo-content" data-completed={isCompleted}>
        {todo.content}
      </span>
      {todo.priority && <span className={`todo-priority ${todo.priority}`}>{todo.priority}</span>}
    </label>
  )
}
```

#### Интеграция в renderParts

```tsx
function renderParts(parts: Part[], role: 'user' | 'assistant'): React.ReactNode {
  return parts
    .map((part, idx) => {
      switch (part.type) {
        case 'text':
          if (part.ignored) return null
          return <TextPart key={idx} text={part.text} />

        case 'file':
          return <FilePart key={idx} file={part} />

        case 'agent':
          return <AgentPart key={idx} agent={part} />

        case 'tool':
          // Обрабатываем todowrite как отдельный тип
          if (part.tool === 'todowrite') {
            return <TodoPart key={idx} tool={part} />
          }
          return <ToolPart key={idx} tool={part} />

        case 'reasoning':
          if (role === 'assistant') {
            return <ReasoningPart key={idx} reasoning={part} />
          }
          return null

        default:
          return null
      }
    })
    .filter(Boolean)
}
```

#### Стили для Todo компонентов

```css
.todo-part {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  margin: 8px 0;
  background: white;
}

.todo-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f3f4f6;
}

.todo-icon {
  font-size: 18px;
  color: #3b82f6;
}

.todo-title {
  font-weight: 600;
  color: #1f2937;
}

.todo-progress {
  margin-left: auto;
  font-size: 14px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 12px;
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
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
  margin-top: 2px;
  cursor: default;
  width: 16px;
  height: 16px;
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

.todo-priority {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
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

#### Расширенный пример с collapsible (как в OpenCode)

```tsx
import { useState } from 'react'

function TodoPart({ tool }: TodoPartProps) {
  const [isOpen, setIsOpen] = useState(false)
  const todos = (tool.state.input?.todos || tool.metadata?.todos || []) as Todo[]

  const completedCount = todos.filter((t) => t.status === 'completed').length
  const totalCount = todos.length

  return (
    <details
      className="todo-tool-part"
      open={isOpen}
      onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="todo-tool-summary">
        <div className="todo-tool-title">
          <svg className="todo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          <span>Todos</span>
        </div>
        <span className="todo-progress-badge">
          {completedCount}/{totalCount}
        </span>
      </summary>

      <div className="todo-tool-content">
        {todos.length === 0 ? (
          <div className="todo-empty">Нет задач</div>
        ) : (
          <div className="todo-list">
            {todos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} />
            ))}
          </div>
        )}
      </div>
    </details>
  )
}
```

#### Реализация в SolidJS

```tsx
import { For, createMemo } from 'solid-js'

export function SolidTodoPart(props: { tool: Extract<Part, { type: 'tool' }> }) {
  const todos = createMemo(
    () => (props.tool.state.input?.todos || props.tool.metadata?.todos || []) as Todo[]
  )

  const progress = createMemo(() => {
    const list = todos()
    const completed = list.filter((t) => t.status === 'completed').length
    return `${completed}/${list.length}`
  })

  return (
    <details class="todo-tool-part">
      <summary class="todo-tool-summary">
        <div class="todo-tool-title">
          <span>✓</span>
          <span>Todos</span>
        </div>
        <span class="todo-progress-badge">{progress()}</span>
      </summary>

      <div class="todo-tool-content">
        <For each={todos()}>{(todo: Todo) => <TodoItem todo={todo} />}</For>
      </div>
    </details>
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
    </label>
  )
}
```

````

---

## 4. Группировка по Turn'ам

Для более продвинутого чата можно группировать сообщения в turn'ы как в OpenCode:

```tsx
interface Turn {
  id: string
  userMessage: ChatMessage
  assistantMessage?: ChatMessage
}

export function TurnBasedChat({ messages }: { messages: ChatMessage[] }) {
  const turns = useMemo(() => groupIntoTurns(messages), [messages])

  return (
    <div className="turn-chat">
      {turns.map((turn) => (
        <TurnComponent key={turn.id} turn={turn} />
      ))}
    </div>
  )
}

function groupIntoTurns(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = []
  const messageMap = new Map(messages.map((m) => [m.info.id, m]))

  for (const message of messages) {
    if (message.info.role === 'user') {
      // Ищем assistant message, у которого parentID = user message id
      const assistantMessage = Array.from(messageMap.values()).find(
        (m) => m.info.role === 'assistant' && m.info.parentID === message.info.id
      )

      turns.push({
        id: message.info.id,
        userMessage: message,
        assistantMessage,
      })
    }
  }

  return turns
}

function TurnComponent({ turn }: { turn: Turn }) {
  return (
    <div className="turn">
      <MessageBubble message={turn.userMessage} />
      {turn.assistantMessage && <MessageBubble message={turn.assistantMessage} />}
    </div>
  )
}
````

---

## 5. Пример стилей (CSS)

```css
.chat-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.message {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 12px;
}

.message.user {
  align-self: flex-end;
  background: #3b82f6;
  color: white;
}

.message.assistant {
  align-self: flex-start;
  background: #f3f4f6;
  color: #1f2937;
}

.message-content {
  margin-bottom: 4px;
}

.message-time {
  font-size: 12px;
  opacity: 0.7;
}

/* Part styles */
.text-part {
  white-space: pre-wrap;
  word-break: break-word;
}

.file-part.image img {
  max-width: 100%;
  border-radius: 8px;
}

.file-part a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  text-decoration: none;
}

.agent-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #8b5cf6;
  color: white;
  border-radius: 12px;
  font-size: 12px;
}

.tool-part {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  margin: 8px 0;
  background: white;
}

.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.tool-name {
  font-weight: 600;
  font-family: monospace;
}

.tool-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
}

.tool-status.completed {
  background: #dcfce7;
  color: #166534;
}

.tool-status.error {
  background: #fee2e2;
  color: #991b1b;
}

.tool-status.running {
  background: #fef3c7;
  color: #92400e;
}

.tool-output {
  margin: 8px 0;
  padding: 8px;
  background: #f9fafb;
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
  white-space: pre-wrap;
}

.tool-error {
  color: #dc2626;
  padding: 8px;
  background: #fef2f2;
  border-radius: 4px;
}

.reasoning-part {
  margin: 8px 0;
  border-left: 3px solid #8b5cf6;
  padding-left: 12px;
}

.reasoning-part[open] {
  background: #faf5ff;
  padding: 12px;
  border-radius: 4px;
}

.reasoning-part pre {
  margin: 8px 0 0;
  font-size: 13px;
  color: #6b7280;
}
```

---

## 6. Обработка ошибок

```tsx
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.info.role === 'user'

  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      {message.info.error && (
        <div className="message-error">
          <ErrorMessage error={message.info.error} />
        </div>
      )}

      <div className="message-content">{renderParts(message.parts, message.info.role)}</div>

      <div className="message-footer">
        <span className="message-time">
          {new Date(message.info.time.created * 1000).toLocaleTimeString()}
        </span>
        {message.info.tokens && (
          <span className="message-tokens">
            {message.info.tokens.input + message.info.tokens.output} tokens
          </span>
        )}
      </div>
    </div>
  )
}

function ErrorMessage({ error }: { error: any }) {
  return (
    <div className="error-banner">
      <span className="error-icon">⚠️</span>
      <span className="error-message">{error.message || 'Unknown error'}</span>
    </div>
  )
}
```

---

## 7. Реальное приложение (SolidJS)

Если нужно использовать SolidJS как в OpenCode:

```tsx
import { createMemo } from 'solid-js'
import { For } from 'solid-js/web'

export function SolidChat({ messages }: { messages: ChatMessage[] }) {
  const sortedMessages = createMemo(() =>
    [...messages].sort((a, b) => a.info.time.created - b.info.time.created)
  )

  return (
    <div class="solid-chat">
      <For each={sortedMessages()}>{(msg) => <MessageBubble message={msg} />}</For>
    </div>
  )
}
```

---

## Ключевые моменты

1. **Каждое сообщение имеет parts** - массив составляющих (текст, файлы, инструменты)
2. **Filtering**: Пропускайте `ignored: true` части и `type: "compaction"` части
3. **Reasoning**: Обычно скрывается за `details` или collapsible
4. **Tools**: Рендерите статус (pending/running/completed/error) и input/output
5. **Files**: Показывайте превью для изображений, ссылки для других файлов
6. **Turn grouping**: Опционально - группируйте user+assistant в turn для лучшего UI

---

## Полный пример

См. файл `/Volumes/128GBSSD/Projects/opencode/packages/ui/src/components/session-turn.tsx` для полной реализации в SolidJS.
