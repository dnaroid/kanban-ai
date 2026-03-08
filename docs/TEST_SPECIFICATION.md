# Test Specification

Comprehensive test specification for the kanban-ai project covering all core features, state machines, API endpoints, and user workflows.

## 1. Test Strategy

### 1.1 Testing Pyramid

| Level | Focus | Tools | Coverage Target |
|-------|-------|-------|-----------------|
| Unit | Individual functions, pure logic | Vitest | 80% |
| Integration | API routes, database operations | Vitest + SQLite | 70% |
| E2E | Full user workflows | Playwright | Critical paths |
| State Machine | State transitions, signal processing | Vitest | 100% |

### 1.2 Unit Tests

**What to Unit Test:**
- State transition validators (`canTransitionStatus`, `canTransitionColumn`)
- Signal rule matching logic
- Tag parsing utilities
- Data transformation functions
- Repository CRUD operations (isolated)
- Queue priority scoring
- Provider concurrency resolution

### 1.3 Integration Tests

**What to Integration Test:**
- All 51 API route handlers
- Database migrations
- Run queue manager with real database
- Workflow configuration persistence
- SSE event broadcasting
- Task-Run lifecycle coordination

### 1.4 E2E Tests

**What to E2E Test:**
- Complete task lifecycle (create -> run -> complete)
- Drag-and-drop task movement
- Real-time UI updates via SSE
- Error recovery flows
- Multi-user concurrent operations

---

## 2. Test Cases by Feature Area

### 2.1 Project Management

#### TC-PM-001: Create Project
Priority: P0
Type: Integration
Preconditions: Valid filesystem path exists
Steps:
  1. POST `/api/projects` with `{ name: "Test Project", path: "/valid/path" }`
  2. Verify response contains project ID
  3. GET `/api/projects/{id}` to confirm persistence
Expected Result: Project created with auto-generated board
Test Data: `{ name: "E-commerce App", path: "/tmp/test-project", color: "#3b82f6" }`

#### TC-PM-002: Create Project with Invalid Path
Priority: P1
Type: Integration
Preconditions: None
Steps:
  1. POST `/api/projects` with `{ name: "Test", path: "/nonexistent/path/xyz" }`
Expected Result: 400 error with descriptive message
Test Data: `{ name: "Invalid", path: "/proc/invalid" }`

#### TC-PM-003: Update Project
Priority: P1
Type: Integration
Preconditions: Project exists
Steps:
  1. PATCH `/api/projects/{id}` with updated fields
  2. Verify updated values returned
  3. Verify `updatedAt` timestamp changed
Expected Result: Project updated successfully
Test Data: `{ name: "Renamed Project", color: "#ef4444" }`

#### TC-PM-004: Delete Project
Priority: P1
Type: Integration
Preconditions: Project exists with tasks
Steps:
  1. DELETE `/api/projects/{id}`
  2. Verify project not found on GET
  3. Verify associated board, tasks, runs are cascade deleted
Expected Result: Project and all dependencies removed
Test Data: Existing project ID

#### TC-PM-005: Browse Directory
Priority: P2
Type: Integration
Preconditions: None
Steps:
  1. POST `/api/browse` with `{ path: "/home/user" }`
  2. Verify response contains directory listing
Expected Result: Array of files and directories with metadata
Test Data: `{ path: process.env.HOME }`

#### TC-PM-006: Filesystem Exists Check
Priority: P2
Type: Integration
Preconditions: None
Steps:
  1. POST `/api/filesystem/exists` with valid path
  2. POST `/api/filesystem/exists` with invalid path
Expected Result: Returns `{ exists: true }` or `{ exists: false }`
Test Data: `{ path: "/tmp" }`, `{ path: "/nonexistent" }`

---

### 2.2 Board/Kanban Management

#### TC-BD-001: Get Board by Project
Priority: P0
Type: Integration
Preconditions: Project exists with auto-created board
Steps:
  1. GET `/api/boards/project/{projectId}`
  2. Verify board has 7 default columns
  3. Verify column systemKeys match workflow
Expected Result: Board with columns in correct order
Test Data: Valid project ID

#### TC-BD-002: Update Board Columns
Priority: P1
Type: Integration
Preconditions: Board exists
Steps:
  1. PATCH `/api/boards/{id}/columns` with reordered columns
  2. Verify column order updated
  3. Verify tasks maintain column associations
Expected Result: Columns reordered without data loss
Test Data: 
```json
{
  "columns": [
    { "id": "col-1", "orderIndex": 0 },
    { "id": "col-2", "orderIndex": 1 }
  ]
}
```

#### TC-BD-003: Column WIP Limit Enforcement
Priority: P2
Type: Integration
Preconditions: Column has WIP limit set
Steps:
  1. Set WIP limit to 2 on "In Progress" column
  2. Move 2 tasks to column
  3. Attempt to move 3rd task
Expected Result: Warning or soft enforcement (configurable)
Test Data: `{ wipLimit: 2 }`

---

### 2.3 Task Management

#### TC-TK-001: Create Task
Priority: P0
Type: Integration
Preconditions: Project and board exist
Steps:
  1. POST `/api/tasks` with task data
  2. Verify task created with status "pending"
  3. Verify task assigned to first column
Expected Result: Task created with all fields persisted
Test Data:
```json
{
  "projectId": "proj-123",
  "boardId": "board-456",
  "columnId": "col-backlog",
  "title": "Implement authentication",
  "description": "Add OAuth2 login",
  "tags": ["backend", "security"],
  "priority": "high",
  "difficulty": "medium"
}
```

#### TC-TK-002: Create Task with Dependencies
Priority: P1
Type: Integration
Preconditions: Multiple tasks exist
Steps:
  1. Create task with dependency references
  2. Verify dependency relationships stored
  3. Verify blocked status if dependency incomplete
Expected Result: Dependencies linked, status reflects constraints
Test Data: Task with `dependsOn: ["task-1", "task-2"]`

#### TC-TK-003: Update Task
Priority: P0
Type: Integration
Preconditions: Task exists
Steps:
  1. PATCH `/api/tasks/{id}` with updated fields
  2. Verify only provided fields updated
  3. Verify `updatedAt` timestamp changed
Expected Result: Partial update successful
Test Data: `{ title: "Updated title", priority: "critical" }`

#### TC-TK-004: Delete Task
Priority: P1
Type: Integration
Preconditions: Task exists with runs
Steps:
  1. DELETE `/api/tasks/{id}`
  2. Verify task removed
  3. Verify associated runs preserved (or cascaded per config)
Expected Result: Task deleted, runs handled per policy
Test Data: Task ID with existing runs

#### TC-TK-005: Move Task to Column
Priority: P0
Type: Integration
Preconditions: Task exists, valid target column
Steps:
  1. POST `/api/tasks/{id}/move` with target column and status
  2. Verify column and status updated
  3. Verify workflow transition validation applied
Expected Result: Task moved with valid status transition
Test Data: `{ columnId: "col-in-progress", status: "running" }`

#### TC-TK-006: Move Task with Invalid Status Transition
Priority: P1
Type: Integration
Preconditions: Task in "done" status
Steps:
  1. Attempt to move task to "running" status directly
Expected Result: 400 error, task unchanged
Test Data: `{ status: "running" }` from done state

#### TC-TK-007: Task Tag Management
Priority: P2
Type: Integration
Preconditions: Task exists
Steps:
  1. Update task with new tags array
  2. Verify tags stored as JSON
  3. Verify tag colors resolved
Expected Result: Tags persisted and queryable
Test Data: `{ tags: ["frontend", "urgent", "bug"] }`

#### TC-TK-008: Task Order in Column
Priority: P2
Type: Integration
Preconditions: Multiple tasks in same column
Steps:
  1. Reorder tasks via drag-drop
  2. Verify `orderInColumn` updated for all affected tasks
Expected Result: Tasks maintain new order
Test Data: Array of task IDs in new order

---

### 2.4 Run Execution

#### TC-RN-001: Start Run
Priority: P0
Type: Integration
Preconditions: Task exists with valid status
Steps:
  1. POST `/api/run/start` with taskId and roleId
  2. Verify run created with "queued" status
  3. Verify task status updated to "running"
Expected Result: Run queued for execution
Test Data: `{ taskId: "task-123", roleId: "role-developer", mode: "execution" }`

#### TC-RN-002: Start Generation Run
Priority: P0
Type: Integration
Preconditions: Task in "pending" status
Steps:
  1. POST `/api/run/start` with mode "generation"
  2. Verify task status becomes "generating"
  3. Verify run kind set to "task-description-improve"
Expected Result: Generation run started
Test Data: `{ taskId: "task-456", mode: "generation" }`

#### TC-RN-003: Start QA Testing Run
Priority: P1
Type: Integration
Preconditions: Task in "done" status
Steps:
  1. POST `/api/opencode/start-qa-testing` with taskId
  2. Verify run created with kind "task-qa-testing"
  3. Verify task status becomes "running"
Expected Result: QA testing run started
Test Data: `{ taskId: "task-789" }`

#### TC-RN-004: Cancel Run
Priority: P1
Type: Integration
Preconditions: Run in "running" or "queued" status
Steps:
  1. POST `/api/run/cancel` with runId
  2. Verify run status "cancelled"
  3. Verify task status "pending"
Expected Result: Run cancelled cleanly
Test Data: `{ runId: "run-123" }`

#### TC-RN-005: List Runs by Task
Priority: P2
Type: Integration
Preconditions: Task with multiple runs
Steps:
  1. GET `/api/run/listByTask?taskId={taskId}`
  2. Verify all runs for task returned
  3. Verify runs ordered by createdAt desc
Expected Result: Array of run objects
Test Data: Task ID with 3+ runs

#### TC-RN-006: Get Queue Stats
Priority: P2
Type: Integration
Preconditions: Multiple runs queued
Steps:
  1. GET `/api/run/queueStats`
  2. Verify response contains queued/running counts
  3. Verify per-provider breakdown
Expected Result: Queue statistics object
Test Data: None (reads current state)

#### TC-RN-007: Concurrent Run Limit
Priority: P1
Type: Integration
Preconditions: Provider concurrency limit set
Steps:
  1. Queue runs exceeding provider limit
  2. Verify only limit number run concurrently
  3. Verify remaining queued
Expected Result: Concurrency enforced
Test Data: 5 runs with limit 2

#### TC-RN-008: Run Retry After Failure
Priority: P1
Type: Integration
Preconditions: Run failed
Steps:
  1. User clicks retry on failed run
  2. Verify new run created
  3. Verify task status reset appropriately
Expected Result: New run queued with same parameters
Test Data: Failed run ID

---

### 2.5 Workflow Engine

#### TC-WF-001: Signal Processing - Run Started
Priority: P0
Type: Unit
Preconditions: Task in pending status
Steps:
  1. Emit signal "run_started" with runKind "execution"
  2. Verify task status transitions to "running"
Expected Result: Status updated per signal rule
Test Data: `{ signalKey: "run_started", runKind: null, runStatus: "running" }`

#### TC-WF-002: Signal Processing - Run Failed
Priority: P0
Type: Unit
Preconditions: Task in running status
Steps:
  1. Emit signal "fail" with runStatus "failed"
  2. Verify task status transitions to "failed"
  3. Verify blockedReason set to "failed"
Expected Result: Task in blocked state
Test Data: `{ signalKey: "fail", runStatus: "failed" }`

#### TC-WF-003: Signal Processing - Generation Complete
Priority: P1
Type: Unit
Preconditions: Task in generating status
Steps:
  1. Emit signal "done" with runKind "task-description-improve"
  2. Verify task status transitions to "pending"
  3. Verify description updated
Expected Result: Task ready for execution
Test Data: `{ signalKey: "done", runKind: "task-description-improve" }`

#### TC-WF-004: User Action Signal - Pause
Priority: P1
Type: Unit
Preconditions: Task in running status
Steps:
  1. Emit signal "pause_run" (user_action scope)
  2. Verify task status "paused"
  3. Verify blockedReason "paused"
Expected Result: Task paused
Test Data: `{ signalKey: "pause_run", scope: "user_action" }`

#### TC-WF-005: Column Transition Validation
Priority: P0
Type: Unit
Preconditions: None
Steps:
  1. Call `canTransitionColumn("backlog", "in_progress")`
  2. Call `canTransitionColumn("closed", "in_progress")`
Expected Result: First true, second false (must go through review)
Test Data: Column system keys

#### TC-WF-006: Status Transition Validation
Priority: P0
Type: Unit
Preconditions: None
Steps:
  1. Call `canTransitionStatus("pending", "running")` - expect true
  2. Call `canTransitionStatus("done", "generating")` - expect false
Expected Result: Valid transitions return true
Test Data: Status pairs

#### TC-WF-007: Signal Rule Matching
Priority: P1
Type: Unit
Preconditions: Workflow config loaded
Steps:
  1. Test signal matching with runKind filter
  2. Test signal matching with fromStatus filter
  3. Test signal matching with fromColumnSystemKey filter
Expected Result: Correct rules matched and applied
Test Data: Various signal/runeKind/status combinations

#### TC-WF-008: Workflow Configuration Persistence
Priority: P2
Type: Integration
Preconditions: None
Steps:
  1. Update workflow transitions via `/api/settings/workflow`
  2. Restart server
  3. Verify transitions persisted
Expected Result: Custom transitions retained
Test Data: Modified status transitions

---

### 2.6 Real-Time Updates (SSE)

#### TC-SSE-001: Subscribe to Session Events
Priority: P0
Type: Integration
Preconditions: Active OpenCode session
Steps:
  1. Connect to `/events?sessionId={sessionId}`
  2. Verify SSE connection established
  3. Trigger event, verify received
Expected Result: Events received in real-time
Test Data: Active session ID

#### TC-SSE-002: Todo Updates
Priority: P1
Type: Integration
Preconditions: Run active with todos
Steps:
  1. Subscribe to session events
  2. Modify todo via OpenCode
  3. Verify `todo.updated` event received
Expected Result: UI synchronized with todo changes
Test Data: Session with active todos

#### TC-SSE-003: Message Updates
Priority: P1
Type: Integration
Preconditions: Active conversation
Steps:
  1. Subscribe to message events
  2. Send message to agent
  3. Verify `message` event received
Expected Result: Messages streamed in real-time
Test Data: Active session ID

#### TC-SSE-004: Connection Recovery
Priority: P2
Type: Integration
Preconditions: Active SSE connection
Steps:
  1. Establish SSE connection
  2. Simulate network interruption
  3. Verify reconnection and event resumption
Expected Result: Connection recovers automatically
Test Data: None

#### TC-SSE-005: Multiple Subscribers
Priority: P2
Type: Integration
Preconditions: None
Steps:
  1. Connect 3 SSE clients to same channel
  2. Broadcast event
  3. Verify all clients receive event
Expected Result: Broadcast to all subscribers
Test Data: Channel ID, test event

---

### 2.7 Tag Management

#### TC-TG-001: Create Tag
Priority: P2
Type: Integration
Preconditions: Board exists
Steps:
  1. POST `/api/tags` with name and color
  2. Verify tag created
  3. Verify available for task assignment
Expected Result: Tag created successfully
Test Data: `{ boardId: "board-123", name: "urgent", color: "#ef4444" }`

#### TC-TG-002: Get Global Tags
Priority: P2
Type: Integration
Preconditions: Multiple boards with tags
Steps:
  1. GET `/api/tags` without boardId filter
  2. Verify all tags returned
Expected Result: Aggregated tag list
Test Data: None

#### TC-TG-003: Delete Tag
Priority: P2
Type: Integration
Preconditions: Tag assigned to tasks
Steps:
  1. DELETE `/api/tags/{id}`
  2. Verify tag removed from tasks
Expected Result: Tag deleted, references cleared
Test Data: Tag ID

---

### 2.8 OpenCode Integration

#### TC-OC-001: List Available Agents
Priority: P1
Type: Integration
Preconditions: OpenCode server running
Steps:
  1. GET `/api/opencode/agents`
  2. Verify agent list returned
  3. Verify agent capabilities included
Expected Result: Array of available agents
Test Data: None

#### TC-OC-002: List Available Skills
Priority: P1
Type: Integration
Preconditions: OpenCode server running
Steps:
  1. GET `/api/opencode/skills`
  2. Verify skill list with descriptions
Expected Result: Skill catalog
Test Data: None

#### TC-OC-003: Refresh Skill Assignments
Priority: P2
Type: Integration
Preconditions: Skills configured
Steps:
  1. POST `/api/opencode/skills/refresh-assignments`
  2. Verify assignments updated
Expected Result: Skill assignments refreshed
Test Data: None

#### TC-OC-004: Model Management
Priority: P2
Type: Integration
Preconditions: Models configured
Steps:
  1. GET `/api/opencode/models`
  2. Toggle model via `/api/opencode/models/toggle`
  3. Verify change persisted
Expected Result: Model list updated
Test Data: `{ modelName: "gpt-4", enabled: true }`

---

### 2.9 Roles Management

#### TC-RL-001: List Roles
Priority: P1
Type: Integration
Preconditions: Roles configured
Steps:
  1. GET `/api/roles/list`
  2. Verify role list with presets
Expected Result: Array of roles
Test Data: None

#### TC-RL-002: Save Role
Priority: P1
Type: Integration
Preconditions: None
Steps:
  1. POST `/api/roles/save` with role config
  2. Verify role persisted
Expected Result: Role saved/updated
Test Data: Role with preset configuration

#### TC-RL-003: Delete Role
Priority: P2
Type: Integration
Preconditions: Role exists
Steps:
  1. DELETE `/api/roles/delete?id={roleId}`
  2. Verify role removed
Expected Result: Role deleted
Test Data: Role ID

---

## 3. Test Scenarios (End-to-End)

### 3.1 Complete Task Lifecycle

**Scenario:** User creates project -> board -> task -> runs AI -> completes

```
Steps:
1. User creates project via API
2. System auto-creates board with 7 columns
3. User creates task in "backlog" column
4. User drags task to "ready" column
5. User clicks "Generate User Story"
6. System starts generation run
7. Task status: pending -> generating -> pending (with description)
8. User starts execution run
9. Task status: pending -> running
10. AI completes successfully
11. Task status: running -> done
12. Task moves to "review" column
13. User runs QA testing
14. Task status: done -> running -> done
15. User drags to "closed" column

Expected: Task flows through all states correctly
```

### 3.2 Drag-and-Drop Task Movement

**Scenario:** User drags task across columns

```
Steps:
1. Task in "backlog" with status "pending"
2. User drags to "in_progress" column
3. System validates column transition
4. System suggests "running" status
5. User confirms
6. Task column and status updated
7. UI reflects change immediately

Expected: Smooth drag-drop with status validation
```

### 3.3 AI Run Failure and Recovery

**Scenario:** AI run fails -> task moves to blocked -> user retries

```
Steps:
1. Task in "running" status
2. AI encounters error
3. Run status: failed
4. Signal "fail" processed
5. Task status: running -> failed
6. Task moves to "blocked" column
7. blockedReason: "failed"
8. User clicks "Retry"
9. New run created
10. Task status: failed -> running
11. Run succeeds
12. Task status: running -> done

Expected: Error handling with recovery path
```

### 3.4 Multiple Concurrent Runs

**Scenario:** Queue management with multiple runs

```
Steps:
1. User queues 5 execution runs simultaneously
2. Provider concurrency limit: 2
3. First 2 runs start immediately
4. Remaining 3 queued
5. First run completes
6. Third run starts automatically
7. All runs complete eventually

Expected: Concurrency limits enforced, queue drains properly
```

### 3.5 Real-Time Collaboration

**Scenario:** Multiple users viewing same board

```
Steps:
1. User A and B connected via SSE
2. User A moves task to new column
3. User B receives task.updated event
4. User B's UI updates immediately
5. User B modifies same task
6. User A receives update

Expected: All clients synchronized
```

### 3.6 Generation Flow

**Scenario:** User generates task description from title

```
Steps:
1. Task has title only, empty description
2. User clicks "Generate Description"
3. Generation run starts
4. Task status: pending -> generating
5. OpenCode generates user story
6. Run completes
7. Task description populated
8. Task status: generating -> pending
9. User reviews and approves

Expected: Description generated and task ready for execution
```

---

## 4. State Machine Test Suite

### 4.1 Task Status State Machine

**States:** `pending`, `running`, `question`, `paused`, `done`, `failed`, `generating`

#### Valid Transitions

| From | To | Signal | Test Case ID |
|------|-----|--------|--------------|
| pending | running | run_started | TC-SM-001 |
| pending | generating | generation_started | TC-SM-002 |
| pending | done | (manual) | TC-SM-003 |
| pending | failed | (manual) | TC-SM-004 |
| pending | paused | pause_run | TC-SM-005 |
| pending | question | request_changes | TC-SM-006 |
| running | pending | cancelled | TC-SM-007 |
| running | paused | pause_run | TC-SM-008 |
| running | question | question | TC-SM-009 |
| running | failed | fail | TC-SM-010 |
| running | done | done | TC-SM-011 |
| generating | pending | generated/done | TC-SM-012 |
| generating | paused | pause_run | TC-SM-013 |
| generating | question | question | TC-SM-014 |
| generating | failed | fail | TC-SM-015 |
| generating | done | done | TC-SM-016 |
| question | pending | answer_question | TC-SM-017 |
| question | running | resume_run | TC-SM-018 |
| question | paused | pause_run | TC-SM-019 |
| question | failed | fail | TC-SM-020 |
| question | done | done | TC-SM-021 |
| paused | pending | cancel_run | TC-SM-022 |
| paused | running | resume_run | TC-SM-023 |
| paused | question | request_changes | TC-SM-024 |
| paused | failed | fail | TC-SM-025 |
| paused | done | done | TC-SM-026 |
| done | pending | reopen_task | TC-SM-027 |
| done | running | start_execution | TC-SM-028 |
| done | failed | mark_test_fail | TC-SM-029 |
| failed | pending | retry_run | TC-SM-030 |
| failed | running | start_execution | TC-SM-031 |
| failed | paused | pause_run | TC-SM-032 |

#### Invalid Transitions (Must Reject)

| From | To | Test Case ID |
|------|-----|--------------|
| pending | pending | TC-SM-E001 (no-op, allowed) |
| done | generating | TC-SM-E002 |
| done | question | TC-SM-E003 |
| failed | generating | TC-SM-E004 |
| failed | done | TC-SM-E005 |
| running | generating | TC-SM-E006 |

#### TC-SM-001: pending -> running
Priority: P0
Type: Unit
Preconditions: Task in pending status
Steps:
  1. Emit signal "run_started"
  2. Verify status transitions to "running"
Expected Result: Status = "running"

#### TC-SM-010: running -> failed
Priority: P0
Type: Unit
Preconditions: Task in running status
Steps:
  1. Emit signal "fail" with runStatus "failed"
  2. Verify status = "failed"
  3. Verify blockedReason = "failed"
Expected Result: Task in failed state with blocked reason

#### TC-SM-E002: done -> generating (Invalid)
Priority: P0
Type: Unit
Preconditions: Task in done status
Steps:
  1. Attempt transition to "generating"
Expected Result: Transition rejected, status unchanged

### 4.2 Run Status State Machine

**States:** `queued`, `running`, `completed`, `failed`, `cancelled`, `timeout`, `paused`

#### Valid Transitions

| From | To | Test Case ID |
|------|-----|--------------|
| queued | running | TC-RSM-001 |
| queued | cancelled | TC-RSM-002 |
| running | completed | TC-RSM-003 |
| running | failed | TC-RSM-004 |
| running | cancelled | TC-RSM-005 |
| running | timeout | TC-RSM-006 |
| running | paused | TC-RSM-007 |
| paused | running | TC-RSM-008 |
| paused | cancelled | TC-RSM-009 |

#### TC-RSM-001: queued -> running
Priority: P0
Type: Integration
Preconditions: Run in queue
Steps:
  1. Queue manager selects run
  2. Execute run
  3. Verify status "running"
Expected Result: Run executing

#### TC-RSM-006: running -> timeout
Priority: P1
Type: Integration
Preconditions: Run exceeds time limit
Steps:
  1. Run exceeds configured timeout
  2. System cancels run
  3. Status = "timeout"
Expected Result: Run timed out cleanly

### 4.3 Column Transition State Machine

**Columns:** `backlog`, `ready`, `deferred`, `in_progress`, `blocked`, `review`, `closed`

#### Valid Transitions

| From | Allowed Targets |
|------|-----------------|
| backlog | ready, deferred, in_progress |
| ready | backlog, deferred, in_progress |
| deferred | backlog, ready, in_progress |
| in_progress | blocked, review, ready, deferred, backlog |
| blocked | in_progress, review, ready, deferred, backlog, closed |
| review | in_progress, blocked, ready, closed |
| closed | ready, review, backlog |

#### TC-COL-001: backlog -> in_progress
Priority: P1
Type: Integration
Preconditions: Task in backlog
Steps:
  1. Move task to in_progress column
  2. Verify transition allowed
Expected Result: Task in new column

#### TC-COL-002: closed -> in_progress (Invalid)
Priority: P1
Type: Integration
Preconditions: Task in closed
Steps:
  1. Attempt direct move to in_progress
Expected Result: 400 error, must go through review

### 4.4 Concurrency Tests

#### TC-CON-001: Concurrent Status Updates
Priority: P0
Type: Integration
Preconditions: Task in running status
Steps:
  1. Two signals arrive simultaneously (done, fail)
  2. Only one should win
  3. Task in consistent state
Expected Result: Atomic update, no corruption

#### TC-CON-002: Concurrent Run Creation
Priority: P1
Type: Integration
Preconditions: Task in pending status
Steps:
  1. Two run start requests simultaneously
  2. Only one should succeed
  3. Or both queue appropriately
Expected Result: No duplicate active runs

#### TC-CON-003: Queue Race Condition
Priority: P1
Type: Integration
Preconditions: Multiple runs completing simultaneously
Steps:
  1. Multiple runs complete at same time
  2. Queue drains correctly
  3. No runs stuck in queue
Expected Result: Queue drains without issues

---

## 5. Regression Test Checklist

### 5.1 Critical User Flows

- [ ] Create project and verify board auto-creation
- [ ] Create task and verify it appears in kanban
- [ ] Move task between columns via drag-drop
- [ ] Start AI run and verify status updates
- [ ] Complete run and verify task completion
- [ ] Cancel run and verify cleanup
- [ ] Generate user story from task title
- [ ] Run QA testing on completed task
- [ ] Reopen closed task

### 5.2 Data Integrity

- [ ] Task count per column matches actual tasks
- [ ] Run count per task matches actual runs
- [ ] Tag assignments persist across updates
- [ ] Column order maintained after reorder
- [ ] Task order within column preserved
- [ ] Dependencies resolve correctly
- [ ] Status and column remain consistent

### 5.3 Error Handling

- [ ] Invalid project path shows clear error
- [ ] Missing task returns 404
- [ ] Invalid status transition rejected
- [ ] Run failure doesn't corrupt task
- [ ] Timeout handled gracefully
- [ ] Network errors in SSE reconnect
- [ ] Database errors return 500 with message

### 5.4 Performance

- [ ] Board loads in < 500ms with 100 tasks
- [ ] Task move completes in < 100ms
- [ ] SSE connection established in < 200ms
- [ ] Queue processes 10 runs/minute minimum
- [ ] Database queries use indexes

---

## 6. Test Data Requirements

### 6.1 Seed Data

```sql
-- Projects
INSERT INTO projects (id, name, path, color) VALUES
  ('proj-test-1', 'Test Project 1', '/tmp/test-1', '#3b82f6'),
  ('proj-test-2', 'Test Project 2', '/tmp/test-2', '#ef4444');

-- Boards (auto-created with projects)
INSERT INTO boards (id, project_id, name) VALUES
  ('board-test-1', 'proj-test-1', 'Default Board');

-- Columns
INSERT INTO board_columns (id, board_id, name, system_key, order_index) VALUES
  ('col-backlog', 'board-test-1', 'Backlog', 'backlog', 0),
  ('col-ready', 'board-test-1', 'Ready', 'ready', 1),
  ('col-in-progress', 'board-test-1', 'In Progress', 'in_progress', 2),
  ('col-blocked', 'board-test-1', 'Blocked', 'blocked', 3),
  ('col-review', 'board-test-1', 'Review', 'review', 4),
  ('col-closed', 'board-test-1', 'Closed', 'closed', 5);

-- Tasks
INSERT INTO tasks (id, project_id, board_id, column_id, title, status) VALUES
  ('task-pending', 'proj-test-1', 'board-test-1', 'col-ready', 'Pending Task', 'pending'),
  ('task-running', 'proj-test-1', 'board-test-1', 'col-in-progress', 'Running Task', 'running'),
  ('task-done', 'proj-test-1', 'board-test-1', 'col-review', 'Done Task', 'done'),
  ('task-failed', 'proj-test-1', 'board-test-1', 'col-blocked', 'Failed Task', 'failed');

-- Tags
INSERT INTO tags (id, board_id, name, color) VALUES
  ('tag-bug', 'board-test-1', 'bug', '#ef4444'),
  ('tag-feature', 'board-test-1', 'feature', '#10b981');

-- Roles
INSERT INTO roles (id, name, preset_json) VALUES
  ('role-dev', 'Developer', '{"behavior": "developer"}'),
  ('role-qa', 'QA Engineer', '{"behavior": "qa"}');
```

### 6.2 Edge Case Data

```javascript
// Maximum length title (255 chars)
const maxTitleTask = {
  title: "A".repeat(255),
  description: "Test maximum length"
};

// Empty description
const emptyDescTask = {
  title: "No Description",
  description: ""
};

// Special characters in title
const specialCharsTask = {
  title: "Task with <script>alert('xss')</script> & \"quotes\" 'apostrophes'",
  description: "Special chars test"
};

// Unicode content
const unicodeTask = {
  title: "日本語タスク - 任务 - Задача",
  description: "Emoji: 🚀 ✅ ❌ 🐛"
};

// Circular dependencies (should fail)
const circularDeps = {
  taskA: { dependsOn: ["taskB"] },
  taskB: { dependsOn: ["taskA"] }
};

// Maximum tags
const maxTagsTask = {
  tags: Array.from({ length: 20 }, (_, i) => `tag-${i}`)
};
```

### 6.3 Performance Test Data

```javascript
// Generate 100 tasks for load testing
const performanceTasks = Array.from({ length: 100 }, (_, i) => ({
  title: `Performance Task ${i}`,
  status: ['pending', 'running', 'done', 'failed'][i % 4],
  columnId: ['col-backlog', 'col-ready', 'col-in-progress', 'col-review'][i % 4]
}));

// Generate 50 concurrent runs
const concurrentRuns = Array.from({ length: 50 }, (_, i) => ({
  taskId: `task-${i}`,
  roleId: 'role-dev',
  mode: 'execution'
}));
```

---

## 7. Coverage Matrix

| Feature | Unit | Integration | E2E | Coverage Target |
|---------|------|-------------|-----|-----------------|
| Project CRUD | ✅ | ✅ | ✅ | 90% |
| Board Management | ✅ | ✅ | ✅ | 85% |
| Task CRUD | ✅ | ✅ | ✅ | 90% |
| Task Movement | ✅ | ✅ | ✅ | 95% |
| Run Execution | ✅ | ✅ | ✅ | 90% |
| Run Queue | ✅ | ✅ | ⬜ | 85% |
| Workflow Signals | ✅ | ✅ | ⬜ | 95% |
| Status Transitions | ✅ | ✅ | ⬜ | 100% |
| Column Transitions | ✅ | ✅ | ✅ | 100% |
| SSE Events | ⬜ | ✅ | ✅ | 80% |
| Tag Management | ✅ | ✅ | ⬜ | 80% |
| Role Management | ✅ | ✅ | ⬜ | 80% |
| OpenCode Integration | ⬜ | ✅ | ✅ | 75% |
| Error Handling | ✅ | ✅ | ✅ | 90% |
| Concurrency | ✅ | ✅ | ⬜ | 85% |

**Legend:** ✅ = Required, ⬜ = Optional

---

## 8. Test Execution Strategy

### 8.1 CI Pipeline

```yaml
# .github/workflows/test.yml
jobs:
  unit:
    run: pnpm test:unit
    coverage: 80%
    
  integration:
    run: pnpm test:integration
    requires: unit
    
  e2e:
    run: pnpm test:e2e
    requires: integration
    browsers: [chromium, firefox]
```

### 8.2 Pre-Commit Hooks

- Run affected unit tests
- Lint check
- Type check

### 8.3 Pre-Merge Requirements

- All unit tests pass
- All integration tests pass
- Coverage thresholds met
- No new TypeScript errors
- Critical E2E scenarios pass

### 8.4 Regression Schedule

- **Daily:** Unit + Integration tests
- **Weekly:** Full E2E suite
- **Pre-release:** Complete regression including performance tests

---

## 9. Test Environment

### 9.1 Required Services

- SQLite (in-memory for unit, file for integration)
- OpenCode server (mocked for unit, real for integration)
- Node.js 20+

### 9.2 Environment Variables

```bash
# Test configuration
TEST_DATABASE_PATH=:memory:
OPENCODE_URL=http://localhost:4096
OPENCODE_MOCK_ENABLED=true
LOG_LEVEL=error
```

### 9.3 Mock Configuration

```typescript
// mocks/opencode.ts
export const mockOpenCodeClient = {
  prompt: vi.fn().mockResolvedValue({ content: "Generated content" }),
  createSession: vi.fn().mockResolvedValue({ sessionId: "test-session" }),
  getTodos: vi.fn().mockResolvedValue([])
};
```

---

## 10. Appendix

### 10.1 Test File Naming Convention

```
src/
├── __tests__/
│   ├── unit/
│   │   ├── workflow-manager.test.ts
│   │   ├── queue-manager.test.ts
│   │   └── status-transitions.test.ts
│   ├── integration/
│   │   ├── api/
│   │   │   ├── projects.test.ts
│   │   │   ├── tasks.test.ts
│   │   │   └── runs.test.ts
│   │   └── database/
│   │       └── migrations.test.ts
│   └── e2e/
│       ├── task-lifecycle.spec.ts
│       └── drag-drop.spec.ts
```

### 10.2 Assertion Helpers

```typescript
// test-helpers/assertions.ts
export function assertValidTaskStatus(status: string): void {
  expect(['pending', 'running', 'question', 'paused', 'done', 'failed', 'generating'])
    .toContain(status);
}

export function assertValidTransition(from: string, to: string): void {
  expect(canTransitionStatus(from, to)).toBe(true);
}

export function assertTaskInColumn(task: Task, columnKey: string): void {
  const column = boardRepo.getById(task.boardId)?.columns.find(c => c.id === task.columnId);
  expect(column?.systemKey).toBe(columnKey);
}
```

### 10.3 Test Utilities

```typescript
// test-helpers/fixtures.ts
export function createTestProject(overrides = {}) {
  return {
    id: randomUUID(),
    name: 'Test Project',
    path: `/tmp/test-${Date.now()}`,
    color: '#3b82f6',
    ...overrides
  };
}

export function createTestTask(overrides = {}) {
  return {
    id: randomUUID(),
    title: 'Test Task',
    status: 'pending',
    ...overrides
  };
}

export async function waitForRunCompletion(runId: string, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const run = runRepo.getById(runId);
    if (['completed', 'failed', 'cancelled', 'timeout'].includes(run.status)) {
      return run;
    }
    await sleep(100);
  }
  throw new Error(`Run ${runId} did not complete within ${timeout}ms`);
}
```
