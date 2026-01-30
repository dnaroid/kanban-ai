export const INIT_DB_SQL = `
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- schema_migrations (version 0)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- projects, tasks (final form after v1..v3 + later additions)
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,

  -- legacy/task core
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  assigned_agent TEXT,
  branch_name TEXT,
  pr_number INTEGER,

  -- board placement (v2)
  board_id TEXT,
  column_id TEXT,
  order_in_column INTEGER DEFAULT 0,

  -- extended fields (v2)
  type TEXT NOT NULL DEFAULT 'task',
  tags_json TEXT NOT NULL DEFAULT '[]',
  description_md TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- indexes (v1..v3)
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_board_id ON tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks(column_id);
CREATE INDEX IF NOT EXISTS idx_boards_project ON boards(project_id);
CREATE INDEX IF NOT EXISTS idx_columns_board ON board_columns(board_id, order_index);
CREATE INDEX IF NOT EXISTS idx_tasks_board_col ON tasks(board_id, column_id, order_in_column);

-- ---------------------------------------------------------------------------
-- agent_roles, context_snapshots, runs, run_events, artifacts (v4 + v11)
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
-- VCS / PR (v5)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vcs_projects (
  project_id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL,
  remote_url TEXT NOT NULL DEFAULT '',
  default_branch TEXT NOT NULL DEFAULT 'main',
  provider_type TEXT NOT NULL DEFAULT '',
  provider_repo_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_vcs_links (
  task_id TEXT PRIMARY KEY,
  branch_name TEXT NOT NULL DEFAULT '',
  pr_id TEXT NOT NULL DEFAULT '',
  pr_url TEXT NOT NULL DEFAULT '',
  last_commit_sha TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pull_requests (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  provider_pr_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  url TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  head_branch TEXT NOT NULL,
  ci_status TEXT NOT NULL DEFAULT 'unknown',
  approvals_count INTEGER NOT NULL DEFAULT 0,
  required_approvals INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_vcs_branch ON task_vcs_links(branch_name);
CREATE INDEX IF NOT EXISTS idx_pr_task ON pull_requests(task_id, updated_at);

-- ---------------------------------------------------------------------------
-- merge_conflicts, releases, release_items (v6)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merge_conflicts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  pr_id TEXT NOT NULL,
  status TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  head_branch TEXT NOT NULL,
  conflict_files_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  target_date TEXT,
  notes_md TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS release_items (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  pr_id TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'planned',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conflicts_task ON merge_conflicts(task_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_releases_project ON releases(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_release_items_release ON release_items(release_id, state);

-- ---------------------------------------------------------------------------
-- auto_merge_settings (v7)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auto_merge_settings (
  project_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'merge',
  require_ci_success INTEGER NOT NULL DEFAULT 1,
  required_approvals INTEGER NOT NULL DEFAULT 1,
  require_no_conflicts INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- task_links, task_schedule, task_events (v8)
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
-- FTS (v9, v10)
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
-- plugins (v12)
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
`

export const migrations = [
  {
    version: 0,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        assigned_agent TEXT,
        branch_name TEXT,
        pr_number INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `,
  },
  {
    version: 2,
    sql: `
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
      );

      ALTER TABLE tasks ADD COLUMN board_id TEXT;
      ALTER TABLE tasks ADD COLUMN column_id TEXT;
      ALTER TABLE tasks ADD COLUMN order_in_column INTEGER DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN type TEXT DEFAULT 'task';
      ALTER TABLE tasks ADD COLUMN tags_json TEXT DEFAULT '[]';
      ALTER TABLE tasks ADD COLUMN description_md TEXT;

      CREATE INDEX IF NOT EXISTS idx_tasks_board_id ON tasks(board_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks(column_id);
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE board_columns ADD COLUMN wip_limit INTEGER;
      
      CREATE INDEX IF NOT EXISTS idx_boards_project ON boards(project_id);
      CREATE INDEX IF NOT EXISTS idx_columns_board ON board_columns(board_id, order_index);
      CREATE INDEX IF NOT EXISTS idx_tasks_board_col ON tasks(board_id, column_id, order_in_column);
    `,
  },
  {
    version: 4,
    sql: `
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
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS vcs_projects (
        project_id TEXT PRIMARY KEY,
        repo_path TEXT NOT NULL,
        remote_url TEXT NOT NULL DEFAULT '',
        default_branch TEXT NOT NULL DEFAULT 'main',
        provider_type TEXT NOT NULL DEFAULT '',
        provider_repo_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_vcs_links (
        task_id TEXT PRIMARY KEY,
        branch_name TEXT NOT NULL DEFAULT '',
        pr_id TEXT NOT NULL DEFAULT '',
        pr_url TEXT NOT NULL DEFAULT '',
        last_commit_sha TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS pull_requests (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        provider_pr_id TEXT NOT NULL,
        title TEXT NOT NULL,
        state TEXT NOT NULL,
        url TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        head_branch TEXT NOT NULL,
        ci_status TEXT NOT NULL DEFAULT 'unknown',
        approvals_count INTEGER NOT NULL DEFAULT 0,
        required_approvals INTEGER NOT NULL DEFAULT 0,
        last_synced_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_task_vcs_branch ON task_vcs_links(branch_name);
      CREATE INDEX IF NOT EXISTS idx_pr_task ON pull_requests(task_id, updated_at);
    `,
  },
  {
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS merge_conflicts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        pr_id TEXT NOT NULL,
        status TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        head_branch TEXT NOT NULL,
        conflict_files_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS releases (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        target_date TEXT,
        notes_md TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS release_items (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        pr_id TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT 'planned',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conflicts_task ON merge_conflicts(task_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_releases_project ON releases(project_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_release_items_release ON release_items(release_id, state);
    `,
  },
  {
    version: 7,
    sql: `
      CREATE TABLE IF NOT EXISTS auto_merge_settings (
        project_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        method TEXT NOT NULL DEFAULT 'merge',
        require_ci_success INTEGER NOT NULL DEFAULT 1,
        required_approvals INTEGER NOT NULL DEFAULT 1,
        require_no_conflicts INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 8,
    sql: `
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
    `,
  },
  {
    version: 9,
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
        task_id UNINDEXED,
        title,
        description,
        tags
      );

      INSERT INTO tasks_fts (task_id, title, description, tags)
      SELECT
        id,
        title,
        COALESCE(description_md, description, ''),
        COALESCE(tags_json, '')
      FROM tasks
      WHERE id NOT IN (SELECT task_id FROM tasks_fts);

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
    `,
  },
  {
    version: 10,
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS runs_fts USING fts5(
        run_id UNINDEXED,
        role_id,
        status,
        error_text
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS run_events_fts USING fts5(
        run_id UNINDEXED,
        event_type,
        payload
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(
        artifact_id UNINDEXED,
        title,
        content
      );

      INSERT INTO runs_fts (run_id, role_id, status, error_text)
      SELECT id, role_id, status, COALESCE(error_text, '') FROM runs
      WHERE id NOT IN (SELECT run_id FROM runs_fts);

      INSERT INTO run_events_fts (run_id, event_type, payload)
      SELECT run_id, event_type, COALESCE(payload_json, '') FROM run_events
      WHERE rowid NOT IN (SELECT rowid FROM run_events_fts);

      INSERT INTO artifacts_fts (artifact_id, title, content)
      SELECT id, title, COALESCE(content, '') FROM artifacts
      WHERE id NOT IN (SELECT artifact_id FROM artifacts_fts);

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
    `,
  },
  {
    version: 11,
    sql: `
      ALTER TABLE runs ADD COLUMN ai_tokens_in INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE runs ADD COLUMN ai_tokens_out INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE runs ADD COLUMN ai_cost_usd REAL NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 12,
    sql: `
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
    `,
  },
  {
    version: 13,
    sql: `
      ALTER TABLE runs ADD COLUMN duration_sec REAL NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 14,
    sql: `
      ALTER TABLE board_columns ADD COLUMN color TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 15,
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);
    `,
  },
  {
    version: 16,
    sql: `
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
    `,
  },
]

export type Migration = (typeof migrations)[number]
