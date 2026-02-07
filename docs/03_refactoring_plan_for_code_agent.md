# Kanban AI — подробный план рефакторинга для код-агента (project/task/run/opencode)

_Дата: 2026-02-07_

План рассчитан на выполнение небольшими безопасными шагами, с сохранением работоспособности. `backup` и `plugins` не включены.

---

## 0) Правила выполнения (обязательные)
- Делать **инкрементально**: один модуль → один PR/коммит-пакет.
- Сначала foundation (Result/Errors/contract), затем перенос логики.
- Всегда держать проект в рабочем состоянии:
  - сборка проходит
  - приложение запускается
  - ключевые экраны открываются
- Любая временная “двойная поддержка” должна иметь план удаления.

---

## 1) Foundation

### 1.1 Result и ErrorCode
**Сделать:**
- `src/shared/ipc/result.ts`:
  - `Result<T>`, `ok()`, `fail()`, `unwrap()`
- `src/shared/ipc/errors.ts`:
  - `ErrorCode` enum
  - helpers для маппинга

**Критерии готовности:**
- типы используются в preload + renderer
- нет “throw наружу” из IPC: только `Result`

### 1.2 Zod-контракт в shared как источник правды
**Сделать:**
- `src/shared/ipc/contract.zod.ts`: схемы для `project/task/run/opencode`
- типы через `z.infer`
- preload API использует типы и контракт из shared

**Критерии:**
- компиляция проходит
- IPC вызовы типизированы end-to-end

### 1.3 Маппер ошибок в main IPC
**Сделать:**
- `src/main/ipc/map-error.ts`: `toResultError(e)`
- обработчики используют `try/catch` и всегда возвращают `Result`

---

## 2) Application слой (use-cases)

### 2.1 Каркас app/ и ports/
**Сделать:**
- `src/main/app/{project,task,run,opencode}/{commands,queries}`
- `src/main/ports/`:
  - `ProjectRepoPort`, `TaskRepoPort`, `RunRepoPort`
  - `OpenCodePort`
  - опционально: `EventBusPort`, `ClockPort`

### 2.2 Переподключить handlers на use-cases (без изменения поведения)
**Стратегия:** сначала “тонкий шов” (thin wrapper), потом улучшения.

**Критерии:**
- handler не содержит бизнес-логики (только validate + call + map-error)
- use-case можно тестировать отдельно

---

## 3) Перенос по модулям (рекомендуемый порядок)

### 3.1 Project
**Use-cases:**
- `SelectProjectFolder`, `CreateProject`, `ListProjects`, `GetProjectById`, `UpdateProject`, `DeleteProject`

**Шаги:**
1) перенести текущую логику из handlers → use-cases
2) добавить базовые проверки (путь/права, уникальность)
3) (опционально) события: `project.created/updated/deleted`

**DoD:** ProjectsScreen работает полностью, CRUD не ломает настройки.

---

### 3.2 Task
**Use-cases:**
- `CreateTask`, `ListTasksByBoard`, `UpdateTask`, `MoveTask`, `DeleteTask`

**Шаги:**
1) перенести CRUD + запросы для доски
2) `MoveTask`:
   - транзакция
   - корректный пересчет `position`
3) вынести политики перемещения (хотя бы как функции)
4) renderer: вынести логику BoardScreen в `features/board/*`

**DoD:** DnD стабилен, позиции не “скачут”, нет лишних перезагрузок.

---

### 3.3 Run
**Use-cases:**
- `StartRun`, `CancelRun`, `DeleteRun`, `ListRunsByTask`, `GetRun`, `TailRunEvents`

**Шаги:**
1) `StartRun`:
   - транзакция: run + event started
   - затем вызов OpenCodePort (вне транзакции), корректные статусы
2) `CancelRun` — идемпотентность
3) унифицировать формат событий `run.*`
4) renderer: подписка + resync

**DoD:** запуск/отмена стабильны, события последовательны, история корректна.

---

### 3.4 OpenCode
**Use-cases:**
- `ListModels`, `RefreshModels`, `ToggleModel`, `UpdateModelDifficulty`
- `GenerateUserStory`, `SendMessage`
- `GetSessionStatus`, `GetActiveSessions`, `GetSessionMessages`, `GetSessionTodos`, `LogProviders`

**Шаги:**
1) ввести `OpenCodePort` и адаптер `OpenCodeService` → port
2) унифицировать события сессии/сообщений
3) добавить коды ошибок на недоступность провайдера/таймауты

**DoD:** UI не падает при ошибках провайдера, события предсказуемы.

---

## 4) Следующий большой шаг (опционально, отдельно): DB в worker
> Это не обязательно делать сразу, но держать как целевую цель.

**Подход:**
- ввести `DbWorker` и протокол сообщений
- repo implementations переносятся в worker
- main получает прокси репозиториев

**DoD:** main больше не выполняет синхронных SQL операций.
