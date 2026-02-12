"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleUpdateResponseSchema = exports.ScheduleUpdateInputSchema = exports.ScheduleGetResponseSchema = exports.ScheduleGetInputSchema = exports.TaskScheduleSchema = exports.TimelineTaskSchema = exports.DepsListResponseSchema = exports.DepsListInputSchema = exports.DepsRemoveResponseSchema = exports.DepsRemoveInputSchema = exports.DepsAddResponseSchema = exports.DepsAddInputSchema = exports.TaskLinkSchema = exports.TaskLinkTypeSchema = exports.TaskDependencyTypeSchema = exports.TaskMoveResponseSchema = exports.TaskMoveInputSchema = exports.TaskDeleteResponseSchema = exports.TaskDeleteInputSchema = exports.TaskGetResponseSchema = exports.TaskGetInputSchema = exports.TaskUpdateResponseSchema = exports.TaskUpdateInputSchema = exports.TaskListByBoardResponseSchema = exports.TaskListByBoardInputSchema = exports.TaskListResponseSchema = exports.TaskListInputSchema = exports.TaskPatchSchema = exports.TaskCreateResponseSchema = exports.CreateTaskInputSchema = exports.KanbanTaskSchema = exports.BoardUpdateColumnsResponseSchema = exports.BoardUpdateColumnsInputSchema = exports.BoardGetDefaultResponseSchema = exports.BoardGetDefaultInputSchema = exports.BoardSchema = exports.BoardColumnInputSchema = exports.BoardColumnSchema = exports.DeleteProjectInputSchema = exports.UpdateProjectInputSchema = exports.CreateProjectInputSchema = exports.ProjectSchema = exports.AppInfoSchema = exports.DiagnosticsGetMetricsResponseSchema = exports.DiagnosticsGetMetricsInputSchema = exports.AppMetricSchema = exports.LogEntrySchema = exports.LogLevelSchema = exports.TaskPrioritySchema = exports.TaskStatusSchema = void 0;
exports.RunListByTaskInputSchema = exports.RunDeleteResponseSchema = exports.RunDeleteInputSchema = exports.RunCancelResponseSchema = exports.RunCancelInputSchema = exports.RunStartResponseSchema = exports.RunStartInputSchema = exports.RunSchema = exports.RunKindSchema = exports.RunStatusSchema = exports.RunModeSchema = exports.DatabaseDeleteResponseSchema = exports.DatabaseDeleteInputSchema = exports.TagListResponseSchema = exports.TagListInputSchema = exports.TagDeleteInputSchema = exports.TagUpdateInputSchema = exports.TagCreateInputSchema = exports.TagSchema = exports.BackupImportResponseSchema = exports.BackupImportInputSchema = exports.BackupExportResponseSchema = exports.BackupExportInputSchema = exports.RolesListResponseSchema = exports.RoleSummarySchema = exports.PluginsReloadResponseSchema = exports.PluginsEnableResponseSchema = exports.PluginsEnableInputSchema = exports.PluginsInstallResponseSchema = exports.PluginsInstallInputSchema = exports.PluginsListResponseSchema = exports.PluginRecordSchema = exports.PluginManifestSchema = exports.PluginPermissionsSchema = exports.PluginTypeSchema = exports.AnalyticsGetRunStatsResponseSchema = exports.AnalyticsGetOverviewResponseSchema = exports.AnalyticsGetRunStatsInputSchema = exports.AnalyticsGetOverviewInputSchema = exports.AnalyticsRunStatsSchema = exports.AnalyticsOverviewSchema = exports.AnalyticsRangeSchema = exports.SearchQueryResponseSchema = exports.SearchResultSchema = exports.ArtifactSearchResultSchema = exports.RunSearchResultSchema = exports.TaskSearchResultSchema = exports.SearchQueryInputSchema = exports.SearchFiltersSchema = exports.SearchEntitySchema = void 0;
exports.ResourceLockRowSchema = exports.RoleSlotRowSchema = exports.TaskQueueRowSchema = exports.TaskQueueStageSchema = exports.TaskQueueStateSchema = exports.OpenCodeSessionEventSchema = exports.OpenCodeIsSubscribedResponseSchema = exports.OpenCodeIsSubscribedInputSchema = exports.OpenCodeUnsubscribeResponseSchema = exports.OpenCodeUnsubscribeInputSchema = exports.OpenCodeSubscribeResponseSchema = exports.OpenCodeSubscribeInputSchema = exports.TaskEventSchema = exports.OpenCodeSessionTodosResponseSchema = exports.OpenCodeSessionTodosInputSchema = exports.OpenCodeTodoSchema = exports.OpenCodeSessionMessagesResponseSchema = exports.OpenCodeMessageSchema = exports.OpenCodeSessionMessagesInputSchema = exports.OpenCodeActiveSessionsResponseSchema = exports.OpenCodeSessionStatusResponseSchema = exports.OpenCodeSessionStatusInputSchema = exports.OpenCodeGenerateUserStoryResponseSchema = exports.OpenCodeGenerateUserStoryInputSchema = exports.AppSettingRunRetentionCleanupResponseSchema = exports.AppSettingRunRetentionCleanupInputSchema = exports.AppSettingSetRetentionPolicyResponseSchema = exports.AppSettingSetRetentionPolicyInputSchema = exports.AppSettingGetRetentionPolicyResponseSchema = exports.AppSettingRetentionPolicySchema = exports.AppSettingSetSidebarCollapsedResponseSchema = exports.AppSettingSetSidebarCollapsedInputSchema = exports.AppSettingGetSidebarCollapsedResponseSchema = exports.AppSettingSetLastProjectIdResponseSchema = exports.AppSettingSetLastProjectIdInputSchema = exports.AppSettingGetLastProjectIdResponseSchema = exports.ArtifactGetResponseSchema = exports.ArtifactGetInputSchema = exports.ArtifactListResponseSchema = exports.ArtifactListInputSchema = exports.ArtifactSchema = exports.ArtifactKindSchema = exports.RunEventsTailResponseSchema = exports.RunEventsTailInputSchema = exports.RunEventMessagePayloadSchema = exports.RunEventSchema = exports.RunEventTypeSchema = exports.RunGetResponseSchema = exports.RunGetInputSchema = exports.RunListByTaskResponseSchema = void 0;
exports.OhMyOpencodeSavePresetResponseSchema = exports.OhMyOpencodeSavePresetInputSchema = exports.OhMyOpencodeLoadPresetResponseSchema = exports.OhMyOpencodeLoadPresetInputSchema = exports.OhMyOpencodeListPresetsResponseSchema = exports.OhMyOpencodeListPresetsInputSchema = exports.OhMyOpencodeRestoreConfigResponseSchema = exports.OhMyOpencodeRestoreConfigInputSchema = exports.OhMyOpencodeBackupConfigResponseSchema = exports.OhMyOpencodeBackupConfigInputSchema = exports.OhMyOpencodeSaveConfigResponseSchema = exports.OhMyOpencodeSaveConfigInputSchema = exports.OhMyOpencodeReadConfigResponseSchema = exports.OhMyOpencodeReadConfigInputSchema = exports.AppSettingSetOhMyOpencodePathResponseSchema = exports.AppSettingSetOhMyOpencodePathInputSchema = exports.AppSettingGetOhMyOpencodePathResponseSchema = exports.OhMyOpencodeConfigSchema = exports.OhMyOpencodeModelFieldSchema = exports.AppSettingSetDefaultModelResponseSchema = exports.AppSettingSetDefaultModelInputSchema = exports.AppSettingGetDefaultModelResponseSchema = exports.AppSettingGetDefaultModelInputSchema = exports.OpencodeSendMessageResponseSchema = exports.OpencodeSendMessageInputSchema = exports.OpenCodeLogProvidersResponseSchema = exports.OpenCodeLogProvidersInputSchema = exports.OpencodeModelUpdateDifficultyResponseSchema = exports.OpencodeModelUpdateDifficultyInputSchema = exports.OpencodeModelToggleResponseSchema = exports.OpencodeModelToggleInputSchema = exports.OpencodeModelsListResponseSchema = exports.OpencodeModelSchema = exports.VoskModelDownloadResponseSchema = exports.VoskModelDownloadInputSchema = exports.STTErrorEventSchema = exports.STTFailedEventSchema = exports.STTFinalEventSchema = exports.STTCommittedEventSchema = exports.STTDeltaEventSchema = exports.STTStatusEventSchema = exports.STTAudioInputSchema = exports.STTLanguageInputSchema = exports.STTStopInputSchema = exports.STTStartInputSchema = exports.STTStatusSchema = exports.STTModeSchema = exports.STTLanguageSchema = void 0;
var zod_1 = require("zod");
exports.TaskStatusSchema = zod_1.z
    .enum(['queued', 'running', 'question', 'paused', 'done', 'failed', 'generating'])
    .describe('TaskStatus');
exports.TaskPrioritySchema = zod_1.z
    .enum(['postpone', 'low', 'normal', 'urgent'])
    .describe('TaskPriority');
exports.LogLevelSchema = zod_1.z.enum(['info', 'warn', 'error', 'debug']);
exports.LogEntrySchema = zod_1.z.object({
    timestamp: zod_1.z.string(),
    level: exports.LogLevelSchema,
    message: zod_1.z.string(),
    context: zod_1.z.string().optional(),
});
exports.AppMetricSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    metricName: zod_1.z.string(),
    metricValue: zod_1.z.number(),
    tags: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    createdAt: zod_1.z.string().datetime(),
});
exports.DiagnosticsGetMetricsInputSchema = zod_1.z
    .object({
    limit: zod_1.z.number().int().min(1).max(1000).optional(),
    metricName: zod_1.z.string().min(1).optional(),
})
    .optional();
exports.DiagnosticsGetMetricsResponseSchema = zod_1.z.object({
    metrics: zod_1.z.array(exports.AppMetricSchema),
});
exports.AppInfoSchema = zod_1.z.object({
    name: zod_1.z.string(),
    version: zod_1.z.string(),
    platform: zod_1.z.string(),
    arch: zod_1.z.string(),
    electronVersion: zod_1.z.string(),
    chromeVersion: zod_1.z.string(),
    nodeVersion: zod_1.z.string(),
    mode: zod_1.z.string(),
    userDataPath: zod_1.z.string(),
});
exports.ProjectSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1),
    path: zod_1.z.string(),
    color: zod_1.z.string().default(''),
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
});
exports.CreateProjectInputSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    path: zod_1.z.string(),
    color: zod_1.z.string().optional(),
});
exports.UpdateProjectInputSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1).optional(),
    path: zod_1.z.string().optional(),
    color: zod_1.z.string().optional(),
});
exports.DeleteProjectInputSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
exports.BoardColumnSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    boardId: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1),
    systemKey: zod_1.z.string().default(''),
    orderIndex: zod_1.z.number(),
    color: zod_1.z.string().default(''),
});
exports.BoardColumnInputSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().min(1),
    systemKey: zod_1.z.string().default(''),
    orderIndex: zod_1.z.number(),
    color: zod_1.z.string().default(''),
});
exports.BoardSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    projectId: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1),
    columns: zod_1.z.array(exports.BoardColumnSchema).optional(),
});
exports.BoardGetDefaultInputSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid(),
});
exports.BoardGetDefaultResponseSchema = zod_1.z.object({
    board: exports.BoardSchema,
    columns: zod_1.z.array(exports.BoardColumnSchema),
});
exports.BoardUpdateColumnsInputSchema = zod_1.z.object({
    boardId: zod_1.z.string().uuid(),
    columns: zod_1.z.array(exports.BoardColumnInputSchema),
});
exports.BoardUpdateColumnsResponseSchema = zod_1.z.object({
    columns: zod_1.z.array(exports.BoardColumnSchema),
});
exports.KanbanTaskSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    projectId: zod_1.z.string().uuid(),
    boardId: zod_1.z.string().uuid(),
    columnId: zod_1.z.string().uuid(),
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    descriptionMd: zod_1.z.string().optional(),
    status: zod_1.z.enum(['queued', 'running', 'question', 'paused', 'done', 'failed', 'generating']),
    priority: zod_1.z.enum(['postpone', 'low', 'normal', 'urgent']),
    difficulty: zod_1.z.enum(['easy', 'medium', 'hard', 'epic']).default('medium'),
    type: zod_1.z.string(),
    orderInColumn: zod_1.z.number().optional(),
    tags: zod_1.z.array(zod_1.z.string()),
    startDate: zod_1.z.string().nullable().optional(),
    dueDate: zod_1.z.string().nullable().optional(),
    estimatePoints: zod_1.z.number().optional(),
    estimateHours: zod_1.z.number().optional(),
    assignee: zod_1.z.string().optional(),
    modelName: zod_1.z.string().nullable().optional(),
    createdAt: zod_1.z.string().datetime().optional(),
    updatedAt: zod_1.z.string().datetime().optional(),
});
exports.CreateTaskInputSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid(),
    boardId: zod_1.z.string().uuid(),
    columnId: zod_1.z.string().uuid(),
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    type: zod_1.z.string().default('task'),
    priority: zod_1.z.enum(['postpone', 'low', 'normal', 'urgent']).default('normal'),
    difficulty: zod_1.z.enum(['easy', 'medium', 'hard', 'epic']).default('medium'),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
    modelName: zod_1.z.string().nullable().optional(),
});
exports.TaskCreateResponseSchema = zod_1.z.object({
    task: exports.KanbanTaskSchema,
});
exports.TaskPatchSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().optional(),
    descriptionMd: zod_1.z.string().optional(),
    status: zod_1.z
        .enum(['queued', 'running', 'question', 'paused', 'done', 'failed', 'generating'])
        .optional(),
    priority: zod_1.z.enum(['postpone', 'low', 'normal', 'urgent']).optional(),
    difficulty: zod_1.z.enum(['easy', 'medium', 'hard', 'epic']).optional(),
    type: zod_1.z.string().optional(),
    columnId: zod_1.z.string().uuid().optional(),
    orderInColumn: zod_1.z.number().optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    startDate: zod_1.z.string().nullable().optional(),
    dueDate: zod_1.z.string().nullable().optional(),
    estimatePoints: zod_1.z.number().optional(),
    estimateHours: zod_1.z.number().optional(),
    assignee: zod_1.z.string().optional(),
    modelName: zod_1.z.string().nullable().optional(),
});
exports.TaskListInputSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid().optional(),
    boardId: zod_1.z.string().uuid().optional(),
});
exports.TaskListResponseSchema = zod_1.z.object({
    tasks: zod_1.z.array(exports.KanbanTaskSchema),
});
exports.TaskListByBoardInputSchema = exports.TaskListInputSchema;
exports.TaskListByBoardResponseSchema = exports.TaskListResponseSchema;
exports.TaskUpdateInputSchema = zod_1.z.object({
    taskId: zod_1.z.string().uuid(),
    patch: exports.TaskPatchSchema,
});
exports.TaskUpdateResponseSchema = exports.TaskCreateResponseSchema;
exports.TaskGetInputSchema = zod_1.z.object({
    taskId: zod_1.z.string().uuid(),
});
exports.TaskGetResponseSchema = zod_1.z.object({
    task: exports.KanbanTaskSchema,
});
exports.TaskDeleteInputSchema = zod_1.z.object({
    taskId: zod_1.z.string().uuid(),
});
exports.TaskDeleteResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.TaskMoveInputSchema = zod_1.z.object({
    taskId: zod_1.z.string().uuid(),
    toColumnId: zod_1.z.string().uuid(),
    toIndex: zod_1.z.number(),
});
exports.TaskMoveResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.TaskDependencyTypeSchema = zod_1.z.enum(['blocks', 'blocked_by', 'relates']);
exports.TaskLinkTypeSchema = zod_1.z.enum(['blocks', 'relates']);
exports.TaskLinkSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    projectId: zod_1.z.string().uuid(),
    fromTaskId: zod_1.z.string().uuid(),
    toTaskId: zod_1.z.string().uuid(),
    linkType: exports.TaskLinkTypeSchema,
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
});
exports.DepsAddInputSchema = zod_1.z.object({
    fromTaskId: zod_1.z.string().uuid(),
    toTaskId: zod_1.z.string().uuid(),
    type: exports.TaskLinkTypeSchema,
});
exports.DepsAddResponseSchema = zod_1.z.object({
    link: exports.TaskLinkSchema,
});
exports.DepsRemoveInputSchema = zod_1.z.object({
    linkId: zod_1.z.string().uuid(),
});
exports.DepsRemoveResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.DepsListInputSchema = zod_1.z.object({
    taskId: zod_1.z.string().uuid(),
});
exports.DepsListResponseSchema = zod_1.z.object({
    links: zod_1.z.array(exports.TaskLinkSchema),
});
exports.TimelineTaskSchema = exports.KanbanTaskSchema;
exports.TaskScheduleSchema = zod_1.z.object({
    taskId: zod_1.z.string().uuid(),
    startDate: zod_1.z.string().nullable(),
    dueDate: zod_1.z.string().nullable(),
    estimatePoints: zod_1.z.number(),
    estimateHours: zod_1.z.number(),
    assignee: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
});
exports.ScheduleGetInputSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid(),
});
exports.ScheduleGetResponseSchema = zod_1.z.object({
    tasks: zod_1.z.array(exports.TimelineTaskSchema),
});
exports.ScheduleUpdateInputSchema = zod_1.z.object({
    taskId: zod_1.z.string().uuid(),
    startDate: zod_1.z.string().nullable(),
    dueDate: zod_1.z.string().nullable(),
    estimatePoints: zod_1.z.number().optional(),
    estimateHours: zod_1.z.number().optional(),
    assignee: zod_1.z.string().optional(),
});
exports.ScheduleUpdateResponseSchema = zod_1.z.object({
    schedule: exports.TaskScheduleSchema,
});
exports.SearchEntitySchema = zod_1.z.enum(['task', 'run', 'artifact']);
exports.SearchFiltersSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid().optional(),
    entity: exports.SearchEntitySchema.optional(),
    status: zod_1.z.enum(['queued', 'running', 'question', 'paused', 'done', 'failed']).optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    priority: zod_1.z.enum(['postpone', 'low', 'normal', 'urgent']).optional(),
    role: zod_1.z.string().optional(),
    dateFrom: zod_1.z.string().optional(),
    dateTo: zod_1.z.string().optional(),
});
exports.SearchQueryInputSchema = zod_1.z.object({
    q: zod_1.z.string().trim().min(1),
    filters: exports.SearchFiltersSchema.optional(),
    limit: zod_1.z.number().int().positive().max(200).optional(),
    offset: zod_1.z.number().int().min(0).optional(),
});
exports.TaskSearchResultSchema = zod_1.z.object({
    entity: zod_1.z.literal('task'),
    task: exports.KanbanTaskSchema,
});
exports.RunSearchResultSchema = zod_1.z.object({
    entity: zod_1.z.literal('run'),
    run: zod_1.z.object({
        id: zod_1.z.string().uuid(),
        taskId: zod_1.z.string().uuid(),
        projectId: zod_1.z.string().uuid(),
        roleId: zod_1.z.string(),
        status: zod_1.z.string(),
        errorText: zod_1.z.string(),
        createdAt: zod_1.z.string().datetime(),
    }),
});
exports.ArtifactSearchResultSchema = zod_1.z.object({
    entity: zod_1.z.literal('artifact'),
    artifact: zod_1.z.object({
        id: zod_1.z.string().uuid(),
        runId: zod_1.z.string().uuid(),
        taskId: zod_1.z.string().uuid(),
        projectId: zod_1.z.string().uuid(),
        title: zod_1.z.string(),
        kind: zod_1.z.string(),
        createdAt: zod_1.z.string().datetime(),
    }),
});
exports.SearchResultSchema = zod_1.z.union([
    exports.TaskSearchResultSchema,
    exports.RunSearchResultSchema,
    exports.ArtifactSearchResultSchema,
]);
exports.SearchQueryResponseSchema = zod_1.z.object({
    results: zod_1.z.array(exports.SearchResultSchema),
});
exports.AnalyticsRangeSchema = zod_1.z.object({
    from: zod_1.z.string().optional(),
    to: zod_1.z.string().optional(),
});
exports.AnalyticsOverviewSchema = zod_1.z.object({
    wipCount: zod_1.z.number(),
    throughputPerDay: zod_1.z.number(),
    doneCount: zod_1.z.number(),
    createdCount: zod_1.z.number(),
    leadTimeHours: zod_1.z.number(),
    cycleTimeHours: zod_1.z.number(),
    aiTokensIn: zod_1.z.number(),
    aiTokensOut: zod_1.z.number(),
    aiCostUsd: zod_1.z.number(),
});
exports.AnalyticsRunStatsSchema = zod_1.z.object({
    totalRuns: zod_1.z.number(),
    successRuns: zod_1.z.number(),
    successRate: zod_1.z.number(),
    avgDurationSec: zod_1.z.number(),
});
exports.AnalyticsGetOverviewInputSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid(),
    range: exports.AnalyticsRangeSchema.optional(),
});
exports.AnalyticsGetRunStatsInputSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid(),
    range: exports.AnalyticsRangeSchema.optional(),
});
exports.AnalyticsGetOverviewResponseSchema = zod_1.z.object({
    overview: exports.AnalyticsOverviewSchema,
});
exports.AnalyticsGetRunStatsResponseSchema = zod_1.z.object({
    stats: exports.AnalyticsRunStatsSchema,
});
exports.PluginTypeSchema = zod_1.z.enum(['role', 'executor', 'integration', 'ui']);
exports.PluginPermissionsSchema = zod_1.z.object({
    canRegisterRoles: zod_1.z.boolean().default(false),
    canRegisterExecutors: zod_1.z.boolean().default(false),
    canCallNetwork: zod_1.z.boolean().default(false),
});
exports.PluginManifestSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    version: zod_1.z.string().min(1),
    type: exports.PluginTypeSchema,
    permissions: exports.PluginPermissionsSchema.optional(),
    entrypoint: zod_1.z.string().min(1),
});
exports.PluginRecordSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    version: zod_1.z.string().min(1),
    enabled: zod_1.z.boolean(),
    type: exports.PluginTypeSchema,
    manifest: exports.PluginManifestSchema,
    installedAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
});
exports.PluginsListResponseSchema = zod_1.z.object({
    plugins: zod_1.z.array(exports.PluginRecordSchema),
});
exports.PluginsInstallInputSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
});
exports.PluginsInstallResponseSchema = zod_1.z.object({
    plugin: exports.PluginRecordSchema,
});
exports.PluginsEnableInputSchema = zod_1.z.object({
    pluginId: zod_1.z.string().min(1),
    enabled: zod_1.z.boolean(),
});
exports.PluginsEnableResponseSchema = zod_1.z.object({
    plugin: exports.PluginRecordSchema,
});
exports.PluginsReloadResponseSchema = zod_1.z.object({
    plugins: zod_1.z.array(exports.PluginRecordSchema),
});
exports.RoleSummarySchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
});
exports.RolesListResponseSchema = zod_1.z.object({
    roles: zod_1.z.array(exports.RoleSummarySchema),
});
exports.BackupExportInputSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid(),
    toPath: zod_1.z.string().min(1),
});
exports.BackupExportResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    path: zod_1.z.string().min(1),
});
exports.BackupImportInputSchema = zod_1.z.object({
    zipPath: zod_1.z.string().min(1),
    mode: zod_1.z.enum(['new', 'overwrite']).default('new'),
    projectPath: zod_1.z.string().optional(),
});
exports.BackupImportResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    projectId: zod_1.z.string().uuid().optional(),
});
exports.TagSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1),
    color: zod_1.z.string(),
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
});
exports.TagCreateInputSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    color: zod_1.z.string(),
});
exports.TagUpdateInputSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1).optional(),
    color: zod_1.z.string().optional(),
});
exports.TagDeleteInputSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
exports.TagListInputSchema = zod_1.z.object({});
exports.TagListResponseSchema = zod_1.z.object({
    tags: zod_1.z.array(exports.TagSchema),
});
exports.DatabaseDeleteInputSchema = zod_1.z.object({});
exports.DatabaseDeleteResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.RunModeSchema = zod_1.z.enum(['plan-only', 'execute', 'critique']);
exports.RunStatusSchema = zod_1.z.enum(['queued', 'running', 'succeeded', 'failed', 'canceled']);
exports.RunKindSchema = zod_1.z.enum(['task-run', 'task-description-improve']);
exports.RunSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    taskId: zod_1.z.string().uuid(),
    roleId: zod_1.z.string(),
    mode: exports.RunModeSchema,
    kind: exports.RunKindSchema,
    status: exports.RunStatusSchema,
    startedAt: zod_1.z.string().datetime().optional(),
    finishedAt: zod_1.z.string().datetime().optional(),
    errorText: zod_1.z.string(),
    budget: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).default({}),
    contextSnapshotId: zod_1.z.string().uuid(),
    sessionId: zod_1.z.string().optional(),
    aiTokensIn: zod_1.z.number().default(0),
    aiTokensOut: zod_1.z.number().default(0),
    aiCostUsd: zod_1.z.number().default(0),
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
});
exports.RunStartInputSchema = zod_1.z.object({
    taskId: zod_1.z.string().uuid(),
    roleId: zod_1.z.string(),
    mode: exports.RunModeSchema.optional(),
});
exports.RunStartResponseSchema = zod_1.z.object({
    runId: zod_1.z.string().uuid(),
});
exports.RunCancelInputSchema = zod_1.z.object({
    runId: zod_1.z.string().uuid(),
});
exports.RunCancelResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.RunDeleteInputSchema = zod_1.z.object({
    runId: zod_1.z.string().uuid(),
});
exports.RunDeleteResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.RunListByTaskInputSchema = zod_1.z.object({
    taskId: zod_1.z.string().uuid(),
});
exports.RunListByTaskResponseSchema = zod_1.z.object({
    runs: zod_1.z.array(exports.RunSchema),
});
exports.RunGetInputSchema = zod_1.z.object({
    runId: zod_1.z.string().uuid(),
});
exports.RunGetResponseSchema = zod_1.z.object({
    run: exports.RunSchema,
});
exports.RunEventTypeSchema = zod_1.z.enum([
    'stdout',
    'stderr',
    'message',
    'tool',
    'artifact',
    'status',
    'debug',
    'usage',
]);
exports.RunEventSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    runId: zod_1.z.string().uuid(),
    ts: zod_1.z.string().datetime(),
    eventType: exports.RunEventTypeSchema,
    payload: zod_1.z.unknown(),
});
exports.RunEventMessagePayloadSchema = zod_1.z.object({
    role: zod_1.z.enum(['user', 'assistant']),
    content: zod_1.z.string(),
    modelID: zod_1.z.string().optional(),
    parts: zod_1.z.any().array(),
});
exports.RunEventsTailInputSchema = zod_1.z.object({
    runId: zod_1.z.string(),
    afterTs: zod_1.z.string().datetime().optional(),
    limit: zod_1.z.number().int().positive().optional(),
});
exports.RunEventsTailResponseSchema = zod_1.z.object({
    events: zod_1.z.array(exports.RunEventSchema),
});
exports.ArtifactKindSchema = zod_1.z.enum(['markdown', 'json', 'patch', 'file_ref', 'link']);
exports.ArtifactSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    runId: zod_1.z.string().uuid(),
    kind: exports.ArtifactKindSchema,
    title: zod_1.z.string(),
    content: zod_1.z.string(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).default({}),
    createdAt: zod_1.z.string().datetime(),
});
exports.ArtifactListInputSchema = zod_1.z.object({
    runId: zod_1.z.string().uuid(),
});
exports.ArtifactListResponseSchema = zod_1.z.object({
    artifacts: zod_1.z.array(exports.ArtifactSchema),
});
exports.ArtifactGetInputSchema = zod_1.z.object({
    artifactId: zod_1.z.string().uuid(),
});
exports.ArtifactGetResponseSchema = zod_1.z.object({
    artifact: exports.ArtifactSchema,
});
exports.AppSettingGetLastProjectIdResponseSchema = zod_1.z.object({
    projectId: zod_1.z.string().nullable(),
});
exports.AppSettingSetLastProjectIdInputSchema = zod_1.z.object({
    projectId: zod_1.z.string(),
});
exports.AppSettingSetLastProjectIdResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.AppSettingGetSidebarCollapsedResponseSchema = zod_1.z.object({
    collapsed: zod_1.z.boolean(),
});
exports.AppSettingSetSidebarCollapsedInputSchema = zod_1.z.object({
    collapsed: zod_1.z.boolean(),
});
exports.AppSettingSetSidebarCollapsedResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.AppSettingRetentionPolicySchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
    days: zod_1.z.number().int().min(1).max(3650),
});
exports.AppSettingGetRetentionPolicyResponseSchema = exports.AppSettingRetentionPolicySchema;
exports.AppSettingSetRetentionPolicyInputSchema = exports.AppSettingRetentionPolicySchema;
exports.AppSettingSetRetentionPolicyResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.AppSettingRunRetentionCleanupInputSchema = zod_1.z.object({
    dryRun: zod_1.z.boolean().optional(),
    maxDeletes: zod_1.z.number().int().min(1).max(10000).optional(),
});
exports.AppSettingRunRetentionCleanupResponseSchema = zod_1.z.object({
    cutoffIso: zod_1.z.string().datetime(),
    deletedRunEvents: zod_1.z.number().int().min(0),
    deletedArtifacts: zod_1.z.number().int().min(0),
    dryRun: zod_1.z.boolean(),
});
exports.OpenCodeGenerateUserStoryInputSchema = zod_1.z.object({
    taskId: zod_1.z.string().uuid(),
});
exports.OpenCodeGenerateUserStoryResponseSchema = zod_1.z.object({
    runId: zod_1.z.string().uuid(),
});
exports.OpenCodeSessionStatusInputSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
});
exports.OpenCodeSessionStatusResponseSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    runId: zod_1.z.string(),
    status: zod_1.z.enum(['running', 'completed', 'failed', 'timeout']),
    messageCount: zod_1.z.number().int(),
    lastMessageAt: zod_1.z.number().optional(),
});
exports.OpenCodeActiveSessionsResponseSchema = zod_1.z.object({
    count: zod_1.z.number().int(),
});
exports.OpenCodeSessionMessagesInputSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    limit: zod_1.z.number().int().optional(),
});
exports.OpenCodeMessageSchema = zod_1.z.object({
    id: zod_1.z.string(),
    role: zod_1.z.enum(['user', 'assistant']),
    content: zod_1.z.string(),
    parts: zod_1.z.array(zod_1.z.any()),
    timestamp: zod_1.z.number(),
    modelID: zod_1.z.string().optional(),
});
exports.OpenCodeSessionMessagesResponseSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    messages: zod_1.z.array(exports.OpenCodeMessageSchema),
});
exports.OpenCodeTodoSchema = zod_1.z.object({
    id: zod_1.z.string(),
    content: zod_1.z.string(),
    status: zod_1.z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
    priority: zod_1.z.enum(['high', 'medium', 'low']),
});
exports.OpenCodeSessionTodosInputSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
});
exports.OpenCodeSessionTodosResponseSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    todos: zod_1.z.array(exports.OpenCodeTodoSchema),
});
exports.TaskEventSchema = zod_1.z.object({
    type: zod_1.z.enum(['task.updated']),
    task: exports.KanbanTaskSchema,
});
// OpenCode event subscription types
exports.OpenCodeSubscribeInputSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
});
exports.OpenCodeSubscribeResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    subscribed: zod_1.z.literal(true),
});
exports.OpenCodeUnsubscribeInputSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
});
exports.OpenCodeUnsubscribeResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    subscribed: zod_1.z.literal(false),
});
exports.OpenCodeIsSubscribedInputSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
});
exports.OpenCodeIsSubscribedResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    subscribed: zod_1.z.boolean(),
});
exports.OpenCodeSessionEventSchema = zod_1.z.union([
    zod_1.z.object({
        type: zod_1.z.literal('todo.updated'),
        sessionId: zod_1.z.string(),
        todos: zod_1.z.array(exports.OpenCodeTodoSchema),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('message.updated'),
        sessionId: zod_1.z.string(),
        message: zod_1.z.unknown(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('message.removed'),
        sessionId: zod_1.z.string(),
        messageId: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('message.part.updated'),
        sessionId: zod_1.z.string(),
        messageId: zod_1.z.string(),
        part: zod_1.z.unknown(),
        delta: zod_1.z.string().optional(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('message.part.removed'),
        sessionId: zod_1.z.string(),
        messageId: zod_1.z.string(),
        partId: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('error'),
        sessionId: zod_1.z.string(),
        error: zod_1.z.string(),
    }),
]);
// ---------------------------------------------------------------------------
// TaskQueueManager schemas
// ---------------------------------------------------------------------------
exports.TaskQueueStateSchema = zod_1.z.enum([
    'queued',
    'running',
    'waiting_user',
    'paused',
    'done',
    'failed',
    'cancelled',
]);
exports.TaskQueueStageSchema = zod_1.z.enum(['ba', 'fe', 'be', 'qa', 'kb']);
exports.TaskQueueRowSchema = zod_1.z.object({
    task_id: zod_1.z.string().uuid(),
    state: exports.TaskQueueStateSchema,
    stage: exports.TaskQueueStageSchema,
    priority: zod_1.z.number().int(),
    enqueued_at: zod_1.z.string().datetime(),
    updated_at: zod_1.z.string().datetime(),
    last_error: zod_1.z.string(),
    locked_by: zod_1.z.string(),
    locked_until: zod_1.z.string().datetime().nullable(),
});
exports.RoleSlotRowSchema = zod_1.z.object({
    role_key: zod_1.z.enum(['ba', 'fe', 'be', 'qa']),
    max_concurrency: zod_1.z.number().int().nonnegative(),
    updated_at: zod_1.z.string().datetime(),
});
exports.ResourceLockRowSchema = zod_1.z.object({
    lock_key: zod_1.z.string(),
    owner: zod_1.z.string(),
    acquired_at: zod_1.z.string().datetime(),
    expires_at: zod_1.z.string().datetime(),
});
// ---------------------------------------------------------------------------
// STT (Speech-to-Text) Realtime Transcription schemas
// ---------------------------------------------------------------------------
exports.STTLanguageSchema = zod_1.z.enum(['ru', 'en']);
exports.STTModeSchema = zod_1.z.enum(['ptt', 'toggle']);
exports.STTStatusSchema = zod_1.z.enum([
    'idle',
    'requesting_mic',
    'connecting',
    'listening',
    'speech',
    'finalizing',
    'error',
]);
exports.STTStartInputSchema = zod_1.z.object({
    editorId: zod_1.z.string(),
    language: exports.STTLanguageSchema,
    mode: exports.STTModeSchema.optional(),
});
exports.STTStopInputSchema = zod_1.z.object({
    editorId: zod_1.z.string(),
});
exports.STTLanguageInputSchema = zod_1.z.object({
    editorId: zod_1.z.string(),
    language: exports.STTLanguageSchema,
});
exports.STTAudioInputSchema = zod_1.z.object({
    editorId: zod_1.z.string(),
    pcm16Base64: zod_1.z.string(),
});
exports.STTStatusEventSchema = zod_1.z.object({
    editorId: zod_1.z.string(),
    status: exports.STTStatusSchema,
    details: zod_1.z.string().optional(),
});
exports.STTDeltaEventSchema = zod_1.z.object({
    editorId: zod_1.z.string(),
    itemId: zod_1.z.string(),
    textDelta: zod_1.z.string(),
});
exports.STTCommittedEventSchema = zod_1.z.object({
    editorId: zod_1.z.string(),
    itemId: zod_1.z.string(),
    previousItemId: zod_1.z.string().optional(),
});
exports.STTFinalEventSchema = zod_1.z.object({
    editorId: zod_1.z.string(),
    itemId: zod_1.z.string(),
    transcript: zod_1.z.string(),
});
exports.STTFailedEventSchema = zod_1.z.object({
    editorId: zod_1.z.string(),
    itemId: zod_1.z.string(),
    error: zod_1.z.object({
        code: zod_1.z.string().optional(),
        message: zod_1.z.string(),
    }),
});
exports.STTErrorEventSchema = zod_1.z.object({
    editorId: zod_1.z.string(),
    error: zod_1.z.object({
        code: zod_1.z.string().optional(),
        message: zod_1.z.string(),
    }),
});
exports.VoskModelDownloadInputSchema = zod_1.z.object({
    lang: zod_1.z.enum(['ru', 'en']),
});
exports.VoskModelDownloadResponseSchema = zod_1.z.object({
    path: zod_1.z.string(),
});
// ---------------------------------------------------------------------------
// OpenCode Models schemas
// ---------------------------------------------------------------------------
exports.OpencodeModelSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    enabled: zod_1.z.boolean(),
    difficulty: zod_1.z.enum(['easy', 'medium', 'hard', 'epic']),
    variants: zod_1.z.string().default(''),
});
exports.OpencodeModelsListResponseSchema = zod_1.z.object({
    models: zod_1.z.array(exports.OpencodeModelSchema),
});
exports.OpencodeModelToggleInputSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    enabled: zod_1.z.boolean(),
});
exports.OpencodeModelToggleResponseSchema = zod_1.z.object({
    model: exports.OpencodeModelSchema,
});
exports.OpencodeModelUpdateDifficultyInputSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    difficulty: zod_1.z.enum(['easy', 'medium', 'hard', 'epic']),
});
exports.OpencodeModelUpdateDifficultyResponseSchema = zod_1.z.object({
    model: exports.OpencodeModelSchema,
});
exports.OpenCodeLogProvidersInputSchema = zod_1.z.object({});
exports.OpenCodeLogProvidersResponseSchema = zod_1.z.object({
    success: zod_1.z.literal(true),
});
exports.OpencodeSendMessageInputSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    message: zod_1.z.string(),
});
exports.OpencodeSendMessageResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.AppSettingGetDefaultModelInputSchema = zod_1.z.object({
    difficulty: zod_1.z.enum(['easy', 'medium', 'hard', 'epic']),
});
exports.AppSettingGetDefaultModelResponseSchema = zod_1.z.object({
    modelName: zod_1.z.string().nullable(),
});
exports.AppSettingSetDefaultModelInputSchema = zod_1.z.object({
    difficulty: zod_1.z.enum(['easy', 'medium', 'hard', 'epic']),
    modelName: zod_1.z.string(),
});
exports.AppSettingSetDefaultModelResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
// OhMyOpencode config schemas
exports.OhMyOpencodeModelFieldSchema = zod_1.z.object({
    key: zod_1.z.string(),
    path: zod_1.z.array(zod_1.z.string()),
    value: zod_1.z.string(),
    reasoningEffort: zod_1.z.string().nullable().optional(),
    variant: zod_1.z.string().nullable().optional(),
    temperature: zod_1.z.number().nullable().optional(),
});
// Allow either a string (model name) or an object with model/variant fields
// Using loose validation to support both formats
var ohMyOpencodeEntrySchema = zod_1.z.union([zod_1.z.string(), zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())]);
exports.OhMyOpencodeConfigSchema = zod_1.z
    .object({
    categories: zod_1.z.record(zod_1.z.string(), ohMyOpencodeEntrySchema).optional(),
    agents: zod_1.z.record(zod_1.z.string(), ohMyOpencodeEntrySchema).optional(),
    systemDefaultModel: zod_1.z.string().optional(),
    $schema: zod_1.z.string().optional(),
})
    .passthrough();
exports.AppSettingGetOhMyOpencodePathResponseSchema = zod_1.z.object({
    path: zod_1.z.string().nullable(),
});
exports.AppSettingSetOhMyOpencodePathInputSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
});
exports.AppSettingSetOhMyOpencodePathResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.OhMyOpencodeReadConfigInputSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
});
exports.OhMyOpencodeReadConfigResponseSchema = zod_1.z.object({
    config: zod_1.z.any(),
    modelFields: zod_1.z.array(exports.OhMyOpencodeModelFieldSchema),
});
exports.OhMyOpencodeSaveConfigInputSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
    config: zod_1.z.any(),
});
exports.OhMyOpencodeSaveConfigResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.OhMyOpencodeBackupConfigInputSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
});
exports.OhMyOpencodeBackupConfigResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    backupPath: zod_1.z.string(),
});
exports.OhMyOpencodeRestoreConfigInputSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
});
exports.OhMyOpencodeRestoreConfigResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
});
exports.OhMyOpencodeListPresetsInputSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
});
exports.OhMyOpencodeListPresetsResponseSchema = zod_1.z.object({
    presets: zod_1.z.array(zod_1.z.string()),
});
exports.OhMyOpencodeLoadPresetInputSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
    presetName: zod_1.z.string().min(1),
});
exports.OhMyOpencodeLoadPresetResponseSchema = exports.OhMyOpencodeReadConfigResponseSchema;
exports.OhMyOpencodeSavePresetInputSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
    presetName: zod_1.z.string().min(1),
    config: zod_1.z.any(),
});
exports.OhMyOpencodeSavePresetResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    presetPath: zod_1.z.string(),
});
