import { z } from 'zod'

export const TaskStatusSchema = z.enum(['todo', 'in-progress', 'done']).describe('TaskStatus')

export const TaskPrioritySchema = z
  .enum(['low', 'medium', 'high', 'urgent'])
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
  status: z.enum(['todo', 'in-progress', 'done']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  type: z.string(),
  orderInColumn: z.number(),
  tags: z.array(z.string()).default([]),
  assignedAgent: z.string().optional(),
  branchName: z.string().optional(),
  prNumber: z.number().optional(),
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
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  type: z.string().default('task'),
  tags: z.array(z.string()).optional(),
})

export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>

export const TaskCreateResponseSchema = z.object({
  task: KanbanTaskSchema,
})

export type TaskCreateResponse = z.infer<typeof TaskCreateResponseSchema>

export const TaskListByBoardInputSchema = z.object({
  boardId: z.string().uuid(),
})

export type TaskListByBoardInput = z.infer<typeof TaskListByBoardInputSchema>

export const TaskListByBoardResponseSchema = z.object({
  tasks: z.array(KanbanTaskSchema),
})

export type TaskListByBoardResponse = z.infer<typeof TaskListByBoardResponseSchema>

export const TaskPatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  descriptionMd: z.string().optional(),
  status: z.enum(['todo', 'in-progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  type: z.string().optional(),
  columnId: z.string().uuid().optional(),
  orderInColumn: z.number().optional(),
  tags: z.array(z.string()).optional(),
  deletedAt: z.string().datetime().optional(),
})

export type TaskPatch = z.infer<typeof TaskPatchSchema>

export const TaskUpdateInputSchema = z.object({
  taskId: z.string().uuid(),
  patch: TaskPatchSchema,
})

export type TaskUpdateInput = z.infer<typeof TaskUpdateInputSchema>

export const TaskUpdateResponseSchema = z.object({
  task: KanbanTaskSchema,
})

export type TaskUpdateResponse = z.infer<typeof TaskUpdateResponseSchema>

export const TaskMoveInputSchema = z.object({
  taskId: z.string().uuid(),
  toColumnId: z.string().uuid(),
  toIndex: z.number(),
})

export type TaskMoveInput = z.infer<typeof TaskMoveInputSchema>

export const TaskMoveResponseSchema = z.object({
  success: z.literal(true),
})

export type TaskMoveResponse = z.infer<typeof TaskMoveResponseSchema>

export const TaskDeleteInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type TaskDeleteInput = z.infer<typeof TaskDeleteInputSchema>

export const TaskDeleteResponseSchema = z.object({
  ok: z.literal(true),
})

export type TaskDeleteResponse = z.infer<typeof TaskDeleteResponseSchema>

export const TaskLinkTypeSchema = z.enum(['blocks', 'relates', 'duplicates'])

export type TaskLinkType = z.infer<typeof TaskLinkTypeSchema>

export const TaskLinkSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  fromTaskId: z.string().uuid(),
  toTaskId: z.string().uuid(),
  linkType: TaskLinkTypeSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type TaskLink = z.infer<typeof TaskLinkSchema>

export const DepsListInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type DepsListInput = z.infer<typeof DepsListInputSchema>

export const DepsListResponseSchema = z.object({
  links: z.array(TaskLinkSchema),
})

export type DepsListResponse = z.infer<typeof DepsListResponseSchema>

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

export const TaskScheduleSchema = z.object({
  taskId: z.string().uuid(),
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  estimatePoints: z.number(),
  estimateHours: z.number(),
  assignee: z.string(),
  updatedAt: z.string().datetime(),
})

export type TaskSchedule = z.infer<typeof TaskScheduleSchema>

export const TimelineTaskSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string(),
  status: z.enum(['todo', 'in-progress', 'done']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  tags: z.array(z.string()),
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  estimatePoints: z.number(),
  estimateHours: z.number(),
  assignee: z.string(),
  updatedAt: z.string().datetime(),
})

export type TimelineTask = z.infer<typeof TimelineTaskSchema>

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
  status: z.enum(['todo', 'in-progress', 'done']).optional(),
  tags: z.array(z.string()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
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

export const GitStatusSchema = z.object({
  branch: z.string(),
  isDirty: z.boolean(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
})

export type GitStatus = z.infer<typeof GitStatusSchema>

export const GitStatusInputSchema = z.object({
  projectId: z.string().uuid(),
})

export type GitStatusInput = z.infer<typeof GitStatusInputSchema>

export const GitStatusResponseSchema = z.object({
  status: GitStatusSchema,
})

export type GitStatusResponse = z.infer<typeof GitStatusResponseSchema>

export const GitBranchCreateInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type GitBranchCreateInput = z.infer<typeof GitBranchCreateInputSchema>

export const GitBranchCreateResponseSchema = z.object({
  branchName: z.string(),
})

export type GitBranchCreateResponse = z.infer<typeof GitBranchCreateResponseSchema>

export const GitBranchCheckoutInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type GitBranchCheckoutInput = z.infer<typeof GitBranchCheckoutInputSchema>

export const GitBranchCheckoutResponseSchema = z.object({
  branchName: z.string(),
})

export type GitBranchCheckoutResponse = z.infer<typeof GitBranchCheckoutResponseSchema>

export const GitDiffInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type GitDiffInput = z.infer<typeof GitDiffInputSchema>

export const GitDiffResponseSchema = z.object({
  diff: z.string(),
})

export type GitDiffResponse = z.infer<typeof GitDiffResponseSchema>

export const GitCommitInputSchema = z.object({
  taskId: z.string().uuid(),
  message: z.string().min(1),
})

export type GitCommitInput = z.infer<typeof GitCommitInputSchema>

export const GitCommitResponseSchema = z.object({
  sha: z.string(),
})

export type GitCommitResponse = z.infer<typeof GitCommitResponseSchema>

export const GitPushInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type GitPushInput = z.infer<typeof GitPushInputSchema>

export const GitPushResponseSchema = z.object({
  ok: z.literal(true),
})

export type GitPushResponse = z.infer<typeof GitPushResponseSchema>

export const PrCreateInputSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(1),
  body: z.string(),
  draft: z.boolean().optional(),
})

export type PrCreateInput = z.infer<typeof PrCreateInputSchema>

export const PrCreateResponseSchema = z.object({
  providerPrId: z.string(),
  url: z.string(),
  state: z.string(),
})

export type PrCreateResponse = z.infer<typeof PrCreateResponseSchema>

export const PrRefreshInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type PrRefreshInput = z.infer<typeof PrRefreshInputSchema>

export const PrRefreshResponseSchema = z.object({
  state: z.string(),
  title: z.string(),
  url: z.string(),
  approvals: z.number().int().nonnegative(),
  requiredApprovals: z.number().int().nonnegative(),
  ciStatus: z.string(),
})

export type PrRefreshResponse = z.infer<typeof PrRefreshResponseSchema>

export const PrMergeInputSchema = z.object({
  taskId: z.string().uuid(),
  method: z.enum(['merge', 'squash', 'rebase']),
})

export type PrMergeInput = z.infer<typeof PrMergeInputSchema>

export const PrMergeResponseSchema = z.object({
  ok: z.boolean(),
  conflictId: z.string().uuid().nullable().optional(),
})

export type PrMergeResponse = z.infer<typeof PrMergeResponseSchema>

export const VcsConnectRepoInputSchema = z.object({
  projectId: z.string().uuid(),
  repoPath: z.string().min(1),
})

export type VcsConnectRepoInput = z.infer<typeof VcsConnectRepoInputSchema>

export const VcsConnectRepoResponseSchema = z.object({
  ok: z.literal(true),
  defaultBranch: z.string(),
})

export type VcsConnectRepoResponse = z.infer<typeof VcsConnectRepoResponseSchema>

export const IntegrationsSetProviderInputSchema = z.object({
  projectId: z.string().uuid(),
  providerType: z.enum(['github', 'gitlab']),
  repoId: z.string().min(1),
})

export type IntegrationsSetProviderInput = z.infer<typeof IntegrationsSetProviderInputSchema>

export const IntegrationsSetProviderResponseSchema = z.object({
  ok: z.literal(true),
})

export type IntegrationsSetProviderResponse = z.infer<typeof IntegrationsSetProviderResponseSchema>

export const IntegrationsSetTokenInputSchema = z.object({
  providerType: z.enum(['github', 'gitlab']),
  token: z.string().min(1),
})

export type IntegrationsSetTokenInput = z.infer<typeof IntegrationsSetTokenInputSchema>

export const IntegrationsSetTokenResponseSchema = z.object({
  ok: z.literal(true),
})

export type IntegrationsSetTokenResponse = z.infer<typeof IntegrationsSetTokenResponseSchema>

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
  runId: z.string().uuid(),
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

export const MergeConflictFileSchema = z.object({
  path: z.string(),
  base: z.string(),
  ours: z.string(),
  theirs: z.string(),
  markers: z.string(),
})

export const MergeConflictPackageSchema = z.object({
  task: z.object({
    id: z.string().uuid(),
    title: z.string(),
  }),
  pr: z.object({
    id: z.string(),
    base: z.string(),
    head: z.string(),
  }),
  files: z.array(MergeConflictFileSchema),
  rules: z.object({
    style: z.string(),
    denylist: z.array(z.string()),
  }),
})

export type MergeConflictPackage = z.infer<typeof MergeConflictPackageSchema>

export const MergeDetectInputSchema = z.object({
  taskId: z.string().uuid(),
})

export type MergeDetectInput = z.infer<typeof MergeDetectInputSchema>

export const MergeDetectResponseSchema = z.object({
  conflictId: z.string().uuid().nullable(),
  conflictPackage: MergeConflictPackageSchema.nullable(),
})

export type MergeDetectResponse = z.infer<typeof MergeDetectResponseSchema>

export const MergeSuggestInputSchema = z.object({
  conflictId: z.string().uuid(),
})

export type MergeSuggestInput = z.infer<typeof MergeSuggestInputSchema>

export const MergeSuggestResponseSchema = z.object({
  runId: z.string().uuid(),
})

export type MergeSuggestResponse = z.infer<typeof MergeSuggestResponseSchema>

export const MergeApplyInputSchema = z.object({
  conflictId: z.string().uuid(),
  patchArtifactId: z.string().uuid(),
})

export type MergeApplyInput = z.infer<typeof MergeApplyInputSchema>

export const MergeApplyResponseSchema = z.object({
  ok: z.literal(true),
})

export type MergeApplyResponse = z.infer<typeof MergeApplyResponseSchema>

export const MergeAbortInputSchema = z.object({
  conflictId: z.string().uuid(),
})

export type MergeAbortInput = z.infer<typeof MergeAbortInputSchema>

export const MergeAbortResponseSchema = z.object({
  ok: z.literal(true),
})

export type MergeAbortResponse = z.infer<typeof MergeAbortResponseSchema>

export const AutoMergeSettingsSchema = z.object({
  projectId: z.string().uuid(),
  enabled: z.boolean(),
  method: z.enum(['merge', 'squash', 'rebase']),
  requireCiSuccess: z.boolean(),
  requiredApprovals: z.number().int().nonnegative(),
  requireNoConflicts: z.boolean(),
})

export type AutoMergeSettings = z.infer<typeof AutoMergeSettingsSchema>

export const AutoMergeSetInputSchema = AutoMergeSettingsSchema

export type AutoMergeSetInput = z.infer<typeof AutoMergeSetInputSchema>

export const AutoMergeSetResponseSchema = z.object({
  settings: AutoMergeSettingsSchema,
})

export type AutoMergeSetResponse = z.infer<typeof AutoMergeSetResponseSchema>

export const AutoMergeRunOnceInputSchema = z.object({
  projectId: z.string().uuid(),
})

export type AutoMergeRunOnceInput = z.infer<typeof AutoMergeRunOnceInputSchema>

export const AutoMergeRunOnceResponseSchema = z.object({
  mergedCount: z.number().int().nonnegative(),
  conflictsCount: z.number().int().nonnegative(),
})

export type AutoMergeRunOnceResponse = z.infer<typeof AutoMergeRunOnceResponseSchema>

export const ReleaseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  status: z.enum(['draft', 'in_progress', 'published', 'canceled']),
  targetDate: z.string().nullable(),
  notesMd: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Release = z.infer<typeof ReleaseSchema>

export const ReleaseItemSchema = z.object({
  id: z.string().uuid(),
  releaseId: z.string().uuid(),
  taskId: z.string().uuid(),
  prId: z.string(),
  state: z.enum(['planned', 'merged', 'dropped']),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ReleaseItem = z.infer<typeof ReleaseItemSchema>

export const ReleaseCreateInputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  targetDate: z.string().nullable().optional(),
})

export type ReleaseCreateInput = z.infer<typeof ReleaseCreateInputSchema>

export const ReleaseCreateResponseSchema = z.object({
  releaseId: z.string().uuid(),
})

export type ReleaseCreateResponse = z.infer<typeof ReleaseCreateResponseSchema>

export const ReleaseAddItemsInputSchema = z.object({
  releaseId: z.string().uuid(),
  taskIds: z.array(z.string().uuid()).min(1),
})

export type ReleaseAddItemsInput = z.infer<typeof ReleaseAddItemsInputSchema>

export const ReleaseAddItemsResponseSchema = z.object({
  ok: z.literal(true),
})

export type ReleaseAddItemsResponse = z.infer<typeof ReleaseAddItemsResponseSchema>

export const ReleaseGenerateNotesInputSchema = z.object({
  releaseId: z.string().uuid(),
})

export type ReleaseGenerateNotesInput = z.infer<typeof ReleaseGenerateNotesInputSchema>

export const ReleaseGenerateNotesResponseSchema = z.object({
  runId: z.string().uuid(),
})

export type ReleaseGenerateNotesResponse = z.infer<typeof ReleaseGenerateNotesResponseSchema>

export const ReleasePublishInputSchema = z.object({
  releaseId: z.string().uuid(),
  notesMd: z.string(),
})

export type ReleasePublishInput = z.infer<typeof ReleasePublishInputSchema>

export const ReleasePublishResponseSchema = z.object({
  ok: z.literal(true),
})

export type ReleasePublishResponse = z.infer<typeof ReleasePublishResponseSchema>

export const ReleaseListInputSchema = z.object({
  projectId: z.string().uuid(),
})

export type ReleaseListInput = z.infer<typeof ReleaseListInputSchema>

export const ReleaseListResponseSchema = z.object({
  releases: z.array(ReleaseSchema),
})

export type ReleaseListResponse = z.infer<typeof ReleaseListResponseSchema>

export const ReleaseGetInputSchema = z.object({
  releaseId: z.string().uuid(),
})

export type ReleaseGetInput = z.infer<typeof ReleaseGetInputSchema>

export const ReleaseGetResponseSchema = z.object({
  release: ReleaseSchema,
  items: z.array(ReleaseItemSchema),
})

export type ReleaseGetResponse = z.infer<typeof ReleaseGetResponseSchema>

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
