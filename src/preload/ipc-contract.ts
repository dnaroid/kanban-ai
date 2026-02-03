import type {
  AppInfo,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  DeleteProjectInput,
  LogEntry,
  CreateTaskInput,
  BoardGetDefaultInput,
  BoardGetDefaultResponse,
  BoardUpdateColumnsInput,
  BoardUpdateColumnsResponse,
  TaskListByBoardInput,
  TaskListByBoardResponse,
  TaskCreateResponse,
  TaskUpdateInput,
  TaskUpdateResponse,
  TaskMoveInput,
  TaskMoveResponse,
  TaskDeleteInput,
  TaskDeleteResponse,
  Tag,
  TagCreateInput,
  TagUpdateInput,
  TagDeleteInput,
  TagListInput,
  TagListResponse,
  DepsListInput,
  DepsListResponse,
  DepsAddInput,
  DepsAddResponse,
  DepsRemoveInput,
  DepsRemoveResponse,
  ScheduleGetInput,
  ScheduleGetResponse,
  ScheduleUpdateInput,
  ScheduleUpdateResponse,
  SearchQueryInput,
  SearchQueryResponse,
  AnalyticsGetOverviewInput,
  AnalyticsGetOverviewResponse,
  AnalyticsGetRunStatsInput,
  AnalyticsGetRunStatsResponse,
  PluginsListResponse,
  PluginsInstallInput,
  PluginsInstallResponse,
  PluginsEnableInput,
  PluginsEnableResponse,
  PluginsReloadResponse,
  RolesListResponse,
  BackupExportInput,
  BackupExportResponse,
  BackupImportInput,
  BackupImportResponse,
  RunStartInput,
  RunStartResponse,
  RunCancelInput,
  RunCancelResponse,
  RunListByTaskInput,
  RunListByTaskResponse,
  RunGetInput,
  RunGetResponse,
  RunDeleteInput,
  RunDeleteResponse,
  RunEventsTailInput,
  RunEventsTailResponse,
  ArtifactListInput,
  ArtifactListResponse,
  ArtifactGetInput,
  ArtifactGetResponse,
  AppSettingGetLastProjectIdResponse,
  AppSettingSetLastProjectIdInput,
  AppSettingSetLastProjectIdResponse,
  AppSettingGetSidebarCollapsedResponse,
  AppSettingSetSidebarCollapsedInput,
  AppSettingSetSidebarCollapsedResponse,
  OpenCodeGenerateUserStoryInput,
  OpenCodeGenerateUserStoryResponse,
  OpenCodeSessionStatusInput,
  OpenCodeSessionStatusResponse,
  OpenCodeActiveSessionsResponse,
  OpenCodeSessionMessagesInput,
  OpenCodeSessionMessagesResponse,
  OpenCodeSessionEvent,
  TaskEvent,
  STTAudioInput,
  STTLanguageInput,
  STTStartInput,
  STTStopInput,
  VoskModelDownloadInput,
  VoskModelDownloadResponse,
} from '../shared/types/ipc'

export type { OpenCodeSessionEvent } from '../shared/types/ipc'
export type { TaskEvent } from '../shared/types/ipc'

export interface MainToRenderer {
  app: {
    getInfo(): Promise<AppInfo>
  }
  opencode: {
    onEvent(sessionId: string, callback: (event: OpenCodeSessionEvent) => void): () => void
    generateUserStory(
      input: OpenCodeGenerateUserStoryInput
    ): Promise<OpenCodeGenerateUserStoryResponse>
    getSessionStatus(input: OpenCodeSessionStatusInput): Promise<OpenCodeSessionStatusResponse>
    getActiveSessions(): Promise<OpenCodeActiveSessionsResponse>
    getSessionMessages(
      input: OpenCodeSessionMessagesInput
    ): Promise<OpenCodeSessionMessagesResponse>
  }
  project: {
    selectFolder(): Promise<{ path: string; name: string } | null>
    create(input: CreateProjectInput): Promise<Project>
    getAll(): Promise<Project[]>
    getById(id: string): Promise<Project | null>
    update(input: UpdateProjectInput): Promise<Project | null>
    delete(input: DeleteProjectInput): Promise<boolean>
  }
  board: {
    getDefault(input: BoardGetDefaultInput): Promise<BoardGetDefaultResponse>
    updateColumns(input: BoardUpdateColumnsInput): Promise<BoardUpdateColumnsResponse>
  }
  task: {
    onEvent(callback: (event: TaskEvent) => void): () => void
    create(input: CreateTaskInput): Promise<TaskCreateResponse>
    listByBoard(input: TaskListByBoardInput): Promise<TaskListByBoardResponse>
    update(input: TaskUpdateInput): Promise<TaskUpdateResponse>
    move(input: TaskMoveInput): Promise<TaskMoveResponse>
    delete(input: TaskDeleteInput): Promise<TaskDeleteResponse>
  }
  tag: {
    create(input: TagCreateInput): Promise<Tag>
    update(input: TagUpdateInput): Promise<Tag>
    delete(input: TagDeleteInput): Promise<{ ok: boolean }>
    list(input: TagListInput): Promise<TagListResponse>
  }
  deps: {
    list(input: DepsListInput): Promise<DepsListResponse>
    add(input: DepsAddInput): Promise<DepsAddResponse>
    remove(input: DepsRemoveInput): Promise<DepsRemoveResponse>
  }
  schedule: {
    get(input: ScheduleGetInput): Promise<ScheduleGetResponse>
    update(input: ScheduleUpdateInput): Promise<ScheduleUpdateResponse>
  }
  search: {
    query(input: SearchQueryInput): Promise<SearchQueryResponse>
  }
  analytics: {
    getOverview(input: AnalyticsGetOverviewInput): Promise<AnalyticsGetOverviewResponse>
    getRunStats(input: AnalyticsGetRunStatsInput): Promise<AnalyticsGetRunStatsResponse>
  }
  plugins: {
    list(): Promise<PluginsListResponse>
    install(input: PluginsInstallInput): Promise<PluginsInstallResponse>
    enable(input: PluginsEnableInput): Promise<PluginsEnableResponse>
    reload(): Promise<PluginsReloadResponse>
  }
  roles: {
    list(): Promise<RolesListResponse>
  }
  backup: {
    exportProject(input: BackupExportInput): Promise<BackupExportResponse>
    importProject(input: BackupImportInput): Promise<BackupImportResponse>
  }
  diagnostics: {
    getLogs(level?: string, limit?: number): Promise<LogEntry[]>
    getLogTail(lines?: number): Promise<string[]>
    getSystemInfo(): Promise<object>
    getDbInfo(): Promise<object>
  }
  run: {
    start(input: RunStartInput): Promise<RunStartResponse>
    cancel(input: RunCancelInput): Promise<RunCancelResponse>
    delete(input: RunDeleteInput): Promise<RunDeleteResponse>
    listByTask(input: RunListByTaskInput): Promise<RunListByTaskResponse>
    get(input: RunGetInput): Promise<RunGetResponse>
  }
  events: {
    tail(input: RunEventsTailInput): Promise<RunEventsTailResponse>
  }
  artifact: {
    list(input: ArtifactListInput): Promise<ArtifactListResponse>
    get(input: ArtifactGetInput): Promise<ArtifactGetResponse>
  }
  appSetting: {
    getLastProjectId(): Promise<AppSettingGetLastProjectIdResponse>
    setLastProjectId(
      input: AppSettingSetLastProjectIdInput
    ): Promise<AppSettingSetLastProjectIdResponse>
    getSidebarCollapsed(): Promise<AppSettingGetSidebarCollapsedResponse>
    setSidebarCollapsed(
      input: AppSettingSetSidebarCollapsedInput
    ): Promise<AppSettingSetSidebarCollapsedResponse>
  }
  vosk: {
    downloadModel(input: VoskModelDownloadInput): Promise<VoskModelDownloadResponse>
  }
}

export interface RendererToMain {
  app: {
    getInfo(): Promise<AppInfo>
  }
  project: {
    selectFolder(): Promise<{ path: string; name: string } | null>
    create(input: CreateProjectInput): Promise<Project>
    getAll(): Promise<Project[]>
    getById(id: string): Promise<Project | null>
    update(input: UpdateProjectInput): Promise<Project | null>
    delete(input: DeleteProjectInput): Promise<boolean>
  }
  board: {
    getDefault(input: BoardGetDefaultInput): Promise<BoardGetDefaultResponse>
    updateColumns(input: BoardUpdateColumnsInput): Promise<BoardUpdateColumnsResponse>
  }
  task: {
    create(input: CreateTaskInput): Promise<TaskCreateResponse>
    listByBoard(input: TaskListByBoardInput): Promise<TaskListByBoardResponse>
    update(input: TaskUpdateInput): Promise<TaskUpdateResponse>
    move(input: TaskMoveInput): Promise<TaskMoveResponse>
    delete(input: TaskDeleteInput): Promise<TaskDeleteResponse>
  }
  tag: {
    create(input: TagCreateInput): Promise<Tag>
    update(input: TagUpdateInput): Promise<Tag>
    delete(input: TagDeleteInput): Promise<{ ok: boolean }>
    list(input: TagListInput): Promise<TagListResponse>
  }
  deps: {
    list(input: DepsListInput): Promise<DepsListResponse>
    add(input: DepsAddInput): Promise<DepsAddResponse>
    remove(input: DepsRemoveInput): Promise<DepsRemoveResponse>
  }
  schedule: {
    get(input: ScheduleGetInput): Promise<ScheduleGetResponse>
    update(input: ScheduleUpdateInput): Promise<ScheduleUpdateResponse>
  }
  search: {
    query(input: SearchQueryInput): Promise<SearchQueryResponse>
  }
  analytics: {
    getOverview(input: AnalyticsGetOverviewInput): Promise<AnalyticsGetOverviewResponse>
    getRunStats(input: AnalyticsGetRunStatsInput): Promise<AnalyticsGetRunStatsResponse>
  }
  plugins: {
    list(): Promise<PluginsListResponse>
    install(input: PluginsInstallInput): Promise<PluginsInstallResponse>
    enable(input: PluginsEnableInput): Promise<PluginsEnableResponse>
    reload(): Promise<PluginsReloadResponse>
  }
  roles: {
    list(): Promise<RolesListResponse>
  }
  backup: {
    exportProject(input: BackupExportInput): Promise<BackupExportResponse>
    importProject(input: BackupImportInput): Promise<BackupImportResponse>
  }
  diagnostics: {
    getLogs(level?: string, limit?: number): Promise<LogEntry[]>
    getLogTail(lines?: number): Promise<string[]>
    getSystemInfo(): Promise<object>
    getDbInfo(): Promise<object>
  }
  run: {
    start(input: RunStartInput): Promise<RunStartResponse>
    cancel(input: RunCancelInput): Promise<RunCancelResponse>
    delete(input: RunDeleteInput): Promise<RunDeleteResponse>
    listByTask(input: RunListByTaskInput): Promise<RunListByTaskResponse>
    get(input: RunGetInput): Promise<RunGetResponse>
  }
  events: {
    tail(input: RunEventsTailInput): Promise<RunEventsTailResponse>
  }
  artifact: {
    list(input: ArtifactListInput): Promise<ArtifactListResponse>
    get(input: ArtifactGetInput): Promise<ArtifactGetResponse>
  }
  appSetting: {
    getLastProjectId(): Promise<AppSettingGetLastProjectIdResponse>
    setLastProjectId(
      input: AppSettingSetLastProjectIdInput
    ): Promise<AppSettingSetLastProjectIdResponse>
    getSidebarCollapsed(): Promise<AppSettingGetSidebarCollapsedResponse>
    setSidebarCollapsed(
      input: AppSettingSetSidebarCollapsedInput
    ): Promise<AppSettingSetSidebarCollapsedResponse>
  }
  stt: {
    start(input: STTStartInput): Promise<void>
    stop(input: STTStopInput): Promise<void>
    setLanguage(input: STTLanguageInput): Promise<void>
    sendAudio(input: STTAudioInput): Promise<void>
  }
}
