import { z } from 'zod'

export const LogLevelSchema = z.enum(['info', 'warn', 'error', 'debug'])

export const LogEntrySchema = z.object({
  timestamp: z.string(),
  level: LogLevelSchema,
  message: z.string(),
  context: z.string().optional(),
})

export type LogLevel = z.infer<typeof LogLevelSchema>
export type LogEntry = z.infer<typeof LogEntrySchema>

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  arch: z.string(),
})

export type AppInfo = z.infer<typeof AppInfoSchema>

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  path: z.string(),
  color: z.string().default(''),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Project = z.infer<typeof ProjectSchema>

export const CreateProjectInputSchema = z.object({
  name: z.string().min(1),
  path: z.string(),
  color: z.string().optional(),
})

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>

export const UpdateProjectInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  path: z.string().optional(),
  color: z.string().optional(),
})

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>

export const DeleteProjectInputSchema = z.object({
  id: z.string().uuid(),
})

export type DeleteProjectInput = z.infer<typeof DeleteProjectInputSchema>
