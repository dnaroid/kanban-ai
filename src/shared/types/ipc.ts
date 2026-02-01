import { z } from 'zod'

export const TaskStatusSchema = z
  .enum(['queued', 'running', 'question', 'paused', 'done', 'failed'])
  .describe('TaskStatus')

export const TaskPrioritySchema = z
  .enum(['postpone', 'low', 'normal', 'urgent'])
  .describe('TaskPriority')

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
  electronVersion: z.string(),
  chromeVersion: z.string(),
  nodeVersion: z.string(),
  mode: z.string(),
  userDataPath: z.string(),
})

export type AppInfo = z.infer<typeof AppInfoSchema>

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  path: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Project = z.infer<typeof ProjectSchema>

export const CreateProjectInputSchema = z.object({
  name: z.string().min(1),
  path: z.string(),
})

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>

export const UpdateProjectInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  path: z.string().optional(),
})

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>

export const DeleteProjectInputSchema = z.object({
  id: z.string().uuid(),
})

export type DeleteProjectInput = z.infer<typeof DeleteProjectInputSchema>

export const BoardColumnSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  name: z.string().min(1),
  orderIndex: z.number(),
  color: z.string().default(''),
})

export type BoardColumn = z.infer<typeof BoardColumnSchema>

export const BoardColumnInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  orderIndex: z.number(),
  color: z.string().default(''),
})

export type BoardColumnInput = z.infer<typeof BoardColumnInputSchema>

export const BoardSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  columns: z.array(BoardColumnSchema).optional(),
})

export type Board = z.infer<typeof BoardSchema>

export const BoardGetDefaultInputSchema = z.object({
  projectId: z.string().uuid(),
})

export type BoardGetDefaultInput = z.infer<typeof BoardGetDefaultInputSchema>

export const BoardGetDefaultResponseSchema = z.object({
  board: BoardSchema,
  columns: z.array(BoardColumnSchema),
})

export type BoardGetDefaultResponse = z.infer<typeof BoardGetDefaultResponseSchema>

export const BoardUpdateColumnsInputSchema = z.object({
  boardId: z.string().uuid(),
  columns: z.array(BoardColumnInputSchema),
})

export type BoardUpdateColumnsInput = z.infer<typeof BoardUpdateColumnsInputSchema>

export const BoardUpdateColumnsResponseSchema = z.object({
  columns: z.array(BoardColumnSchema),
})

export type BoardUpdateColumnsResponse = z.infer<typeof BoardUpdateColumnsResponseSchema>

export const KanbanTaskSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  boardId: z.string().uuid(),
  columnId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  descriptionMd: z.string().optional(),
  status: z.enum(['queued', 'running', 'question', 'paused', 'done', 'failed']),
  priority: z.enum(['postpone', 'low', 'normal', 'urgent']),
  difficulty: z.enum(['easy', 'medium', 'hard', 'epic']).default('medium'),
  type: z.string(),
  orderInColumn: z.number().optional(),

  tags: z.array(z.string()),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimatePoints: z.number().optional(),
  estimateHours: z.number().optional(),
  assignee: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type KanbanTask = z.infer<typeof KanbanTaskSchema>

export const CreateTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  boardId: z.string().uuid(),
  columnId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.string().default('task'),
  priority: z.enum(['postpone', 'low', 'normal', 'urgent']).default('normal'),
  difficulty: z.enum(['easy', 'medium', 'hard', 'epic']).default('medium'),
  tags: z.array(z.string()).default([]),
})

export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>

export const TaskCreateResponseSchema = z.object({
  task: KanbanTaskSchema,
})

export type TaskCreateResponse = z.infer<typeof TaskCreateResponseSchema>

export const TaskPatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  descriptionMd: z.string().optional(),
  status: z.enum(['queued', 'running', 'question', 'paused', 'done', 'failed']).optional(),
  priority: z.enum(['postpone', 'low', 'normal', 'urgent']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'epic']).optional(),
  type: z.string().optional(),
  columnId: z.string().uuid().optional(),
  orderInColumn: z.number().optional(),
  tags: z.array(z.string()).optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimatePoints: z.number().optional(),
  estimateHours: z.number().optional(),
  assignee: z.string().optional(),
})

export type TaskPatch = z.infer<typeof TaskPatchSchema>

export const TaskListInputSchema = z.object({
  projectId: z.string().uuid().optional(),
  boardId: z.string().uuid().optional(),
})

export type TaskListInput = z.infer<typeof TaskListInputSchema>

export const TaskListResponseSchema = z.object({
  tasks: z.array(KanbanTaskSchema),
})

export type TaskListResponse = z.infer<typeof TaskListResponseSchema>

export const TaskListByBoardInputSchema = TaskListInputSchema
export type TaskListByBoardInput = TaskListInput

export const TaskListByBoardResponseSchema = TaskListResponseSchema
export type TaskListByBoardResponse = TaskListResponse

export const TaskUpdateInputSchema = z.object({
  taskId: z.string().uuid(),
  patch: TaskPatchSchema,
})
export type TaskUpdateInput = z.infer<typeof TaskUpdateInputSchema>

export const TaskUpdateResponseSchema = TaskCreateResponseSchema
export type TaskUpdateResponse = TaskCreateResponse

export const TaskGetInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type TaskGetInput = z.infer<typeof TaskGetInputSchema>

export const TaskGetResponseSchema = z.object({
  task: KanbanTaskSchema,
})

export type TaskGetResponse = z.infer<typeof TaskGetResponseSchema>

export const TaskDeleteInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type TaskDeleteInput = z.infer<typeof TaskDeleteInputSchema>

export const TaskDeleteResponseSchema = z.object({
  ok: z.literal(true),
})

export type TaskDeleteResponse = z.infer<typeof TaskDeleteResponseSchema>

export const TaskMoveInputSchema = z.object({
  taskId: z.string().uuid(),
  toColumnId: z.string().uuid(),
  toIndex: z.number(),
})

export type TaskMoveInput = z.infer<typeof TaskMoveInputSchema>

export const TaskMoveResponseSchema = z.object({
  ok: z.literal(true),
})

export type TaskMoveResponse = z.infer<typeof TaskMoveResponseSchema>

export const TaskDependencyTypeSchema = z.enum(['blocks', 'blocked_by', 'relates'])

export type TaskDependencyType = z.infer<typeof TaskDependencyTypeSchema>

export const TaskLinkTypeSchema = z.enum(['blocks', 'relates'])

export type TaskLinkType = z.infer<typeof TaskLinkTypeSchema>

export const TaskLinkSchema = z.object({
  id: z.string().uuid(),
  fromTaskId: z.string().uuid(),
  toTaskId: z.string().uuid(),
  linkType: TaskLinkTypeSchema,
  createdAt: z.string().datetime(),
})

export type TaskLink = z.infer<typeof TaskLinkSchema>

export const DepsAddInputSchema = z.object({
  fromTaskId: z.string().uuid(),
  toTaskId: z.string().uuid(),
  type: TaskLinkTypeSchema,
})

export type DepsAddInput = z.infer<typeof DepsAddInputSchema>

export const DepsAddResponseSchema = z.object({
  link: TaskLinkSchema,
})

export type DepsAddResponse = z.infer<typeof DepsAddResponseSchema>

export const DepsRemoveInputSchema = z.object({
  linkId: z.string().uuid(),
})

export type DepsRemoveInput = z.infer<typeof DepsRemoveInputSchema>

export const DepsRemoveResponseSchema = z.object({
  ok: z.literal(true),
})

export type DepsRemoveResponse = z.infer<typeof DepsRemoveResponseSchema>

export const DepsListInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type DepsListInput = z.infer<typeof DepsListInputSchema>

export const DepsListResponseSchema = z.object({
  links: z.array(TaskLinkSchema),
})

export type DepsListResponse = z.infer<typeof DepsListResponseSchema>

export const TimelineTaskSchema = KanbanTaskSchema
export const TaskScheduleSchema = KanbanTaskSchema

export type TimelineTask = z.infer<typeof TimelineTaskSchema>
export type TaskSchedule = z.infer<typeof TaskScheduleSchema>

export const ScheduleGetInputSchema = z.object({
  projectId: z.string().uuid(),
})

export type ScheduleGetInput = z.infer<typeof ScheduleGetInputSchema>

export const ScheduleGetResponseSchema = z.object({
  tasks: z.array(TimelineTaskSchema),
})

export type ScheduleGetResponse = z.infer<typeof ScheduleGetResponseSchema>

export const ScheduleUpdateInputSchema = z.object({
  taskId: z.string().uuid(),
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  estimatePoints: z.number().optional(),
  estimateHours: z.number().optional(),
  assignee: z.string().optional(),
})

export type ScheduleUpdateInput = z.infer<typeof ScheduleUpdateInputSchema>

export const ScheduleUpdateResponseSchema = z.object({
  schedule: TaskScheduleSchema,
})

export type ScheduleUpdateResponse = z.infer<typeof ScheduleUpdateResponseSchema>

export const SearchEntitySchema = z.enum(['task', 'run', 'artifact'])

export type SearchEntity = z.infer<typeof SearchEntitySchema>

export const SearchFiltersSchema = z.object({
  projectId: z.string().uuid().optional(),
  entity: SearchEntitySchema.optional(),
  status: z.enum(['queued', 'running', 'question', 'paused', 'done', 'failed']).optional(),
  tags: z.array(z.string()).optional(),
  priority: z.enum(['postpone', 'low', 'normal', 'urgent']).optional(),
  role: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

export type SearchFilters = z.infer<typeof SearchFiltersSchema>

export const SearchQueryInputSchema = z.object({
  q: z.string().trim().min(1),
  filters: SearchFiltersSchema.optional(),
})

export type SearchQueryInput = z.infer<typeof SearchQueryInputSchema>

export const TaskSearchResultSchema = z.object({
  entity: z.literal('task'),
  task: KanbanTaskSchema,
})

export type TaskSearchResult = z.infer<typeof TaskSearchResultSchema>

export const RunSearchResultSchema = z.object({
  entity: z.literal('run'),
  run: z.object({
    id: z.string().uuid(),
    taskId: z.string().uuid(),
    projectId: z.string().uuid(),
    roleId: z.string(),
    status: z.string(),
    errorText: z.string(),
    createdAt: z.string().datetime(),
  }),
})

export type RunSearchResult = z.infer<typeof RunSearchResultSchema>

export const ArtifactSearchResultSchema = z.object({
  entity: z.literal('artifact'),
  artifact: z.object({
    id: z.string().uuid(),
    runId: z.string().uuid(),
    taskId: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    kind: z.string(),
    createdAt: z.string().datetime(),
  }),
})

export type ArtifactSearchResult = z.infer<typeof ArtifactSearchResultSchema>

export const SearchResultSchema = z.union([
  TaskSearchResultSchema,
  RunSearchResultSchema,
  ArtifactSearchResultSchema,
])

export type SearchResult = z.infer<typeof SearchResultSchema>

export const SearchQueryResponseSchema = z.object({
  results: z.array(SearchResultSchema),
})

export type SearchQueryResponse = z.infer<typeof SearchQueryResponseSchema>

export const AnalyticsRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
})

export type AnalyticsRange = z.infer<typeof AnalyticsRangeSchema>

export const AnalyticsOverviewSchema = z.object({
  wipCount: z.number(),
  throughputPerDay: z.number(),
  doneCount: z.number(),
  createdCount: z.number(),
  leadTimeHours: z.number(),
  cycleTimeHours: z.number(),
  aiTokensIn: z.number(),
  aiTokensOut: z.number(),
  aiCostUsd: z.number(),
})

export type AnalyticsOverview = z.infer<typeof AnalyticsOverviewSchema>

export const AnalyticsRunStatsSchema = z.object({
  totalRuns: z.number(),
  successRuns: z.number(),
  successRate: z.number(),
  avgDurationSec: z.number(),
})

export type AnalyticsRunStats = z.infer<typeof AnalyticsRunStatsSchema>

export const AnalyticsGetOverviewInputSchema = z.object({
  projectId: z.string().uuid(),
  range: AnalyticsRangeSchema.optional(),
})

export type AnalyticsGetOverviewInput = z.infer<typeof AnalyticsGetOverviewInputSchema>

export const AnalyticsGetRunStatsInputSchema = z.object({
  projectId: z.string().uuid(),
  range: AnalyticsRangeSchema.optional(),
})

export type AnalyticsGetRunStatsInput = z.infer<typeof AnalyticsGetRunStatsInputSchema>

export const AnalyticsGetOverviewResponseSchema = z.object({
  overview: AnalyticsOverviewSchema,
})

export type AnalyticsGetOverviewResponse = z.infer<typeof AnalyticsGetOverviewResponseSchema>

export const AnalyticsGetRunStatsResponseSchema = z.object({
  stats: AnalyticsRunStatsSchema,
})

export type AnalyticsGetRunStatsResponse = z.infer<typeof AnalyticsGetRunStatsResponseSchema>

export const PluginTypeSchema = z.enum(['role', 'executor', 'integration', 'ui'])

export type PluginType = z.infer<typeof PluginTypeSchema>

export const PluginPermissionsSchema = z.object({
  canRegisterRoles: z.boolean().default(false),
  canRegisterExecutors: z.boolean().default(false),
  canCallNetwork: z.boolean().default(false),
})

export const PluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  type: PluginTypeSchema,
  permissions: PluginPermissionsSchema.optional(),
  entrypoint: z.string().min(1),
})

export type PluginManifest = z.infer<typeof PluginManifestSchema>

export const PluginRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  enabled: z.boolean(),
  type: PluginTypeSchema,
  manifest: PluginManifestSchema,
  installedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type PluginRecord = z.infer<typeof PluginRecordSchema>

export const PluginsListResponseSchema = z.object({
  plugins: z.array(PluginRecordSchema),
})

export type PluginsListResponse = z.infer<typeof PluginsListResponseSchema>

export const PluginsInstallInputSchema = z.object({
  path: z.string().min(1),
})

export type PluginsInstallInput = z.infer<typeof PluginsInstallInputSchema>

export const PluginsInstallResponseSchema = z.object({
  plugin: PluginRecordSchema,
})

export type PluginsInstallResponse = z.infer<typeof PluginsInstallResponseSchema>

export const PluginsEnableInputSchema = z.object({
  pluginId: z.string().min(1),
  enabled: z.boolean(),
})

export type PluginsEnableInput = z.infer<typeof PluginsEnableInputSchema>

export const PluginsEnableResponseSchema = z.object({
  plugin: PluginRecordSchema,
})

export type PluginsEnableResponse = z.infer<typeof PluginsEnableResponseSchema>

export const PluginsReloadResponseSchema = z.object({
  plugins: z.array(PluginRecordSchema),
})

export type PluginsReloadResponse = z.infer<typeof PluginsReloadResponseSchema>

export const RoleSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
})

export type RoleSummary = z.infer<typeof RoleSummarySchema>

export const RolesListResponseSchema = z.object({
  roles: z.array(RoleSummarySchema),
})

export type RolesListResponse = z.infer<typeof RolesListResponseSchema>

export const BackupExportInputSchema = z.object({
  projectId: z.string().uuid(),
  toPath: z.string().min(1),
})

export type BackupExportInput = z.infer<typeof BackupExportInputSchema>

export const BackupExportResponseSchema = z.object({
  ok: z.literal(true),
  path: z.string().min(1),
})

export type BackupExportResponse = z.infer<typeof BackupExportResponseSchema>

export const BackupImportInputSchema = z.object({
  zipPath: z.string().min(1),
  mode: z.enum(['new', 'overwrite']).default('new'),
  projectPath: z.string().optional(),
})

export type BackupImportInput = z.infer<typeof BackupImportInputSchema>

export const BackupImportResponseSchema = z.object({
  ok: z.literal(true),
  projectId: z.string().uuid().optional(),
})

export type BackupImportResponse = z.infer<typeof BackupImportResponseSchema>

export const RunModeSchema = z.enum(['plan-only', 'execute', 'critique'])
export const RunStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'canceled'])

export const RunSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  roleId: z.string(),
  mode: RunModeSchema,
  status: RunStatusSchema,
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  errorText: z.string(),
  budget: z.record(z.string(), z.unknown()).default({}),
  contextSnapshotId: z.string().uuid(),
  sessionId: z.string().optional(),
  aiTokensIn: z.number().default(0),
  aiTokensOut: z.number().default(0),
  aiCostUsd: z.number().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Run = z.infer<typeof RunSchema>

export const RunStartInputSchema = z.object({
  taskId: z.string().uuid(),
  roleId: z.string(),
  mode: RunModeSchema.optional(),
})

export type RunStartInput = z.infer<typeof RunStartInputSchema>

export const RunStartResponseSchema = z.object({
  runId: z.string().uuid(),
})

export type RunStartResponse = z.infer<typeof RunStartResponseSchema>

export const RunCancelInputSchema = z.object({
  runId: z.string().uuid(),
})

export type RunCancelInput = z.infer<typeof RunCancelInputSchema>

export const RunCancelResponseSchema = z.object({
  ok: z.literal(true),
})

export type RunCancelResponse = z.infer<typeof RunCancelResponseSchema>

export const RunListByTaskInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type RunListByTaskInput = z.infer<typeof RunListByTaskInputSchema>

export const RunListByTaskResponseSchema = z.object({
  runs: z.array(RunSchema),
})

export type RunListByTaskResponse = z.infer<typeof RunListByTaskResponseSchema>

export const RunGetInputSchema = z.object({
  runId: z.string().uuid(),
})

export type RunGetInput = z.infer<typeof RunGetInputSchema>

export const RunGetResponseSchema = z.object({
  run: RunSchema,
})

export type RunGetResponse = z.infer<typeof RunGetResponseSchema>

export const RunEventTypeSchema = z.enum([
  'stdout',
  'stderr',
  'message',
  'tool',
  'artifact',
  'status',
  'debug',
  'usage',
])

export const RunEventSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  ts: z.string().datetime(),
  eventType: RunEventTypeSchema,
  payload: z.unknown(),
})

export type RunEvent = z.infer<typeof RunEventSchema>

export const RunEventsTailInputSchema = z.object({
  runId: z.string(),
  afterTs: z.string().datetime().optional(),
  limit: z.number().int().positive().optional(),
})

export type RunEventsTailInput = z.infer<typeof RunEventsTailInputSchema>

export const RunEventsTailResponseSchema = z.object({
  events: z.array(RunEventSchema),
})

export type RunEventsTailResponse = z.infer<typeof RunEventsTailResponseSchema>

export const ArtifactKindSchema = z.enum(['markdown', 'json', 'patch', 'file_ref', 'link'])

export const ArtifactSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  kind: ArtifactKindSchema,
  title: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
})

export type Artifact = z.infer<typeof ArtifactSchema>

export const ArtifactListInputSchema = z.object({
  runId: z.string().uuid(),
})

export type ArtifactListInput = z.infer<typeof ArtifactListInputSchema>

export const ArtifactListResponseSchema = z.object({
  artifacts: z.array(ArtifactSchema),
})

export type ArtifactListResponse = z.infer<typeof ArtifactListResponseSchema>

export const ArtifactGetInputSchema = z.object({
  artifactId: z.string().uuid(),
})

export type ArtifactGetInput = z.infer<typeof ArtifactGetInputSchema>

export const ArtifactGetResponseSchema = z.object({
  artifact: ArtifactSchema,
})

export type ArtifactGetResponse = z.infer<typeof ArtifactGetResponseSchema>

export const AppSettingGetLastProjectIdResponseSchema = z.object({
  projectId: z.string().nullable(),
})

export type AppSettingGetLastProjectIdResponse = z.infer<
  typeof AppSettingGetLastProjectIdResponseSchema
>

export const AppSettingSetLastProjectIdInputSchema = z.object({
  projectId: z.string(),
})

export type AppSettingSetLastProjectIdInput = z.infer<typeof AppSettingSetLastProjectIdInputSchema>

export const AppSettingSetLastProjectIdResponseSchema = z.object({
  ok: z.literal(true),
})

export type AppSettingSetLastProjectIdResponse = z.infer<
  typeof AppSettingSetLastProjectIdResponseSchema
>

export const AppSettingGetSidebarCollapsedResponseSchema = z.object({
  collapsed: z.boolean(),
})

export type AppSettingGetSidebarCollapsedResponse = z.infer<
  typeof AppSettingGetSidebarCollapsedResponseSchema
>

export const AppSettingSetSidebarCollapsedInputSchema = z.object({
  collapsed: z.boolean(),
})

export type AppSettingSetSidebarCollapsedInput = z.infer<
  typeof AppSettingSetSidebarCollapsedInputSchema
>

export const AppSettingSetSidebarCollapsedResponseSchema = z.object({
  ok: z.literal(true),
})

export type AppSettingSetSidebarCollapsedResponse = z.infer<
  typeof AppSettingSetSidebarCollapsedResponseSchema
>

export const OpenCodeGenerateUserStoryInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type OpenCodeGenerateUserStoryInput = z.infer<typeof OpenCodeGenerateUserStoryInputSchema>

export const OpenCodeGenerateUserStoryResponseSchema = z.object({
  description: z.string(),
})

export type OpenCodeGenerateUserStoryResponse = z.infer<
  typeof OpenCodeGenerateUserStoryResponseSchema
>

// OpenCode event subscription types
export const OpenCodeSubscribeInputSchema = z.object({
  sessionID: z.string(),
})

export type OpenCodeSubscribeInput = z.infer<typeof OpenCodeSubscribeInputSchema>

export const OpenCodeSubscribeResponseSchema = z.object({
  ok: z.literal(true),
  subscribed: z.literal(true),
})

export type OpenCodeSubscribeResponse = z.infer<typeof OpenCodeSubscribeResponseSchema>

export const OpenCodeUnsubscribeInputSchema = z.object({
  sessionID: z.string(),
})

export type OpenCodeUnsubscribeInput = z.infer<typeof OpenCodeUnsubscribeInputSchema>

export const OpenCodeUnsubscribeResponseSchema = z.object({
  ok: z.literal(true),
  subscribed: z.literal(false),
})

export type OpenCodeUnsubscribeResponse = z.infer<typeof OpenCodeUnsubscribeResponseSchema>

export const OpenCodeIsSubscribedInputSchema = z.object({
  sessionID: z.string(),
})

export type OpenCodeIsSubscribedInput = z.infer<typeof OpenCodeIsSubscribedInputSchema>

export const OpenCodeIsSubscribedResponseSchema = z.object({
  ok: z.literal(true),
  subscribed: z.boolean(),
})

export type OpenCodeIsSubscribedResponse = z.infer<typeof OpenCodeIsSubscribedResponseSchema>

export const OpenCodeSessionEventSchema = z.union([
  z.object({
    type: z.literal('message.updated'),
    sessionId: z.string(),
    message: z.unknown(),
  }),
  z.object({
    type: z.literal('message.removed'),
    sessionId: z.string(),
    messageId: z.string(),
  }),
  z.object({
    type: z.literal('message.part.updated'),
    sessionId: z.string(),
    messageId: z.string(),
    part: z.unknown(),
    delta: z.string().optional(),
  }),
  z.object({
    type: z.literal('message.part.removed'),
    sessionId: z.string(),
    messageId: z.string(),
    partId: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    sessionId: z.string(),
    error: z.string(),
  }),
])

export type OpenCodeSessionEvent = z.infer<typeof OpenCodeSessionEventSchema>

// ---------------------------------------------------------------------------
// TaskQueueManager schemas
// ---------------------------------------------------------------------------
export const TaskQueueStateSchema = z.enum([
  'queued',
  'running',
  'waiting_user',
  'paused',
  'done',
  'failed',
  'cancelled',
])

export type TaskQueueState = z.infer<typeof TaskQueueStateSchema>

export const TaskQueueStageSchema = z.enum(['ba', 'fe', 'be', 'qa', 'kb'])

export type TaskQueueStage = z.infer<typeof TaskQueueStageSchema>

export const TaskQueueRowSchema = z.object({
  task_id: z.string().uuid(),
  state: TaskQueueStateSchema,
  stage: TaskQueueStageSchema,
  priority: z.number().int(),
  enqueued_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  last_error: z.string(),
  locked_by: z.string(),
  locked_until: z.string().datetime().nullable(),
})

export type TaskQueueRow = z.infer<typeof TaskQueueRowSchema>

export const RoleSlotRowSchema = z.object({
  role_key: z.enum(['ba', 'fe', 'be', 'qa']),
  max_concurrency: z.number().int().nonnegative(),
  updated_at: z.string().datetime(),
})

export type RoleSlotRow = z.infer<typeof RoleSlotRowSchema>

export const ResourceLockRowSchema = z.object({
  lock_key: z.string(),
  owner: z.string(),
  acquired_at: z.string().datetime(),
  expires_at: z.string().datetime(),
})

export type ResourceLockRow = z.infer<typeof ResourceLockRowSchema>

export type ToolState = 'pending' | 'running' | 'completed' | 'error'

export type Part =
  | { type: 'text'; text: string; synthetic?: boolean; ignored?: boolean }
  | { type: 'file'; url: string; mime: string; filename?: string }
  | { type: 'agent'; name: string }
  | {
      type: 'tool'
      callID: string
      tool: string
      state: ToolState
      input?: any
      output?: any
      error?: string
    }
  | { type: 'reasoning'; text: string }

export type MessageInfo = {
  id: string
  sessionID: string
  role: 'user' | 'assistant'
  time: {
    created: number
    completed?: number
  }
  parts: Part[]
}

// ---------------------------------------------------------------------------
// STT (Speech-to-Text) Realtime Transcription schemas
// ---------------------------------------------------------------------------
export const STTLanguageSchema = z.enum(['ru', 'en'])
export type STTLanguage = z.infer<typeof STTLanguageSchema>

export const STTModeSchema = z.enum(['ptt', 'toggle'])
export type STTMode = z.infer<typeof STTModeSchema>

export const STTStatusSchema = z.enum([
  'idle',
  'requesting_mic',
  'connecting',
  'listening',
  'speech',
  'finalizing',
  'error',
])
export type STTStatus = z.infer<typeof STTStatusSchema>

export const STTStartInputSchema = z.object({
  editorId: z.string(),
  language: STTLanguageSchema,
  mode: STTModeSchema.optional(),
})
export type STTStartInput = z.infer<typeof STTStartInputSchema>

export const STTStopInputSchema = z.object({
  editorId: z.string(),
})
export type STTStopInput = z.infer<typeof STTStopInputSchema>

export const STTLanguageInputSchema = z.object({
  editorId: z.string(),
  language: STTLanguageSchema,
})
export type STTLanguageInput = z.infer<typeof STTLanguageInputSchema>

export const STTAudioInputSchema = z.object({
  editorId: z.string(),
  pcm16Base64: z.string(),
})
export type STTAudioInput = z.infer<typeof STTAudioInputSchema>

export const STTStatusEventSchema = z.object({
  editorId: z.string(),
  status: STTStatusSchema,
  details: z.string().optional(),
})
export type STTStatusEvent = z.infer<typeof STTStatusEventSchema>

export const STTDeltaEventSchema = z.object({
  editorId: z.string(),
  itemId: z.string(),
  textDelta: z.string(),
})
export type STTDeltaEvent = z.infer<typeof STTDeltaEventSchema>

export const STTCommittedEventSchema = z.object({
  editorId: z.string(),
  itemId: z.string(),
  previousItemId: z.string().optional(),
})
export type STTCommittedEvent = z.infer<typeof STTCommittedEventSchema>

export const STTFinalEventSchema = z.object({
  editorId: z.string(),
  itemId: z.string(),
  transcript: z.string(),
})
export type STTFinalEvent = z.infer<typeof STTFinalEventSchema>

export const STTFailedEventSchema = z.object({
  editorId: z.string(),
  itemId: z.string(),
  error: z.object({
    code: z.string().optional(),
    message: z.string(),
  }),
})
export type STTFailedEvent = z.infer<typeof STTFailedEventSchema>

export const STTErrorEventSchema = z.object({
  editorId: z.string(),
  error: z.object({
    code: z.string().optional(),
    message: z.string(),
  }),
})
export type STTErrorEvent = z.infer<typeof STTErrorEventSchema>

export const VoskModelDownloadInputSchema = z.object({
  lang: z.enum(['ru', 'en']),
})
export type VoskModelDownloadInput = z.infer<typeof VoskModelDownloadInputSchema>

export const VoskModelDownloadResponseSchema = z.object({
  path: z.string(),
})
export type VoskModelDownloadResponse = z.infer<typeof VoskModelDownloadResponseSchema>
