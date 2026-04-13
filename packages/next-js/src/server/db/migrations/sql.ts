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
