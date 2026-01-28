export const migrations = [
  {
    version: 0,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );
    `
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
    `
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

      -- Add new columns to tasks
      ALTER TABLE tasks ADD COLUMN board_id TEXT;
      ALTER TABLE tasks ADD COLUMN column_id TEXT;
      ALTER TABLE tasks ADD COLUMN order_in_column INTEGER DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN type TEXT DEFAULT 'task';
      ALTER TABLE tasks ADD COLUMN tags_json TEXT DEFAULT '[]';
      ALTER TABLE tasks ADD COLUMN description_md TEXT;

      CREATE INDEX IF NOT EXISTS idx_tasks_board_id ON tasks(board_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks(column_id);
    `
  }
]

export type Migration = typeof migrations[number]
