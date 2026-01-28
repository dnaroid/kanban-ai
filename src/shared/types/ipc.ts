import { z } from 'zod'

export const LogLevelSchema = z.enum(['info', 'warn', 'error', 'debug'])

export const LogEntrySchema = z.object({
  timestamp: z.string(),
  level: LogLevelSchema,
  message: z.string(),
  context: z.string().optional()
})

export type LogLevel = z.infer<typeof LogLevelSchema>
export type LogEntry = z.infer<typeof LogEntrySchema>

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  arch: z.string(),
  electronVersion: z.string(),
  chromeVersion: z.string(),
  nodeVersion: z.string(),
  mode: z.string(),
  userDataPath: z.string()
})

export type AppInfo = z.infer<typeof AppInfoSchema>

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  path: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
})

export type Project = z.infer<typeof ProjectSchema>

export const CreateProjectInputSchema = z.object({
  name: z.string().min(1),
  path: z.string()
})

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>

export const UpdateProjectInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  path: z.string().optional()
})

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>

export const DeleteProjectInputSchema = z.object({
  id: z.string().uuid()
})

export const BoardColumnSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  name: z.string().min(1),
  orderIndex: z.number()
})

export type BoardColumn = z.infer<typeof BoardColumnSchema>

export const BoardSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  columns: z.array(BoardColumnSchema).optional()
})

export type Board = z.infer<typeof BoardSchema>

export const KanbanTaskSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  boardId: z.string().uuid(),
  columnId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  descriptionMd: z.string().optional(),
  status: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  type: z.string(),
  orderInColumn: z.number(),
  tags: z.array(z.string()).default([]),
  assignedAgent: z.string().optional(),
  branchName: z.string().optional(),
  prNumber: z.number().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
})

export type KanbanTask = z.infer<typeof KanbanTaskSchema>

export const CreateTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  boardId: z.string().uuid(),
  columnId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  type: z.string().default('task'),
  tags: z.array(z.string()).optional()
})

export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>
