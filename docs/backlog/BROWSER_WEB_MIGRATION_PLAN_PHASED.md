# Kanban AI — План миграции на браузерную (Web) версию

> Дата: 2026-01-30  
> Цель: добавить **browser UI** как ещё один клиент (помимо Electron и будущего Ink TUI), при этом **не переписывать
core** (DB/Run/Git/PR/OpenCode).  
> Приоритет: экраны **Projects → Board → Task** + базовый автопайплайн.

---

## 0) Что значит “браузерная версия” в твоём случае (2 реалистичных режима)

### Вариант 1 — Local Web (рекомендуется как первый шаг)

- Приложение запускает **локальный server** (Node) на `localhost`
- UI открывается в браузере (Chrome/Safari) и общается с сервером по HTTP/WebSocket
- База SQLite остаётся на диске (как сейчас), git/opencode доступен локально  
  ✅ почти всё переиспользуется  
  ✅ проще по безопасности  
  ✅ не нужно решать “облачные” проблемы сразу

---

## 1) Главная стратегия: 1 core → 3 клиента

### Текущее состояние

- Core/backend у тебя в `src/main/**`
- Electron использует IPC (`src/main/ipc/**`, `src/preload/**`, `src/renderer/**`)

### Целевая модель

- **AppApi** — единое typed API ядра (projects/tasks/boards/runs/vcs)
- **Transport adapters**:
    - Electron IPC adapter (как сейчас)
    - Web adapter (HTTP + WS)
    - TUI adapter (direct calls)

```
Core (services+repos+rules)
   ↑           ↑
Electron IPC   Web API (HTTP/WS)
   ↑           ↑
Renderer UI    Browser UI
```

---

## 2) Важная развилка: где живёт БД и git для Web UI?

### Local Web

- БД: `better-sqlite3` на сервере (Node) ✅
- Git/OpenCode: на сервере (Node) ✅
- UI: только отображает/управляет ✅

---

## 3) Что нужно добавить, чтобы Web UI стало возможным

## 3.1 AppApi facade (если ещё не сделал)

- Методы: projects/boards/tasks/runs/artifacts/vcs/search
- Это уже описано в плане Ink TUI — Web использует то же самое.

## 3.2 Web transport

Нужны:

- REST/HTTP endpoints для CRUD и запросов
- WebSocket/SSE для стриминга событий (run_events, PR polling, progress)

**Минимум:**

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id/board`
- `GET /api/boards/:id`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `POST /api/tasks/:id/move`
- `GET /api/tasks/:id`
- `GET /api/tasks/:id/runs`
- `POST /api/tasks/:id/runs`
- `GET /api/runs/:id/events`
- `GET /api/tasks/:id/artifacts`
- `WS /ws` (events stream)

## 4) UI стек для браузера

### Рекомендуемый выбор (самый бесшовный)

- **React + Vite** (у тебя уже Vite и React в renderer)
- Tailwind можно переиспользовать
- Компоненты из renderer частично переносим (но без Electron specifics)

---

## 5) План миграции (Local Web) — фазы

## Phase W0 — Подготовка ядра к Web (0.5–2 дня)

### W0.1 Ввести/завершить AppApi + EventBus

- AppApi: тот же фасад, что нужен Ink TUI
- EventBus: события для run/pr/task updates

### W0.2 Вынести платформенные зависимости в Ports

- PathsPort: где DB/логи/настройки
- SecretStorePort: токены (для GitHub provider)
- LoggerPort

**Exit criteria:** core можно запустить в node процессе без Electron.

---

## Phase W1 — Запуск локального сервера (1–2 дня)

### W1.1 Создать `src/web/server.ts`

Выбор: `express` / `fastify` / `hono`

- Лучше `fastify` (быстро, типизированно), но можно `express` для скорости.

### W1.2 Реализовать REST endpoints поверх AppApi

Тонкость: возвращать только safe данные (без секретов).

### W1.3 Реализовать WS/SSE стрим событий

- WS: удобнее для двусторонней связи
- SSE: проще (сервер → клиент), но хуже для интерактива

**Рекомендация:** WS.

**Exit criteria:** curl/insomnia может:

- создать проект
- создать таску
- получить board
- стартануть run
- получить run events (stream)

---

## Phase W2 — Web UI: Projects screen (0.5–2 дня)

### UI

- список проектов
- создание проекта (name + path)
- выбор проекта → переход на board

### Реюз из Electron

- стили/компоненты (Card/Button/Input)
- часть утилит

**Exit criteria:** в браузере можно открыть проект.

---

## Phase W3 — Web UI: Board screen (2–5 дней)

### UI must-have

- колонки и задачи
- drag&drop (в браузере уже реально)
    - можно использовать тот же `@dnd-kit/*`, что у тебя есть
- фильтр/поиск
- быстрый create task
- open task drawer/screen

### Логика перемещения

- UI вызывает `POST /api/tasks/:id/move`
- сервер пересчитывает order_in_column и возвращает обновлённый board snapshot

**Exit criteria:** move работает и сохраняется в DB.

---

## Phase W4 — Web UI: Task screen + Runs + Artifacts (2–6 дней)

### Task screen

- детали, редактирование
- runs list + запуск BA/Dev/QA
- live streaming run events
- artifacts viewer
- VCS panel (branch/pr status) + actions: create branch, create PR

### Стриминг

- WS канал: `subscribe(taskId)` / `subscribe(runId)`
- UI показывает “tail” событий и статус

**Exit criteria:** полный флоу “открыть задачу → запустить run → видеть события”.

---

## Phase W5 — Упаковка и DX (1–3 дня)

### Опции доставки Local Web

1) **Как CLI**: `pnpm web` → стартует server и печатает URL
2) **Как отдельный desktop wrapper** (потом): Electron может просто открыть web UI, но это не обязательно
3) **Docker** (опционально): удобно для воспроизводимости

### Dev tooling

- `pnpm web:dev` → server watch + ui dev server proxy
- единый `.env` для путей/портов

---

## 6) Сложные места и как их решить

### 6.1 “Выбор папки/репозитория” в браузере

Браузер не даст свободно лазить по FS.
Для Local Web решение:

- UI вводит `path` руками
- или backend предлагает “recent paths”
- или отдельная команда CLI `kanban add-project ~/repo` (и UI увидит)

### 6.2 Git операции и безопасность

- Всё делает сервер (Node), UI только командует
- Токены хранятся в SecretStorePort на стороне сервера
- Для Local Web можно ограничить доступ `localhost only`

### 6.3 OpenCode headless + streaming

- Запуск остаётся на сервере
- События run_events уже у тебя пишутся в DB → их легко стримить через WS

### 6.4 FTS таблицы

- На сервере это просто SQL запросы
- UI получает результаты через `/api/search`

---

## 7) План эволюции в Cloud/Team (если когда-нибудь потребуется)

## Phase C1 — Multi-user auth (веб)

- Users table + sessions/JWT
- RBAC per project

## Phase C2 — Server-side git + providers

- GitHub App / OAuth
- Webhooks: PR/CI updates (вместо polling)
- Queue: выполнение runs в фоне (BullMQ/Redis)

## Phase C3 — “Agent runner” модель

- Локальный agent (на машине разработчика) подключается к cloud и выполняет задачи в локальном репо
- Cloud хранит только “управление”, а выполнение — на agent’е

> Это уже отдельный продуктовый уровень. Не делай, пока Local Web не принесёт пользу.

---

## 8) Backlog задач (готовый список)

**WEB-01** AppApi facade завершить (projects/boards/tasks/runs/vcs/search)  
**WEB-02** EventBus сделать универсальным (для UI и Web transport)  
**WEB-03** Web server skeleton (fastify/express) + DI core  
**WEB-04** REST endpoints v0 (Projects/Board/Task)  
**WEB-05** WS events stream (runs/pr/task updates)  
**WEB-06** Web UI scaffold (Vite React)  
**WEB-07** Projects screen  
**WEB-08** Board screen + dnd-kit  
**WEB-09** Task screen + runs + artifacts + WS streaming  
**WEB-10** VCS actions (branch/pr) via API  
**WEB-11** Search endpoint (tasks_fts) + UI filter  
**WEB-12** Local security: localhost-only + optional token

---

## 9) Acceptance criteria (что считать “миграция на браузер” готовой)

1) Открываю `http://localhost:PORT` и вижу список проектов
2) Создаю проект (name+path) → появляется в списке
3) Открываю проект → вижу доску с колонками и задачами
4) Перетаскиваю задачу между колонками → сохраняется
5) Открываю задачу → вижу детали, runs, artifacts
6) Запускаю Dev run → вижу streaming событий
7) Создаю ветку и PR из UI → вижу статус/URL

---

## 10) Рекомендуемый “быстрый старт” (самый короткий путь)

1) Сделай **Local Web** без auth, только `localhost`
2) Реализуй **Projects + Board + Task** (как в Ink плане)
3) Стрим событий через WS
4) Дальше уже решай: либо это станет “вторым UI”, либо вырастет в Cloud.
