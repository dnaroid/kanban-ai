# Kanban AI — целевая структура проекта и каталог use-cases (project/task/run/opencode)

_Дата: 2026-02-07_

Цель: зафиксировать **целевую** (target) структуру папок и список use-cases, которые соответствуют текущим IPC-каналам в `ARCHITECTURE.md` (только: project/task/run/opencode).

---

## 1) Принципы
- **IPC = адаптер**, не бизнес-логика.
- **Use-case = единица поведения**: команда (изменяет состояние) или запрос (читает).
- **Domain = инварианты** и правила (напр. допустимость переходов статусов).
- **Infra = детали**: SQLite, OpenCode SDK, файловая система, логирование.
- **Shared = контракт**: Zod-схемы, типы, коды ошибок, события.

---

## 2) Целевая структура папок (tree)

```text
src/
  shared/
    ipc/
      contract.zod.ts          # Zod схемы запросов/ответов; типы infer
      channels.ts              # перечисление каналов (project.*, task.* ...)
      errors.ts                # ErrorCode enum + helpers
      result.ts                # Result<T> тип + unwrap helpers
      events.ts                # Event envelope + topics
    types/
      ids.ts                   # ProjectId/TaskId/RunId etc
      time.ts
    utils/
      invariant.ts
      logger.ts

  main/
    bootstrap/
      app-lifecycle.ts
      window.ts

    ipc/
      register.ts
      handlers/
        project.handlers.ts
        task.handlers.ts
        run.handlers.ts
        opencode.handlers.ts
      map-error.ts
      validate.ts

    app/                       # Application layer (use-cases)
      project/
        commands/
          CreateProject.ts
          UpdateProject.ts
          DeleteProject.ts
          SelectProjectFolder.ts
        queries/
          GetProjectById.ts
          ListProjects.ts
      task/
        commands/
          CreateTask.ts
          UpdateTask.ts
          MoveTask.ts
          DeleteTask.ts
        queries/
          ListTasksByBoard.ts
      run/
        commands/
          StartRun.ts
          CancelRun.ts
          DeleteRun.ts
        queries/
          GetRun.ts
          ListRunsByTask.ts
          TailRunEvents.ts
      opencode/
        commands/
          RefreshModels.ts
          ToggleModel.ts
          UpdateModelDifficulty.ts
          GenerateUserStory.ts
          SendMessage.ts
        queries/
          ListModels.ts
          GetSessionStatus.ts
          GetActiveSessions.ts
          GetSessionMessages.ts
          GetSessionTodos.ts
          LogProviders.ts

    domain/
      project/
        Project.ts
        ProjectPolicy.ts
      task/
        Task.ts
        TaskPolicy.ts
        TaskMovePolicy.ts
      run/
        Run.ts
        RunPolicy.ts
      opencode/
        Session.ts

    ports/
      db/
        ProjectRepoPort.ts
        TaskRepoPort.ts
        RunRepoPort.ts
      opencode/
        OpenCodePort.ts
      events/
        EventBusPort.ts
      clock/
        ClockPort.ts

    infra/
      db/
        DatabaseManager.ts
        repositories/
          ProjectRepository.sqlite.ts
          TaskRepository.sqlite.ts
          RunRepository.sqlite.ts
        migrations/
      opencode/
        OpenCodeService.ts
      events/
        EventBus.ipc.ts
      logging/
        logger.ts

  preload/
    api.ts
    preload.ts

  renderer/
    app/
      App.tsx
      routes.tsx
    shared/
      api/
        client.ts
      ui/
      hooks/
    features/
      projects/
        api/
        model/
        ui/
      board/
        api/
        model/
        ui/
      runs/
        api/
        model/
        ui/
      opencode/
        api/
        model/
        ui/
    screens/
      ProjectsScreen.tsx
      BoardScreen.tsx
      TimelineScreen.tsx
      AnalyticsScreen.tsx
      SettingsScreen.tsx
      DiagnosticsScreen.tsx
```

---

## 3) Список use-cases по IPC-каналам

### 3.1 Project (`project.*`)
| IPC канал | Тип | Use-case | Кратко |
|---|---:|---|---|
| `project.selectFolder` | command | `SelectProjectFolder` | Выбор директории проекта (права/валидация пути) |
| `project.create` | command | `CreateProject` | Создать проект + дефолтная доска |
| `project.getAll` | query | `ListProjects` | Список проектов |
| `project.getById` | query | `GetProjectById` | Данные проекта |
| `project.update` | command | `UpdateProject` | Переименовать/обновить метаданные |
| `project.delete` | command | `DeleteProject` | Удалить проект (с каскадом по данным) |

**События (topics):** `project.created`, `project.updated`, `project.deleted`

### 3.2 Task (`task.*`)
| IPC канал | Тип | Use-case | Кратко |
|---|---:|---|---|
| `task.create` | command | `CreateTask` | Создать задачу (теги/позиция/статус) |
| `task.listByBoard` | query | `ListTasksByBoard` | Канбан: задачи по доске + сортировки |
| `task.update` | command | `UpdateTask` | Редактирование полей/описания |
| `task.move` | command | `MoveTask` | Перемещение между колонками + позиционирование |
| `task.delete` | command | `DeleteTask` | Удаление задачи (+ проверки зависимостей) |

**Доменные политики:** переходы статусов, правила пересортировки, ограничения при активных runs  
**События:** `task.created`, `task.updated`, `task.moved`, `task.deleted`

### 3.3 Run (`run.*`)
| IPC канал | Тип | Use-case | Кратко |
|---|---:|---|---|
| `run.start` | command | `StartRun` | Запуск AI-задачи: создать run, старт с OpenCode |
| `run.cancel` | command | `CancelRun` | Отмена активного run |
| `run.delete` | command | `DeleteRun` | Удаление run |
| `run.listByTask` | query | `ListRunsByTask` | История run-ов по задаче |
| `run.get` | query | `GetRun` | Детали run |
| `run.events:tail` | query/stream | `TailRunEvents` | Подписка/хвост событий |

**События:** `run.started`, `run.progress`, `run.completed`, `run.failed`, `run.canceled`

### 3.4 OpenCode (`opencode.*`)
| IPC канал | Тип | Use-case | Кратко |
|---|---:|---|---|
| `opencode.listModels` | query | `ListModels` | Список моделей/провайдеров |
| `opencode.refreshModels` | command | `RefreshModels` | Обновить список/состояния |
| `opencode.toggleModel` | command | `ToggleModel` | Включить/выключить модель |
| `opencode.updateModelDifficulty` | command | `UpdateModelDifficulty` | Настроить сложность |
| `opencode.generateUserStory` | command | `GenerateUserStory` | Генерация user story |
| `opencode.sendMessage` | command | `SendMessage` | Отправка сообщения в сессию |
| `opencode.getSessionStatus` | query | `GetSessionStatus` | Статус сессии |
| `opencode.getActiveSessions` | query | `GetActiveSessions` | Активные сессии |
| `opencode.getSessionMessages` | query | `GetSessionMessages` | Сообщения |
| `opencode.getSessionTodos` | query | `GetSessionTodos` | TODOs |
| `opencode.logProviders` | query | `LogProviders` | Диагностика |

**События:** `opencode.session.updated`, `opencode.message.added`, `opencode.models.updated`

---

## 4) Общие требования к use-cases
- Возвращать `Result<T>` или доменную ошибку, маппируемую в `Result`.
- Определять границы транзакций (особенно `MoveTask`, `StartRun`).
- Идемпотентность для `CancelRun` (повторная отмена — ok).
