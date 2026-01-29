# Kanban AI (Electron + OpenCode) — Полная спецификация функционала (Фазы 0–5)

> Версия документа: 0.1 (на основе реализованных фаз 0–5)  
> Дата: 2026-01-29

Этот документ описывает **полный ожидаемый функционал** продукта на текущем этапе (после завершения фазы 5): UI, сущности, флоу, ограничения и нефункциональные требования.

---

## 1) Обзор продукта

Kanban AI — десктопное (Electron) offline-first приложение для управления проектами и задачами, в котором:
- задачи живут на канбан-доске и таймлайне,
- действия над задачами сопровождаются AI-запусками (Runs) через OpenCode/headless,
- изменения по задачам связываются с Git (ветка/коммиты/PR),
- поддерживаются релизы, зависимости, глобальный поиск, аналитика,
- возможна расширяемость через плагины,
- есть экспорт/импорт/бэкапы и базовое hardening.

---

## 2) Термины и сущности

### 2.1 Project
Контейнер: репозиторий, доски, задачи, релизы, настройки.

### 2.2 Board / Column
Kanban-доска с набором колонок, порядок колонок, WIP-лимиты (опционально).

### 2.3 Task
Карточка работы. Минимальные поля:
- title
- description_md
- type (story/bug/spike/chore)
- priority
- tags
- column/status (через column_id)
- порядок в колонке (order_in_column)

Доп. функционал после фазы 5:
- scheduling (start/due, estimates, assignee)
- dependencies (links)
- поиск/аналитика

### 2.4 Run (Job)
Запуск агента над задачей с ролью (BA/Dev/QA и др.).
- status: queued/running/succeeded/failed/canceled
- context snapshot (какой контекст отдали агенту)
- events (лог/сообщения/статус)
- artifacts (результаты: markdown/json/patch)

### 2.5 Agent Role (Preset)
Роль/пресет: инструкции и настройки запуска. Минимум:
- BA (user story + AC)
- Dev (план/пач/изменения)
- QA (test plan)
Плагины могут добавлять новые роли/исполнители.

### 2.6 VCS Link (Task ↔ Branch ↔ PR)
Привязка таски к:
- ветке
- последнему коммиту
- PR (url/id/state)
Отображаются CI/approvals и действуют merge gates.

### 2.7 Release
Релиз проекта:
- список items (таски/PR)
- notes (markdown)
- статус (draft/in_progress/published/canceled)

### 2.8 Dependencies
Связи между задачами:
- blocks / blocked by (минимум)
- дополнительные типы: relates/duplicates (опционально)

### 2.9 Global Search
Поиск по:
- tasks (title/desc/tags)
- runs/events
- artifacts (title/content snippet)
с фильтрами.

### 2.10 Analytics
Дашборд метрик проекта:
- WIP/throughput
- lead time / cycle time
- runs stats (duration/success)
- AI usage/cost (best-effort)

### 2.11 Plugins
Локальные плагины (v1):
- роли (presets)
- executors/providers
- интеграции (минимум)
без UI-плагинов (в фазе 5 — по возможности только логические).

### 2.12 Backup / Export / Import
Экспорт проекта в zip (db + конфиги + артефакты/ссылки), импорт обратно.

---

## 3) Навигация и основные экраны

### 3.1 Sidebar / Top navigation (минимум)
- Projects
- Search
- Timeline
- Releases
- Analytics
- Diagnostics (System Diagnostics)
- Settings (Project Settings / Global Settings) — если вынесено отдельно

> Допускается, что Search/Timeline/Releases/Analytics доступны как табы внутри проекта.

### 3.2 Projects
Функции:
- список проектов
- создание проекта (name, repoPath optional)
- поиск по проектам
- открытие проекта → Board (по умолчанию)

### 3.3 Project Home
Вкладки (минимум на фазе 5):
- Board
- Timeline
- Releases
- Analytics
- Settings

### 3.4 Board (Kanban)
- колонки в горизонтальном скролле
- drag & drop:
  - reorder в колонке
  - move между колонками
- создание/редактирование/удаление колонок
- quick add task в колонке
- отображение карточек с бейджами (type/priority/tags)
- blocked badge (если dependencies требуют)
- корректные empty/loading/error состояния

### 3.5 Task Details (Drawer/Screen)
Секции/вкладки:
- Details: title, description_md, type, priority, tags
- Dependencies: blocks/blocked-by + add/remove
- Runs:
  - список runs
  - Start Run (role dropdown)
  - Cancel/Retry
- Chat/Log:
  - событийный лог (stdout/stderr/message/status)
  - polling/stream
- Artifacts:
  - list + viewers (markdown/json/patch)
- VCS:
  - branch status + diff viewer
  - commit/push
  - create PR
  - PR status panel + merge gates

### 3.6 Runs / Execution log
Требования:
- отдельный run можно открыть и “replay” события
- авто-скролл, jump to end
- фильтр errors only (опционально)

### 3.7 VCS (внутри Task)
Требования:
- Connect repository на уровне проекта (repoPath)
- create branch per task (policy `task/{taskId}-{slug}`)
- checkout branch
- show dirty/clean, ahead/behind
- show diff
- commit all (message)
- push
- create PR (draft toggle)
- polling PR statuses: CI + approvals
- merge button disabled по gate-reasons

### 3.8 Releases
- список релизов
- create release (name, target date optional)
- add tasks/items
- generate notes (run) → markdown
- edit notes → publish
- (опционально) link to provider release

### 3.9 Timeline (Gantt-lite)
- список/полосы задач на шкале времени (week/month)
- фильтры: assignee, tags, status, release
- drag задач по времени (update start/due)
- валидации (due < start, conflicts with dependencies)
- unscheduled tasks list

### 3.10 Global Search
- search bar (global)
- результаты группами: Tasks / Runs / Artifacts
- фильтры (project/status/tags/priority/role/date range)
- быстрый переход: open task, open run, open artifact
- индексация через FTS (triggers) или иное решение

### 3.11 Analytics Dashboard
- overview:
  - WIP по колонкам
  - throughput по неделе/дню
  - lead/cycle time (avg/median)
- runs:
  - count
  - success rate
  - avg duration
- AI:
  - tokens in/out (если доступно)
  - cost estimate
- диапазон дат + фильтры

### 3.12 Diagnostics
- Runtime: platform/arch/electron/chrome/node/app version/mode
- Persistence: db path, size, schema version, counts
- OpenCode connection status
- Main process logs (tail + refresh)

---

## 4) Настройки

### 4.1 Global settings
- plugins directory
- default concurrency for runs
- safe mode toggles
- log verbosity
- backup defaults

### 4.2 Project settings
- repoPath connect
- provider type (github/gitlab)
- repo id (owner/repo)
- merge gates:
  - require CI success
  - required approvals
  - allow merge when draft (обычно false)
- branch naming template
- role presets overrides (если поддержано)
- search indexing limits (max artifact size indexed)

---

## 5) Безопасность и ограничения (Hardening)

### 5.1 Secrets
- токены провайдеров хранить в SecretStore
- redaction в логах (Bearer/sk-/AIza и т.п.)

### 5.2 FS denylist / allowlist
- блокировать чтение: `.env`, `*.key`, `id_rsa`, `secrets.*`, etc.
- ограничить доступ плагинов к FS/процессам

### 5.3 Runs safety
- safe-mode: deny опасных команд
- лимиты:
  - concurrency per provider/model
  - max duration
  - max output size

### 5.4 Data size / performance
- виртуализация списков (board columns, events log, search results)
- pagination для run_events (tail afterTs)
- индексирование артефактов: хранить snippet, лимитировать size

---

## 6) Плагины (v1)

### 6.1 Установка
- локальная папка `plugins/<plugin-id>/`
- manifest.json
- enable/disable + reload

### 6.2 Возможности (минимум)
- registerRolePreset(roleId, preset)
- registerExecutor(executorId, factory)
- registerIntegration(integrationId, configSchema)

### 6.3 Sandbox (обязательно)
- запуск плагинов в изолированном процессе/vm
- запрет прямых системных API без разрешения
- логирование ошибок плагинов в diagnostics

---

## 7) Экспорт/импорт/бэкап

### 7.1 Export
- zip с:
  - db
  - project settings
  - plugins state
  - artifacts (если в файлах) или dump artifacts table в json
- экспорт должен быть воспроизводимым и переносимым

### 7.2 Import
- восстановление как новый projectId (по умолчанию)
- rebind repoPath (если путь другой)
- прогресс/лог импорта

---

## 8) Ключевые пользовательские сценарии (User journeys)

1) **Создать проект → работать с задачами**
- create project
- open board
- add column/task
- drag tasks

2) **BA workflow**
- открыть таску → Run (BA) → получить user story + AC в artifact → прикрепить к описанию

3) **Dev workflow**
- connect repo → create branch
- Run (Dev) (в пределах модели) → изменения/patch → diff review → commit → push → create PR

4) **QA workflow**
- Run (QA) → test plan artifact
- сохранить в задачу/релиз

5) **Release**
- создать release → добавить таски → generate notes → publish

6) **Planning**
- назначить даты/оценки/assignee → таймлайн → зависимости → blocked badges

7) **Search**
- найти таску/артефакт/ран по ключевым словам → открыть источник

8) **Analytics**
- смотреть throughput/WIP/cycle time + runs success rate

9) **Plugins**
- установить плагин с новой ролью → роль появляется в Run dropdown

10) **Backup**
- export → import → данные восстанавливаются

---

## 9) Нефункциональные требования

- Offline-first: всё работает без сети (кроме PR provider API)
- Надёжность: транзакции SQLite, отсутствие потери данных
- Прозрачность: любой run воспроизводим (replay events)
- UX: нет `undefined`, только skeleton/placeholder/ошибки
- Производительность: комфортно при
  - 5–10k tasks
  - 50–200k run events
  - сотнях artifacts
- Observability: diagnostics + main logs tail

---

## 10) Checklist: что должно “точно быть” после фазы 5

### Core
- Projects + Board + Tasks + Columns + DnD + Task Drawer
- Dependencies + Timeline
- Global Search (Tasks/Runs/Artifacts)
- Analytics dashboard
- Runs + Log/Chat + Artifacts + Replay
- OpenCode executor (или mock) + context snapshots + security redaction/denylist

### VCS/PR/Release
- repo connect, branch-per-task, diff, commit, push
- PR create, status polling, merge gates
- Releases: list/create/items/notes generator/publish

### Extensibility & Ops
- Plugins v1 (loader + enable/disable + roles/executors)
- Export/Import zip
- Perf hardening (virtualization/pagination)
- Diagnostics full (runtime/persistence/logs/opencode)

---

## 11) Рекомендации для тестируемости (data-testid)

Чтобы тест‑агент мог надежно “прокликивать” UI, для ключевых элементов добавить `data-testid` (или аналог):
- sidebar.projects, sidebar.search, sidebar.timeline, sidebar.releases, sidebar.analytics, sidebar.diagnostics
- projects.new, projects.search
- board.column.{id}.addTask, board.column.{id}.menu
- task.drawer, task.title, task.save
- runs.start, runs.role.select, runs.cancel, runs.retry
- run.log, run.artifacts.list, artifact.open.{id}
- vcs.branch.create, vcs.commit, vcs.push, pr.create, pr.merge
- release.create, release.addItems, release.generateNotes, release.publish
- search.input, search.filter.status, search.results
- analytics.range, analytics.cards.*
- backup.export, backup.import
- plugins.install, plugins.enable.{id}
