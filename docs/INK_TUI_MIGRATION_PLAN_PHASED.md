# Kanban AI — План перехода на Ink TUI (Projects → Board → Task Screen)

> Дата: 2026-01-30  
> Цель: сделать **Ink TUI** как второй UI к существующему core (DB/Run/Git/PR), начиная с 3 ключевых экранов:  
> 1) **Projects** (список + добавление/выбор)  
> 2) **Board** (доска + колонки + перемещение)  
> 3) **Task Screen** (детали таски + чат/runs/артефакты)

---

## 0) Почему Ink и какие ограничения

### Почему Ink
- React-подход → проще переиспользовать ментальную модель твоего `renderer`
- Хорошая экосистема компонентов: `ink`, `ink-text-input`, `ink-select-input`, `ink-table`, `ink-spinner`, `ink-link`, `ink-use-stdout-dimensions`
- Удобно делать **командную палитру** и hotkeys

### Ограничения Ink (важно учитывать)
- Нет “нативного drag&drop” → делаем **move mode** (выбор карточки → выбор колонки → позиция)
- Большие “доски” потребуют виртуализации (либо пагинация/scroll)
- Rich markdown — либо упрощенный рендер (mono) либо отдельный scrollable viewer

---

## 1) Целевой результат v0 (минимум, который уже полезен)

### Must-have
- Projects screen:
  - list projects
  - create project (name + path)
  - select project
- Board screen:
  - list boards, default board
  - columns + tasks
  - move task between columns
  - quick create task
  - search/filter by text/tag/priority/status
- Task screen:
  - title/desc/tags/priority/status
  - list runs + latest status
  - open run log (stream) / events
  - show artifacts
  - actions: start BA run, start Dev run, start QA run, create branch, create PR

### Nice-to-have (не в первой итерации)
- Timeline screen
- Analytics
- Plugin manager UI (можно текстом)
- Fancy markdown rendering

---

## 2) Стратегия интеграции: TUI как второй “frontend” к core

### Текущее состояние (по дереву)
- Core логика в `src/main/**` (db/run/git/pr/merge/services)
- Electron-specific: `src/main/main.ts`, `src/main/ipc/**`, `src/preload/**`, `src/renderer/**`

### Что нужно для Ink TUI
1) **AppApi facade** (единая typed API для UI)
2) **EventBus** (подписка на run/pr/polling события)
3) **Ports** для платформенных вещей (paths/secrets/logger)

Цель: Ink вызывает `AppApi` **напрямую**, без IPC.

---

## 3) Пакеты/зависимости для TUI

### Зависимости
- `ink`
- `react` (Ink использует react)
- `ink-text-input`
- `ink-select-input`
- `ink-use-stdout-dimensions` (опц.)
- `ink-spinner` (опц.)
- `zod` (если будешь валидировать вход)
- `chalk` (опц., если нужно — но Ink сам управляет цветом)

### Скрипты
- `pnpm tui` → запуск `tsx`/`node` entrypoint
- `pnpm tui:dev` → watch (например `tsx watch`)
- `pnpm tui:build` → сборка (опционально; можно просто node)

---

## 4) План работ (фазами) — без переписывания ядра

## Phase A — Подготовка core для двух UI (1–2 дня работы)
### A1. Создать AppApi facade
Файл: `src/main/app-api.ts`

**Должно быть минимум:**
- Projects:
  - `listProjects()`
  - `createProject({ name, path })`
  - `getProject(id)`
- Boards/Tasks:
  - `getDefaultBoard(projectId)` / `listBoards(projectId)`
  - `listColumns(boardId)`
  - `listTasksByBoard(boardId)`
  - `createTask(input)`
  - `updateTask(id, patch)`
  - `moveTask({ taskId, toColumnId, orderHint })`
  - `getTask(taskId)` + `getTaskArtifacts(taskId)` + `getTaskRuns(taskId)`
- Runs:
  - `startRun({ taskId, roleId, mode })`
  - `streamRunEvents(runId)` (через EventBus)
- VCS:
  - `ensureTaskBranch(taskId)`
  - `createOrUpdatePR(taskId)`
  - `pollPR(taskId)` / `getPR(taskId)`

> Реализация AppApi — просто “склейка” твоих сервисов/репозиториев.

### A2. EventBus в core
- `src/main/events/event-bus.ts`
- типы событий: `RunEventAppended`, `RunStatusChanged`, `PRUpdated`, `TaskUpdated`, `BoardChanged`

Ink UI подписывается и обновляет компоненты.

### A3. Ports/adapters (минимум)
- `PathsPort`: где хранить БД/файлы
- `SecretStorePort`: если TUI должен логинить GitHub/Provider
- `LoggerPort`: чтобы TUI мог выводить логи в отдельный файл

**Результат Phase A:** TUI может жить без Electron.

---

## Phase B — Скелет Ink приложения и навигация (0.5–1 день)
### B1. Entry point
- `src/tui/main.tsx` — Ink render root
- `src/tui/app.tsx` — router/state

### B2. Router (3 экрана)
Состояние:
- `screen: 'projects' | 'board' | 'task'`
- `selectedProjectId?`
- `selectedBoardId?`
- `selectedTaskId?`

Навигация:
- `Esc` → назад
- `Ctrl+C` → exit
- `Tab` → переключение фокуса между панелями
- `/` → поиск/палитра
- `?` → help overlay

### B3. Командная палитра (очень полезно)
Команда → действие:
- `Project: Open …`
- `Task: Create`
- `Task: Move`
- `Run: Start BA/Dev/QA`
- `Git: Create Branch`
- `PR: Create/Sync`
- `Refresh`

---

## Phase C — Экран Projects (первый usable) (1 день)
### UI вайрфрейм
```
Projects
────────────────────────────────────────────────────────────────
[Search…]
> kwizie        ~/Projects/kwizie
  indexer       ~/Projects/indexer
  ...
────────────────────────────────────────────────────────────────
Actions: (N) New project  (Enter) Open  (R) Refresh  (Q) Quit
```

### Функционал
- `listProjects()` при входе
- фильтр по строке поиска
- `N` → форма создания проекта (name+path)
  - path можно вводить вручную (позже прикрутишь file-picker через CLI)
- `Enter` → open project → screen board (default)

### Acceptance критерии
- Создать проект
- Проект появляется в списке
- Можно открыть проект и перейти на доску

---

## Phase D — Экран Board (колонки + задачи + перемещение) (2–4 дня)
### UI вайрфрейм (3 панели)
```
Board: Default   Project: kwizie
────────────────────────────────────────────────────────────────
Backlog            In Dev              Review               Done
[KZ-1] Title...    [KZ-7] ...          [KZ-9] ...           ...
[KZ-2] ...         ...
...
────────────────────────────────────────────────────────────────
Focus: Backlog | Selected: KZ-2
Keys: ←→ switch column  ↑↓ select task  (M) move  (O) open
      (N) new task  (/) search  (R) refresh
```

### Реализация “move” вместо drag&drop
- `M` → entering move mode:
  1) выбрать target column (`←→`)
  2) выбрать позицию (`↑↓`) или “top/bottom”
  3) подтвердить `Enter`
- вызвать `appApi.moveTask({ taskId, toColumnId, orderHint })`

### Поиск/фильтры
- `/` → строка фильтра
- фильтр применяется в памяти (первый этап)  
  позже можно задействовать `tasks_fts`

### Перфоманс
- Не рендерить всю доску как React-список огромных строк:
  - ограничить видимые задачи по высоте терминала
  - хранить “scroll offsets” по колонкам
- Подписка на `TaskUpdated/BoardChanged` → точечный refresh

### Acceptance критерии
- Показать колонки + задачи
- Переместить задачу между колонками
- Создать новую задачу (в текущей колонке)
- Открыть задачу (Task screen)

---

## Phase E — Экран Task (детали + runs + чат/лог) (2–5 дней)
### UI вайрфрейм (tabs)
```
Task: KZ-142  [P1] [ui, perf]     Column: In Dev
────────────────────────────────────────────────────────────────
Title: ...
Description:
  ...
────────────────────────────────────────────────────────────────
Tabs: (1) Details  (2) Runs  (3) Chat  (4) Artifacts  (5) VCS
────────────────────────────────────────────────────────────────
[Runs tab]
> run_123  Dev   running   started 12:31
  run_122  BA    success   ...
────────────────────────────────────────────────────────────────
Actions: (B) BA run  (D) Dev run  (Q) QA run  (G) branch  (P) PR
```

### Что должно работать в первой версии
- Details:
  - редактирование title/priority/tags (упрощенно)
- Runs:
  - список runs
  - выбрать run → открыть лог/events viewer
  - streaming: по EventBus дописывать строки в “tail”
- Artifacts:
  - список artifact (title/kind)
  - открыть → scroll viewer
- VCS:
  - показать branch/pr status из `task_vcs_links`/`pull_requests`
  - кнопки: ensure branch, create/update PR
- Chat:
  - если у тебя чат хранится в run_events — показывай как чат (role/user/assistant)
  - если нет — можно пока показывать run_events как лог

### Acceptance критерии
- Открыть задачу с доски
- Запустить run и увидеть статус “running”
- Увидеть появляющиеся run_events (стрим)
- Открыть artifacts и прочитать content
- Создать ветку и увидеть branch_name
- Создать PR и увидеть URL

---

## 5) Какой “минимальный” рефакторинг нужен прямо сейчас

### 5.1 Не тащить Electron в core
Проверка: в `src/main/**` (кроме `main.ts` и `ipc/**`) не должно быть `electron` imports.

### 5.2 Перенести вычисления/правила из UI в core
Если сейчас renderer сам решает:
- какие колонки
- сортировку
- business rules “move”

Лучше, чтобы:
- core выдавал “готовую модель доски” (`BoardViewModel`)
- TUI/Electron только рендерили

---

## 6) Конкретные задачи (готовый backlog для агента)

### Epic: Ink TUI MVP
**TUI-01** Add AppApi facade (projects/boards/tasks/runs/vcs)  
**TUI-02** Add core EventBus + event types  
**TUI-03** Add PathsPort + SecretStorePort (TUI impl)  
**TUI-04** Create Ink app skeleton + router + help overlay  
**TUI-05** Implement Projects screen (list/create/select)  
**TUI-06** Implement Board screen (render columns/tasks + move mode + create task)  
**TUI-07** Implement Task screen (details + runs list + artifacts + VCS actions)  
**TUI-08** Implement Run log viewer (streaming tail)  
**TUI-09** Implement search/filter across board + tasks_fts (optional)  
**TUI-10** Add smoke tests (CLI-level) for API calls + basic screens

---

## 7) Технологические решения (рекомендации)

### State management
- для Ink достаточно `useState` + “store” на `zustand` (опционально)
- события EventBus обновляют store

### Компоненты
- `List` (select input)
- `Table` / `ColumnsLayout`
- `Modal` (confirm/move mode)
- `Tabs`
- `ScrollableText`

### Логи
- Не смешивать stdout UI и debug логи:
  - debug логи → файл (`~/.kanban-ai/logs/tui.log`)
  - UI → только Ink render

---

## 8) Критерии готовности “можно пользоваться”

1) Можно открыть проект и увидеть доску  
2) Можно создать/переместить задачу  
3) Можно открыть задачу, запустить run и смотреть события  
4) Можно создать ветку и PR из task screen  
5) UI не ломается при длинных списках (есть скролл/пагинация)  

---

## 9) С чего начать прямо сейчас (самый быстрый путь)

1) **Сделай AppApi** на существующих сервисах  
2) **Сделай Projects screen** (как самый легкий)  
3) Затем Board screen без move (только read-only)  
4) Потом move mode  
5) Потом Task screen (Details)  
6) Потом Runs streaming

---

## 10) Примечание про совместимость с Electron

Важно: Electron renderer продолжит работать как раньше, если:
- IPC handlers будут вызывать тот же AppApi
- а TUI — вызывать AppApi напрямую

Так ты не плодишь две реализации логики.

