# PHASE 5 — Productization: Timeline/Dependencies + Search/Analytics + Plugins + Hardening (план для агента GLM 4.7)

> Цель фазы 5: превратить “рабочий прототип” в **удобный продукт** для ежедневной работы:
> - продвинутое управление задачами (таймлайн, зависимости, оценки)
> - мощный поиск (таски + runs + артефакты + диффы)
> - аналитика (скорость, WIP, lead/cycle time, AI cost)
> - расширяемость (плагинная архитектура: роли/провайдеры/интеграции)
> - надёжность (backup/export, миграции, perf, security hardening)
>
> В конце пользователь должен уметь: планировать релиз на таймлайне, связывать зависимости, находить всё поиском,
> видеть метрики и стоимость AI, подключать плагины/интеграции без переписывания ядра.

---

## 0) Definition of Done

Фаза 5 завершена, если:

1) ✅ Есть **Timeline** (Gantt-lite) на уровне проекта/релиза:
   - даты/оценки/назначения
   - перетаскивание задач по времени (MVP)
2) ✅ Есть **Dependencies**:
   - блокирующие связи (blocks/blocked by)
   - визуализация + валидации (циклы/битые ссылки)
3) ✅ Есть **Global Search**:
   - поиск по таскам (title/desc/tags)
   - поиск по runs/events/artifacts
   - фильтры: проект/статус/теги/приоритет/роль/диапазон дат
4) ✅ Есть **Analytics Dashboard**:
   - WIP, throughput, lead time, cycle time
   - runs: success rate, avg duration
   - AI: токены/стоимость/скорость (если доступно)
5) ✅ Есть **Plugins v1**:
   - подключение “role presets” и “run executors/providers” как плагинов
   - включение/выключение в настройках
6) ✅ Есть **Backup/Export/Import**:
   - экспорт проекта (DB + конфиги + ссылки на артефакты)
   - импорт обратно
7) ✅ Hardening:
   - rate limits / concurrency limits per provider
   - redaction/denylist расширены
   - быстрый запуск/производительность (без лагов при 5–10k задач и 50k events)
8) ✅ Тесты:
   - dependencies validator
   - search индекс/запросы
   - analytics расчёты
   - plugin loader sandbox

---

## 1) Scope / Non-scope

### Входит
- Timeline + dependencies
- Search + индексация (SQLite FTS или внешний индекс)
- Analytics + агрегаты
- Plugin system v1 (локальные плагины)
- Backup/export/import
- Perf + security hardening

### Не входит (будущие фазы)
- Многопользовательская синхронизация/коллаборация (сервер)
- Полный “IDE внутри” (пока не надо)
- Комплексные интеграции типа Jira/Linear (можно плагинами позже)

---

## 2) Решения (зафиксировать в `docs/decisions/PHASE5.md`)

1) Поиск:
   - MVP: **SQLite FTS5** (простая установка, оффлайн)
   - позже: внешний индексер/Qdrant (если потребуется)
2) Timeline:
   - Gantt-lite: дни/недели, без сложного критического пути (пока)
3) Analytics:
   - часть метрик хранить как агрегаты (для скорости)
4) Plugins:
   - форматы: local folder + manifest.json
   - sandbox: ограничение API плагинов, запрет прямого FS без разрешений
5) Backup:
   - формат: zip (db + json configs + artifacts текст)
6) Cost:
   - best-effort (если провайдер отдаёт usage) + fallback estimates

---

## 3) DB: миграции (новые сущности)

### 3.1 Dependencies
#### `task_links`
- `id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `from_task_id TEXT NOT NULL`
- `to_task_id TEXT NOT NULL`
- `link_type TEXT NOT NULL` (`blocks|relates|duplicates`)
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Индексы:
- `idx_links_from` on `(from_task_id)`
- `idx_links_to` on `(to_task_id)`
- `idx_links_project` on `(project_id)`

### 3.2 Scheduling (timeline)
#### `task_schedule`
- `task_id TEXT PRIMARY KEY`
- `start_date TEXT NULL` (YYYY-MM-DD)
- `due_date TEXT NULL`
- `estimate_points REAL NOT NULL DEFAULT 0`
- `estimate_hours REAL NOT NULL DEFAULT 0`
- `assignee TEXT NOT NULL DEFAULT ''` (позже можно таблицу users)
- `updated_at TEXT NOT NULL`

### 3.3 Search (FTS)
Вариант A (FTS5 таблицы):
- `tasks_fts` (title, description, tags)
- `runs_fts` (role, status, context summary)
- `artifacts_fts` (title, content snippet)

Плюс triggers для sync.

### 3.4 Analytics aggregates (ускорение)
#### `analytics_daily`
- `id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `day TEXT NOT NULL` (YYYY-MM-DD)
- `wip_count INTEGER NOT NULL`
- `done_count INTEGER NOT NULL`
- `created_count INTEGER NOT NULL`
- `avg_cycle_time_hours REAL NOT NULL`
- `runs_count INTEGER NOT NULL`
- `runs_success_count INTEGER NOT NULL`
- `runs_avg_duration_sec REAL NOT NULL`
- `ai_tokens_in INTEGER NOT NULL DEFAULT 0`
- `ai_tokens_out INTEGER NOT NULL DEFAULT 0`
- `ai_cost_usd REAL NOT NULL DEFAULT 0`
- `updated_at TEXT NOT NULL`

> MVP можно сначала считать “на лету”, а таблицу aggregates добавить как оптимизацию (если тормозит).

### 3.5 Plugin registry
#### `plugins`
- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `version TEXT NOT NULL`
- `enabled INTEGER NOT NULL` (0/1)
- `type TEXT NOT NULL` (`role|executor|integration|ui`)
- `manifest_json TEXT NOT NULL`
- `installed_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

---

## 4) Dependency engine

### 4.1 Валидации
- запрет циклов (DAG check)
- запрет self-link
- проверка существования задач
- optional: cross-project links (feature flag)

### 4.2 UI
- в Task details: секция Dependencies:
  - “Blocks” (эта задача блокирует)
  - “Blocked by” (эту задачу блокируют)
  - “Add dependency” (поиск задач)
- на Board: бейдж “Blocked” и tooltip “blocked by TASK-123”

---

## 5) Timeline (Gantt-lite)

### 5.1 Данные
- берём `task_schedule.start_date/due_date/estimate_*`
- для release: суммарный горизонт + фильтры по статусу/тегам

### 5.2 UI MVP
- Timeline screen:
  - переключатель масштабов: Week / Month
  - полоски задач на шкале
  - drag по оси времени (меняет start/due)
  - фильтры: assignee, tags, status, release

### 5.3 Правила (MVP)
- если у задачи нет дат — не показывать или показывать “unscheduled”
- warnings:
  - due < start
  - due раньше зависимостей (если blocked by)

---

## 6) Global Search

### 6.1 Query API
- простая строка + filters:
  - projectId
  - entity: task/run/artifact
  - date range
  - status/role
  - tags/priority

### 6.2 UI
- search bar в top header
- results:
  - grouped: Tasks / Runs / Artifacts
  - быстрые действия: open task, open run, open artifact
- подсветка совпадений (optional)

### 6.3 Индексация
- FTS triggers на insert/update/delete
- для больших текстов артефактов хранить snippet (или только первые N KB)

---

## 7) Analytics Dashboard

### 7.1 Метрики (MVP)
- Board:
  - WIP count (по колонкам “In progress”)
  - throughput (done per day/week)
- Task:
  - lead time: created → done
  - cycle time: in-progress → done (если есть события)
- Runs:
  - success rate
  - avg duration
- AI:
  - tokens in/out
  - cost (если доступно) или estimates

### 7.2 Источник данных
- события изменения таски:
  - нужно добавить `task_events` (если ещё нет) или вычислять по `updated_at` и transitions
- для MVP можно:
  - хранить `task_status_changed_at` при перемещении колонок
  - записывать `task_events` при переходах (лучше)

---

## 8) Plugin system v1

### 8.1 Формат плагина
Папка:
```
plugins/<plugin-id>/
  manifest.json
  index.js (или dist)
```

### 8.2 Manifest (MVP)
- id, name, version, type
- permissions:
  - canRegisterRoles
  - canRegisterExecutors
  - canCallNetwork (false по умолчанию)
- entrypoint

### 8.3 Plugin API (минимум)
- registerRolePreset(roleId, preset)
- registerExecutor(executorId, factory)
- registerIntegration(integrationId, configSchema)

> UI плагины — позже (слишком рискованно). В фазе 5: только “логические” плагины.

### 8.4 Sandbox/безопасность
- плагины выполняются в отдельном процессе (или vm) с ограниченным API
- запрет прямого доступа к FS/child_process (кроме разрешённых операций через прокси)

---

## 9) Backup / Export / Import

### 9.1 Export (zip)
- `app.db`
- `project.json` (настройки, provider repoId, gates)
- `plugins.json` (включенные плагины)
- artifacts (если вынесены в файлы) или export таблицы artifacts в json

### 9.2 Import
- распаковать в новый projectId или поверх (выбрать режим)
- пересчитать пути (repoPath может быть другой → запросить новый путь)

### 9.3 UI
- Project Settings → Backup:
  - Export
  - Import

---

## 10) IPC (минимум)

### Dependencies
- `deps.list({ taskId })`
- `deps.add({ fromTaskId, toTaskId, type })`
- `deps.remove({ linkId })`

### Schedule/Timeline
- `schedule.get({ projectId }) -> tasks with schedule`
- `schedule.update({ taskId, startDate, dueDate, estimateHours, points, assignee })`

### Search
- `search.query({ q, filters }) -> results[]`

### Analytics
- `analytics.getOverview({ projectId, range })`
- `analytics.getRunStats({ projectId, range })`

### Plugins
- `plugins.list()`
- `plugins.install({ path })` (локальный путь)
- `plugins.enable({ pluginId, enabled })`
- `plugins.reload()`

### Backup
- `backup.exportProject({ projectId, toPath })`
- `backup.importProject({ zipPath })`

---

## 11) Тестирование (минимум)

### Unit
- cycle detection (deps)
- timeline validation (dates)
- search query builder (filters)
- analytics calculators (lead/cycle)
- plugin manifest validator

### Integration
- FTS triggers работают: insert task → search finds it
- export/import: roundtrip без потерь
- plugin registerRolePreset работает и появляется в UI

---

## 12) План работ (тикеты фазы 5)

> Правило: один тикет = один небольшой коммит.  
> После тикета: список файлов + команды проверки + краткий итог.

### T5.1 — DB миграции: task_links + task_schedule + (опц.) task_events
Коммит: `feat(db): add deps and schedule tables`

### T5.2 — Dependency engine + IPC + UI в Task details
Коммит: `feat(deps): manage task dependencies`

### T5.3 — Timeline screen skeleton + schedule IPC
Коммит: `feat(timeline): schedule api and timeline screen`

### T5.4 — Timeline drag&drop update + validations
Коммит: `feat(timeline): drag scheduling with validations`

### T5.5 — Search v1 (FTS5) + индексация tasks
Коммит: `feat(search): tasks fts index and query`

### T5.6 — Search расширение: runs/events/artifacts + UI results
Коммит: `feat(search): global search across tasks/runs/artifacts`

### T5.7 — Analytics v1: WIP/throughput + runs stats
Коммит: `feat(analytics): dashboard v1`

### T5.8 — AI cost tracking (best-effort) + rate limits per provider
Коммит: `feat(ai): cost tracking and rate limits`

### T5.9 — Plugins v1: loader + registry + enable/disable
Коммит: `feat(plugins): plugin loader v1`

### T5.10 — Plugins: registerRolePreset/registerExecutor + UI for roles list
Коммит: `feat(plugins): role/executor registration`

### T5.11 — Backup/export/import (zip) + UI
Коммит: `feat(backup): export/import project`

### T5.12 — Perf pass: pagination/virtualization + indexing limits
Коммит: `perf: handle large datasets in board/search/logs`

### T5.13 — Tests: deps/search/backup/plugins
Коммит: `test: phase5 coverage`

---

## 13) Команды проверки
- После T5.1, T5.6, T5.9, T5.11, T5.13:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Каждый тикет:
  - `pnpm dev`

---

## 14) UX проверка фазы 5 (user acceptance)
1) Добавить зависимости: Task B blocked by Task A → UI показывает “Blocked”  
2) Расставить даты на таймлайне, перетащить задачу → даты сохраняются  
3) Поиск: найти по слову из artifact → открыть run/artifact  
4) Dashboard показывает WIP/throughput и статистику runs  
5) Подключить плагин с новой ролью → роль появилась в Run dropdown  
6) Export project → Import → данные восстановились

---

## 15) Инструкции агенту (вставить в prompt)
- Делай тикеты T5.1–T5.13 маленькими коммитами.  
- Сначала deps/timeline, затем search, потом analytics, потом plugins/backup.  
- Для больших списков используй virtualization/pagination.  
- Плагины запускай в sandbox и не давай им прямой доступ к FS/процессам.
