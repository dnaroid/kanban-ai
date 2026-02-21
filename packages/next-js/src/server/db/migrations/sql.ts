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
CREATE TABLE IF NOT EXISTS workflow_statuses (
  status TEXT PRIMARY KEY,
  order_index INTEGER NOT NULL UNIQUE,
  preferred_column_system_key TEXT NOT NULL,
  blocked_reason TEXT,
  closed_reason TEXT
);

CREATE TABLE IF NOT EXISTS workflow_column_templates (
  system_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  order_index INTEGER NOT NULL UNIQUE,
  default_status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_column_allowed_statuses (
  system_key TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (system_key, status),
  FOREIGN KEY (system_key) REFERENCES workflow_column_templates(system_key) ON DELETE CASCADE,
  FOREIGN KEY (status) REFERENCES workflow_statuses(status) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workflow_status_transitions (
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  PRIMARY KEY (from_status, to_status),
  FOREIGN KEY (from_status) REFERENCES workflow_statuses(status) ON DELETE CASCADE,
  FOREIGN KEY (to_status) REFERENCES workflow_statuses(status) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workflow_column_transitions (
  from_system_key TEXT NOT NULL,
  to_system_key TEXT NOT NULL,
  PRIMARY KEY (from_system_key, to_system_key),
  FOREIGN KEY (from_system_key) REFERENCES workflow_column_templates(system_key) ON DELETE CASCADE,
  FOREIGN KEY (to_system_key) REFERENCES workflow_column_templates(system_key) ON DELETE CASCADE
);

INSERT OR IGNORE INTO workflow_statuses
  (status, order_index, preferred_column_system_key, blocked_reason, closed_reason)
VALUES
  ('queued', 0, 'ready', NULL, NULL),
  ('running', 1, 'in_progress', NULL, NULL),
  ('question', 2, 'blocked', 'question', NULL),
  ('paused', 3, 'blocked', 'paused', NULL),
  ('done', 4, 'review', NULL, 'done'),
  ('failed', 5, 'blocked', 'failed', 'failed'),
  ('generating', 6, 'in_progress', NULL, NULL);

INSERT OR IGNORE INTO workflow_column_templates
  (system_key, name, color, order_index, default_status)
VALUES
  ('backlog', 'Backlog', '#6366f1', 0, 'queued'),
  ('ready', 'Ready', '#0ea5e9', 1, 'queued'),
  ('deferred', 'Deferred', '#6b7280', 2, 'queued'),
  ('in_progress', 'In Progress', '#f59e0b', 3, 'running'),
  ('blocked', 'Blocked', '#ef4444', 4, 'paused'),
  ('review', 'Review / QA', '#8b5cf6', 5, 'done'),
  ('closed', 'Closed', '#10b981', 6, 'done');

INSERT OR IGNORE INTO workflow_column_allowed_statuses (system_key, status) VALUES
  ('backlog', 'queued'),
  ('ready', 'queued'),
  ('deferred', 'queued'),
  ('in_progress', 'running'),
  ('in_progress', 'generating'),
  ('blocked', 'question'),
  ('blocked', 'paused'),
  ('blocked', 'failed'),
  ('review', 'done'),
  ('closed', 'done'),
  ('closed', 'failed');

INSERT OR IGNORE INTO workflow_status_transitions (from_status, to_status) VALUES
  ('queued', 'running'),
  ('queued', 'generating'),
  ('queued', 'done'),
  ('queued', 'failed'),
  ('queued', 'paused'),
  ('queued', 'question'),
  ('running', 'queued'),
  ('running', 'paused'),
  ('running', 'question'),
  ('running', 'failed'),
  ('running', 'done'),
  ('question', 'queued'),
  ('question', 'running'),
  ('question', 'paused'),
  ('question', 'failed'),
  ('question', 'done'),
  ('paused', 'queued'),
  ('paused', 'running'),
  ('paused', 'question'),
  ('paused', 'failed'),
  ('paused', 'done'),
  ('done', 'queued'),
  ('done', 'running'),
  ('done', 'failed'),
  ('failed', 'queued'),
  ('failed', 'running'),
  ('failed', 'paused'),
  ('generating', 'queued'),
  ('generating', 'paused'),
  ('generating', 'question'),
  ('generating', 'failed'),
  ('generating', 'done');

INSERT OR IGNORE INTO workflow_column_transitions (from_system_key, to_system_key) VALUES
  ('backlog', 'ready'),
  ('backlog', 'deferred'),
  ('backlog', 'in_progress'),
  ('ready', 'backlog'),
  ('ready', 'deferred'),
  ('ready', 'in_progress'),
  ('deferred', 'backlog'),
  ('deferred', 'ready'),
  ('deferred', 'in_progress'),
  ('in_progress', 'blocked'),
  ('in_progress', 'review'),
  ('in_progress', 'ready'),
  ('in_progress', 'deferred'),
  ('in_progress', 'backlog'),
  ('blocked', 'in_progress'),
  ('blocked', 'review'),
  ('blocked', 'ready'),
  ('blocked', 'deferred'),
  ('blocked', 'backlog'),
  ('blocked', 'closed'),
  ('review', 'in_progress'),
  ('review', 'blocked'),
  ('review', 'ready'),
  ('review', 'closed'),
  ('closed', 'ready'),
  ('closed', 'review'),
  ('closed', 'backlog');
`;
