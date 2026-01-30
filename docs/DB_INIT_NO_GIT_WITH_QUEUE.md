# Kanban AI — Консолидированная схема БД без Git/VCS + с TaskQueueManager

> Дата: 2026-01-30  
> Цель: выкинуть из **INIT_DB_SQL** и “fresh install” схемы всё, что относится к Git/PR/merge, и добавить основы под **очередь задач** (слоты ролей + workspace-lock).

---

## 1) Что именно выкидываем (DB + поля)

### 1.1 Таблицы (удаляем из INIT)
- `vcs_projects`
- `task_vcs_links`
- `pull_requests`
- `merge_conflicts`
- `auto_merge_settings`

### 1.2 Поля в `tasks` (удаляем из “final form”)
- `branch_name`
- `pr_number`

> Если у тебя есть “старые базы”, SQLite не умеет DROP COLUMN. Для чистого удаления колонок нужен перенос: создать новую таблицу `tasks_new`, скопировать поля, переименовать. Для **fresh install** достаточно обновить INIT.

### 1.3 Релизы
Релизы можно оставить как PM-фичу, но убрать зависимость от PR:
- в `release_items` убрать `pr_id`

---

## 2) Добавляем под новый флоу (TaskQueueManager)

### 2.1 `task_queue`
Хранит стадию пайплайна (BA/FE/BE/QA), состояние (queued/running/waiting_user/failed/paused), приоритет очереди.

### 2.2 `role_slots`
Максимальная параллельность по ролям.

### 2.3 `resource_locks`
TTL-локи ресурсов (например `project:<id>:workspace`), чтобы FE/BE/QA не ломали друг другу рабочую директорию.

---

## 3) Обновлённый `INIT_DB_SQL` (без Git/VCS, с очередью)

> Вставь целиком вместо текущего `INIT_DB_SQL`.

```sql
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- schema_migrations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- projects, boards, columns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS board_columns (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  wip_limit INTEGER,
  color TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- tasks (final form; NO git columns)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,

  -- core
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,           -- e.g. 'open' | 'done' | 'archived' (или как у тебя принято)
  priority TEXT NOT NULL,         -- e.g. 'p0'|'p1'|'p2'|'p3'
  assigned_agent TEXT,            -- optional (manual), не обязателен при queue

  -- board placement
  board_id TEXT,
  column_id TEXT,
  order_in_column INTEGER DEFAULT 0,

  -- extended
  type TEXT NOT NULL DEFAULT 'task',
  tags_json TEXT NOT NULL DEFAULT '[]',
  description_md TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE SET NULL,
  FOREIGN KEY (column_id) REFERENCES board_columns(id) ON DELETE SET NULL
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_board_id ON tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks(column_id);
CREATE INDEX IF NOT EXISTS idx_boards_project ON boards(project_id);
CREATE INDEX IF NOT EXISTS idx_columns_board ON board_columns(board_id, order_index);
CREATE INDEX IF NOT EXISTS idx_tasks_board_col ON tasks(board_id, column_id, order_in_column);

-- ---------------------------------------------------------------------------
-- agent_roles, context_snapshots, runs, run_events, artifacts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  preset_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS context_snapshots (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'execute',
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  error_text TEXT NOT NULL DEFAULT '',
  budget_json TEXT NOT NULL DEFAULT '{}',
  context_snapshot_id TEXT NOT NULL,

  ai_tokens_in INTEGER NOT NULL DEFAULT 0,
  ai_tokens_out INTEGER NOT NULL DEFAULT 0,
  ai_cost_usd REAL NOT NULL DEFAULT 0,
  duration_sec REAL NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES agent_roles(id),
  FOREIGN KEY (context_snapshot_id) REFERENCES context_snapshots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runs_task ON runs(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_run ON run_events(run_id, ts);
CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id, created_at);

-- ---------------------------------------------------------------------------
-- releases (PM feature) — keep, but NO PR linkage
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  target_date TEXT,
  notes_md TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS release_items (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'planned',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_releases_project ON releases(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_release_items_release ON release_items(release_id, state);

-- ---------------------------------------------------------------------------
-- task_links, task_schedule, task_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  from_task_id TEXT NOT NULL,
  to_task_id TEXT NOT NULL,
  link_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (from_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (to_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_schedule (
  task_id TEXT PRIMARY KEY,
  start_date TEXT NULL,
  due_date TEXT NULL,
  estimate_points REAL NOT NULL DEFAULT 0,
  estimate_hours REAL NOT NULL DEFAULT 0,
  assignee TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_links_from ON task_links(from_task_id);
CREATE INDEX IF NOT EXISTS idx_links_to ON task_links(to_task_id);
CREATE INDEX IF NOT EXISTS idx_links_project ON task_links(project_id);
CREATE INDEX IF NOT EXISTS idx_schedule_task ON task_schedule(task_id);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, ts);

-- ---------------------------------------------------------------------------
-- TaskQueueManager (NEW)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_queue (
  task_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,      -- queued|running|waiting_user|paused|done|failed
  stage TEXT NOT NULL,      -- ba|fe|be|qa|kb (или твои ключи ролей)
  priority INTEGER NOT NULL,
  enqueued_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT NOT NULL DEFAULT '',
  locked_by TEXT NOT NULL DEFAULT '',
  locked_until TEXT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_queue_state_prio ON task_queue(state, priority, updated_at);
CREATE INDEX IF NOT EXISTS idx_task_queue_stage_state ON task_queue(stage, state, priority);

CREATE TABLE IF NOT EXISTS role_slots (
  role_key TEXT PRIMARY KEY,       -- ba|fe|be|qa
  max_concurrency INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_locks (
  lock_key TEXT PRIMARY KEY,       -- e.g. project:<id>:workspace
  owner TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resource_locks_expires ON resource_locks(expires_at);

-- ---------------------------------------------------------------------------
-- FTS
-- ---------------------------------------------------------------------------

-- tasks_fts
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  task_id UNINDEXED,
  title,
  description,
  tags
);

CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON tasks
BEGIN
  INSERT INTO tasks_fts (task_id, title, description, tags)
  VALUES (
    new.id,
    new.title,
    COALESCE(new.description_md, new.description, ''),
    COALESCE(new.tags_json, '')
  );
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON tasks
BEGIN
  UPDATE tasks_fts
  SET
    title = new.title,
    description = COALESCE(new.description_md, new.description, ''),
    tags = COALESCE(new.tags_json, '')
  WHERE task_id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_delete AFTER DELETE ON tasks
BEGIN
  DELETE FROM tasks_fts WHERE task_id = old.id;
END;

-- runs_fts
CREATE VIRTUAL TABLE IF NOT EXISTS runs_fts USING fts5(
  run_id UNINDEXED,
  role_id,
  status,
  error_text
);

CREATE TRIGGER IF NOT EXISTS runs_fts_insert AFTER INSERT ON runs
BEGIN
  INSERT INTO runs_fts (run_id, role_id, status, error_text)
  VALUES (new.id, new.role_id, new.status, COALESCE(new.error_text, ''));
END;

CREATE TRIGGER IF NOT EXISTS runs_fts_update AFTER UPDATE ON runs
BEGIN
  UPDATE runs_fts
  SET role_id = new.role_id,
      status = new.status,
      error_text = COALESCE(new.error_text, '')
  WHERE run_id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS runs_fts_delete AFTER DELETE ON runs
BEGIN
  DELETE FROM runs_fts WHERE run_id = old.id;
END;

-- run_events_fts
CREATE VIRTUAL TABLE IF NOT EXISTS run_events_fts USING fts5(
  run_id UNINDEXED,
  event_type,
  payload
);

CREATE TRIGGER IF NOT EXISTS run_events_fts_insert AFTER INSERT ON run_events
BEGIN
  INSERT INTO run_events_fts (run_id, event_type, payload)
  VALUES (new.run_id, new.event_type, COALESCE(new.payload_json, ''));
END;

CREATE TRIGGER IF NOT EXISTS run_events_fts_update AFTER UPDATE ON run_events
BEGIN
  UPDATE run_events_fts
  SET event_type = new.event_type,
      payload = COALESCE(new.payload_json, '')
  WHERE run_id = new.run_id AND rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS run_events_fts_delete AFTER DELETE ON run_events
BEGIN
  DELETE FROM run_events_fts WHERE run_id = old.run_id AND rowid = old.rowid;
END;

-- artifacts_fts
CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(
  artifact_id UNINDEXED,
  title,
  content
);

CREATE TRIGGER IF NOT EXISTS artifacts_fts_insert AFTER INSERT ON artifacts
BEGIN
  INSERT INTO artifacts_fts (artifact_id, title, content)
  VALUES (new.id, new.title, COALESCE(new.content, ''));
END;

CREATE TRIGGER IF NOT EXISTS artifacts_fts_update AFTER UPDATE ON artifacts
BEGIN
  UPDATE artifacts_fts
  SET title = new.title,
      content = COALESCE(new.content, '')
  WHERE artifact_id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS artifacts_fts_delete AFTER DELETE ON artifacts
BEGIN
  DELETE FROM artifacts_fts WHERE artifact_id = old.id;
END;

-- ---------------------------------------------------------------------------
-- plugins + app_settings + opencode_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

CREATE TABLE IF NOT EXISTS opencode_sessions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  directory TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_opencode_sessions_run ON opencode_sessions(run_id);
CREATE INDEX IF NOT EXISTS idx_opencode_sessions_status ON opencode_sessions(status);
```

---

## 4) Как должен выглядеть `migrations` для fresh install (консолидированно)

Если ты действительно хочешь “одна миграция создаёт всё” (удобно для нового DB файла):

```ts
export const migrations = [
  {
    version: 0,
    sql: INIT_DB_SQL,
  },
] as const

export type Migration = (typeof migrations)[number]
```

> Если твой мигратор ожидает, что `schema_migrations` создаётся отдельной миграцией (version 0), оставь старую схему:  
> - v0: `schema_migrations`  
> - v1: `INIT_DB_SQL` (без блока schema_migrations)  
> Но по сути это косметика.

---

## 5) Zod-структуры, которые нужно поправить (минимальный список)

### 5.1 `Task` (убрать git-поля)
- удалить: `branch_name`, `pr_number`
- оставить: `assigned_agent` (или переименовать позже)

### 5.2 Добавить схемы очереди
- `TaskQueueRow`
- `RoleSlotRow`
- `ResourceLockRow`

Пример заготовки:

```ts
import { z } from 'zod'

export const TaskQueueState = z.enum(['queued','running','waiting_user','paused','done','failed'])
export const TaskQueueStage = z.enum(['ba','fe','be','qa','kb'])

export const TaskQueueRow = z.object({
  task_id: z.string(),
  state: TaskQueueState,
  stage: TaskQueueStage,
  priority: z.number().int(),
  enqueued_at: z.string(),
  updated_at: z.string(),
  last_error: z.string(),
  locked_by: z.string(),
  locked_until: z.string().nullable(),
})

export const RoleSlotRow = z.object({
  role_key: z.enum(['ba','fe','be','qa']),
  max_concurrency: z.number().int().nonnegative(),
  updated_at: z.string(),
})

export const ResourceLockRow = z.object({
  lock_key: z.string(),
  owner: z.string(),
  acquired_at: z.string(),
  expires_at: z.string(),
})
```

---

## 6) Что делать со “старыми” базами

Если уже есть пользовательская база с git-таблицами:
- **вариант A (рекоменд.)**: создать новый DB файл с новой схемой, мигрировать данные выборочно:
  - переносим: projects, boards, board_columns, tasks, agent_roles, context_snapshots, runs, run_events, artifacts, task_links, task_schedule, task_events, plugins, app_settings, opencode_sessions, releases, release_items
  - не переносим: vcs/pr/merge таблицы
- **вариант B**: оставить старые таблицы, но не использовать (быстро, но “грязно”).

---

## 7) Замечания по полям

1) `tasks.status` и `column_id` могут дублировать “состояние”.  
   - Если основной источник правды — board columns, `status` лучше сделать высокоуровневым (`open/done/archived`) или позже убрать.

2) `assigned_agent` при очереди можно заменить на:
   - `preferred_stage` (fe/be/qa/ba) или `preferred_agent_role_id`, но это не обязательно для старта.

