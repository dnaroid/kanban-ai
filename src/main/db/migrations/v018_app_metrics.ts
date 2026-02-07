export const v018AppMetricsSql = `
CREATE TABLE IF NOT EXISTS app_metrics (
  id TEXT PRIMARY KEY,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_metrics_name_created
  ON app_metrics(metric_name, created_at DESC);
`
