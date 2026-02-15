export const v017SystemKeySql = `
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
