# OpenCode SDK: Передача вложений в промпте ассистента

Этот документ описывает, как передавать документы, изображения и ссылки на файлы проекта в промпте ассистента через OpenCode SDK.

---

## Общая концепция

Сообщения в OpenCode SDK строятся на основе **массива частей (parts)**. Каждая часть может быть разного типа: текст, файл, изображение, PDF, агентская подзадача или синтетический комментарий.

---

## Типы частей сообщений

### 1. Текст (Text)

```typescript
{
  id: "part-1",
  type: "text",
  text: "Опиши этот код",
}
```

**Обязательные поля:**

- `id` — уникальный идентификатор части
- `type` — значение `"text"`
- `text` — текст сообщения

---

### 2. Файлы проекта (ссылки)

Формат URL: `file://<абсолютный_путь>?start=<строка>&end=<строка>`

#### Простая ссылка на файл

```typescript
{
  id: "part-2",
  type: "file",
  mime: "text/plain",
  url: "file:///Volumes/128GBSSD/Projects/kanban-ai/src/index.ts",
  filename: "index.ts",
}
```

#### Ссылка с диапазоном строк

```typescript
{
  id: "part-2",
  type: "file",
  mime: "text/plain",
  url: "file:///Volumes/128GBSSD/Projects/kanban-ai/src/index.ts?start=10&end=20",
  filename: "index.ts",
}
```

#### С полным содержимым (source)

Если нужно включить текст в запрос:

```typescript
{
  id: "part-2",
  type: "file",
  mime: "text/plain",
  url: "file:///Volumes/128GBSSD/Projects/kanban-ai/src/index.ts?start=10&end=20",
  filename: "index.ts",
  source: {
    type: "file",
    text: {
      value: "содержимое файла или выделенного текста",
      start: 0,
      end: 100,
    },
    path: "/Volumes/128GBSSD/Projects/kanban-ai/src/index.ts",
  },
}
```

**Обязательные поля:**

- `id` — уникальный идентификатор
- `type` — значение `"file"`
- `mime` — MIME-тип (например, `"text/plain"`)
- `url` — путь к файлу с протоколом `file://`
- `filename` — имя файла

**Необязательные поля:**

- `source` — полное содержимое файла

---

### 3. Изображения

Формат: **data URL** (base64)

```typescript
{
  id: "part-3",
  type: "file",
  mime: "image/png",
  url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  filename: "screenshot.png",
}
```

**Поддерживаемые MIME-типы изображений:**

- `image/png`
- `image/jpeg`
- `image/gif`
- `image/webp`

**Обязательные поля:**

- `id` — уникальный идентификатор
- `type` — значение `"file"`
- `mime` — MIME-тип изображения
- `url` — data URL с base64-кодированным изображением
- `filename` — имя файла

---

### 4. PDF документы

```typescript
{
  id: "part-4",
  type: "file",
  mime: "application/pdf",
  url: "data:application/pdf;base64,JVBERi0xLjcKCjE...",
  filename: "document.pdf",
}
```

**Обязательные поля:**

- `id` — уникальный идентификатор
- `type` — значение `"file"`
- `mime` — `"application/pdf"`
- `url` — data URL с base64-кодированным PDF
- `filename` — имя файла

---

### 5. Агентские части (подзадачи)

Используются для делегирования задач подагентам.

```typescript
{
  id: "part-5",
  type: "agent",
  name: "sisyphus-junior",
  source: {
    value: "@sisyphus-junior",
    start: 0,
    end: 18,
  },
}
```

**Обязательные поля:**

- `id` — уникальный идентификатор
- `type` — значение `"agent"`
- `name` — имя подагента

---

### 6. Синтетический текст (системные комментарии)

Используется для встроенных системных комментариев и заметок.

```typescript
{
  id: "part-6",
  type: "text",
  text: "The user made following comment regarding lines 10 through 20 of src/index.ts: Fix this bug",
  synthetic: true,
}
```

**Обязательные поля:**

- `id` — уникальный идентификатор
- `type` — значение `"text"`
- `text` — текст комментария
- `synthetic` — значение `true`

---

## Полный пример запроса

```typescript
const requestParts = [
  // 1. Основной текст запроса
  {
    id: 'part-1',
    type: 'text',
    text: 'Проанализируй этот код и найди потенциальные проблемы',
  },
  // 2. Ссылка на файл проекта
  {
    id: 'part-2',
    type: 'file',
    mime: 'text/plain',
    url: 'file:///Volumes/128GBSSD/Projects/kanban-ai/src/index.ts',
    filename: 'index.ts',
  },
  // 3. Прикреплённое изображение
  {
    id: 'part-3',
    type: 'file',
    mime: 'image/png',
    url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
    filename: 'screenshot.png',
  },
  // 4. PDF документ
  {
    id: 'part-4',
    type: 'file',
    mime: 'application/pdf',
    url: 'data:application/pdf;base64,JVBERi0xLjcKCjE...',
    filename: 'spec.pdf',
  },
]
```

---

## Отправка запроса через OpenCode SDK

```typescript
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'

const client = createOpencodeClient({
  baseUrl: 'https://api.opencode.ai',
  directory: '/Volumes/128GBSSD/Projects/kanban-ai',
})

await client.session.prompt({
  sessionID: 'session-abc123',
  agent: 'sisyphus',
  model: { providerID: 'anthropic', modelID: 'claude-sonnet-4-20250514' },
  messageID: 'msg-xyz789',
  parts: requestParts,
})
```

---

## Краткая справка по типам

| Тип                 | URL формат                           | Поле `type` | Обязательные поля                       |
| ------------------- | ------------------------------------ | ----------- | --------------------------------------- |
| Текст               | —                                    | `text`      | `id`, `type`, `text`                    |
| Файл проекта        | `file://<путь>?start=X&end=Y`        | `file`      | `id`, `type`, `mime`, `url`, `filename` |
| Изображение         | `data:<mime>;base64,<data>`          | `file`      | `id`, `type`, `mime`, `url`, `filename` |
| PDF                 | `data:application/pdf;base64,<data>` | `file`      | `id`, `type`, `mime`, `url`, `filename` |
| Подзадача           | —                                    | `agent`     | `id`, `type`, `name`                    |
| Синтетический текст | —                                    | `text`      | `id`, `type`, `text`, `synthetic`       |

---

## Кодирование в base64

Для кодирования файлов в base64:

### Node.js

```typescript
import fs from 'fs'

// Чтение файла и кодирование в base64
const fileBuffer = fs.readFileSync('/path/to/file.png')
const base64String = fileBuffer.toString('base64')

// Создание data URL
const dataUrl = `data:image/png;base64,${base64String}`
```

### Browser

```typescript
// Чтение через File API
const file = fileInput.files[0]
const reader = new FileReader()

reader.onload = (e) => {
  const dataUrl = e.target.result // уже в формате data:...
}

reader.readAsDataURL(file)
```

---

## Примечания

- Все пути к файлам должны быть **абсолютными**
- Для файлов проекта рекомендуется использовать диапазоны строк для фокусировки на конкретных участках кода
- Изображения и PDF файлы должны быть закодированы в base64
- ID каждой части должен быть уникальным в рамках запроса
