import {
	v017SystemKeySql,
	v018AppMetricsSql,
	v019TaskBlockedReasonSql,
	v020TaskClosedReasonSql,
	v021WorkflowConfigSql,
	v022WorkflowVisualsSql,
	v023WorkflowSignalsSql,
	v024AgentRoleSessionPreferencesSql,
	v025RunMetadataSql,
	v026DropWorkflowTablesSql,
	v027TaskCommitMessageSql,
	v028TaskQaReportSql,
	v029ModelContextLimitSql,
	v030TaskIsGeneratedSql,
	v031DropDeadTablesSql,
	v032TaskBlockedReasonTextSql,
} from "./sql";
export {
	v017SystemKeySql,
	v018AppMetricsSql,
	v019TaskBlockedReasonSql,
	v020TaskClosedReasonSql,
	v021WorkflowConfigSql,
	v022WorkflowVisualsSql,
	v023WorkflowSignalsSql,
	v024AgentRoleSessionPreferencesSql,
	v025RunMetadataSql,
	v026DropWorkflowTablesSql,
	v027TaskCommitMessageSql,
	v028TaskQaReportSql,
	v029ModelContextLimitSql,
	v030TaskIsGeneratedSql,
	v031DropDeadTablesSql,
	v032TaskBlockedReasonTextSql,
};

export const INIT_DB_SQL = `
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
  color TEXT NOT NULL DEFAULT '',
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
  system_key TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL,
  wip_limit INTEGER,
  color TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- tasks (includes all migrations 1-16)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,

  -- core
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,           -- 'queued' | 'running' | 'done' | 'archived' (migration 2)
  blocked_reason TEXT,
  blocked_reason_text TEXT,
  closed_reason TEXT,
  priority TEXT NOT NULL,         -- 'low' | 'normal' | 'urgent' (migration 4)
  difficulty TEXT NOT NULL DEFAULT 'medium',  -- migration 1
  assigned_agent TEXT,            -- optional (manual), не обязателен при queue

  -- board placement
  board_id TEXT,
  column_id TEXT,
  order_in_column INTEGER DEFAULT 0,

  -- extended
  type TEXT NOT NULL DEFAULT 'chore',
  tags_json TEXT NOT NULL DEFAULT '[]',
  description_md TEXT,

  -- scheduling (migration 3)
  start_date TEXT,
  due_date TEXT,
  estimate_points REAL,
  estimate_hours REAL,
  assignee TEXT,

  -- model assignment (migration 15)
  model_name TEXT,
  commit_message TEXT,
  qa_report TEXT,
  is_generated TEXT NOT NULL DEFAULT '0',

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE SET NULL,
  FOREIGN KEY (column_id) REFERENCES board_columns(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(name)
);

-- seed tags
INSERT OR IGNORE INTO tags (id, name, color, created_at, updated_at) VALUES
  ('tag-logic', 'Logic', '#3b82f6', datetime('now'), datetime('now')),
  ('tag-arch', 'Arch', '#ec4899', datetime('now'), datetime('now')),
  ('tag-core', 'Core', '#84cc16', datetime('now'), datetime('now')),
  ('tag-design', 'Design', '#f59e0b', datetime('now'), datetime('now')),
  ('tag-ui', 'UI', '#a855f7', datetime('now'), datetime('now'));

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
  preferred_model_name TEXT,
  preferred_model_variant TEXT,
  preferred_llm_agent TEXT,
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
  kind TEXT NOT NULL DEFAULT 'task-run',  -- migration 6
  status TEXT NOT NULL,
  session_id TEXT,                        -- migration 7
  started_at TEXT,
  finished_at TEXT,
  error_text TEXT NOT NULL DEFAULT '',
  budget_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
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
  message_id TEXT,                        -- migration 5
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
CREATE INDEX IF NOT EXISTS idx_run_events_message ON run_events(message_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id, created_at);

-- ---------------------------------------------------------------------------
-- task_links
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

CREATE INDEX IF NOT EXISTS idx_links_from ON task_links(from_task_id);
CREATE INDEX IF NOT EXISTS idx_links_to ON task_links(to_task_id);
CREATE INDEX IF NOT EXISTS idx_links_project ON task_links(project_id);

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
-- opencode_models + app_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opencode_models (
  name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  difficulty TEXT NOT NULL DEFAULT 'medium',  -- migration 14
  variants TEXT NOT NULL DEFAULT '',          -- migration 16
  context_limit INTEGER NOT NULL DEFAULT 0   -- migration 29
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

;
`;

export const migrations = [
	{
		version: 16,
		sql: INIT_DB_SQL,
	},
	{
		version: 17,
		sql: v017SystemKeySql,
	},
	{
		version: 18,
		sql: v018AppMetricsSql,
	},
	{
		version: 19,
		sql: v019TaskBlockedReasonSql,
	},
	{
		version: 20,
		sql: v020TaskClosedReasonSql,
	},
	{
		version: 21,
		sql: v021WorkflowConfigSql,
	},
	{
		version: 22,
		sql: v022WorkflowVisualsSql,
	},
	{
		version: 23,
		sql: v023WorkflowSignalsSql,
	},
	{
		version: 24,
		sql: v024AgentRoleSessionPreferencesSql,
	},
	{
		version: 25,
		sql: v025RunMetadataSql,
	},
	{
		version: 26,
		sql: v026DropWorkflowTablesSql,
	},
	{
		version: 27,
		sql: v027TaskCommitMessageSql,
	},
	{
		version: 28,
		sql: v028TaskQaReportSql,
	},
	{
		version: 29,
		sql: v029ModelContextLimitSql,
	},
	{
		version: 30,
		sql: v030TaskIsGeneratedSql,
	},
	{
		version: 31,
		sql: v031DropDeadTablesSql,
	},
	{
		version: 32,
		sql: v032TaskBlockedReasonTextSql,
	},
] as const;

export type Migration = (typeof migrations)[number];
