export const v017SystemKeySql = `
-- Add system_key column to board_columns (idempotent via error handling in code)
ALTER TABLE board_columns ADD COLUMN system_key TEXT NOT NULL DEFAULT '';
`;

export const v018AppMetricsSql = `
CREATE TABLE IF NOT EXISTS app_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_key TEXT NOT NULL UNIQUE,
  metric_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const v019TaskBlockedReasonSql = `
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;
`;

export const v020TaskClosedReasonSql = `
ALTER TABLE tasks ADD COLUMN closed_reason TEXT;
`;

export const v021WorkflowConfigSql = `
-- no-op: workflow tables created here were dropped in v026; config lives in TS fallbacks
`;

export const v022WorkflowVisualsSql = `
-- no-op: workflow tables created in v021 were dropped in v026
`;

export const v023WorkflowSignalsSql = `
-- no-op: workflow tables created in v021 were dropped in v026
`;

export const v024AgentRoleSessionPreferencesSql = `
ALTER TABLE agent_roles
ADD COLUMN preferred_model_name TEXT;

ALTER TABLE agent_roles
ADD COLUMN preferred_model_variant TEXT;

ALTER TABLE agent_roles
ADD COLUMN preferred_llm_agent TEXT;
`;

export const v025RunMetadataSql = `
ALTER TABLE runs
ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
`;

export const v026DropWorkflowTablesSql = `
-- no-op: tables no longer exist; v021-v023 are also no-ops now
`;

export const v027TaskCommitMessageSql = `
ALTER TABLE tasks ADD COLUMN commit_message TEXT;
`;

export const v028TaskQaReportSql = `
ALTER TABLE tasks ADD COLUMN qa_report TEXT;
`;

export const v029ModelContextLimitSql = `
ALTER TABLE opencode_models ADD COLUMN context_limit INTEGER NOT NULL DEFAULT 0;
`;

export const v030TaskIsGeneratedSql = `
ALTER TABLE tasks ADD COLUMN is_generated TEXT NOT NULL DEFAULT '0';
`;

export const v031DropDeadTablesSql = `
-- Drop unused tables (zero references in application code)

-- PM feature never implemented
DROP TABLE IF EXISTS release_items;
DROP TABLE IF EXISTS releases;

-- Plugin system never implemented
DROP TABLE IF EXISTS plugins;

-- Metrics table never used (replaced by in-memory tracking)
DROP TABLE IF EXISTS app_metrics;

-- Scheduling stored directly in tasks table
DROP TABLE IF EXISTS task_schedule;

-- Events tracked via run_events instead
DROP TABLE IF EXISTS task_events;

-- Queue managed in-memory by RunsQueueManager
DROP TABLE IF EXISTS task_queue;
DROP TABLE IF EXISTS role_slots;
DROP TABLE IF EXISTS resource_locks;
`;

export const v032TaskBlockedReasonTextSql = `
ALTER TABLE tasks ADD COLUMN blocked_reason_text TEXT;
`;

export const v033UploadsSql = `
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  stored_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_uploads_task_id ON uploads(task_id);
`;

export const v034ProjectOrderIndexSql = `
ALTER TABLE projects ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;

UPDATE projects
SET order_index = sub.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY updated_at ASC) AS row_num
  FROM projects
) AS sub
WHERE projects.id = sub.id;
`;

export const v035TaskWasQaRejectedSql = `
ALTER TABLE tasks ADD COLUMN was_qa_rejected TEXT NOT NULL DEFAULT '0';
`;

export const v036DropDeadColumnsAndFtsSql = `
-- Drop FTS triggers (write-only, never queried)
DROP TRIGGER IF EXISTS tasks_fts_insert;
DROP TRIGGER IF EXISTS tasks_fts_update;
DROP TRIGGER IF EXISTS tasks_fts_delete;
DROP TRIGGER IF EXISTS runs_fts_insert;
DROP TRIGGER IF EXISTS runs_fts_update;
DROP TRIGGER IF EXISTS runs_fts_delete;
DROP TRIGGER IF EXISTS run_events_fts_insert;
DROP TRIGGER IF EXISTS run_events_fts_update;
DROP TRIGGER IF EXISTS run_events_fts_delete;
DROP TRIGGER IF EXISTS artifacts_fts_insert;
DROP TRIGGER IF EXISTS artifacts_fts_update;
DROP TRIGGER IF EXISTS artifacts_fts_delete;

-- Drop FTS virtual tables
DROP TABLE IF EXISTS tasks_fts;
DROP TABLE IF EXISTS runs_fts;
DROP TABLE IF EXISTS run_events_fts;
DROP TABLE IF EXISTS artifacts_fts;

-- Drop dead columns
ALTER TABLE tasks DROP COLUMN assigned_agent;
ALTER TABLE tasks DROP COLUMN start_date;
ALTER TABLE tasks DROP COLUMN estimate_points;
ALTER TABLE tasks DROP COLUMN estimate_hours;
ALTER TABLE artifacts DROP COLUMN metadata_json;
ALTER TABLE context_snapshots DROP COLUMN hash;
ALTER TABLE board_columns DROP COLUMN wip_limit;
`;
