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
  GitStatusInput,
  GitStatusResponse,
  GitBranchCreateInput,
  GitBranchCreateResponse,
  GitBranchCheckoutInput,
  GitBranchCheckoutResponse,
  GitDiffInput,
  GitDiffResponse,
  GitCommitInput,
  GitCommitResponse,
  GitPushInput,
  GitPushResponse,
  PrCreateInput,
  PrCreateResponse,
  PrRefreshInput,
  PrRefreshResponse,
  PrMergeInput,
  PrMergeResponse,
  VcsConnectRepoInput,
  VcsConnectRepoResponse,
  IntegrationsSetProviderInput,
  IntegrationsSetProviderResponse,
  IntegrationsSetTokenInput,
  IntegrationsSetTokenResponse,
  RunStartInput,
  RunStartResponse,
  RunCancelInput,
  RunCancelResponse,
  RunListByTaskInput,
  RunListByTaskResponse,
  RunGetInput,
  RunGetResponse,
  RunEventsTailInput,
  RunEventsTailResponse,
  ArtifactListInput,
  ArtifactListResponse,
  ArtifactGetInput,
  ArtifactGetResponse,
  MergeDetectInput,
  MergeDetectResponse,
  MergeSuggestInput,
  MergeSuggestResponse,
  MergeApplyInput,
  MergeApplyResponse,
  MergeAbortInput,
  MergeAbortResponse,
  AutoMergeSetInput,
  AutoMergeSetResponse,
  AutoMergeRunOnceInput,
  AutoMergeRunOnceResponse,
  ReleaseCreateInput,
  ReleaseCreateResponse,
  ReleaseAddItemsInput,
  ReleaseAddItemsResponse,
  ReleaseGenerateNotesInput,
  ReleaseGenerateNotesResponse,
  ReleasePublishInput,
  ReleasePublishResponse,
  ReleaseListInput,
  ReleaseListResponse,
  ReleaseGetInput,
  ReleaseGetResponse,
  AppSettingGetLastProjectIdResponse,
  AppSettingSetLastProjectIdInput,
  AppSettingSetLastProjectIdResponse,
} from '../shared/types/ipc'

export interface MainToRenderer {
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
  git: {
    status(input: GitStatusInput): Promise<GitStatusResponse>
    branchCreate(input: GitBranchCreateInput): Promise<GitBranchCreateResponse>
    branchCheckout(input: GitBranchCheckoutInput): Promise<GitBranchCheckoutResponse>
    diff(input: GitDiffInput): Promise<GitDiffResponse>
    commit(input: GitCommitInput): Promise<GitCommitResponse>
    push(input: GitPushInput): Promise<GitPushResponse>
  }
  pr: {
    create(input: PrCreateInput): Promise<PrCreateResponse>
    refresh(input: PrRefreshInput): Promise<PrRefreshResponse>
    merge(input: PrMergeInput): Promise<PrMergeResponse>
  }
  vcs: {
    connectRepo(input: VcsConnectRepoInput): Promise<VcsConnectRepoResponse>
  }
  integrations: {
    setProvider(input: IntegrationsSetProviderInput): Promise<IntegrationsSetProviderResponse>
    setToken(input: IntegrationsSetTokenInput): Promise<IntegrationsSetTokenResponse>
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
  merge: {
    detect(input: MergeDetectInput): Promise<MergeDetectResponse>
    suggest(input: MergeSuggestInput): Promise<MergeSuggestResponse>
    apply(input: MergeApplyInput): Promise<MergeApplyResponse>
    abort(input: MergeAbortInput): Promise<MergeAbortResponse>
  }
  autoMerge: {
    set(input: AutoMergeSetInput): Promise<AutoMergeSetResponse>
    runOnce(input: AutoMergeRunOnceInput): Promise<AutoMergeRunOnceResponse>
  }
  release: {
    create(input: ReleaseCreateInput): Promise<ReleaseCreateResponse>
    addItems(input: ReleaseAddItemsInput): Promise<ReleaseAddItemsResponse>
    generateNotes(input: ReleaseGenerateNotesInput): Promise<ReleaseGenerateNotesResponse>
    publish(input: ReleasePublishInput): Promise<ReleasePublishResponse>
    list(input: ReleaseListInput): Promise<ReleaseListResponse>
    get(input: ReleaseGetInput): Promise<ReleaseGetResponse>
  }
  appSetting: {
    getLastProjectId(): Promise<AppSettingGetLastProjectIdResponse>
    setLastProjectId(
      input: AppSettingSetLastProjectIdInput
    ): Promise<AppSettingSetLastProjectIdResponse>
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
  git: {
    status(input: GitStatusInput): Promise<GitStatusResponse>
    branchCreate(input: GitBranchCreateInput): Promise<GitBranchCreateResponse>
    branchCheckout(input: GitBranchCheckoutInput): Promise<GitBranchCheckoutResponse>
    diff(input: GitDiffInput): Promise<GitDiffResponse>
    commit(input: GitCommitInput): Promise<GitCommitResponse>
    push(input: GitPushInput): Promise<GitPushResponse>
  }
  pr: {
    create(input: PrCreateInput): Promise<PrCreateResponse>
    refresh(input: PrRefreshInput): Promise<PrRefreshResponse>
    merge(input: PrMergeInput): Promise<PrMergeResponse>
  }
  vcs: {
    connectRepo(input: VcsConnectRepoInput): Promise<VcsConnectRepoResponse>
  }
  integrations: {
    setProvider(input: IntegrationsSetProviderInput): Promise<IntegrationsSetProviderResponse>
    setToken(input: IntegrationsSetTokenInput): Promise<IntegrationsSetTokenResponse>
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
  merge: {
    detect(input: MergeDetectInput): Promise<MergeDetectResponse>
    suggest(input: MergeSuggestInput): Promise<MergeSuggestResponse>
    apply(input: MergeApplyInput): Promise<MergeApplyResponse>
    abort(input: MergeAbortInput): Promise<MergeAbortResponse>
  }
  autoMerge: {
    set(input: AutoMergeSetInput): Promise<AutoMergeSetResponse>
    runOnce(input: AutoMergeRunOnceInput): Promise<AutoMergeRunOnceResponse>
  }
  release: {
    create(input: ReleaseCreateInput): Promise<ReleaseCreateResponse>
    addItems(input: ReleaseAddItemsInput): Promise<ReleaseAddItemsResponse>
    generateNotes(input: ReleaseGenerateNotesInput): Promise<ReleaseGenerateNotesResponse>
    publish(input: ReleasePublishInput): Promise<ReleasePublishResponse>
    list(input: ReleaseListInput): Promise<ReleaseListResponse>
    get(input: ReleaseGetInput): Promise<ReleaseGetResponse>
  }
  appSetting: {
    getLastProjectId(): Promise<AppSettingGetLastProjectIdResponse>
    setLastProjectId(
      input: AppSettingSetLastProjectIdInput
    ): Promise<AppSettingSetLastProjectIdResponse>
  }
}
