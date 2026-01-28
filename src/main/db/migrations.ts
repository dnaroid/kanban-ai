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
  }
]

export type Migration = typeof migrations[number]
