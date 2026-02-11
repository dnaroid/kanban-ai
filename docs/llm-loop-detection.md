# Детектирование зацикливания LLM в Kilo Code

## Описание

Документ описывает алгоритмы и механизмы детектирования бесконечных циклов (зацикливания) LLM в проекте Kilo Code.

---

## Содержание

1. [Проблема зацикливания](#проблема-зацикливания)
2. [ToolRepetitionDetector - основной механизм](#toolrepetitiondetector)
3. [Интеграция в Task класс](#интеграция-в-task-класс)
4. [Дополнительные механизмы защиты](#дополнительные-механизмы-защиты)
5. [Примеры использования](#примеры-использования)

---

## Проблема зацикливания

LLM-агенты могут попасть в бесконечный цикл, когда многократно вызывают один и тот же инструмент с одинаковыми параметрами. Это происходит, когда модель не может найти решение и повторяет одни и те же действия.

**Примеры циклов:**
- Чтение одного и того же файла без изменений
- Выполнение одной и той же команды терминала
- Повторные запросы к API без прогресса

---

## ToolRepetitionDetector

### Обзор

`ToolRepetitionDetector` — основной класс для детектирования и предотвращения циклических вызовов инструментов.

**Файл:** `src/core/tools/ToolRepetitionDetector.ts`

### Инициализация

```typescript
export class ToolRepetitionDetector {
  private previousToolCallJson: string | null = null
  private consecutiveIdenticalToolCallCount: number = 0
  private readonly consecutiveIdenticalToolCallLimit: number

  constructor(limit: number = 3) {
    this.consecutiveIdenticalToolCallLimit = limit
  }
}
```

**Параметры:**
- `limit` — максимальное количество идентичных последовательных вызовов (по умолчанию: 3)

### Алгоритм работы

#### 1. Проверка инструмента

```typescript
public check(currentToolCallBlock: ToolUse): {
  allowExecution: boolean
  askUser?: {
    messageKey: string
    messageDetail: string
  }
}
```

Метод проверяет текущий вызов инструмента и возвращает решение о разрешении выполнения.

#### 2. Исключение для действий браузера

```typescript
// Browser scroll actions should not be subject to repetition detection
// as they are frequently needed for navigating through web pages
if (this.isBrowserScrollAction(currentToolCallBlock)) {
  // Allow browser scroll actions without counting them as repetitions
  return { allowExecution: true }
}

private isBrowserScrollAction(toolUse: ToolUse): boolean {
  if (toolUse.name !== "browser_action") {
    return false
  }

  const action = toolUse.params.action as string
  return action === "scroll_down" || action === "scroll_up"
}
```

**Почему исключение:** Прокрутка страницы (`scroll_down`/`scroll_up`) — легитимные повторные действия при навигации по веб-страницам.

#### 3. Сериализация для сравнения

```typescript
// Serialize block to a canonical JSON string for comparison
const currentToolCallJson = this.serializeToolUse(currentToolCallBlock)

private serializeToolUse(toolUse: ToolUse): string {
  const toolObject: Record<string, any> = {
    name: toolUse.name,
    params: toolUse.params,
  }

  // Only include nativeArgs if it has content
  if (toolUse.nativeArgs && Object.keys(toolUse.nativeArgs).length > 0) {
    toolObject.nativeArgs = toolUse.nativeArgs
  }

  return stringify(toolObject)
}
```

**Зачем сериализация:**
- Преобразование объекта вызова в канонический JSON для надежного сравнения
- Использование `safe-stable-stringify` для детерминированной сериализации
- Сортировка ключей для идентичных объектов

#### 4. Сравнение с предыдущим вызовом

```typescript
// Compare with previous tool call
if (this.previousToolCallJson === currentToolCallJson) {
  this.consecutiveIdenticalToolCallCount++
} else {
  this.consecutiveIdenticalToolCallCount = 0 // Reset to 0 for a new tool
  this.previousToolCallJson = currentToolCallJson
}
```

**Логика:**
- Если текущий вызов идентичен предыдущему → увеличиваем счётчик
- Если отличается → сбрасываем счётчик и обновляем предыдущее значение

#### 5. Проверка лимита

```typescript
// Check if limit is reached (0 means unlimited)
if (
  this.consecutiveIdenticalToolCallLimit > 0 &&
  this.consecutiveIdenticalToolCallCount >= this.consecutiveIdenticalToolCallLimit
) {
  // Reset counters to allow recovery if user guides AI past this point
  this.consecutiveIdenticalToolCallCount = 0
  this.previousToolCallJson = null

  // Return result indicating execution should not be allowed
  return {
    allowExecution: false,
    askUser: {
      messageKey: "mistake_limit_reached",
      messageDetail: t("tools:toolRepetitionLimitReached", { toolName: currentToolCallBlock.name }),
    },
  }
}

// Execution is allowed
return { allowExecution: true }
```

**При достижении лимита:**
1. Сброс счётчиков для возможности восстановления
2. Возврат `allowExecution: false`
3. Сообщение пользователю через `askUser` с ключом `mistake_limit_reached`

### Полный алгоритм (диаграмма)

```
┌─────────────────────────────────────────────────────────────────┐
│  Начало вызова инструмента                          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │ Это browser scroll?          │
            └───────────────────────────────┘
                    │         │
           Да │         │ Нет
                    ▼         ▼
        ┌─────────┐   ┌──────────────────────────────┐
        │ Разрешить │   │ Сериализовать вызов         │
        │ выполнение  │   │ (name + params)            │
        └─────────┘   └──────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │ Совпадает с предыдущим?     │
            └───────────────────────────────┘
                    │         │
               Да │         │ Нет
                    ▼         ▼
        ┌─────────┐   ┌───────────────────────────────┐
        │ Увеличить │   │ Сбросить счётчик              │
        │ счётчик  │   │ (count = 0)                    │
        │ count++   │   │ Сохранить текущий вызов         │
        └─────────┘   └───────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │ count >= limit?              │
            └───────────────────────────────┘
                    │         │
               Да │         │ Нет
                    ▼         ▼
        ┌─────────┐   ┌───────────────────────────────┐
        │ Сбросить  │   │ Разрешить выполнение            │
        │ счётчики  │   │ return { allowExecution: true }│
        │ Сообщить   │   └───────────────────────────────┘
        │ пользователю│
        │ return      │
        │ { allow... │
        │  : false }│
        └─────────┘
```

---

## Интеграция в Task класс

### Инициализация

**Файл:** `src/core/task/Task.ts` (строка 658)

```typescript
constructor({
  context,
  provider,
  apiConfiguration,
  enableDiff = false,
  enableCheckpoints = true,
  checkpointTimeout = DEFAULT_CHECKPOINT_TIMEOUT_SECONDS,
  enableBridge = false,
  fuzzyMatchThreshold = 1.0,
  consecutiveMistakeLimit = DEFAULT_CONSECUTIVE_MISTAKE_LIMIT, // По умолчанию из типов
  task,
  images,
  historyItem,
  experiments: experimentsConfig,
  startTask = true,
  rootTask,
  parentTask,
  taskNumber = -1,
  onCreated,
  initialTodos,
  workspacePath,
  initialStatus,
}: TaskOptions) {
  // ... другой код ...

  this.toolRepetitionDetector = new ToolRepetitionDetector(this.consecutiveMistakeLimit)
}
```

### Проверка перед выполнением

Класс `Task` должен вызывать `toolRepetitionDetector.check()` перед каждым выполнением инструмента.

### Лимит последовательных ошибок

**Константа:** `DEFAULT_CONSECUTIVE_MISTAKE_LIMIT` из пакетов типов

```typescript
// packages/types/src/task.ts
export interface CreateTaskOptions {
  enableDiff?: boolean
  enableCheckpoints?: boolean
  fuzzyMatchThreshold?: number
  consecutiveMistakeLimit?: number // Настраиваемый лимит
  experiments?: Record<string, boolean>
  initialTodos?: TodoItem[]
  initialStatus?: "active" | "delegated" | "completed"
}
```

### ConsecutiveMistakeError

Когда достигается лимит ошибок, генерируется structured error для телеметрии.

**Файл:** `packages/types/src/telemetry.ts`

```typescript
export class ConsecutiveMistakeError extends Error {
  constructor(
    message: string,
    public readonly taskId: string,
    public readonly consecutiveMistakeCount: number,
    public readonly consecutiveMistakeLimit: number,
    public readonly reason: ConsecutiveMistakeReason = "unknown",
    public readonly provider?: string,
    public readonly modelId?: string,
  ) {
    super(message)
    this.name = "ConsecutiveMistakeError"
  }
}

/**
 * Тип причины ошибки
 */
export type ConsecutiveMistakeReason =
  | "no_tools_used"  // Модель не использовала инструменты
  | "tool_repetition" // Повторные вызовы инструментов
```

### Обработка ошибки в Task

**Файл:** `src/core/task/Task.ts` (строки 2680-2714)

```typescript
if (this.consecutive_mistakeLimit > 0 && this.consecutive_mistakeCount >= this.consecutive_mistakeLimit) {
  // Track consecutive mistake errors in telemetry via event and PostHog exception tracking.
  // The reason is "no_tools_used" because this limit is reached via initiateTaskLoop
  // which increments consecutiveMistakeCount when model doesn't use any tools.
  TelemetryService.instance.captureConsecutiveMistakeError(this.taskId)
  TelemetryService.instance.captureException(
    new ConsecutiveMistakeError(
      `Task reached consecutive mistake limit (${this.consecutiveMistakeLimit})`,
      this.taskId,
      this.consecutiveMistakeCount,
      this.consecutiveMistakeLimit,
      "no_tools_used",
      this.apiConfiguration.apiProvider,
      getModelId(this.apiConfiguration),
    ),
  )

  const { response, text, images } = await this.ask(
    "mistake_limit_reached",
    t("common:errors.mistake_limit_guidance"),
  )

  if (response === "messageResponse") {
    currentUserContent.push(
      ...[
        { type: "text" as const, text: formatResponse.tooManyMistakes(text) },
        ...formatResponse.imageBlocks(images),
      ],
    )

    await this.say("user_feedback", text, images)
  }

  this.consecutiveMistakeCount = 0
}
```

---

## Дополнительные механизмы защиты

### 1. AskIgnoredError

**Файл:** `src/core/task/AskIgnoredError.ts`

```typescript
/**
 * Error thrown when an ask promise is superseded by a newer one.
 *
 * This is used as an internal control flow signal - not an actual error.
 * It occurs when multiple asks are sent in rapid succession and an older
 * ask is invalidated by a newer one (e.g., during streaming updates).
 */
export class AskIgnoredError extends Error {
  constructor(reason?: string) {
    super(reason ? `Ask ignored: ${reason}` : "Ask ignored")
    this.name = "AskIgnoredError"
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AskIgnoredError.prototype)
  }
}
```

**Назначение:** Предотвращение race conditions при быстрой отправке множественных сообщений пользователем.

### 2. MessageManager — управление историей

**Файл:** `src/core/message-manager/index.ts`

Класс `MessageManager` обеспечивает централизованную обработку операций перемотки истории:

- Удаление сообщений без родителя
- Очистка orphaned summary сообщений
- Удаление orphaned truncation markers

```typescript
export class MessageManager {
  /**
   * Rewind conversation to a specific timestamp.
   * This is SINGLE entry point for all message deletion operations.
   */
  async rewindToTimestamp(ts: number, options: RewindOptions = {}): Promise<void> {
    const { includeTargetMessage = false, skipCleanup = false } = options

    // Find index in clineMessages
    const clineIndex = this.task.clineMessages.findIndex((m) => m.ts === ts)
    if (clineIndex === -1) {
      throw new Error(`Message with timestamp ${ts} not found in clineMessages`)
    }

    // Calculate actual cutoff index
    const cutoffIndex = includeTargetMessage ? clineIndex + 1 : clineIndex

    await this.performRewind(cutoffIndex, ts, { skipCleanup })
  }

  /**
   * Collect condenseIds and truncationIds from context-management events
   * that will be removed during rewind.
   */
  private collectRemovedContextEventIds(fromIndex: number): ContextEventIds {
    const condenseIds = new Set<string>()
    const truncationIds = new Set<string>()

    for (let i = fromIndex; i < this.task.clineMessages.length; i++) {
      const msg = this.task.clineMessages[i]

      // Collect condenseIds from condense_context events
      if (msg.say === "condense_context" && msg.contextCondense?.condenseId) {
        condenseIds.add(msg.contextCondense.condenseId)
      }

      // Collect truncationIds from sliding_window_truncation events
      if (msg.say === "sliding_window_truncation" && msg.contextTruncation?.truncationId) {
        truncationIds.add(msg.contextTruncation.truncationId)
      }
    }

    return { condenseIds, truncationIds }
  }
}
```

### 3. Защита от дубликатов tool_result

**Файл:** `src/core/task/Task.ts` (строки 416-436)

```typescript
/**
 * Push a tool_result block to userMessageContent, preventing duplicates.
 * This is critical for native tool protocol where duplicate tool_use_ids cause API errors.
 *
 * @param toolResult - The tool_result block to add
 * @returns true if added, false if duplicate was skipped
 */
public pushToolResultToUserContent(toolResult: Anthropic.ToolResultBlockParam): boolean {
  const existingResult = this.userMessageContent.find(
    (block): block is Anthropic.ToolResultBlockParam =>
      block.type === "tool_result" && block.tool_use_id === toolResult.tool_use_id,
  )
  if (existingResult) {
    console.warn(
      `[Task#pushToolResultToUserContent] Skipping duplicate tool_result for tool_use_id: ${toolResult.tool_use_id}`,
    )
    return false
  }
  this.userMessageContent.push(toolResult)
  return true
}
```

**Почему критично:** В протоколе Native Tool Calling дубликатные `tool_use_ids` вызывают API ошибки (400 Bad Request).

### 4. Конфигурационные константы

```typescript
// src/core/task/Task.ts
const MAX_EXPONENTIAL_BACKOFF_SECONDS = 600 // 10 минут
const DEFAULT_USAGE_COLLECTION_TIMEOUT_MS = 5000 // 5 секунд
const FORCED_CONTEXT_REDUCTION_PERCENT = 75 // Сохранить 75% контекста
const MAX_CONTEXT_WINDOW_RETRIES = 3 // Максимум 3 попытки для ошибок контекста
```

---

## Примеры использования

### Пример 1: Инициализация с кастомным лимитом

```typescript
// Создание задачи с лимитом 5 повторений вместо 3 по умолчанию
const task = new Task({
  context,
  provider,
  apiConfiguration,
  consecutiveMistakeLimit: 5, // Кастомный лимит
  // ... другие параметры
})
```

### Пример 2: Интеграция проверки перед выполнением

```typescript
async function executeToolSafely(toolCall: ToolUse, task: Task) {
  // Проверка на зацикливание
  const checkResult = task.toolRepetitionDetector.check(toolCall)

  if (!checkResult.allowExecution) {
    // Обработка блокировки выполнения
    console.log(`Tool execution blocked: ${checkResult.askUser?.messageDetail}`)

    // Отправка сообщения пользователю
    await task.say("user_feedback", checkResult.askUser?.messageDetail || "")

    return
  }

  // Выполнение инструмента
  await executeTool(toolCall)
}
```

### Пример 3: Обработка ConsecutiveMistakeError

```typescript
import {
  isConsecutiveMistakeError,
  extractConsecutiveMistakeErrorProperties
} from "@roo-code/types"

try {
  // ... выполнение задачи
} catch (error) {
  if (isConsecutiveMistakeError(error)) {
    // Извлечение структурированных свойств для телеметрии
    const properties = extractConsecutiveMistakeErrorProperties(error)

    console.log(`Consecutive mistake detected:`, {
      taskId: properties.taskId,
      count: properties.consecutiveMistakeCount,
      limit: properties.consecutiveMistakeLimit,
      reason: properties.reason,
    })

    // Отправка в телеметрию
    TelemetryService.instance.captureException(properties)
  }
}
```

### Пример 4: Использование MessageManager для очистки

```typescript
// Перемотка истории к определённому времени
async function rewindConversation(task: Task, targetTimestamp: number) {
  try {
    await task.messageManager.rewindToTimestamp(targetTimestamp, {
      includeTargetMessage: false,
    })
    console.log("Conversation rewound successfully")
  } catch (error) {
    console.error("Failed to rewind conversation:", error)
  }
}
```

---

## Рекомендации по использованию

### Для разработчиков

1. **Настраивайте лимит адаптивно:**
   - Для сложных задач: `consecutiveMistakeLimit: 5-10`
   - Для простых задач: `consecutiveMistakeLimit: 3` (по умолчанию)
   - Для тестирования: `consecutiveMistakeLimit: 0` (отключить детекцию)

2. **Используйте MessageManager для операций перемотки:**
   - Никогда не удаляйте сообщения напрямую из `clineMessages`
   - Всегда используйте `task.messageManager.rewindToTimestamp()`

3. **Предотвращайте дубликаты tool_result:**
   - Используйте `task.pushToolResultToUserContent()` вместо прямого добавления
   - Это критично для протокола Native Tool Calling

### Для пользователей

1. **При достижении лимита:**
   - Система автоматически уведомит вас
   - Вы можете направить AI правильным курсом
   - Счётчики сбрасываются после вмешательства

2. **Действия браузера не ограничены:**
   - Прокрутка страниц может выполняться многократно
   - Это нормальное поведение при навигации

---

## Текущие ограничения

### ToolRepetitionDetector

1. **Сравнение только последовательных вызовов:**
   - Детектирует только идентичные вызовы подряд
   - Не детектирует паттерны типа A-B-A-B

2. **JSON-сериализация:**
   - Зависит от порядка ключей в JSON
   - `safe-stable-stringify` решает проблему детерминизма

### Дополнительные механизмы

1. **AskIgnoredError:**
   - Работает только для race conditions
   - Не предотвращает логические циклы

2. **MessageManager:**
   - Удаляет только сообщения после перемотки
   - Не предотвращает добавление дубликатов

---

## Будущие улучшения

### Потенциальные расширения

1. **Detekция паттернов (A-B-A-B):**
   ```typescript
   // Псевдокод для будущей реализации
   interface PatternDetector {
     detectPattern(calls: ToolUse[]): { hasPattern: boolean, pattern: string }
   }
   ```

2. **Контекстный анализ:**
   - Детектирование повторений в контексте инструментов
   - Сравнение результатов выполнения

3. **Adaptivный лимит:**
   ```typescript
   // Пример: динамическое изменение лимита
   if (complexityScore > 0.8) {
     this.toolRepetitionDetector.setLimit(10)
   } else {
     this.toolRepetitionDetector.setLimit(3)
   }
   ```

---

## Связанные файлы

- `src/core/tools/ToolRepetitionDetector.ts` — основной класс детекции
- `src/core/task/Task.ts` — интеграция и обработка
- `packages/types/src/telemetry.ts` — определения ошибок
- `src/core/task/AskIgnoredError.ts` — race condition защита
- `src/core/message-manager/index.ts` — управление историей
- `packages/types/src/task.ts` — типы и константы

---

## Резюме

Детектирование зацикливания LLM в Kilo Code реализовано через многоуровневую систему защиты:

1. **ToolRepetitionDetector** — основной механизм для предотвращения бесконечных циклов вызовов инструментов
2. **ConsecutiveMistakeError** — structured error для телеметрии
3. **MessageManager** — централизованное управление историей сообщений
4. **AskIgnoredError** — защита от race conditions
5. **Защита от дублей** — предотвращение дубликатных tool_result блоков

Система эффективно детектирует повторяющиеся идентичные вызовы и позволяет восстанавливаться после вмешательства пользователя.
