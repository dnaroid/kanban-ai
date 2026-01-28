# Kanban for Headless OpenCode + oh-my-opencode — архитектура

## Архитектурные цели
1) Надёжное выполнение AI‑ранов (очередь, отмена, повтор, лимиты).  
2) Отделение UI от “исполнительного ядра” (чтобы можно было менять UI/движок).  
3) Воспроизводимость: логи, снапшоты контекста, детерминированные артефакты.  
4) Безопасность: секреты в keychain, allowlist директорий, redaction, safe shell.  
5) Offline-first: локальная БД, работа без сети, синхронизация по событиям.

---

## 1) Высокоуровневые компоненты

### Electron App
- **Main process**
  - Orchestrator/Job Runner
  - OpenCode Adapter (headless)
  - Git Adapter (локальные операции)
  - PR Provider Adapter (GitHub/GitLab)
  - Storage (SQLite) + migrations
  - Secrets (OS keychain)
  - File Index/Context Builder (подготовка контекста)
  - IPC API (типизированные сообщения в renderer)
- **Renderer process**
  - UI: Board, Task Details, Chat, Timeline, Search
  - State: query-cache, optimistic updates
  - DnD + виртуализация списков
  - Просмотр диффов/артефактов

### Сервисный слой (логически)
- **Domain layer**: Project/Board/Task/Run/Artifact/Policy.
- **Execution layer**: Queue, concurrency, retry, cancellation, timeouts.
- **Integration layer**: Git/PR/CI/OpenCode adapters.
- **Policy layer**: DoD, merge gates, permissions, budgets.

---

## 2) Взаимодействие с OpenCode (headless)

### Опции интеграции
1) **Spawn CLI process**: Electron main запускает `opencode` как подпроцесс.
   - Плюсы: просто, минимум инфраструктуры.
   - Минусы: сложнее делать стриминг/контроль состояния, надо аккуратно управлять окружением.
2) **MCP server / long-lived agent**: держим процесс OpenCode/MCP поднятым, общаемся по RPC.
   - Плюсы: быстрее, удобнее стриминг, можно кэшировать контексты.
   - Минусы: сложнее жизненный цикл, надо управлять несколькими проектами.

**Рекомендация**: MVP на spawn CLI; затем перейти на long-lived сервер для скорости и лучшего UX.

### Стриминг
- Нужен канал “stdout events → IPC → UI”.
- События сохраняются в БД как **RunEvent** (для replay).

### Контекст‑пакет таски
- Builder собирает:
  - markdown: story + AC + DoD + ссылки,
  - выбранные файлы/диффы,
  - системные правила проекта (политики, ограничения).
- Сохраняем как **ContextSnapshot** (хэш + список ресурсов).

---

## 3) Git/PR/CI интеграции

### GitAdapter (локальные операции)
- Клонирование/подключение репозитория к проекту.
- Создание ветки, коммиты, rebase, merge.
- Вычисление diff (для UI и для контекста агента).

### PRProvider
- Создание/обновление PR (draft → ready).
- Получение статусов review/CI.
- Merge/close.
- Webhooks (если возможно) или polling.

### Merge conflict resolution
- Детектор конфликтов после merge/rebase.
- Генерация контекста:
  - конфликтные файлы,
  - base/ours/theirs,
  - правила проекта.
- Запуск run “MergeResolver”:
  - режим **Suggest** (патч + объяснение)
  - режим **Apply** (применение патча после подтверждения)

---

## 4) Модель данных (SQLite)

### Таблицы (минимальный набор)
- workspaces(id, name, created_at)
- projects(id, workspace_id, name, repo_path, git_provider, remote_url, settings_json)
- boards(id, project_id, name, columns_json, swimlanes_json)
- tasks(id, project_id, board_id, column_id, lane_id, title, description_md, ac_md, dod_md,
       type, priority, tags_json, estimate, due_date, status, created_at, updated_at)
- task_links(id, project_id, from_task_id, to_task_id, link_type)
- runs(id, task_id, role, status, started_at, finished_at, budget_json, context_snapshot_id)
- run_events(id, run_id, ts, event_type, payload_json)
- artifacts(id, run_id, kind, title, content_ref, metadata_json)
- vcs_links(task_id, branch_name, pr_id, pr_url, last_commit, ci_status)

### Индексы
- tasks(project_id, status), tags virtual index (FTS), run_events(run_id, ts).

---

## 5) Очередь задач (Job Runner)

### Функции
- Queue per project + global scheduler.
- Concurrency limits:
  - per provider/model,
  - per project,
  - global.
- Retry policy (exponential backoff).
- Cancellation (user cancels run; graceful terminate child process).
- Timeouts + watchdog.

### Состояния Job
- queued → running → succeeded/failed/canceled.
- Progress events для UI.

---

## 6) IPC контракт (Main ↔ Renderer)

### Принцип
- Renderer не имеет прямого доступа к FS/секретам.
- Только типизированные RPC + event stream.

### Примеры методов
- project.create/open/list
- board.updateColumns
- task.create/update/move
- run.start(role, taskId, mode)
- run.cancel(runId)
- vcs.createBranch(taskId)
- vcs.createPR(taskId)
- vcs.mergePR(taskId)
- artifacts.open(artifactId)

---

## 7) Безопасность

- Секреты (tokens) хранятся в OS keychain.
- Политика директорий:
  - allowlist: какие папки репо доступны агенту,
  - denylist: .env, ключи, сертификаты.
- Redaction: чистим токены/секреты в логах.
- Safe shell: запрет опасных команд (rm -rf, sudo, curl | sh), либо подтверждение.

---

## 8) Расширяемость

### Plugin API (позже)
- Backend plugins:
  - validators (DoD gates),
  - context enrichers,
  - custom operations.
- UI plugins:
  - панели/виджеты,
  - кастом рендер карточек.

---

## 9) Технологический стек (рекомендация)
- Electron + React (или Vue/Svelte по желанию)
- State/query: TanStack Query
- DnD: dnd-kit
- Editor: Monaco/CodeMirror для markdown
- Diff: встроенный diff viewer (Monaco diff) или lightweight diff lib
- DB: SQLite (better-sqlite3) + migrations
- Git: simple-git или nodegit/libgit2 (сначала simple-git)
- Логи: structured logs + storage в run_events
