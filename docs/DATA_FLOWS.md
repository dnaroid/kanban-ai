# Data Flow Diagrams for Testing

> Reference: [ARCHITECTURE.md](./ARCHITECTURE.md) for component details

## 1. System Data Flow Overview

### High-Level Architecture

```mermaid
graph TB
    subgraph Client["Frontend (React)"]
        UI[UI Components]
        Models[Feature Models]
        ApiClient[API Client]
        ES[EventSource]
    end
    
    subgraph Server["Backend (Next.js)"]
        API[REST API Routes]
        Services[Services]
        Managers[Managers]
        Repos[Repositories]
        SSE[SSE Broker]
    end
    
    subgraph Storage["Storage Layer"]
        DB[(SQLite)]
    end
    
    subgraph External["External Services"]
        OpenCode[OpenCode Server]
    end
    
    UI --> Models --> ApiClient
    ApiClient -->|HTTP| API
    API --> Services --> Managers --> Repos --> DB
    Services --> Managers
    Managers --> SSE
    SSE -->|SSE Stream| ES --> Models --> UI
    Managers -->|SDK| OpenCode
```

### Entity Relationships

```mermaid
erDiagram
    projects ||--o{ boards : "has"
    projects ||--o{ tasks : "has"
    boards ||--o{ board_columns : "contains"
    board_columns ||--o{ tasks : "contains"
    tasks ||--o{ runs : "executes"
    tasks ||--o{ task_links : "links"
    runs ||--o{ run_events : "logs"
    runs ||--o{ artifacts : "produces"
    runs ||--o| context_snapshots : "snapshots"
    agent_roles ||--o{ runs : "assigned to"
    
    projects {
        string id PK
        string name
        string path UK
        string createdAt
        string updatedAt
    }
    
    boards {
        string id PK
        string projectId FK
        string name
        string createdAt
    }
    
    tasks {
        string id PK
        string projectId FK
        string boardId FK
        string columnId FK
        string title
        string status
        string updatedAt
    }
    
    runs {
        string id PK
        string taskId FK
        string roleId FK
        string sessionId
        string status
        string contextSnapshotId FK
    }
```

---

## 2. Detailed Flow Diagrams

### 2.1 Project CRUD Flow

#### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Frontend
    participant API as /api/projects
    participant PR as ProjectRepository
    participant BR as BoardRepository
    participant DB as SQLite
    participant SSE as SSE Broker
    
    Note over U,SSE: CREATE Project
    U->>UI: Click "New Project"
    UI->>API: POST /api/projects {name, path}
    API->>PR: projectRepo.create(input)
    PR->>DB: INSERT INTO projects
    DB-->>PR: Project
    PR-->>API: Project
    API->>BR: boardRepo.create({projectId, name})
    BR->>DB: INSERT INTO boards + columns
    API-->>UI: {success: true, data: project}
    UI-->>U: Show project
    
    Note over U,SSE: READ Projects
    U->>UI: View projects list
    UI->>API: GET /api/projects
    API->>PR: projectRepo.getAll()
    PR->>DB: SELECT * FROM projects
    DB-->>PR: Project[]
    PR-->>API: Project[]
    API-->>UI: {success: true, data: projects}
```

#### Flow Specification

| Aspect | Details |
|--------|---------|
| **Trigger** | User creates/updates/deletes a project |
| **Participants** | Frontend, API Route, ProjectRepository, BoardRepository, SQLite |
| **Steps** | 1. Validate input (name, path required) 2. Create project record 3. Create default board with columns 4. Return project data |
| **Output** | Project object with id, name, path, timestamps |
| **Error Handling** | 400: Missing required fields, 409: Duplicate path, 500: Server error |
| **Test Points** | Mock `projectRepo.create()`, assert DB insert called, verify board creation |

---

### 2.2 Task CRUD Flow

#### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Frontend
    participant API as /api/tasks
    participant TR as TaskRepository
    participant BR as BoardRepository
    participant WM as WorkflowManager
    participant DB as SQLite
    participant SSE as SSE Broker
    
    Note over U,SSE: CREATE Task
    U->>UI: Click "Add Task"
    UI->>API: POST /api/tasks {projectId, boardId, columnId, title}
    API->>BR: boardRepo.getById(boardId)
    BR-->>API: Board with columns
    API->>WM: getDefaultStatusForWorkflowColumn(columnKey)
    WM-->>API: "pending"
    API->>WM: resolveTaskStatusReasons(status, columnKey)
    WM-->>API: {blockedReason, closedReason}
    API->>TR: taskRepo.create(input)
    TR->>DB: INSERT INTO tasks
    DB-->>TR: Task
    API->>SSE: publishSseEvent("task:event", payload)
    SSE-->>UI: SSE: task:created
    API-->>UI: {success: true, data: task}
```

#### Data Transformation Map

```
Request                    Service                    Repository                 DB
------------------------   ------------------------   ------------------------   ------------------------
{                          Validate board             Add defaults:              INSERT INTO tasks (
  projectId,               Resolve status             - id: UUID                   id, project_id, board_id,
  boardId,      ------>    Resolve reasons  ------>   - status: "pending"  ------> column_id, title, status,
  columnId,                                           - orderInColumn: max+1       blocked_reason, ...
  title,                                               - createdAt/updatedAt      )
  description?                                                                   VALUES (?, ?, ...)
  status?                                             }
}
```

#### Flow Specification

| Aspect | Details |
|--------|---------|
| **Trigger** | User creates a new task |
| **Participants** | Frontend, API Route, TaskRepository, BoardRepository, WorkflowManager, SSE Broker |
| **Steps** | 1. Validate required fields 2. Resolve workflow column 3. Determine default status 4. Calculate blocked/closed reasons 5. Create task with auto-incremented order 6. Publish SSE event |
| **Output** | Task object with workflow-compliant status |
| **Error Handling** | 400: Missing fields, invalid column, unsupported status 500: DB error |
| **Test Points** | Mock `taskRepo.create()`, verify `publishSseEvent()` called, assert status resolution |

---

### 2.3 Task Drag-and-Drop Flow

#### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Frontend (DnD)
    participant API as /api/tasks/[id]/move
    participant TR as TaskRepository
    participant BR as BoardRepository
    participant WM as WorkflowManager
    participant DB as SQLite
    participant SSE as SSE Broker
    
    U->>UI: Drag task to new column
    UI->>API: PUT /api/tasks/[id]/move {columnId, toIndex}
    API->>TR: taskRepo.getById(id)
    TR-->>API: Task
    API->>BR: boardRepo.getById(boardId)
    BR-->>API: Board
    
    API->>WM: canTransitionColumn(fromKey, toKey)
    WM-->>API: true/false
    
    alt Transition not allowed
        API-->>UI: 400: Column transition not allowed
    end
    
    API->>WM: isStatusAllowedInWorkflowColumn(status, toKey)
    
    alt Status not allowed in target column
        API->>WM: getDefaultStatusForWorkflowColumn(toKey)
        WM-->>API: fallbackStatus
        API->>WM: canTransitionStatus(current, fallback)
    end
    
    API->>TR: taskRepo.move(id, columnId, toIndex)
    TR->>DB: UPDATE tasks SET column_id, order_in_column
    TR-->>API: movedTask
    
    API->>WM: resolveTaskStatusReasons(status, columnKey)
    WM-->>API: {blockedReason, closedReason}
    
    API->>TR: taskRepo.update(id, patch)
    TR->>DB: UPDATE tasks SET status, blocked_reason, closed_reason
    
    API->>SSE: publishSseEvent("task:event", payload)
    SSE-->>UI: SSE: task:moved
    API-->>UI: {success: true, data: task}
```

#### Flow Specification

| Aspect | Details |
|--------|---------|
| **Trigger** | User drags task to different column |
| **Participants** | Frontend DnD, API Route, TaskRepository, WorkflowManager, SSE Broker |
| **Steps** | 1. Validate task exists 2. Check column transition allowed 3. Check status compatibility 4. Move task (update column + reorder) 5. Update status/blockedReason/closedReason 6. Publish SSE |
| **Output** | Updated task with new column, order, and potentially new status |
| **Error Handling** | 404: Task not found, 400: Invalid column/transition, 500: DB error |
| **Test Points** | Mock `canTransitionColumn()`, verify order recalculation, assert SSE payload |

---

### 2.4 Run Start Flow

#### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Frontend
    participant API as /api/run/start
    participant RS as RunService
    participant RQ as RunsQueueManager
    participant TR as TaskRepository
    participant RR as RunRepository
    participant CS as ContextSnapshotRepo
    participant DB as SQLite
    participant SSE as SSE Broker
    
    U->>UI: Click "Run Task"
    UI->>API: POST /api/run/start {taskId, roleId?, mode?}
    API->>RS: runService.start(input)
    RS->>TR: taskRepo.getById(taskId)
    TR-->>RS: Task
    RS->>RS: resolveAssignedRoleIdFromTags(tags)
    RS->>CS: contextSnapshotRepo.create({taskId, kind, payload})
    CS->>DB: INSERT INTO context_snapshots
    RS->>RR: runRepo.create({taskId, roleId, mode, status: "queued"})
    RR->>DB: INSERT INTO runs
    RR-->>RS: Run {id, status: "queued"}
    
    RS->>SSE: publishRunUpdate(run)
    RS->>RQ: queueManager.enqueue(runId, input)
    RQ->>RQ: Add to provider queue
    RQ->>RQ: scheduleDrain()
    
    RS-->>API: {runId}
    API-->>UI: {runId}
    SSE-->>UI: SSE: run:event {runId, status: "queued"}
```

#### Data Transformation Map

```
Request                    RunService                 Queue Input                DB
------------------------   ------------------------   ------------------------   ------------------------
{                          Resolve role:              Build queue input:         INSERT INTO runs (
  taskId,                  - from tags or       --->   - projectPath               id, task_id, role_id,
  roleId?,                 - from param               - sessionTitle              mode, status, ...
  mode?,                   - default                  - prompt              --->  status = "queued"
  modelName?                                          - sessionPreferences       )
}                                                                                 INSERT INTO run_events (
                                                                                    run_id, event_type, payload
                                                                                  )
```

#### Flow Specification

| Aspect | Details |
|--------|---------|
| **Trigger** | User clicks "Run Task" button |
| **Participants** | Frontend, API Route, RunService, RunsQueueManager, RunRepository, ContextSnapshotRepo |
| **Steps** | 1. Validate task exists 2. Resolve role from tags/param/default 3. Create context snapshot 4. Create run record (status: queued) 5. Build prompt 6. Enqueue in RunsQueueManager 7. Publish SSE |
| **Output** | `{runId: string}` |
| **Error Handling** | 400: Task not found, no roles configured, project not found 500: DB error |
| **Test Points** | Mock `runRepo.create()`, verify enqueue called, assert SSE event published |

---

### 2.5 Run Execution Flow (Queue Processing)

#### Sequence Diagram

```mermaid
sequenceDiagram
    participant RQ as RunsQueueManager
    participant OS as OpencodeService
    participant SM as SessionManager
    participant RR as RunRepository
    participant RE as RunEventRepository
    participant TP as TaskProjector
    participant DB as SQLite
    participant OC as OpenCode Server
    participant SSE as SSE Broker
    
    Note over RQ,SSE: Queue Processing (drainQueue)
    
    RQ->>RQ: selectNextRunnableRun(queue)
    RQ->>RQ: Check dependencies resolved
    RQ->>RQ: Check priority ordering
    
    RQ->>RR: runRepo.update(runId, {status: "running"})
    RQ->>SSE: publishRunUpdate(run)
    RQ->>TP: projectRunStarted(run)
    TP->>DB: UPDATE tasks SET status
    TP->>SSE: publishSseEvent("task:event")
    
    RQ->>OS: opencodeService.start()
    OS->>OC: Health check / spawn process
    
    RQ->>SM: sessionManager.createSession(title, path)
    SM->>OC: POST /session/create
    OC-->>SM: {sessionId}
    RQ->>RR: runRepo.update(runId, {sessionId})
    
    RQ->>SM: sessionManager.subscribe(sessionId, handler)
    SM->>OC: GET /events (SSE)
    
    RQ->>SM: sessionManager.sendPrompt(sessionId, prompt)
    SM->>OC: POST /session/prompt
    
    loop Until completion
        OC-->>SM: SSE: message.updated
        SM->>RQ: handler(event)
        RQ->>RQ: resolveAssistantRunSignal(content)
        
        alt Signal found (done/fail/question)
            RQ->>RQ: finalizeRunFromSession()
            RQ->>RR: runRepo.update(runId, {status, finishedAt})
            RQ->>TP: projectRunOutcome(run, status, signal, content)
            TP->>DB: UPDATE tasks SET status, description, etc.
            TP->>SSE: publishSseEvent("task:event")
            RQ->>SSE: publishRunUpdate(run)
        end
    end
    
    RQ->>SM: sessionManager.unsubscribe(sessionId)
```

#### Flow Specification

| Aspect | Details |
|--------|---------|
| **Trigger** | RunsQueueManager drains queue (after enqueue or run completion) |
| **Participants** | RunsQueueManager, OpencodeService, SessionManager, RunRepository, TaskProjector |
| **Steps** | 1. Select next runnable (check deps, priority) 2. Update run status to running 3. Start OpenCode service 4. Create session 5. Subscribe to events 6. Send prompt 7. Handle events until signal 8. Finalize run 9. Project outcome to task |
| **Output** | Run with status: completed/failed/paused, Task with updated status/description |
| **Error Handling** | On error: set status to failed, set errorText, project failure |
| **Test Points** | Mock `sessionManager.createSession()`, verify event handling, assert status transitions |

---

### 2.6 Workflow Signal Processing Flow

#### Sequence Diagram

```mermaid
sequenceDiagram
    participant RQ as RunsQueueManager
    participant TP as TaskProjector
    participant WM as WorkflowManager
    participant TR as TaskRepository
    participant BR as BoardRepository
    participant DB as SQLite
    participant SSE as SSE Broker
    
    Note over RQ,SSE: Run completed with signal
    
    RQ->>TP: projectRunOutcome(run, runStatus, signalKey, content)
    TP->>TR: taskRepo.getById(taskId)
    TR-->>TP: Task
    
    TP->>WM: resolveTaskStatusBySignal({scope, signalKey, runKind, runStatus, currentStatus})
    
    Note over WM: Lookup signal rules:<br/>1. Match signalKey<br/>2. Match runKind<br/>3. Match runStatus<br/>4. Return toStatus
    
    WM-->>TP: nextStatus | null
    
    alt Status changed
        TP->>BR: boardRepo.getById(boardId)
        BR-->>TP: Board
        TP->>WM: getPreferredColumnIdForStatus(board, status)
        WM-->>TP: columnId
        TP->>WM: canTransitionColumn(fromKey, toKey)
        
        alt Column transition allowed
            TP->>WM: resolveTaskStatusReasons(status, columnKey)
            WM-->>TP: {blockedReason, closedReason}
            TP->>TR: taskRepo.update(taskId, {status, columnId, blockedReason, closedReason})
            TR->>DB: UPDATE tasks
        end
    end
    
    alt Generation run completed
        TP->>TP: parseUserStoryResponse(content)
        Note over TP: Extract: description, title,<br/>tags, type, difficulty, agentRoleId
        TP->>TR: taskRepo.update(taskId, {description, title, tags, ...})
    end
    
    TP->>SSE: publishSseEvent("task:event", payload)
```

#### Signal Rule Resolution

```
resolveTaskStatusBySignal(input) lookup:
┌─────────────────────────────────────────────────────────────────────────────┐
│ Input: {scope, signalKey, runKind, runStatus, currentStatus, currentColumn}│
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Filter rules by signalKey                                                 │
│ 2. Match runKind (null matches any)                                         │
│ 3. Match runStatus (null matches any)                                       │
│ 4. Match fromColumnSystemKey (null matches any)                             │
│ 5. Match fromStatus (null matches any)                                      │
│ 6. Return first matching rule's toStatus                                    │
└─────────────────────────────────────────────────────────────────────────────┘

Example rules:
| signalKey      | runKind                   | runStatus  | toStatus   |
|----------------|---------------------------|------------|------------|
| run_started    | null                      | running    | running    |
| generation_started | task-description-improve | running | generating |
| done           | task-description-improve  | completed  | pending    |
| done           | null                      | completed  | done       |
| fail           | null                      | failed     | failed     |
| question       | null                      | paused     | paused     |
```

#### Flow Specification

| Aspect | Details |
|--------|---------|
| **Trigger** | Run completes/fails/pauses with signal |
| **Participants** | TaskProjector, WorkflowManager, TaskRepository, BoardRepository |
| **Steps** | 1. Get current task 2. Resolve next status via signal rules 3. Determine preferred column 4. Check column transition 5. Resolve blocked/closed reasons 6. Update task 7. Parse generation content if applicable 8. Publish SSE |
| **Output** | Task with updated status, column, reasons, and optionally description |
| **Error Handling** | Invalid status returns null (no update), invalid transitions blocked |
| **Test Points** | Mock `resolveTaskStatusBySignal()`, verify rule matching, assert column resolution |

---

### 2.7 SSE Subscription Flow

#### Sequence Diagram

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as /api/events
    participant SSE as SSE Broker
    participant Mgrs as Managers
    
    UI->>API: GET /api/events (EventSource)
    API->>SSE: subscribeSse(listenerId, listener)
    SSE->>SSE: listeners.set(id, listener)
    API-->>UI: HTTP 200, Content-Type: text/event-stream
    
    loop Keep-alive
        API->>UI: SSE: ":heartbeat\n\n"
    end
    
    Note over Mgrs,SSE: Some manager publishes event
    Mgrs->>SSE: publishSseEvent(channel, payload)
    SSE->>SSE: for listener of listeners.values()
    SSE->>API: listener(channel, payload)
    API->>UI: SSE: "event: ${channel}\ndata: ${JSON.stringify(payload)}\n\n"
    
    UI->>UI: EventSource.onmessage
    UI->>UI: Update local state
    
    Note over UI,SSE: Cleanup on unmount
    UI->>API: EventSource.close()
    API->>SSE: unsubscribe() (cleanup function)
    SSE->>SSE: listeners.delete(id)
```

#### SSE Event Payloads

```typescript
// Task events (channel: "task:event")
interface TaskSsePayload {
  taskId: string;
  boardId: string;
  projectId: string;
  eventType?: "task:created" | "task:moved" | "task:updated";
  updatedAt: string;
}

// Run events (channel: "run:event")
interface RunSsePayload {
  runId: string;
  taskId: string;
  status: RunStatus;
  sessionId?: string;
  errorText?: string;
  updatedAt: string;
}
```

#### Flow Specification

| Aspect | Details |
|--------|---------|
| **Trigger** | Frontend component mounts (EventSource connection) |
| **Participants** | Frontend EventSource, API Route, SSE Broker, Managers |
| **Steps** | 1. Open EventSource connection 2. Register listener with SSE Broker 3. Send heartbeats 4. Broadcast events to all listeners 5. Update frontend state 6. Cleanup on unmount |
| **Output** | Real-time UI updates without polling |
| **Error Handling** | Reconnection on disconnect, cleanup on close |
| **Test Points** | Mock `publishSseEvent()`, verify listener registration, assert event format |

---

## 3. Data Transformation Maps

### 3.1 Request to Database (Create Task)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ REQUEST (POST /api/tasks)                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ {                                                                            │
│   projectId: "proj_abc",                                                     │
│   boardId: "board_123",                                                      │
│   columnId: "col_456",                                                       │
│   title: "Implement feature X",                                              │
│   description: "Detailed description...",                                    │
│   priority: "normal",        // optional, default: "normal"                  │
│   difficulty: "medium",      // optional, default: "medium"                  │
│   type: "feature",           // optional, default: "chore"                   │
│   tags: ["frontend", "api"], // optional, default: []                        │
│   status: "pending"          // optional, resolved via workflow              │
│ }                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ SERVICE LAYER TRANSFORMATIONS                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. Validate board exists and column belongs to board                         │
│ 2. Resolve workflow column system key                                        │
│ 3. Get default status for column: getDefaultStatusForWorkflowColumn(key)     │
│ 4. Validate status allowed in column: isStatusAllowedInWorkflowColumn()      │
│ 5. Resolve reasons: resolveTaskStatusReasons(status, columnKey)              │
│ 6. Calculate order: MAX(order_in_column) + 1 for board+column                │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ DATABASE INSERT                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ INSERT INTO tasks (                                                          │
│   id,                   -- UUID generated                                    │
│   project_id,           -- from request                                      │
│   board_id,             -- from request                                      │
│   column_id,            -- from request                                      │
│   title,                -- from request                                      │
│   description,          -- from request or null                              │
│   description_md,       -- null initially                                    │
│   status,               -- resolved via workflow                             │
│   blocked_reason,       -- resolved via workflow                             │
│   closed_reason,        -- resolved via workflow                             │
│   priority,             -- from request or "normal"                          │
│   difficulty,           -- from request or "medium"                          │
│   type,                 -- from request or "chore"                           │
│   order_in_column,      -- calculated                                        │
│   tags_json,            -- JSON.stringify(tags)                              │
│   created_at,           -- ISO timestamp                                     │
│   updated_at            -- ISO timestamp                                     │
│ )                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Database to Response (Get Task)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ DATABASE SELECT                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ SELECT                                                                       │
│   id, project_id as projectId, board_id as boardId, column_id as columnId,   │
│   title, description, description_md as descriptionMd, status,               │
│   blocked_reason as blockedReason, closed_reason as closedReason,            │
│   priority, difficulty, type, order_in_column as orderInColumn,              │
│   tags_json as tags, start_date as startDate, due_date as dueDate,           │
│   created_at as createdAt, updated_at as updatedAt                           │
│ FROM tasks WHERE id = ?                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ REPOSITORY TRANSFORMATION                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ - Map snake_case columns to camelCase properties                             │
│ - tags field remains as JSON string (parsed by frontend)                     │
│ - Return null for optional fields not set                                    │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ API RESPONSE                                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ {                                                                            │
│   success: true,                                                             │
│   data: {                                                                    │
│     id: "task_xyz",                                                          │
│     projectId: "proj_abc",                                                   │
│     boardId: "board_123",                                                    │
│     columnId: "col_456",                                                     │
│     title: "Implement feature X",                                            │
│     description: "Detailed description...",                                  │
│     status: "pending",                                                       │
│     blockedReason: null,                                                     │
│     closedReason: null,                                                      │
│     priority: "normal",                                                      │
│     difficulty: "medium",                                                    │
│     type: "feature",                                                         │
│     orderInColumn: 0,                                                        │
│     tags: "[\"frontend\",\"api\"]",                                          │
│     createdAt: "2026-03-06T10:00:00.000Z",                                   │
│     updatedAt: "2026-03-06T10:00:00.000Z"                                    │
│   }                                                                          │
│ }                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 SSE Event Payload Transformation

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TASK UPDATE TRIGGER                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ taskRepo.update(taskId, {status: "running", columnId: "col_789"})            │
│ const updatedTask = taskRepo.getById(taskId)                                 │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ SSE PUBLICATION                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ publishSseEvent("task:event", {                                              │
│   taskId: updatedTask.id,                                                    │
│   boardId: updatedTask.boardId,                                              │
│   projectId: updatedTask.projectId,                                          │
│   eventType: "task:updated",  // optional discriminator                      │
│   updatedAt: updatedTask.updatedAt                                           │
│ })                                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ SSE WIRE FORMAT                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ event: task:event                                                            │
│ data: {"taskId":"task_xyz","boardId":"board_123","projectId":"proj_abc",     │
│ data: "updatedAt":"2026-03-06T10:05:00.000Z"}                                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND HANDLER                                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│ eventSource.onmessage = (event) => {                                         │
│   const payload = JSON.parse(event.data);                                    │
│   // payload: { taskId, boardId, projectId, updatedAt }                      │
│   // Trigger refetch of task or optimistic update                            │
│ }                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Concurrency Flows

### 4.1 Multiple Runs in Queue

```mermaid
sequenceDiagram
    participant U1 as User 1
    participant U2 as User 2
    participant RQ as RunsQueueManager
    participant Q as Provider Queue
    participant R as Running Set
    
    U1->>RQ: enqueue(runId1, input1)
    RQ->>Q: queue.push(runId1) [provider:openai]
    RQ->>RQ: scheduleDrain()
    
    U2->>RQ: enqueue(runId2, input2)
    RQ->>Q: queue.push(runId2) [provider:openai]
    Note over RQ: drain already scheduled
    
    Note over RQ: drainQueue()
    RQ->>RQ: running.size < concurrency (0 < 1)
    RQ->>Q: selectNextRunnableRun()
    Q-->>RQ: runId1
    RQ->>R: running.add(runId1)
    RQ->>RQ: executeRun(runId1) async
    
    Note over RQ: runId2 waits in queue
    RQ->>RQ: running.size >= concurrency (1 >= 1)
    Note over RQ: Cannot start runId2 yet
    
    Note over RQ: runId1 completes
    R->>RQ: running.delete(runId1)
    RQ->>RQ: scheduleDrain()
    
    Note over RQ: drainQueue() again
    RQ->>Q: selectNextRunnableRun()
    Q-->>RQ: runId2
    RQ->>R: running.add(runId2)
    RQ->>RQ: executeRun(runId2) async
```

### 4.2 Concurrent Task Updates

```mermaid
sequenceDiagram
    participant T1 as Thread 1 (Run 1)
    participant T2 as Thread 2 (Run 2)
    participant TR as TaskRepository
    participant DB as SQLite
    participant SSE as SSE Broker
    
    Note over T1,T2: Both runs complete for same task
    
    par Concurrent updates
        T1->>TR: taskRepo.update(taskId, {status: "done"})
        TR->>DB: UPDATE tasks SET status = "done"
        T1->>SSE: publishSseEvent("task:event")
    and
        T2->>TR: taskRepo.update(taskId, {description: "..."})
        TR->>DB: UPDATE tasks SET description = "..."
        T2->>SSE: publishSseEvent("task:event")
    end
    
    Note over SSE: Two SSE events sent in sequence
    Note over DB: Last write wins (no optimistic locking)
```

### 4.3 SSE Event Ordering

```
Event Order Guarantee:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Manager 1                    SSE Broker                  Client            │
│     │                            │                          │               │
│     │ publishSseEvent(A)         │                          │               │
│     │───────────────────────────>│                          │               │
│     │                            │ broadcast(A)             │               │
│     │                            │─────────────────────────>│               │
│     │                            │                          │ process(A)    │
│     │                            │                          │               │
│  Manager 2                    SSE Broker                  Client            │
│     │                            │                          │               │
│     │ publishSseEvent(B)         │                          │               │
│     │───────────────────────────>│                          │               │
│     │                            │ broadcast(B)             │               │
│     │                            │─────────────────────────>│               │
│     │                            │                          │ process(B)    │
│                                                                              │
│  Order: A arrives before B (single-threaded broadcast)                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

No-Order Scenario (different clients):
┌─────────────────────────────────────────────────────────────────────────────┐
│  Client 1 and Client 2 may receive events in different orders              │
│  if they subscribe at different times or have different latencies.          │
│  Each client sees a consistent order, but clients may differ.               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Test Verification Points

### 5.1 Project CRUD Tests

```typescript
// Test: Create project with board
describe("Project CRUD Flow", () => {
  // Mock points
  const mockProjectRepo = {
    create: vi.fn(),
    getAll: vi.fn(),
  };
  const mockBoardRepo = {
    create: vi.fn(),
  };

  // Assertions
  it("should create project and default board", async () => {
    mockProjectRepo.create.mockReturnValue({ id: "proj_1", name: "Test" });
    
    const response = await POST(createRequest({ name: "Test", path: "/test" }));
    
    expect(mockProjectRepo.create).toHaveBeenCalledWith({
      name: "Test",
      path: "/test",
      color: undefined,
    });
    expect(mockBoardRepo.create).toHaveBeenCalledWith({
      projectId: "proj_1",
      name: "Main Board",
    });
    expect(response.status).toBe(200);
  });

  // Error path test
  it("should return 409 for duplicate path", async () => {
    mockProjectRepo.create.mockImplementation(() => {
      throw new Error("UNIQUE constraint failed: projects.path");
    });
    
    const response = await POST(createRequest({ name: "Test", path: "/test" }));
    
    expect(response.status).toBe(409);
  });
});
```

### 5.2 Task CRUD Tests

```typescript
// Test: Create task with workflow resolution
describe("Task CRUD Flow", () => {
  const mockTaskRepo = { create: vi.fn(), getById: vi.fn() };
  const mockBoardRepo = { getById: vi.fn() };
  const mockPublishSse = vi.fn();

  it("should resolve default status from workflow column", async () => {
    mockBoardRepo.getById.mockReturnValue({
      id: "board_1",
      columns: [{ id: "col_1", systemKey: "ready" }],
    });
    mockTaskRepo.create.mockReturnValue({ id: "task_1", status: "pending" });

    await POST(createRequest({
      projectId: "proj_1",
      boardId: "board_1",
      columnId: "col_1",
      title: "Task",
    }));

    expect(mockTaskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending", // Default for "ready" column
        blockedReason: null,
        closedReason: null,
      })
    );
  });

  it("should publish SSE event after creation", async () => {
    mockTaskRepo.create.mockReturnValue({
      id: "task_1",
      boardId: "board_1",
      projectId: "proj_1",
      updatedAt: "2026-03-06T10:00:00Z",
    });

    await POST(createRequest({ ... }));

    expect(mockPublishSse).toHaveBeenCalledWith("task:event", {
      taskId: "task_1",
      boardId: "board_1",
      projectId: "proj_1",
      eventType: "task:created",
      updatedAt: "2026-03-06T10:00:00Z",
    });
  });
});
```

### 5.3 Run Flow Tests

```typescript
// Test: Run start flow
describe("Run Start Flow", () => {
  const mockRunRepo = { create: vi.fn(), update: vi.fn() };
  const mockTaskRepo = { getById: vi.fn() };
  const mockQueueManager = { enqueue: vi.fn() };
  const mockPublishRunUpdate = vi.fn();

  it("should create run in queued status and enqueue", async () => {
    mockTaskRepo.getById.mockReturnValue({
      id: "task_1",
      projectId: "proj_1",
      title: "Task",
    });
    mockRunRepo.create.mockReturnValue({
      id: "run_1",
      taskId: "task_1",
      status: "queued",
    });

    const result = await runService.start({ taskId: "task_1" });

    expect(mockRunRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task_1",
        status: "queued",
      })
    );
    expect(mockQueueManager.enqueue).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({
        prompt: expect.any(String),
        projectPath: expect.any(String),
      })
    );
    expect(result).toEqual({ runId: "run_1" });
  });
});

// Test: Run execution and completion
describe("Run Execution Flow", () => {
  it("should project run outcome to task", () => {
    const mockTaskRepo = { getById: vi.fn(), update: vi.fn() };
    const mockPublishSse = vi.fn();

    mockTaskRepo.getById.mockReturnValue({
      id: "task_1",
      status: "running",
      boardId: "board_1",
    });
    mockTaskRepo.update.mockReturnValue({
      id: "task_1",
      status: "done",
    });

    const projector = new RunTaskProjector();
    projector.projectRunOutcome(
      { taskId: "task_1", metadata: {} },
      "completed",
      "done",
      "Task completed"
    );

    expect(mockTaskRepo.update).toHaveBeenCalledWith(
      "task_1",
      expect.objectContaining({
        status: "done",
      })
    );
    expect(mockPublishSse).toHaveBeenCalled();
  });
});
```

### 5.4 Workflow Signal Tests

```typescript
// Test: Signal resolution
describe("Workflow Signal Resolution", () => {
  it("should resolve status from run signal", () => {
    const result = resolveTaskStatusBySignal({
      scope: "run",
      signalKey: "done",
      runKind: null,
      runStatus: "completed",
      currentStatus: "running",
    });

    expect(result).toBe("done");
  });

  it("should resolve different status for generation run", () => {
    const result = resolveTaskStatusBySignal({
      scope: "run",
      signalKey: "done",
      runKind: "task-description-improve",
      runStatus: "completed",
      currentStatus: "generating",
    });

    expect(result).toBe("pending"); // Generation goes back to pending
  });

  it("should return null for invalid transition", () => {
    const result = resolveTaskStatusBySignal({
      scope: "run",
      signalKey: "invalid_signal",
      runKind: null,
      runStatus: "completed",
      currentStatus: "running",
    });

    expect(result).toBeNull();
  });
});
```

### 5.5 SSE Tests

```typescript
// Test: SSE subscription and broadcast
describe("SSE Flow", () => {
  it("should broadcast event to all listeners", () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    const unsub1 = subscribeSse("listener_1", listener1);
    const unsub2 = subscribeSse("listener_2", listener2);

    publishSseEvent("task:event", { taskId: "task_1" });

    expect(listener1).toHaveBeenCalledWith("task:event", { taskId: "task_1" });
    expect(listener2).toHaveBeenCalledWith("task:event", { taskId: "task_1" });

    unsub1();
    publishSseEvent("task:event", { taskId: "task_2" });

    expect(listener1).toHaveBeenCalledTimes(1); // Not called after unsubscribe
    expect(listener2).toHaveBeenCalledTimes(2);
  });
});
```

### 5.6 Integration Test Checklist

| Flow | Mock Points | Assertions | Data Integrity Checks |
|------|-------------|------------|----------------------|
| Project Create | `projectRepo.create`, `boardRepo.create` | Status 200, project.id returned | Board created with project FK |
| Task Create | `taskRepo.create`, `publishSseEvent` | Correct status resolved, SSE called | orderInColumn auto-incremented |
| Task Move | `taskRepo.move`, `canTransitionColumn` | Column/status updated together | blockedReason matches status |
| Run Start | `runRepo.create`, `queueManager.enqueue` | Run queued, context snapshot created | Run linked to task |
| Run Execute | `sessionManager`, `taskProjector` | Session created, task updated | Run duration calculated |
| Signal Process | `resolveTaskStatusBySignal`, `taskRepo.update` | Correct status, column, reasons | Generation content parsed |
| SSE Subscribe | `subscribeSse`, `publishSseEvent` | Events received in order | Cleanup on unsubscribe |

---

## 6. Error Handling Paths

### 6.1 API Error Responses

```typescript
// Standard error response format
interface ErrorResponse {
  success: false;
  error: string;
  details?: string; // Only in non-production
}

// Common error scenarios
const ERROR_SCENARIOS = {
  // Project errors
  PROJECT_NOT_FOUND: { status: 404, error: "Project not found" },
  PROJECT_PATH_EXISTS: { status: 409, error: "Project path already exists" },
  
  // Task errors
  TASK_NOT_FOUND: { status: 404, error: "Task not found" },
  INVALID_COLUMN: { status: 400, error: "Column does not belong to board" },
  INVALID_STATUS: { status: 400, error: "Unsupported task status" },
  TRANSITION_NOT_ALLOWED: { status: 400, error: "Column transition is not allowed" },
  
  // Run errors
  NO_ROLES_CONFIGURED: { status: 400, error: "No agent roles configured" },
  RUN_NOT_FOUND: { status: 404, error: "Run not found" },
  
  // Generic
  VALIDATION_ERROR: { status: 400, error: "Missing required fields" },
  SERVER_ERROR: { status: 500, error: "Internal server error" },
};
```

### 6.2 Run Execution Error Flow

```mermaid
flowchart TD
    Start[Run Execution Start] --> CheckQueue{Run still queued?}
    CheckQueue -->|No| Skip[Skip execution]
    CheckQueue -->|Yes| UpdateRunning[Update status: running]
    
    UpdateRunning --> StartService[Start OpenCode service]
    StartService --> ServiceError{Service error?}
    ServiceError -->|Yes| FailRun[Mark run failed]
    
    ServiceError -->|No| CreateSession[Create session]
    CreateSession --> SessionError{Session error?}
    SessionError -->|Yes| FailRun
    
    SessionError -->|No| Subscribe[Subscribe to events]
    Subscribe --> SendPrompt[Send prompt]
    SendPrompt --> PromptError{Prompt error?}
    PromptError -->|Yes| FailRun
    
    PromptError -->|No| WaitCompletion[Wait for completion]
    WaitCompletion --> Timeout{Timeout?}
    Timeout -->|Yes| FailRun
    
    Timeout -->|No| Signal{Signal received?}
    Signal -->|done| CompleteRun[Mark completed]
    Signal -->|fail| FailRun
    Signal -->|question| PauseRun[Mark paused]
    
    FailRun --> SetError[Set errorText]
    SetError --> ProjectFailed[Project: task status = failed]
    ProjectFailed --> Cleanup[Cleanup session]
    
    CompleteRun --> ProjectDone[Project: task status = done]
    PauseRun --> ProjectPaused[Project: task status = paused]
    
    CompleteRun --> Cleanup
    PauseRun --> Cleanup
    Cleanup --> End[End]
```

---

## 7. Quick Reference

### SSE Event Types

| Channel | Event Types | Trigger |
|---------|-------------|---------|
| `task:event` | `task:created`, `task:moved`, `task:updated` | Task CRUD, status changes, moves |
| `run:event` | `run:queued`, `run:started`, `run:completed`, `run:failed`, `run:paused` | Run lifecycle |

### Run Status Transitions

```mermaid
stateDiagram-v2
    [*] --> queued: enqueue()
    queued --> running: executeRun()
    queued --> cancelled: cancel()
    running --> completed: done signal
    running --> failed: fail signal / error
    running --> paused: question signal
    running --> cancelled: cancel()
    paused --> running: resume
    paused --> cancelled: cancel()
```

### Task Status by Column

| Column | Default Status | Allowed Statuses |
|--------|---------------|------------------|
| backlog | pending | pending |
| ready | pending | pending |
| deferred | pending | pending |
| in_progress | running | running, generating |
| blocked | paused | question, paused, failed |
| review | done | done |
| closed | done | done, failed |

### Test Mock Priority

1. **Repository methods** - Mock for unit isolation
2. **SSE Broker** - Mock to verify event publishing
3. **Workflow functions** - Mock for deterministic status resolution
4. **External services** - Mock OpenCode SDK calls
