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
]

export type Migration = (typeof migrations)[number]
