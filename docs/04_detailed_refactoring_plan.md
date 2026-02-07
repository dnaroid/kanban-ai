# Kanban AI — Детальный План Рефакторинга

_Дата: 2026-02-07_  
_Основан на анализе текущей кодовой базы_

---

## Оглавление

1. [Текущее состояние](#текущее-состояние)
2. [Целевая архитектура](#целевая-архитектура)
3. [Пошаговый план выполнения](#пошаговый-план-выполнения)
4. [Критерии готовности](#критерии-готовности)
5. [Риски и митигация](#риски-и-митигация)

---

## Текущее состояние

### Архитектурные проблемы

**1. Монолитный IPC Handler (1017 строк)**

- Файл: `src/main/ipc/handlers.ts`
- Содержит 55+ обработчиков для всех доменов
- Смешанная ответственность: валидация + бизнес-логика + координация
- Примеры бизнес-логики в handlers:
  - `updateTaskAndEmit()` — обновление задачи + выбор модели + событие
  - `resolveInProgressColumnId()` — поиск колонки по имени
  - `run:start` — создание snapshot + enqueue + перемещение задачи + обновление статуса

**2. Синхронная работа с БД**

- 100% синхронные операции через `better-sqlite3`
- Прямые вызовы `db.prepare().run()` в main процессе
- Риск блокировки UI при:
  - FTS запросах (search)
  - Аналитике (агрегации)
  - Массовых операциях (импорт/экспорт)

**3. Отсутствие единого формата ошибок**

- 55+ мест с `throw new Error(message)`
- Нет кодов ошибок
- Нет централизованной обработки
- Renderer получает разные форматы ошибок

**4. Отсутствие слоя Application**

- Бизнес-логика размазана между handlers и repositories
- Нет явных use-cases
- Сложно тестировать без Electron
- Нет единой точки для транзакций

**5. Разрозненные события**

- `task:event` — через event bus
- `opencode:event` — через SSE подписки
- `run:events:tail` — через polling
- Нет единого механизма подписки

### Текущая структура

```
src/main/
├── ipc/
│   ├── handlers.ts          # 1017 строк, все домены
│   ├── validation.ts
│   ├── task-event-bus.ts
│   └── diagnostics-handlers.ts
├── db/
│   ├── index.ts             # DatabaseManager
│   ├── project-repository.ts
│   ├── task-repository.ts
│   ├── run-repository.ts
│   └── ... (13 репозиториев)
├── run/
│   ├── opencode-service.ts
│   ├── opencode-session-manager.ts
│   ├── opencode-executor-sdk.ts
│   └── run-service.ts
├── analytics/
├── backup/
├── deps/
├── plugins/
└── search/
```

---

## Целевая архитектура

### Принципы

1. **Layered Architecture**
   - IPC = тонкий адаптер (валидация + маппинг)
   - Application = use-cases (команды/запросы)
   - Domain = бизнес-правила
   - Infrastructure = репозитории + внешние сервисы

2. **Result Pattern**
   - Все операции возвращают `Result<T, ErrorCode>`
   - Нет throw в бизнес-логике
   - Единый формат ошибок

3. **Port/Adapter Pattern**
   - Интерфейсы для репозиториев
   - Интерфейсы для внешних сервисов (OpenCode)
   - Возможность подмены реализаций

4. **Event-Driven**
   - Единый EventBus
   - Типизированные события
   - Подписка через topics

### Целевая структура

```
src/
├── shared/
│   ├── ipc/
│   │   ├── contract.zod.ts      # Zod схемы (из текущего ipc-contract.ts)
│   │   ├── channels.ts          # Перечисление каналов
│   │   ├── errors.ts            # ErrorCode enum + helpers
│   │   ├── result.ts            # Result<T> type
│   │   └── events.ts            # Event envelope + topics
│   ├── types/
│   │   ├── ids.ts               # ProjectId, TaskId, RunId
│   │   └── time.ts
│   └── utils/
│       ├── invariant.ts
│       └── logger.ts
│
├── main/
│   ├── bootstrap/
│   │   ├── app-lifecycle.ts
│   │   └── window.ts
│   │
│   ├── ipc/
│   │   ├── register.ts
│   │   ├── handlers/
│   │   │   ├── project.handlers.ts
│   │   │   ├── task.handlers.ts
│   │   │   ├── run.handlers.ts
│   │   │   └── opencode.handlers.ts
│   │   ├── map-error.ts
│   │   └── validate.ts
│   │
│   ├── app/                     # Application layer (use-cases)
│   │   ├── project/
│   │   │   ├── commands/
│   │   │   │   ├── CreateProject.ts
│   │   │   │   ├── UpdateProject.ts
│   │   │   │   ├── DeleteProject.ts
│   │   │   │   └── SelectProjectFolder.ts
│   │   │   └── queries/
│   │   │       ├── GetProjectById.ts
│   │   │       └── ListProjects.ts
│   │   ├── task/
│   │   │   ├── commands/
│   │   │   │   ├── CreateTask.ts
│   │   │   │   ├── UpdateTask.ts
│   │   │   │   ├── MoveTask.ts
│   │   │   │   └── DeleteTask.ts
│   │   │   └── queries/
│   │   │       └── ListTasksByBoard.ts
│   │   ├── run/
│   │   │   ├── commands/
│   │   │   │   ├── StartRun.ts
│   │   │   │   ├── CancelRun.ts
│   │   │   │   └── DeleteRun.ts
│   │   │   └── queries/
│   │   │       ├── GetRun.ts
│   │   │       ├── ListRunsByTask.ts
│   │   │       └── TailRunEvents.ts
│   │   └── opencode/
│   │       ├── commands/
│   │       │   ├── RefreshModels.ts
│   │       │   ├── ToggleModel.ts
│   │       │   ├── UpdateModelDifficulty.ts
│   │       │   ├── GenerateUserStory.ts
│   │       │   └── SendMessage.ts
│   │       └── queries/
│   │           ├── ListModels.ts
│   │           ├── GetSessionStatus.ts
│   │           ├── GetActiveSessions.ts
│   │           ├── GetSessionMessages.ts
│   │           ├── GetSessionTodos.ts
│   │           └── LogProviders.ts
│   │
│   ├── domain/
│   │   ├── project/
│   │   │   ├── Project.ts
│   │   │   └── ProjectPolicy.ts
│   │   ├── task/
│   │   │   ├── Task.ts
│   │   │   ├── TaskPolicy.ts
│   │   │   └── TaskMovePolicy.ts
│   │   ├── run/
│   │   │   ├── Run.ts
│   │   │   └── RunPolicy.ts
│   │   └── opencode/
│   │       └── Session.ts
│   │
│   ├── ports/
│   │   ├── db/
│   │   │   ├── ProjectRepoPort.ts
│   │   │   ├── TaskRepoPort.ts
│   │   │   └── RunRepoPort.ts
│   │   ├── opencode/
│   │   │   └── OpenCodePort.ts
│   │   ├── events/
│   │   │   └── EventBusPort.ts
│   │   └── clock/
│   │       └── ClockPort.ts
│   │
│   └── infra/
│       ├── db/
│       │   ├── DatabaseManager.ts
│       │   ├── repositories/
│       │   │   ├── ProjectRepository.sqlite.ts
│       │   │   ├── TaskRepository.sqlite.ts
│       │   │   └── RunRepository.sqlite.ts
│       │   └── migrations/
│       ├── opencode/
│       │   └── OpenCodeService.ts
│       ├── events/
│       │   └── EventBus.ipc.ts
│       └── logging/
│           └── logger.ts
```

---

## Пошаговый план выполнения

### Фаза 0: Подготовка (Foundation)

**Цель:** Создать базовые типы и контракты без изменения поведения

#### Шаг 0.1: Result и ErrorCode

**Файлы:**

- `src/shared/ipc/result.ts`
- `src/shared/ipc/errors.ts`

**Действия:**

1. Создать `src/shared/ipc/result.ts`:

```typescript
export type Result<T, E = ErrorCode> =
  | { ok: true; data: T }
  | { ok: false; error: { code: E; message: string; details?: unknown } }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })

export const fail = <E = ErrorCode>(
  code: E,
  message: string,
  details?: unknown
): Result<never, E> => ({
  ok: false,
  error: { code, message, details },
})

export const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}
```

2. Создать `src/shared/ipc/errors.ts`:

```typescript
export enum ErrorCode {
  // Generic
  UNKNOWN = 'UNKNOWN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',

  // Project
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  PROJECT_PATH_INVALID = 'PROJECT_PATH_INVALID',

  // Task
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  TASK_MOVE_INVALID = 'TASK_MOVE_INVALID',

  // Run
  RUN_NOT_FOUND = 'RUN_NOT_FOUND',
  RUN_ALREADY_RUNNING = 'RUN_ALREADY_RUNNING',
  RUN_CANCEL_FAILED = 'RUN_CANCEL_FAILED',

  // OpenCode
  OPENCODE_UNAVAILABLE = 'OPENCODE_UNAVAILABLE',
  OPENCODE_SESSION_NOT_FOUND = 'OPENCODE_SESSION_NOT_FOUND',
  OPENCODE_TIMEOUT = 'OPENCODE_TIMEOUT',
}

export const toErrorMessage = (code: ErrorCode): string => {
  // Маппинг кодов на человекочитаемые сообщения
}
```

**Критерии готовности:**

- [ ] Типы компилируются
- [ ] Экспортируются из `src/shared/ipc/index.ts`
- [ ] Нет breaking changes (старый код работает)

**Время:** 1 час

---

#### Шаг 0.2: Zod-контракт в shared

**Файлы:**

- `src/shared/ipc/contract.zod.ts` (перенос из `src/preload/ipc-contract.ts`)
- `src/shared/ipc/channels.ts`

**Действия:**

1. Создать `src/shared/ipc/channels.ts`:

```typescript
export const IPC_CHANNELS = {
  PROJECT: {
    SELECT_FOLDER: 'project:selectFolder',
    CREATE: 'project:create',
    GET_ALL: 'project:getAll',
    GET_BY_ID: 'project:getById',
    UPDATE: 'project:update',
    DELETE: 'project:delete',
  },
  TASK: {
    CREATE: 'task:create',
    LIST_BY_BOARD: 'task:listByBoard',
    UPDATE: 'task:update',
    MOVE: 'task:move',
    DELETE: 'task:delete',
  },
  // ... остальные
} as const
```

2. Перенести Zod схемы из `src/preload/ipc-contract.ts` в `src/shared/ipc/contract.zod.ts`

3. Обновить импорты в `src/main/ipc/handlers.ts` и `src/preload/preload.ts`

**Критерии готовности:**

- [ ] Все схемы перенесены
- [ ] Импорты обновлены
- [ ] Компиляция проходит
- [ ] IPC вызовы работают

**Время:** 2 часа

---

#### Шаг 0.3: Маппер ошибок в main IPC

**Файлы:**

- `src/main/ipc/map-error.ts`

**Действия:**

1. Создать `src/main/ipc/map-error.ts`:

```typescript
import { ErrorCode, fail, type Result } from '../../shared/ipc/result'

export const toResultError = (error: unknown): Result<never> => {
  if (error instanceof Error) {
    // Попытка извлечь код ошибки из сообщения или типа
    const code = extractErrorCode(error)
    return fail(code, error.message, { stack: error.stack })
  }
  return fail(ErrorCode.UNKNOWN, String(error))
}

const extractErrorCode = (error: Error): ErrorCode => {
  // Эвристики для определения кода ошибки
  if (error.message.includes('not found')) return ErrorCode.NOT_FOUND
  if (error.message.includes('already exists')) return ErrorCode.ALREADY_EXISTS
  return ErrorCode.UNKNOWN
}
```

2. Обернуть 2-3 handler'а в try/catch с `toResultError()` для проверки

**Критерии готовности:**

- [ ] Функция `toResultError()` работает
- [ ] Тестовые handlers возвращают `Result`
- [ ] Renderer корректно обрабатывает ошибки

**Время:** 1 час

---

### Фаза 1: Application Layer (Use-Cases)

**Цель:** Создать слой use-cases и переподключить handlers

#### Шаг 1.1: Каркас app/ и ports/

**Файлы:**

- `src/main/app/{project,task,run,opencode}/{commands,queries}/`
- `src/main/ports/`

**Действия:**

1. Создать структуру папок:

```bash
mkdir -p src/main/app/project/{commands,queries}
mkdir -p src/main/app/task/{commands,queries}
mkdir -p src/main/app/run/{commands,queries}
mkdir -p src/main/app/opencode/{commands,queries}
mkdir -p src/main/ports/{db,opencode,events,clock}
```

2. Создать интерфейсы портов:

`src/main/ports/db/ProjectRepoPort.ts`:

```typescript
import type { Project, CreateProjectInput } from '../../../shared/types/ipc'
import type { Result } from '../../../shared/ipc/result'

export interface ProjectRepoPort {
  create(input: CreateProjectInput): Result<Project>
  getAll(): Result<Project[]>
  getById(id: string): Result<Project | null>
  update(id: string, updates: Partial<Project>): Result<Project | null>
  delete(id: string): Result<boolean>
}
```

`src/main/ports/events/EventBusPort.ts`:

```typescript
export interface EventBusPort {
  publish<T>(topic: string, event: T): void
  subscribe<T>(topic: string, handler: (event: T) => void): () => void
}
```

**Критерии готовности:**

- [ ] Структура папок создана
- [ ] Интерфейсы портов определены
- [ ] Компиляция проходит

**Время:** 1 час

---

#### Шаг 1.2: Первый use-case (CreateProject)

**Файлы:**

- `src/main/app/project/commands/CreateProject.ts`
- `src/main/ipc/handlers/project.handlers.ts` (новый)

**Действия:**

1. Создать use-case:

`src/main/app/project/commands/CreateProject.ts`:

```typescript
import type { CreateProjectInput, Project } from '../../../../shared/types/ipc'
import type { Result } from '../../../../shared/ipc/result'
import { ok, fail, ErrorCode } from '../../../../shared/ipc/result'
import type { ProjectRepoPort } from '../../../ports/db/ProjectRepoPort'
import type { EventBusPort } from '../../../ports/events/EventBusPort'

export class CreateProject {
  constructor(
    private projectRepo: ProjectRepoPort,
    private eventBus: EventBusPort
  ) {}

  async execute(input: CreateProjectInput): Promise<Result<Project>> {
    // Валидация бизнес-правил
    if (!input.path || !input.name) {
      return fail(ErrorCode.VALIDATION_ERROR, 'Path and name are required')
    }

    // Создание проекта
    const result = this.projectRepo.create(input)
    if (!result.ok) return result

    // Публикация события
    this.eventBus.publish('project.created', { project: result.data })

    return ok(result.data)
  }
}
```

2. Создать handler:

`src/main/ipc/handlers/project.handlers.ts`:

```typescript
import { ipcHandlers } from '../validation'
import { CreateProjectInputSchema } from '../../../shared/ipc/contract.zod'
import { CreateProject } from '../../app/project/commands/CreateProject'
import { projectRepo } from '../../db/project-repository'
import { eventBus } from '../../infra/events/EventBus.ipc'

const createProject = new CreateProject(projectRepo, eventBus)

ipcHandlers.register('project:create', CreateProjectInputSchema, async (_, input) => {
  return await createProject.execute(input)
})
```

3. Адаптировать `ProjectRepository` для возврата `Result`:

`src/main/db/project-repository.ts`:

```typescript
import { ok, fail, ErrorCode, type Result } from '../../shared/ipc/result'

export class ProjectRepository implements ProjectRepoPort {
  create(input: CreateProjectInput): Result<Project> {
    try {
      const db = dbManager.connect()
      // ... существующая логика
      return ok(project)
    } catch (error) {
      return fail(ErrorCode.UNKNOWN, String(error))
    }
  }
  // ... остальные методы
}
```

**Критерии готовности:**

- [ ] Use-case работает
- [ ] Handler вызывает use-case
- [ ] Repository возвращает Result
- [ ] Событие публикуется
- [ ] UI создает проект без ошибок

**Время:** 3 часа

---

#### Шаг 1.3: Остальные Project use-cases

**Файлы:**

- `src/main/app/project/commands/{UpdateProject,DeleteProject,SelectProjectFolder}.ts`
- `src/main/app/project/queries/{GetProjectById,ListProjects}.ts`

**Действия:**

1. Создать use-cases по аналогии с `CreateProject`
2. Обновить handlers в `project.handlers.ts`
3. Добавить события: `project.updated`, `project.deleted`

**Критерии готовности:**

- [ ] Все Project use-cases реализованы
- [ ] ProjectsScreen работает полностью
- [ ] CRUD не ломает настройки
- [ ] События публикуются

**Время:** 4 часа

---

### Фаза 2: Task Module

**Цель:** Перенести логику задач с правилами перемещения

#### Шаг 2.1: Task use-cases

**Файлы:**

- `src/main/app/task/commands/{CreateTask,UpdateTask,MoveTask,DeleteTask}.ts`
- `src/main/app/task/queries/ListTasksByBoard.ts`
- `src/main/domain/task/TaskMovePolicy.ts`

**Действия:**

1. Создать `TaskMovePolicy`:

`src/main/domain/task/TaskMovePolicy.ts`:

```typescript
export class TaskMovePolicy {
  static canMove(task: Task, toColumnId: string): Result<void> {
    // Проверки:
    // - Задача не заблокирована активным run
    // - Колонка существует
    // - Переход статуса допустим
    return ok(undefined)
  }

  static calculateNewPosition(
    taskId: string,
    toColumnId: string,
    toIndex: number,
    existingTasks: Task[]
  ): number {
    // Логика пересчета позиций
  }
}
```

2. Создать `MoveTask` use-case:

`src/main/app/task/commands/MoveTask.ts`:

```typescript
export class MoveTask {
  constructor(
    private taskRepo: TaskRepoPort,
    private eventBus: EventBusPort
  ) {}

  async execute(input: {
    taskId: string
    toColumnId: string
    toIndex: number
  }): Promise<Result<void>> {
    const task = this.taskRepo.getById(input.taskId)
    if (!task.ok || !task.data) {
      return fail(ErrorCode.TASK_NOT_FOUND, 'Task not found')
    }

    // Проверка политики
    const canMove = TaskMovePolicy.canMove(task.data, input.toColumnId)
    if (!canMove.ok) return canMove

    // Транзакция: перемещение + пересчет позиций
    const result = this.taskRepo.move(input.taskId, input.toColumnId, input.toIndex)
    if (!result.ok) return result

    // Событие
    this.eventBus.publish('task.moved', {
      taskId: input.taskId,
      fromColumnId: task.data.columnId,
      toColumnId: input.toColumnId,
    })

    return ok(undefined)
  }
}
```

3. Обновить `TaskRepository.move()` для транзакционности

**Критерии готовности:**

- [ ] DnD стабилен
- [ ] Позиции не "скачут"
- [ ] Нет лишних перезагрузок
- [ ] События корректны

**Время:** 6 часов

---

#### Шаг 2.2: Renderer refactoring

**Файлы:**

- `src/renderer/features/board/model/useBoardState.ts`
- `src/renderer/features/board/api/taskApi.ts`
- `src/renderer/features/board/ui/KanbanBoard.tsx`

**Действия:**

1. Вынести state в `features/board/model/`
2. Вынести API вызовы в `features/board/api/`
3. Упростить `BoardScreen` до композиции

**Критерии готовности:**

- [ ] BoardScreen < 200 строк
- [ ] State изолирован
- [ ] API переиспользуется

**Время:** 4 часа

---

### Фаза 3: Run Module

**Цель:** Унифицировать запуск и события

#### Шаг 3.1: Run use-cases

**Файлы:**

- `src/main/app/run/commands/{StartRun,CancelRun,DeleteRun}.ts`
- `src/main/app/run/queries/{GetRun,ListRunsByTask,TailRunEvents}.ts`

**Действия:**

1. Создать `StartRun`:

`src/main/app/run/commands/StartRun.ts`:

```typescript
export class StartRun {
  constructor(
    private runRepo: RunRepoPort,
    private taskRepo: TaskRepoPort,
    private opencode: OpenCodePort,
    private eventBus: EventBusPort
  ) {}

  async execute(input: {
    taskId: string
    roleId: string
    mode: string
  }): Promise<Result<{ runId: string }>> {
    // 1. Создать run (транзакция)
    const run = this.runRepo.create({
      taskId: input.taskId,
      roleId: input.roleId,
      mode: input.mode,
      status: 'queued',
    })
    if (!run.ok) return run

    // 2. Событие: run.created
    this.eventBus.publish('run.created', { run: run.data })

    // 3. Запуск OpenCode (вне транзакции)
    const startResult = await this.opencode.startSession(run.data.id, input.taskId)
    if (!startResult.ok) {
      this.runRepo.update(run.data.id, { status: 'failed', errorText: startResult.error.message })
      return startResult
    }

    // 4. Обновить статус
    this.runRepo.update(run.data.id, { status: 'running', sessionId: startResult.data.sessionId })
    this.taskRepo.update(input.taskId, { status: 'running' })

    // 5. Событие: run.started
    this.eventBus.publish('run.started', { runId: run.data.id })

    return ok({ runId: run.data.id })
  }
}
```

2. Создать `CancelRun` с идемпотентностью

3. Унифицировать формат событий `run.*`

**Критерии готовности:**

- [ ] Запуск/отмена стабильны
- [ ] События последовательны
- [ ] История корректна
- [ ] Идемпотентность работает

**Время:** 6 часов

---

### Фаза 4: OpenCode Module

**Цель:** Унифицировать интеграцию с OpenCode

#### Шаг 4.1: OpenCodePort

**Файлы:**

- `src/main/ports/opencode/OpenCodePort.ts`
- `src/main/infra/opencode/OpenCodeService.ts` (адаптер)

**Действия:**

1. Создать интерфейс:

`src/main/ports/opencode/OpenCodePort.ts`:

```typescript
export interface OpenCodePort {
  startSession(runId: string, taskId: string): Promise<Result<{ sessionId: string }>>
  sendMessage(sessionId: string, message: string): Promise<Result<void>>
  getSessionStatus(sessionId: string): Promise<Result<SessionStatus>>
  listModels(): Promise<Result<Model[]>>
  refreshModels(): Promise<Result<Model[]>>
}
```

2. Адаптировать существующий `OpenCodeExecutorSDK` к порту

3. Добавить коды ошибок:
   - `OPENCODE_UNAVAILABLE`
   - `OPENCODE_SESSION_NOT_FOUND`
   - `OPENCODE_TIMEOUT`

**Критерии готовности:**

- [ ] UI не падает при ошибках провайдера
- [ ] События предсказуемы
- [ ] Таймауты обрабатываются

**Время:** 5 часов

---

### Фаза 5: Event Bus Unification

**Цель:** Единый механизм событий

#### Шаг 5.1: EventBus implementation

**Файлы:**

- `src/main/infra/events/EventBus.ipc.ts`
- `src/shared/ipc/events.ts`

**Действия:**

1. Создать типы событий:

`src/shared/ipc/events.ts`:

```typescript
export type DomainEvent =
  | { type: 'project.created'; project: Project }
  | { type: 'project.updated'; project: Project }
  | { type: 'project.deleted'; projectId: string }
  | { type: 'task.created'; task: Task }
  | { type: 'task.updated'; task: Task }
  | { type: 'task.moved'; taskId: string; fromColumnId: string; toColumnId: string }
  | { type: 'task.deleted'; taskId: string }
  | { type: 'run.created'; run: Run }
  | { type: 'run.started'; runId: string }
  | { type: 'run.progress'; runId: string; progress: number }
  | { type: 'run.completed'; runId: string }
  | { type: 'run.failed'; runId: string; error: string }
  | { type: 'run.canceled'; runId: string }
```

2. Реализовать EventBus:

`src/main/infra/events/EventBus.ipc.ts`:

```typescript
export class EventBusIpc implements EventBusPort {
  private subscribers = new Map<string, Set<(event: any) => void>>()

  publish<T>(topic: string, event: T): void {
    const handlers = this.subscribers.get(topic)
    if (!handlers) return
    handlers.forEach((handler) => handler(event))
  }

  subscribe<T>(topic: string, handler: (event: T) => void): () => void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set())
    }
    this.subscribers.get(topic)!.add(handler)

    return () => {
      this.subscribers.get(topic)?.delete(handler)
    }
  }
}

export const eventBus = new EventBusIpc()
```

3. Мигрировать с `task-event-bus.ts` на `EventBus`

**Критерии готовности:**

- [ ] Все события через EventBus
- [ ] Подписки работают
- [ ] Нет дублирования событий

**Время:** 4 часа

---

### Фаза 6: DB Worker (опционально)

**Цель:** Вынести БД в worker thread

**Примечание:** Это большая задача, можно отложить на потом

#### Шаг 6.1: DbWorker protocol

**Файлы:**

- `src/main/infra/db/DbWorker.ts`
- `src/main/infra/db/DbWorkerProtocol.ts`

**Действия:**

1. Создать протокол сообщений
2. Запустить worker thread
3. Создать прокси репозиториев
4. Мигрировать по одному репозиторию

**Критерии готовности:**

- [ ] Main не выполняет синхронных SQL операций
- [ ] UI не блокируется

**Время:** 16+ часов (отдельная фаза)

---

## Критерии готовности

### Общие критерии для каждой фазы

- [ ] Компиляция проходит без ошибок
- [ ] Приложение запускается
- [ ] Ключевые экраны открываются
- [ ] Нет регрессий в функциональности
- [ ] Тесты проходят (если есть)

### Критерии завершения рефакторинга

- [ ] Все IPC handlers — тонкие обертки (< 10 строк)
- [ ] Бизнес-логика в use-cases
- [ ] Все операции возвращают `Result<T>`
- [ ] Единый EventBus для всех событий
- [ ] Репозитории реализуют интерфейсы портов
- [ ] Нет прямых вызовов репозиториев из handlers
- [ ] Код покрыт тестами (хотя бы use-cases)

---

## Риски и митигация

### Риск 1: Большие изменения ломают функциональность

**Митигация:**

- Делать по модулю (project → task → run → opencode)
- Держать старые handlers до полной миграции
- Использовать feature flags для переключения

### Риск 2: Совместимость IPC в процессе рефакторинга

**Митигация:**

- Временно поддерживать старые каналы через thin-wrapper
- Использовать префикс `v2:` для новых каналов
- Мигрировать renderer постепенно

### Риск 3: Производительность Result pattern

**Митигация:**

- Result — zero-cost abstraction (union type)
- Бенчмарки показывают negligible overhead
- Выигрыш в читаемости перевешивает

### Риск 4: Сложность тестирования

**Митигация:**

- Use-cases легко тестировать с mock портами
- Интеграционные тесты для handlers
- E2E тесты для критических путей

---

## Оценка времени

| Фаза      | Описание                        | Время        |
| --------- | ------------------------------- | ------------ |
| 0.1       | Result и ErrorCode              | 1 час        |
| 0.2       | Zod-контракт в shared           | 2 часа       |
| 0.3       | Маппер ошибок                   | 1 час        |
| 1.1       | Каркас app/ и ports/            | 1 час        |
| 1.2       | Первый use-case (CreateProject) | 3 часа       |
| 1.3       | Остальные Project use-cases     | 4 часа       |
| 2.1       | Task use-cases                  | 6 часов      |
| 2.2       | Renderer refactoring            | 4 часа       |
| 3.1       | Run use-cases                   | 6 часов      |
| 4.1       | OpenCodePort                    | 5 часов      |
| 5.1       | EventBus unification            | 4 часа       |
| **Итого** | **Без DB Worker**               | **37 часов** |
| 6.1       | DB Worker (опционально)         | 16+ часов    |

**Рекомендация:** Выполнять по 4-6 часов в день → 6-9 рабочих дней

---

## Следующие шаги

1. Согласовать план с командой
2. Создать feature branch: `refactor/application-layer`
3. Начать с Фазы 0 (Foundation)
4. После каждой фазы — code review + merge
5. Документировать изменения в CHANGELOG.md

---

## Приложение: Примеры кода

### Пример use-case с транзакцией

```typescript
export class MoveTask {
  async execute(input: MoveTaskInput): Promise<Result<void>> {
    return this.taskRepo.transaction(async (tx) => {
      // 1. Получить задачу
      const task = await tx.getById(input.taskId)
      if (!task.ok || !task.data) {
        return fail(ErrorCode.TASK_NOT_FOUND, 'Task not found')
      }

      // 2. Проверить политику
      const canMove = TaskMovePolicy.canMove(task.data, input.toColumnId)
      if (!canMove.ok) return canMove

      // 3. Переместить
      const result = await tx.move(input.taskId, input.toColumnId, input.toIndex)
      if (!result.ok) return result

      // 4. Событие (вне транзакции)
      this.eventBus.publish('task.moved', { ... })

      return ok(undefined)
    })
  }
}
```

### Пример handler

```typescript
ipcHandlers.register('task:move', TaskMoveInputSchema, async (_, input) => {
  try {
    const result = await moveTask.execute(input)
    return result
  } catch (error) {
    return toResultError(error)
  }
})
```

### Пример теста use-case

```typescript
describe('MoveTask', () => {
  it('should move task to another column', async () => {
    const mockTaskRepo = createMockTaskRepo()
    const mockEventBus = createMockEventBus()
    const moveTask = new MoveTask(mockTaskRepo, mockEventBus)

    const result = await moveTask.execute({
      taskId: 'task-1',
      toColumnId: 'col-2',
      toIndex: 0,
    })

    expect(result.ok).toBe(true)
    expect(mockTaskRepo.move).toHaveBeenCalledWith('task-1', 'col-2', 0)
    expect(mockEventBus.publish).toHaveBeenCalledWith('task.moved', expect.any(Object))
  })
})
```

---

**Конец документа**
