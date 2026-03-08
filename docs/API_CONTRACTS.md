# API Contracts

API request/response schemas for integration testing. All endpoints use JSON payloads and return standardized response wrappers.

## Standard Response Format

All API responses follow this envelope structure:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;  // Only in development mode
}
```

Success responses include `data`, error responses include `error` with an optional `details` field containing debugging information in non-production environments.

---

## Core Type Definitions

### Project

```typescript
interface Project {
  id: string;
  name: string;
  path: string;
  color: string;
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}

interface CreateProjectInput {
  name: string;
  path: string;
  color?: string;
}

interface UpdateProjectInput {
  name?: string;
  path?: string;
  color?: string;
}
```

### Board

```typescript
interface Board {
  id: string;
  projectId: string;
  name: string;
  columns: BoardColumn[];
  createdAt: string;
  updatedAt: string;
}

interface BoardColumn {
  id: string;
  boardId: string;
  name: string;
  systemKey: string;
  orderIndex: number;
  wipLimit?: number | null;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BoardColumnInput {
  id?: string;
  name: string;
  systemKey?: string;
  orderIndex: number;
  color?: string | null;
}
```

### Task

```typescript
type TaskStatus = string;
type BlockedReason = "question" | "paused" | "failed";
type ClosedReason = "done" | "failed";
type TaskPriority = "postpone" | "low" | "normal" | "urgent";
type TaskDifficulty = "easy" | "medium" | "hard" | "epic";
type TaskType = "feature" | "bug" | "chore" | "improvement";

interface KanbanTask {
  id: string;
  projectId: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  descriptionMd: string | null;
  status: TaskStatus;
  blockedReason: BlockedReason | null;
  closedReason: ClosedReason | null;
  priority: TaskPriority;
  difficulty: TaskDifficulty;
  type: TaskType;
  orderInColumn: number;
  tags: string[];
  startDate: string | null;
  dueDate: string | null;
  estimatePoints: number | null;
  estimateHours: number | null;
  assignee: string | null;
  modelName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateTaskInput {
  projectId: string;
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  status?: string;
  blockedReason?: BlockedReason | null;
  closedReason?: ClosedReason | null;
  priority?: string;
  difficulty?: string;
  type?: string;
  tags?: string[];
  dueDate?: string;
  modelName?: string | null;
}

interface UpdateTaskInput {
  columnId?: string;
  title?: string;
  description?: string | null;
  descriptionMd?: string | null;
  status?: string;
  blockedReason?: BlockedReason | null;
  closedReason?: ClosedReason | null;
  priority?: string;
  difficulty?: string;
  type?: string;
  orderInColumn?: number;
  tags?: string;
  startDate?: string | null;
  dueDate?: string | null;
  estimatePoints?: number | null;
  estimateHours?: number | null;
  assignee?: string | null;
  modelName?: string | null;
}
```

### Run

```typescript
type RunStatus = 
  | "queued" 
  | "running" 
  | "completed" 
  | "failed" 
  | "cancelled" 
  | "timeout" 
  | "paused";

interface Run {
  id: string;
  taskId: string;
  sessionId: string;
  roleId?: string;
  model?: string;
  mode?: string;
  status: RunStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

interface RunEvent {
  id: string;
  runId: string;
  ts: string;
  eventType: "stdout" | "stderr" | "message" | "status" | string;
  payload: unknown;
}
```

### Artifact

```typescript
interface Artifact {
  id: string;
  runId: string;
  kind: "json" | "patch" | "markdown" | string;
  title: string;
  content: string;
  createdAt: string;
}
```

### Agent Role

```typescript
interface AgentRole {
  id: string;
  name: string;
  description: string;
  preferred_model_name?: string | null;
  preferred_model_variant?: string | null;
  preferred_llm_agent?: string | null;
}

interface AgentRolePreset {
  version: string;
  provider: string;
  modelName: string;
  skills: string[];
  systemPrompt: string;
  mustDo: string[];
  outputContract: string[];
  behavior?: AgentRoleBehavior;
}

interface AgentRoleBehavior {
  preferredForStoryGeneration?: boolean;
  preferredForQaTesting?: boolean;
  recommended?: boolean;
  optional?: boolean;
  quickSelect?: boolean;
}
```

### Task Dependencies

```typescript
type TaskLinkType = "blocks" | "relates";

interface TaskLink {
  id: string;
  projectId: string;
  fromTaskId: string;
  toTaskId: string;
  linkType: TaskLinkType;
  createdAt: string;
  updatedAt: string;
}
```

### Tag

```typescript
interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}
```

### Workflow Configuration

```typescript
type WorkflowColumnSystemKey = string;
type WorkflowTaskStatus = string;
type WorkflowBlockedReason = "question" | "paused" | "failed";
type WorkflowClosedReason = "done" | "failed";
type WorkflowSignalScope = "run" | "user_action";
type WorkflowRunStatus = 
  | "queued" 
  | "running" 
  | "completed" 
  | "failed" 
  | "cancelled" 
  | "timeout" 
  | "paused";

interface WorkflowStatusConfig {
  status: WorkflowTaskStatus;
  orderIndex: number;
  preferredColumnSystemKey: WorkflowColumnSystemKey;
  blockedReason: WorkflowBlockedReason | null;
  closedReason: WorkflowClosedReason | null;
  color: string;
  icon: string;
}

interface WorkflowColumnConfig {
  systemKey: WorkflowColumnSystemKey;
  name: string;
  color: string;
  icon: string;
  orderIndex: number;
  defaultStatus: WorkflowTaskStatus;
  allowedStatuses: WorkflowTaskStatus[];
}

interface WorkflowSignalConfig {
  key: string;
  scope: WorkflowSignalScope;
  title: string;
  description: string;
  orderIndex: number;
  isActive: boolean;
}

interface WorkflowSignalRuleConfig {
  key: string;
  signalKey: string;
  runKind: string | null;
  runStatus: WorkflowRunStatus | null;
  fromColumnSystemKey?: WorkflowColumnSystemKey | null;
  fromStatus: WorkflowTaskStatus | null;
  toStatus: WorkflowTaskStatus;
}

interface WorkflowConfig {
  statuses: WorkflowStatusConfig[];
  columns: WorkflowColumnConfig[];
  statusTransitions: Record<string, WorkflowTaskStatus[]>;
  columnTransitions: Record<WorkflowColumnSystemKey, WorkflowColumnSystemKey[]>;
  signals: WorkflowSignalConfig[];
  signalRules: WorkflowSignalRuleConfig[];
}
```

### OpenCode Types

```typescript
type ToolState = "pending" | "running" | "completed" | "error";

type PartType = 
  | "text" 
  | "file" 
  | "tool" 
  | "reasoning" 
  | "agent" 
  | "step-start" 
  | "snapshot" 
  | "other";

interface TextPart {
  id?: string;
  messageID?: string;
  type: "text";
  text: string;
  ignored?: boolean;
}

interface ToolPart {
  id?: string;
  messageID?: string;
  type: "tool";
  tool: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  error?: string;
  ignored?: boolean;
}

interface OpenCodeMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: Part[];
  timestamp: number;
  modelID?: string;
}

interface OpenCodeTodo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
}

interface OpencodeModel {
  name: string;
  enabled: boolean;
  difficulty: "easy" | "medium" | "hard" | "epic";
  variants: string;
}

interface OpencodeAgent {
  id: string;
  name: string;
}
```

---

## API Endpoint Catalog

### Projects

#### GET /api/projects
List all projects.

**Response:**
```typescript
{
  success: true;
  data: Project[];
}
```

#### GET /api/projects/[id]
Get a single project by ID.

**Response:**
```typescript
{
  success: true;
  data: Project;
}
// Error:
{
  success: false;
  error: "Project not found";
}
```

#### POST /api/projects
Create a new project.

**Request:**
```typescript
{
  name: string;
  path: string;
  color?: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: Project;
}
// Error (409):
{
  success: false;
  error: "Project path already exists";
}
```

#### PUT /api/projects/[id]
Update a project.

**Request:**
```typescript
{
  name?: string;
  path?: string;
  color?: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: Project;
}
// Error (404):
{
  success: false;
  error: "Project not found";
}
```

#### DELETE /api/projects/[id]
Delete a project.

**Response:**
```typescript
{
  success: true;
}
// Error (404):
{
  success: false;
  error: "Project not found";
}
```

---

### Tasks

#### GET /api/tasks
List tasks by board.

**Query Parameters:**
- `boardId` (required): Board ID to filter tasks

**Response:**
```typescript
{
  success: true;
  data: KanbanTask[];
}
// Error (400):
{
  success: false;
  error: "boardId query parameter is required";
}
```

#### GET /api/tasks/[id]
Get a single task.

**Response:**
```typescript
{
  success: true;
  data: KanbanTask;
}
// Error (404):
{
  success: false;
  error: "Task not found";
}
```

#### POST /api/tasks
Create a new task.

**Request:**
```typescript
{
  projectId: string;
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  difficulty?: string;
  type?: string;
  tags?: string[];
  dueDate?: string;
  modelName?: string | null;
}
```

**Response:**
```typescript
{
  success: true;
  data: KanbanTask;
}
```

#### PUT /api/tasks/[id]
Update a task.

**Request:**
```typescript
{
  columnId?: string;
  title?: string;
  description?: string | null;
  status?: string;
  blockedReason?: BlockedReason | null;
  closedReason?: ClosedReason | null;
  priority?: string;
  difficulty?: string;
  type?: string;
  tags?: string[];
  dueDate?: string | null;
  assignee?: string | null;
  modelName?: string | null;
}
```

**Response:**
```typescript
{
  success: true;
  data: KanbanTask;
}
// Errors:
{
  success: false;
  error: "Task not found";  // 404
}
{
  success: false;
  error: "Status transition is not allowed";  // 400
}
{
  success: false;
  error: "Column transition is not allowed";  // 400
}
```

#### DELETE /api/tasks/[id]
Delete a task.

**Response:**
```typescript
{
  success: true;
}
```

#### PUT /api/tasks/[id]/move
Move a task to a different column.

**Request:**
```typescript
{
  columnId: string;
  toIndex?: number;
}
```

**Response:**
```typescript
{
  success: true;
  data: KanbanTask;
}
// Errors:
{
  success: false;
  error: "Column transition is not allowed";  // 400
}
{
  success: false;
  error: "Status transition is not allowed for target column";  // 400
}
```

---

### Boards

#### GET /api/boards/project/[id]
Get board for a project.

**Response:**
```typescript
{
  success: true;
  data: Board;
}
// Error (404):
{
  success: false;
  error: "Board not found";
}
```

#### PUT /api/boards/[id]/columns
Update board columns.

**Request:**
```typescript
{
  columns: BoardColumnInput[];
}
```

**Response:**
```typescript
{
  success: true;
  data: BoardColumn[];
}
```

---

### Runs

#### POST /api/run/start
Start a new run.

**Request:**
```typescript
{
  taskId: string;
  roleId?: string;
  mode?: string;
  modelName?: string | null;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    runId: string;
  };
}
```

#### POST /api/run/cancel
Cancel a running task.

**Request:**
```typescript
{
  runId: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    success: true;
  };
}
```

#### POST /api/run/delete
Delete a run.

**Request:**
```typescript
{
  runId: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    success: true;
  };
}
```

#### GET /api/run/get
Get run details.

**Query Parameters:**
- `runId` (required): Run ID

**Response:**
```typescript
{
  success: true;
  data: {
    run: Run | null;
  };
}
```

#### GET /api/run/listByTask
List runs for a task.

**Query Parameters:**
- `taskId` (required): Task ID

**Response:**
```typescript
{
  success: true;
  data: {
    runs: Run[];
  };
}
```

#### GET /api/run/queueStats
Get queue statistics.

**Response:**
```typescript
{
  success: true;
  data: {
    totalQueued: number;
    totalRunning: number;
    providers: {
      providerKey: string;
      queued: number;
      running: number;
      concurrency: number;
    }[];
  };
}
```

#### POST /api/run/startBySignal
Start runs based on a workflow signal.

**Request:**
```typescript
{
  projectId: string;
  signalKey: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    startedCount: number;
    skippedNoRuleCount: number;
    skippedActiveRunCount: number;
    taskIds: string[];
    runIds: string[];
  };
}
```

---

### OpenCode

#### POST /api/opencode/generate-user-story
Generate user story for task(s).

**Request (single task):**
```typescript
{
  taskId: string;
}
```

**Request (multiple tasks):**
```typescript
{
  taskIds: string[];
}
```

**Response (single):**
```typescript
{
  success: true;
  data: {
    runId: string;
  };
}
```

**Response (multiple):**
```typescript
{
  success: true;
  data: {
    runIds: string[];
  };
}
```

#### POST /api/opencode/start-qa-testing
Start QA testing for a task.

**Request:**
```typescript
{
  taskId: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    runId: string;
  };
}
```

#### GET /api/opencode/agents
List available OpenCode agents.

**Response:**
```typescript
{
  success: true;
  data: {
    agents: OpencodeAgent[];
  };
}
```

#### GET /api/opencode/skills
List available skills.

**Response:**
```typescript
{
  success: true;
  data: {
    skills: string[];
  };
}
```

#### POST /api/opencode/skills/refresh-assignments
Refresh skill assignments.

**Response:**
```typescript
{
  success: true;
  data: {
    sessionId: string;
    updatedRoles: number;
    consideredRoles: number;
  };
}
```

#### GET /api/opencode/models
List all models.

**Response:**
```typescript
{
  success: true;
  data: {
    models: OpencodeModel[];
  };
}
```

#### GET /api/opencode/models/enabled
List enabled models.

**Response:**
```typescript
{
  success: true;
  data: {
    models: OpencodeModel[];
  };
}
```

#### POST /api/opencode/models/toggle
Toggle model enabled state.

**Request:**
```typescript
{
  name: string;
  enabled: boolean;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    model: OpencodeModel;
  };
}
```

#### POST /api/opencode/models/difficulty
Update model difficulty.

**Request:**
```typescript
{
  name: string;
  difficulty: "easy" | "medium" | "hard" | "epic";
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    model: OpencodeModel;
  };
}
```

#### POST /api/opencode/models/refresh
Refresh models from OpenCode.

**Response:**
```typescript
{
  success: true;
  data: {
    models: OpencodeModel[];
  };
}
```

#### GET /api/opencode/models/config
Export models configuration.

**Response:**
```typescript
{
  success: true;
  data: {
    version: number;
    exportedAt: string;
    models: Array<{
      name: string;
      difficulty: string;
    }>;
    defaultModels: Record<string, string>;
    allModelsHash: string;
  };
}
```

#### POST /api/opencode/models/config
Import models configuration.

**Request:**
```typescript
{
  version: number;
  models: Array<{
    name: string;
    difficulty: string;
  }>;
  defaultModels?: Record<string, string>;
  allModelsHash?: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    imported: number;
    skipped: number;
    hashMismatch: boolean;
  };
}
```

#### POST /api/opencode/restart
Restart OpenCode serve.

**Response:**
```typescript
{
  success: true;
  data: {
    restarted: boolean;
  };
}
```

#### GET /api/opencode/sessions/[sessionId]/messages
Get session messages.

**Query Parameters:**
- `limit` (optional): Max messages to return

**Response:**
```typescript
{
  success: true;
  data: {
    messages: OpenCodeMessage[];
  };
}
```

#### POST /api/opencode/sessions/[sessionId]/messages
Send a message to a session.

**Request:**
```typescript
{
  message: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    ok: true;
  };
}
```

#### GET /api/opencode/sessions/[sessionId]/todos
Get session todos.

**Response:**
```typescript
{
  success: true;
  data: {
    todos: OpenCodeTodo[];
  };
}
```

---

### Roles

#### GET /api/roles/list
List agent roles.

**Response:**
```typescript
{
  success: true;
  data: {
    roles: Array<{
      id: string;
      name: string;
      description: string;
    }>;
  };
}
```

#### GET /api/roles/list-full
List roles with full details.

**Response:**
```typescript
{
  success: true;
  data: {
    roles: Array<{
      id: string;
      name: string;
      description: string;
      preset_json: string;
      preferred_model_name?: string | null;
      preferred_model_variant?: string | null;
      preferred_llm_agent?: string | null;
    }>;
  };
}
```

#### POST /api/roles/save
Save a role.

**Request:**
```typescript
{
  id: string;
  name: string;
  description?: string;
  preset_json: string;
  preferred_model_name?: string | null;
  preferred_model_variant?: string | null;
  preferred_llm_agent?: string | null;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    success: boolean;
  };
}
```

#### POST /api/roles/delete
Delete a role.

**Request:**
```typescript
{
  id: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    success: boolean;
  };
}
```

---

### Tags

#### GET /api/tags
List all tags.

**Response:**
```typescript
{
  success: true;
  data: Tag[];
}
```

#### POST /api/tags
Create a tag.

**Request:**
```typescript
{
  name: string;
  color: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: Tag;
}
```

#### PUT /api/tags/[id]
Update a tag.

**Request:**
```typescript
{
  name: string;
  color: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: Tag;
}
```

#### DELETE /api/tags/[id]
Delete a tag.

**Response:**
```typescript
{
  success: true;
}
```

---

### Dependencies

#### GET /api/deps
List task dependencies.

**Query Parameters:**
- `taskId` (required): Task ID

**Response:**
```typescript
{
  success: true;
  data: {
    links: TaskLink[];
  };
}
```

#### POST /api/deps
Create a dependency.

**Request:**
```typescript
{
  fromTaskId: string;
  toTaskId: string;
  type: "blocks" | "relates";
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    link: TaskLink;
  };
}
// Errors:
{
  success: false;
  error: "Cannot create a self dependency";  // 400
}
{
  success: false;
  error: "Task not found";  // 404
}
{
  success: false;
  error: "This dependency would create a cycle";  // 409
}
```

#### DELETE /api/deps/[linkId]
Delete a dependency.

**Response:**
```typescript
{
  success: true;
  data: {
    ok: true;
  };
}
```

---

### Artifacts

#### GET /api/artifact/list
List artifacts for a run.

**Query Parameters:**
- `runId` (required): Run ID

**Response:**
```typescript
{
  success: true;
  data: {
    artifacts: Artifact[];
  };
}
```

#### GET /api/artifact/get
Get a single artifact.

**Query Parameters:**
- `artifactId` (required): Artifact ID

**Response:**
```typescript
{
  success: true;
  data: {
    artifact: Artifact | null;
  };
}
```

---

### Settings

#### GET /api/settings/workflow
Get workflow configuration.

**Response:**
```typescript
{
  success: true;
  data: WorkflowConfig;
}
```

#### PUT /api/settings/workflow
Update workflow configuration.

**Request:**
```typescript
WorkflowConfig;
```

**Response:**
```typescript
{
  success: true;
  data: WorkflowConfig;
}
// Error (400):
{
  success: false;
  error: "Invalid workflow configuration payload";
}
```

#### GET /api/app-settings
Get an app setting.

**Query Parameters:**
- `key` (required): Setting key

**Response:**
```typescript
{
  success: true;
  data: {
    value: string;
  };
}
```

#### POST /api/app-settings
Set an app setting.

**Request:**
```typescript
{
  key: string;
  value: string;
}
```

**Response:**
```typescript
{
  success: true;
}
```

---

### Filesystem & Browse

#### GET /api/browse
Browse directory contents.

**Query Parameters:**
- `path` (optional): Directory path to browse

**Response:**
```typescript
{
  currentPath: string;
  parentPath: string | null;
  homePath: string;
  entries: {
    name: string;
    path: string;
    isDirectory: boolean;
    isFile: boolean;
  }[];
}
```

#### GET /api/filesystem/exists
Check if path exists.

**Query Parameters:**
- `path` (required): Path to check

**Response:**
```typescript
{
  success: true;
  data: {
    exists: boolean;
  };
}
```

---

### OMC (Oh-My-OpenCode)

#### GET /api/omc
Read OMC configuration.

**Query Parameters:**
- `path` (optional): Config file path

**Response:**
```typescript
{
  success: true;
  data: {
    config: unknown;
    path?: string;
  };
}
```

#### POST /api/omc
Save OMC configuration.

**Request:**
```typescript
{
  path: string;
  config: unknown;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    ok: true;
  };
}
```

#### GET /api/omc/presets
List OMC presets.

**Query Parameters:**
- `path` (required): Config directory path

**Response:**
```typescript
{
  success: true;
  data: {
    presets: string[];
  };
}
```

#### POST /api/omc/presets/save
Save a preset.

**Request:**
```typescript
{
  path: string;
  presetName: string;
  config: unknown;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    ok: true;
    presetPath?: string;
  };
}
```

#### POST /api/omc/presets/load
Load a preset.

**Request:**
```typescript
{
  path: string;
  presetName: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    config: unknown;
  };
}
```

#### POST /api/omc/backup
Create backup.

**Request:**
```typescript
{
  path: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    ok: true;
    backupPath: string;
  };
}
```

#### POST /api/omc/restore
Restore from backup.

**Request:**
```typescript
{
  path: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    ok: true;
  };
}
```

---

### Database

#### POST /api/database/delete
Delete all data (dangerous).

**Response:**
```typescript
{
  success: true;
  data: {
    ok: true;
  };
}
```

---

### App Utilities

#### POST /api/app/open-path
Open path in system file manager.

**Request:**
```typescript
{
  path: string;
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    success: true;
  };
}
```

#### GET /api/schema
Fetch JSON schema from URL.

**Query Parameters:**
- `url` (required): Schema URL

**Response:**
```typescript
{
  success: true;
  data: {
    schema: JSONSchema;
  };
}
```

---

## SSE Event Schemas

### Connection

Connect to `/api/events` endpoint for real-time updates. Optional `sessionId` query parameter filters OpenCode events to a specific session.

**Connection Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
```

### Event Channels

#### task:event
Task lifecycle events.

```typescript
interface TaskEventPayload {
  taskId: string;
  boardId: string;
  projectId: string;
  eventType: "task:created" | "task:updated" | "task:moved" | "task:deleted";
  updatedAt: string;
}
```

**Example SSE message:**
```
event: task:event
data: {"taskId":"abc123","boardId":"board1","projectId":"proj1","eventType":"task:created","updatedAt":"2024-01-15T10:30:00Z"}

```

#### run:event
Run status change events.

```typescript
interface RunEventPayload {
  runId: string;
  status: RunStatus;
  taskId?: string;
  sessionId?: string;
  message?: string;
  // Additional fields based on event type
}
```

**Example SSE message:**
```
event: run:event
data: {"runId":"run123","status":"running","taskId":"task1"}

```

#### opencode:event
OpenCode session events.

```typescript
interface OpenCodeEventPayload {
  sessionId: string;
  eventType: string;
  // Event-specific payload
}
```

### Subscription Pattern

```typescript
// Connect to SSE endpoint
const eventSource = new EventSource('/api/events?sessionId=optional-filter');

// Listen for specific channels
eventSource.addEventListener('task:event', (event) => {
  const payload = JSON.parse(event.data) as TaskEventPayload;
  console.log(`Task ${payload.taskId}: ${payload.eventType}`);
});

eventSource.addEventListener('run:event', (event) => {
  const payload = JSON.parse(event.data) as RunEventPayload;
  console.log(`Run ${payload.runId}: ${payload.status}`);
});

// Heartbeat messages (every 25 seconds)
eventSource.onmessage = (event) => {
  if (event.data === 'heartbeat') {
    console.log('Connection alive');
  }
};
```

---

## Integration Test Examples

### Example 1: Create Project and Board

```typescript
// 1. Create a project
const createProjectResponse = await fetch('/api/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Test Project',
    path: '/path/to/project',
    color: '#3B82F6'
  })
});

const projectResult = await createProjectResponse.json();
// Expected: { success: true, data: { id: "...", name: "Test Project", ... } }

// 2. Get the auto-created board
const boardResponse = await fetch(`/api/boards/project/${projectResult.data.id}`);
const boardResult = await boardResponse.json();
// Expected: { success: true, data: { id: "...", projectId: "...", columns: [...], ... } }
```

### Example 2: Create and Move Task

```typescript
// 1. Create a task
const createTaskResponse = await fetch('/api/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: 'proj-123',
    boardId: 'board-456',
    columnId: 'col-789',
    title: 'Implement feature X',
    description: 'Add new feature for user authentication',
    type: 'feature',
    priority: 'normal',
    difficulty: 'medium',
    tags: ['auth', 'backend']
  })
});

const taskResult = await createTaskResponse.json();
// Expected: { success: true, data: { id: "...", title: "Implement feature X", ... } }

// 2. Move task to another column
const moveResponse = await fetch(`/api/tasks/${taskResult.data.id}/move`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    columnId: 'col-in-progress',
    toIndex: 0
  })
});

const moveResult = await moveResponse.json();
// Expected: { success: true, data: { id: "...", columnId: "col-in-progress", ... } }
```

### Example 3: Start Run and Monitor

```typescript
// 1. Start a run
const startRunResponse = await fetch('/api/run/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    taskId: 'task-123',
    roleId: 'role-456'
  })
});

const runResult = await startRunResponse.json();
// Expected: { success: true, data: { runId: "..." } }

// 2. Check run status
const getRunResponse = await fetch(`/api/run/get?runId=${runResult.data.runId}`);
const runStatus = await getRunResponse.json();
// Expected: { success: true, data: { run: { id: "...", status: "queued", ... } } }

// 3. Subscribe to events
const eventSource = new EventSource('/api/events');
eventSource.addEventListener('run:event', (event) => {
  const payload = JSON.parse(event.data);
  if (payload.runId === runResult.data.runId) {
    console.log('Run status:', payload.status);
  }
});
```

### Example 4: Error Handling

```typescript
// Duplicate project path (409 Conflict)
const duplicateResponse = await fetch('/api/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Duplicate Project',
    path: '/existing/path'
  })
});

const duplicateResult = await duplicateResponse.json();
// Expected: { success: false, error: "Project path already exists" }

// Invalid task transition (400 Bad Request)
const invalidTransitionResponse = await fetch('/api/tasks/task-123', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'invalid-status'
  })
});

const transitionResult = await invalidTransitionResponse.json();
// Expected: { success: false, error: "Unsupported task status" }

// Not found (404)
const notFoundResponse = await fetch('/api/tasks/nonexistent-id');
const notFoundResult = await notFoundResponse.json();
// Expected: { success: false, error: "Task not found" }
```

### Example 5: Workflow Configuration

```typescript
// Get current workflow config
const configResponse = await fetch('/api/settings/workflow');
const config = await configResponse.json();
// Expected: { success: true, data: { statuses: [...], columns: [...], ... } }

// Update workflow configuration
const updateResponse = await fetch('/api/settings/workflow', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    statuses: [
      {
        status: 'ready',
        orderIndex: 0,
        preferredColumnSystemKey: 'backlog',
        blockedReason: null,
        closedReason: null,
        color: '#10B981',
        icon: 'circle'
      }
    ],
    columns: [...],
    statusTransitions: { 'ready': ['in_progress', 'blocked'] },
    columnTransitions: { 'backlog': ['in_progress', 'blocked'] },
    signals: [],
    signalRules: []
  })
});

const updatedConfig = await updateResponse.json();
// Expected: { success: true, data: { ...updatedWorkflowConfig } }
```

### Example 6: Task Dependencies

```typescript
// Create blocking dependency
const createDepResponse = await fetch('/api/deps', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fromTaskId: 'task-1',
    toTaskId: 'task-2',
    type: 'blocks'
  })
});

const depResult = await createDepResponse.json();
// Expected: { success: true, data: { link: { id: "...", fromTaskId: "task-1", ... } } }

// Attempt cyclic dependency (409 Conflict)
const cyclicResponse = await fetch('/api/deps', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fromTaskId: 'task-2',
    toTaskId: 'task-1',
    type: 'blocks'
  })
});

const cyclicResult = await cyclicResponse.json();
// Expected: { success: false, error: "This dependency would create a cycle" }
```

---

## HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful GET, PUT, DELETE |
| 201 | Created | Successful POST creating resource |
| 400 | Bad Request | Invalid input, validation errors |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Duplicate resource, cyclic dependency |
| 500 | Internal Server Error | Unexpected server error |

---

## Testing Checklist

For each endpoint, verify:

- [ ] Success response includes `success: true` and `data`
- [ ] Error response includes `success: false` and `error`
- [ ] Required parameters validated (400 on missing)
- [ ] Invalid values rejected (400 on bad input)
- [ ] Non-existent resources return 404
- [ ] Timestamps are ISO 8601 formatted
- [ ] IDs are valid UUIDs
- [ ] SSE events include correct channel and parseable JSON
