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
  ('pending', 0, 'ready', NULL, NULL),
  ('running', 1, 'in_progress', NULL, NULL),
  ('question', 2, 'blocked', 'question', NULL),
  ('paused', 3, 'blocked', 'paused', NULL),
  ('done', 4, 'review', NULL, 'done'),
  ('failed', 5, 'blocked', 'failed', 'failed'),
  ('generating', 6, 'in_progress', NULL, NULL);

INSERT OR IGNORE INTO workflow_column_templates
  (system_key, name, color, order_index, default_status)
VALUES
  ('backlog', 'Backlog', '#6366f1', 0, 'pending'),
  ('ready', 'Ready', '#0ea5e9', 1, 'pending'),
  ('deferred', 'Deferred', '#6b7280', 2, 'pending'),
  ('in_progress', 'In Progress', '#f59e0b', 3, 'running'),
  ('blocked', 'Blocked', '#ef4444', 4, 'paused'),
  ('review', 'Review / QA', '#8b5cf6', 5, 'done'),
  ('closed', 'Closed', '#10b981', 6, 'done');

INSERT OR IGNORE INTO workflow_column_allowed_statuses (system_key, status) VALUES
  ('backlog', 'pending'),
  ('ready', 'pending'),
  ('deferred', 'pending'),
  ('in_progress', 'running'),
  ('in_progress', 'generating'),
  ('blocked', 'question'),
  ('blocked', 'paused'),
  ('blocked', 'failed'),
  ('review', 'done'),
  ('closed', 'done'),
  ('closed', 'failed');

INSERT OR IGNORE INTO workflow_status_transitions (from_status, to_status) VALUES
  ('pending', 'running'),
  ('pending', 'generating'),
  ('pending', 'done'),
  ('pending', 'failed'),
  ('pending', 'paused'),
  ('pending', 'question'),
  ('running', 'pending'),
  ('running', 'paused'),
  ('running', 'question'),
  ('running', 'failed'),
  ('running', 'done'),
  ('question', 'pending'),
  ('question', 'running'),
  ('question', 'paused'),
  ('question', 'failed'),
  ('question', 'done'),
  ('paused', 'pending'),
  ('paused', 'running'),
  ('paused', 'question'),
  ('paused', 'failed'),
  ('paused', 'done'),
  ('done', 'pending'),
  ('done', 'running'),
  ('done', 'failed'),
  ('failed', 'pending'),
  ('failed', 'running'),
  ('failed', 'paused'),
  ('generating', 'pending'),
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

export const v022WorkflowVisualsSql = `
ALTER TABLE workflow_statuses ADD COLUMN color TEXT NOT NULL DEFAULT '#94a3b8';
ALTER TABLE workflow_statuses ADD COLUMN icon TEXT NOT NULL DEFAULT 'circle';
ALTER TABLE workflow_column_templates ADD COLUMN icon TEXT NOT NULL DEFAULT 'list';

UPDATE workflow_statuses
SET color = CASE status
  WHEN 'pending' THEN '#64748b'
  WHEN 'running' THEN '#3b82f6'
  WHEN 'question' THEN '#f97316'
  WHEN 'paused' THEN '#eab308'
  WHEN 'done' THEN '#10b981'
  WHEN 'failed' THEN '#ef4444'
  WHEN 'generating' THEN '#8b5cf6'
  ELSE color
END;

UPDATE workflow_statuses
SET icon = CASE status
  WHEN 'pending' THEN 'clock'
  WHEN 'running' THEN 'play'
  WHEN 'question' THEN 'help-circle'
  WHEN 'paused' THEN 'pause'
  WHEN 'done' THEN 'check-circle'
  WHEN 'failed' THEN 'x-circle'
  WHEN 'generating' THEN 'sparkles'
  ELSE icon
END;

UPDATE workflow_column_templates
SET icon = CASE system_key
  WHEN 'backlog' THEN 'list'
  WHEN 'ready' THEN 'check-circle'
  WHEN 'deferred' THEN 'clock'
  WHEN 'in_progress' THEN 'play'
  WHEN 'blocked' THEN 'shield-alert'
  WHEN 'review' THEN 'eye'
  WHEN 'closed' THEN 'archive'
  ELSE icon
END;
`;

export const v023WorkflowSignalsSql = `
CREATE TABLE IF NOT EXISTS workflow_signals (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS workflow_signal_rules (
  key TEXT PRIMARY KEY,
  signal_key TEXT NOT NULL,
  run_kind TEXT,
  run_status TEXT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  FOREIGN KEY (signal_key) REFERENCES workflow_signals(key) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_signal_rules_selector
ON workflow_signal_rules (
  signal_key,
  COALESCE(run_kind, ''),
  COALESCE(run_status, ''),
  COALESCE(from_status, '')
);

INSERT OR IGNORE INTO workflow_signals
  (key, scope, title, description, order_index, is_active)
VALUES
  ('run_started', 'run', 'Run Started', 'Execution run started', 0, 1),
  ('generation_started', 'run', 'Generation Started', 'User story generation run started', 1, 1),
  ('generated', 'run', 'Generated', 'Generation output produced', 2, 1),
  ('done', 'run', 'Done', 'Run completed successfully', 3, 1),
  ('fail', 'run', 'Fail', 'Run failed', 4, 1),
  ('question', 'run', 'Question', 'Run paused waiting for user input', 5, 1),
  ('test_ok', 'run', 'Test OK', 'Tests passed', 6, 1),
  ('test_fail', 'run', 'Test Fail', 'Tests failed', 7, 1),
  ('timeout', 'run', 'Timeout', 'Run timed out', 8, 1),
  ('cancelled', 'run', 'Cancelled', 'Run cancelled', 9, 1),
  ('start_generation', 'user_action', 'Start Generation', 'User starts generation flow', 20, 1),
  ('start_execution', 'user_action', 'Start Execution', 'User starts execution flow', 21, 1),
  ('pause_run', 'user_action', 'Pause Run', 'User pauses execution', 22, 1),
  ('resume_run', 'user_action', 'Resume Run', 'User resumes execution', 23, 1),
  ('cancel_run', 'user_action', 'Cancel Run', 'User cancels execution', 24, 1),
  ('retry_run', 'user_action', 'Retry Run', 'User retries execution', 25, 1),
  ('approve_generation', 'user_action', 'Approve Generation', 'User approves generated story', 26, 1),
  ('reject_generation', 'user_action', 'Reject Generation', 'User rejects generated story', 27, 1),
  ('request_changes', 'user_action', 'Request Changes', 'User requests changes', 28, 1),
  ('mark_test_ok', 'user_action', 'Mark Test OK', 'User marks tests as passed', 29, 1),
  ('mark_test_fail', 'user_action', 'Mark Test Fail', 'User marks tests as failed', 30, 1),
  ('answer_question', 'user_action', 'Answer Question', 'User answers run question', 31, 1),
  ('reopen_task', 'user_action', 'Reopen Task', 'User reopens task', 32, 1);

INSERT OR IGNORE INTO workflow_signal_rules
  (key, signal_key, run_kind, run_status, from_status, to_status)
VALUES
  ('rule-run-started-default', 'run_started', NULL, 'running', NULL, 'running'),
  ('rule-generation-started', 'generation_started', 'task-description-improve', 'running', NULL, 'generating'),
  ('rule-generated-default', 'generated', 'task-description-improve', 'completed', NULL, 'pending'),
  ('rule-done-generated', 'done', 'task-description-improve', 'completed', NULL, 'pending'),
  ('rule-done-default', 'done', NULL, 'completed', NULL, 'done'),
  ('rule-fail-default', 'fail', NULL, 'failed', NULL, 'failed'),
  ('rule-test-ok-default', 'test_ok', NULL, 'completed', NULL, 'done'),
  ('rule-test-fail-default', 'test_fail', NULL, 'failed', NULL, 'failed'),
  ('rule-question-generated', 'question', 'task-description-improve', 'paused', NULL, 'question'),
  ('rule-question-default', 'question', NULL, 'paused', NULL, 'paused'),
  ('rule-timeout-default', 'timeout', NULL, 'timeout', NULL, 'failed'),
  ('rule-cancelled-default', 'cancelled', NULL, 'cancelled', NULL, 'pending'),
  ('rule-user-start-generation', 'start_generation', NULL, NULL, NULL, 'generating'),
  ('rule-user-start-execution', 'start_execution', NULL, NULL, NULL, 'running'),
  ('rule-user-pause-run', 'pause_run', NULL, NULL, NULL, 'paused'),
  ('rule-user-resume-run', 'resume_run', NULL, NULL, NULL, 'running'),
  ('rule-user-cancel-run', 'cancel_run', NULL, NULL, NULL, 'pending'),
  ('rule-user-retry-run', 'retry_run', NULL, NULL, NULL, 'pending'),
  ('rule-user-approve-generation', 'approve_generation', NULL, NULL, NULL, 'pending'),
  ('rule-user-reject-generation', 'reject_generation', NULL, NULL, NULL, 'failed'),
  ('rule-user-request-changes', 'request_changes', NULL, NULL, NULL, 'question'),
  ('rule-user-mark-test-ok', 'mark_test_ok', NULL, NULL, NULL, 'done'),
  ('rule-user-mark-test-fail', 'mark_test_fail', NULL, NULL, NULL, 'failed'),
  ('rule-user-answer-question', 'answer_question', NULL, NULL, NULL, 'pending'),
  ('rule-user-reopen-task', 'reopen_task', NULL, NULL, NULL, 'pending');
`;
