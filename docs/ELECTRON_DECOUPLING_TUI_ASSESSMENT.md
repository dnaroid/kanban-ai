# Kanban AI — Насколько код привязан к Electron и как отвязать для TUI

> Дата: 2026-01-30  
> Контекст: ты показал структуру проекта (дерево файлов + entrypoints + deps). Полный исходный код я не читал построчно,
> поэтому выводы основаны на структуре и типичных паттернах Electron.

---

## 1) Короткий ответ

**Судя по структуре, “ядро” у тебя уже почти отвязано от Electron.**  
Привязка к Electron в основном в:

- `src/main/main.ts` (boot Electron)
- `src/main/ipc/*` (handlers + validation)
- `src/preload/*` (bridge)
- `src/renderer/*` (React UI)
- конфиги `electron.vite.config.ts`, `electron-builder.config.ts`

А вот большая часть бизнес-логики выглядит “чисто node”:

- `src/main/db/*` (better-sqlite3) ✅
- `src/main/run/*` (job-runner, opencode-executor, session manager, security) ✅ *(если без `electron`-импортов)*
- `src/main/git/*`, `src/main/pr/*`, `src/main/merge/*`, `src/main/release/*`, `src/main/search/*` ✅
- `src/main/plugins/*` ✅
- `src/main/services/*` ✅

То есть **TUI-версию сделать реально**, и по ощущениям это не “переписать всё”, а **вынести core и сделать второй
фронтенд** (Electron Renderer vs TUI), которые дергают одно и то же ядро.

---

## 2) Где именно “жесткая” привязка к Electron (по дереву)

### 2.1 Main-process Electron boot

- `src/main/main.ts` — создание окна, life-cycle, меню, devtools и т.п.
- Возможны импорты `electron` в сервисы (нужно проверить), но по структуре они скорее локализованы.

### 2.2 IPC слой (Electron-only транспорт)

- `src/main/ipc/handlers.ts`, `diagnostics-handlers.ts`, `validation.ts`
- `src/preload/ipc-contract.ts`, `preload.ts`
- `src/ipc/types/index.ts` и `src/shared/types/ipc.ts`

Это важный узел: сейчас Renderer общается с Main через IPC контракт.

### 2.3 Renderer UI

- `src/renderer/*` — полностью Electron/React.

### 2.4 Секреты / secure store (может быть Electron-dependent)

- `src/main/secrets/secret-store.ts`
- В Diagnostics UI видно “Secure Store Mock/Standard”, значит у тебя уже есть **mock**, это плюс для TUI.

---

## 3) Что уже хорошо для TUI (почему “не сложно”)

### 3.1 Твои сервисы и репозитории уже в `src/main/*`

Это фактически “backend” приложения:

- DB + repos
- run pipeline (OpenCode)
- Git/PR/merge/CI polling
- plugins
- analytics

**TUI может просто запускать этот backend как библиотеку** и отображать состояние.

### 3.2 Shared types уже есть

- `src/shared/types/*`
- `src/ipc/types/*`

Это облегчает выделение “domain API”.

---

## 4) Реальная сложность: оценка по зонам (без чтения кода)

### 4.1 Самое простое (почти сразу)

- Сделать CLI/TUI, которое:
    - открывает БД
    - читает projects/tasks/boards
    - показывает списки
    - запускает простые команды (create task, move task, start run)
      **Сложность: низкая**, если core сервисы не используют Electron API.

### 4.2 Среднее

- Реализовать “живой” TUI: подписки на события, прогресс runs, streaming логов
  **Сложность: средняя**, потому что в Electron ты мог полагаться на IPC и reactive state в React.

### 4.3 Самое сложное

- Полная “feature parity” UI: drag&drop, drawers, rich markdown, графики
  **Сложность: высокая**, но это скорее UX/виджеты, а не отвязка от Electron.

---

## 5) Как отвязать правильно: целевая архитектура

### 5.1 Вынести `core` (библиотеку) из Electron Main

Цель: чтобы и Electron, и TUI вызывали одинаковое ядро.

Предлагаемая структура (в пределах монорепы pnpm workspace):

```
packages/
  core/                 # чистая node-библиотека (domain + services)
  transport-ipc/        # electron ipc адаптер (optional)
  ui-electron/          # renderer (react)
  ui-tui/               # blessed/ink/tview и т.п.
```

Если не хочешь монорепу — можно проще:

- оставить `src/main/*` как core
- добавить `src/tui/*`
- постепенно “вытеснять” electron-импорты из core

### 5.2 Разделить слои

- **Domain/Core**: сервисы + репозитории + модели
- **Ports (interfaces)**: логгер, секреты, файловая система, диалоги, нотификации, “open external url”
- **Adapters**:
    - Electron adapter: IPC transport, secure store, dialogs
    - TUI adapter: stdin UI, env vars, file prompts (через CLI), keychain/файл

---

## 6) Конкретный “чеклист” отвязки по твоему коду

### 6.1 Поиск импортов Electron в core

Цель: чтобы внутри `src/main/**` (кроме `src/main/main.ts` и `src/main/ipc/**`) **не было**:

- `import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'`
- `electron-store`, `nativeTheme`, etc.

Если есть — заменить на интерфейсы:

- `ShellPort.openExternal(url)`
- `DialogPort.pickDirectory()`
- `ClipboardPort.readText()`
- `NotificationPort.notify()`

### 6.2 Вынести IPC-contract в “API” слой

Сейчас у тебя `ipc.ts` и `ipc-contract.ts`. Для TUI полезнее иметь:

- `AppApi` (typed methods): `listProjects`, `createTask`, `moveTask`, `startRun`, `getRunEvents`, …
- Electron: `ipcMain.handle("app:listProjects", ...)` просто вызывает `AppApi.listProjects()`
- TUI: напрямую вызывает `AppApi.listProjects()` без IPC

То есть IPC становится **адаптером**, а не “основным способом общения”.

### 6.3 “Event bus” вместо “renderer push”

TUI и Electron UI обоим нужен стрим:

- run events
- PR polling updates
- analytics updates

Сделай core-уровневый событийный интерфейс:

- `subscribe(listener)` / `unsubscribe`
- или RxJS observable
- или `EventEmitter`

Electron: события ретранслируются в renderer через IPC push (если надо).  
TUI: события напрямую обновляют виджеты.

### 6.4 DB path / app data dir

Electron часто хранит DB в `app.getPath("userData")`.
Для TUI нужно:

- либо ENV `KANBAN_DB_PATH`
- либо default `~/.kanban-ai/kanban.sqlite`

Сделай `PathsPort.getAppDataDir()` с 2 реализациями:

- Electron: userData
- TUI: homedir-based

### 6.5 Secrets / Secure Store

У тебя уже “Mock/Standard”.
Сделай `SecretStorePort`:

- Electron impl: keytar / safeStorage / os keychain
- TUI impl: keytar тоже можно (в node), либо файл + шифрование

Важно: **не держать секреты в renderer/tui**, только в core.

---

## 7) Как будет выглядеть TUI-версия в коде (минимальный скелет)

### 7.1 Одна точка входа для core

Например:

- `createApp({ dbPath, ports, logger }) => AppApi`

TUI:

- создает `AppApi`
- рисует экраны
- вызывает методы
- подписывается на события

Electron main:

- создает `AppApi`
- регистрирует IPC handlers, которые дергают `AppApi`

### 7.2 Что можно переиспользовать 1:1

Из твоего дерева — почти всё это можно оставить без изменений и просто переэкспортировать:

- `src/main/db/*`
- `src/main/run/*`
- `src/main/git/*`
- `src/main/pr/*`
- `src/main/merge/*`
- `src/main/plugins/*`
- `src/main/search/*`
- `src/main/analytics/*`
- `src/main/services/*`

---

## 8) Практичный план “отвязки” (минимум шагов)

### Шаг 1 — Ввести `AppApi` (facade)

- создать `src/main/app-api.ts`
- собрать туда методы, которые сейчас дергаются через IPC
- IPC handlers просто вызывают `appApi.method()`

### Шаг 2 — Вывести порты

- PathsPort
- SecretStorePort
- LoggerPort
- (опц.) DialogPort / ShellPort

Подменить прямые вызовы electron API.

### Шаг 3 — Добавить `src/tui/main.ts`

- создать TUI, который создает `AppApi` напрямую
- для начала: read-only board + open task drawer + run list

### Шаг 4 — Подписки/стримы событий

- EventBus в core
- TUI обновляет UI на событиях
- Electron renderer тоже может слушать те же события через IPC push

---

## 9) Итог: “жестко привязан” или нет?

**UI — да, привязан (renderer). Transport — да (IPC).**  
**Core/backend — скорее всего нет, и это отличная новость.**

С твоей текущей структурой “отвязка” обычно сводится к тому, чтобы:

- **перевернуть зависимость**: IPC/renderer зависят от core, а не наоборот
- добавить 2-3 порта (paths/secrets/dialogs)
- завести AppApi facade + EventBus
- написать TUI поверх AppApi
