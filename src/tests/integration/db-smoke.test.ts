import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb } from '../helpers/test-db'

describe('Database Smoke Tests', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    if (cleanup) {
      cleanup()
      cleanup = null
    }
  })

  it('should create database with migrations applied', () => {
    const { db, cleanup: cleanupFn } = createTestDb()
    cleanup = cleanupFn

    // Check that schema_migrations table exists and has version 16
    const result = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as {
      version: number
    }

    expect(result.version).toBe(16)
  })

  it('should create and retrieve a project', () => {
    const { db, cleanup: cleanupFn } = createTestDb()
    cleanup = cleanupFn

    const now = new Date().toISOString()
    const projectId = 'test-project-1'

    // Insert project
    db.prepare(
      `INSERT INTO projects (id, name, path, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(projectId, 'Test Project', '/tmp/test', '#ff0000', now, now)

    // Retrieve project
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as {
      id: string
      name: string
      path: string
      color: string
    }

    expect(project).toBeDefined()
    expect(project.id).toBe(projectId)
    expect(project.name).toBe('Test Project')
    expect(project.path).toBe('/tmp/test')
  })

  it('should create and retrieve a task', () => {
    const { db, cleanup: cleanupFn } = createTestDb()
    cleanup = cleanupFn

    const now = new Date().toISOString()
    const projectId = 'test-project-1'
    const taskId = 'test-task-1'

    // Insert project first (foreign key constraint)
    db.prepare(
      `INSERT INTO projects (id, name, path, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(projectId, 'Test Project', '/tmp/test', '#ff0000', now, now)

    // Insert task
    db.prepare(
      `INSERT INTO tasks (id, project_id, title, description, status, priority, difficulty, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      taskId,
      projectId,
      'Test Task',
      'Test Description',
      'queued',
      'normal',
      'medium',
      now,
      now
    )

    // Retrieve task
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
      id: string
      project_id: string
      title: string
      status: string
    }

    expect(task).toBeDefined()
    expect(task.id).toBe(taskId)
    expect(task.title).toBe('Test Task')
    expect(task.status).toBe('queued')
    expect(task.project_id).toBe(projectId)
  })

  it('should enforce foreign key constraints', () => {
    const { db, cleanup: cleanupFn } = createTestDb()
    cleanup = cleanupFn

    const now = new Date().toISOString()
    const taskId = 'test-task-1'
    const nonExistentProjectId = 'non-existent-project'

    // Attempt to insert task with non-existent project_id
    expect(() => {
      db.prepare(
        `INSERT INTO tasks (id, project_id, title, description, status, priority, difficulty, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        taskId,
        nonExistentProjectId,
        'Test Task',
        'Test Description',
        'queued',
        'normal',
        'medium',
        now,
        now
      )
    }).toThrow()
  })

  it('should support FTS search on tasks', () => {
    const { db, cleanup: cleanupFn } = createTestDb()
    cleanup = cleanupFn

    const now = new Date().toISOString()
    const projectId = 'test-project-1'
    const taskId = 'test-task-1'

    // Insert project
    db.prepare(
      `INSERT INTO projects (id, name, path, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(projectId, 'Test Project', '/tmp/test', '#ff0000', now, now)

    // Insert task
    db.prepare(
      `INSERT INTO tasks (id, project_id, title, description, status, priority, difficulty, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      taskId,
      projectId,
      'Implement authentication',
      'Add JWT authentication to API',
      'queued',
      'normal',
      'medium',
      now,
      now
    )

    // Search using FTS
    const results = db
      .prepare('SELECT task_id FROM tasks_fts WHERE tasks_fts MATCH ?')
      .all('authentication') as { task_id: string }[]

    expect(results).toHaveLength(1)
    expect(results[0].task_id).toBe(taskId)
  })
})
