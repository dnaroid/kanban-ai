# Regression Test Matrix

> Preventing regressions through systematic testing

This document defines the regression testing strategy for Kanban AI. Use it to ensure critical functionality remains intact after changes.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `pnpm test:run` | Run all unit tests |
| `pnpm test` | Run tests in watch mode |
| `pnpm lint` | Code quality check |
| `pnpm build` | Build verification |

---

## 1. Feature Risk Assessment

| Feature | Impact if Broken | Regression Risk | Priority |
|---------|------------------|-----------------|----------|
| **Task Workflow** | Tasks stuck in wrong states, board unusable | HIGH - 7 states, 7 columns, complex transitions | P0 |
| **Run Execution** | AI agents cannot process tasks | HIGH - external dependencies, async flows | P0 |
| **SSE Events** | UI frozen, no real-time updates | HIGH - critical for UX | P0 |
| **Database Operations** | Data loss, corruption | HIGH - SQLite operations | P0 |
| **Drag & Drop** | Cannot organize tasks | MEDIUM - UI component | P1 |
| **Project CRUD** | Cannot manage projects | MEDIUM - basic operations | P1 |
| **Task CRUD** | Cannot manage tasks | MEDIUM - basic operations | P1 |
| **Board Display** | Kanban board unusable | MEDIUM - UI rendering | P1 |
| **OpenCode Integration** | AI features unavailable | MEDIUM - external service | P1 |
| **User Story Generation** | Poor task descriptions | LOW - enhancement feature | P2 |
| **QA Testing Run** | Manual testing required | LOW - optional feature | P2 |
| **Tag Management** | Missing categorization | LOW - organizational | P2 |
| **Task Dependencies** | Blocked tasks mishandled | MEDIUM - scheduling impact | P1 |

---

## 2. Regression Test Matrix

### 2.1 Task Workflow (P0)

| Feature | Test Case | Priority | Type | Frequency |
|---------|-----------|----------|------|-----------|
| Status Transitions | pending -> running -> done | P0 | Unit | Every commit |
| Status Transitions | pending -> generating -> pending | P0 | Unit | Every commit |
| Status Transitions | running -> question -> pending | P0 | Unit | Every commit |
| Status Transitions | running -> paused -> running | P0 | Unit | Every commit |
| Status Transitions | running -> failed -> pending | P0 | Unit | Every commit |
| Status Transitions | done -> pending (reopen) | P0 | Unit | Every commit |
| Column Mapping | Status maps to correct column | P0 | Unit | Every commit |
| Column Transitions | backlog -> ready -> in_progress -> review -> closed | P0 | Unit | Every commit |
| Column Constraints | Status only allowed in valid columns | P0 | Unit | Every commit |
| Blocked Reason | question sets blockedReason | P0 | Unit | Every commit |
| Closed Reason | done/failed sets closedReason | P0 | Unit | Every commit |

**Test Command:**
```bash
pnpm test:run -- task-workflow-manager
```

**Test File:** `packages/next-js/src/server/workflow/task-workflow-manager.test.ts`

### 2.2 Run Execution (P0)

| Feature | Test Case | Priority | Type | Frequency |
|---------|-----------|----------|------|-----------|
| Queue Scheduling | Higher priority runs first | P0 | Unit | Every commit |
| Queue Scheduling | Postponed tasks not started | P0 | Unit | Every commit |
| Concurrency | Respects provider limits | P0 | Unit | Every commit |
| Session Creation | Creates OpenCode session | P0 | Unit | Every commit |
| Session Preferences | Forwards model/agent preferences | P0 | Unit | Every commit |
| Status Markers | Parses [STATUS: done] | P0 | Unit | Every commit |
| Status Markers | Parses [STATUS: fail] | P0 | Unit | Every commit |
| Status Markers | Parses [STATUS: question] | P0 | Unit | Every commit |
| QA Markers | Parses [STATUS: test_ok] | P0 | Unit | Every commit |
| QA Markers | Parses [STATUS: test_fail] | P0 | Unit | Every commit |
| Cancel | Cancels queued run | P0 | Unit | Every commit |
| Cancel | Aborts running session | P0 | Unit | Every commit |
| Error Recovery | Recovers from network failure with late marker | P0 | Unit | Every commit |
| Dependencies | Skips blocked tasks | P0 | Unit | Every commit |

**Test Command:**
```bash
pnpm test:run -- runs-queue-manager
```

**Test File:** `packages/next-js/src/server/run/runs-queue-manager.test.ts`

### 2.3 Run Service (P0)

| Feature | Test Case | Priority | Type | Frequency |
|---------|-----------|----------|------|-----------|
| Start Run | Creates run with correct params | P0 | Unit | Every commit |
| Start Run | Creates context snapshot | P0 | Unit | Every commit |
| Generate User Story | Returns existing active run | P0 | Unit | Every commit |
| Generate User Story | Creates BA run when none active | P0 | Unit | Every commit |
| Generate User Story | Uses preset model preferences | P0 | Unit | Every commit |
| Generate User Story | Respects agent: tag assignment | P0 | Unit | Every commit |
| QA Testing | Returns existing QA run | P0 | Unit | Every commit |
| QA Testing | Creates QA run with snapshot | P0 | Unit | Every commit |

**Test Command:**
```bash
pnpm test:run -- run-service
```

**Test File:** `packages/next-js/src/server/run/run-service.test.ts`

### 2.4 Task Projection (P0)

| Feature | Test Case | Priority | Type | Frequency |
|---------|-----------|----------|------|-----------|
| Status Update | Run start updates task status | P0 | Unit | Every commit |
| Column Move | Moves to preferred column on status change | P0 | Unit | Every commit |
| Column Constraint | Keeps current column if transition blocked | P0 | Unit | Every commit |
| User Story Parse | Extracts META tags | P0 | Unit | Every commit |
| User Story Parse | Extracts STORY content | P0 | Unit | Every commit |
| User Story Parse | Updates task title | P0 | Unit | Every commit |
| SSE Publish | Publishes task:event on update | P0 | Unit | Every commit |

**Test Command:**
```bash
pnpm test:run -- run-task-projector
```

**Test File:** `packages/next-js/src/server/run/run-task-projector.test.ts`

### 2.5 API Endpoints (P1)

| Feature | Test Case | Priority | Type | Frequency |
|---------|-----------|----------|------|-----------|
| Projects CRUD | GET /api/projects returns list | P1 | Integration | Pre-release |
| Projects CRUD | POST /api/projects creates project | P1 | Integration | Pre-release |
| Projects CRUD | PUT /api/projects/[id] updates | P1 | Integration | Pre-release |
| Projects CRUD | DELETE /api/projects/[id] removes | P1 | Integration | Pre-release |
| Tasks CRUD | GET /api/tasks returns list | P1 | Integration | Pre-release |
| Tasks CRUD | POST /api/tasks creates task | P1 | Integration | Pre-release |
| Tasks CRUD | PUT /api/tasks/[id] updates | P1 | Integration | Pre-release |
| Tasks CRUD | DELETE /api/tasks/[id] removes | P1 | Integration | Pre-release |
| Task Move | POST /api/tasks/[id]/move changes column | P1 | Integration | Pre-release |
| Run Start | POST /api/run/start queues run | P1 | Integration | Pre-release |
| Run Cancel | POST /api/run/cancel stops run | P1 | Integration | Pre-release |
| Queue Stats | GET /api/run/queueStats returns stats | P1 | Integration | Pre-release |
| Boards | GET /api/boards/project/[id] returns board | P1 | Integration | Pre-release |
| Columns | PUT /api/boards/[id]/columns updates | P1 | Integration | Pre-release |

**API Endpoints (51 total):**
```
/api/projects                    # CRUD
/api/tasks                       # CRUD + move
/api/boards                      # project board, columns
/api/run                         # start, cancel, delete, get, listByTask, queueStats
/api/opencode                    # sessions, messages, todos, models, generate-user-story
/api/roles                       # list, list-full, save, delete
/api/tags                        # CRUD
/api/deps                        # CRUD
/api/artifact                    # list, get
/api/omc                         # presets, backup, restore
/api/settings/workflow           # workflow config
/api/browse                      # file browser
/api/filesystem/exists           # path check
/api/database/delete             # reset database
/api/app-settings                # app settings
/api/schema                      # JSON schema
/api/app/open-path               # open in OS
```

### 2.6 UI Components (P1)

| Feature | Test Case | Priority | Type | Frequency |
|---------|-----------|----------|------|-----------|
| Kanban Board | Renders columns | P1 | E2E | Pre-release |
| Kanban Board | Renders task cards | P1 | E2E | Pre-release |
| Kanban Board | Drag task between columns | P1 | E2E | Pre-release |
| Task Card | Displays title, status, priority | P1 | E2E | Pre-release |
| Task Drawer | Opens on card click | P1 | E2E | Pre-release |
| Task Drawer | Edits description | P1 | E2E | Pre-release |
| Run Button | Starts execution | P1 | E2E | Pre-release |
| Run Button | Shows status indicator | P1 | E2E | Pre-release |

### 2.7 SSE Events (P0)

| Feature | Test Case | Priority | Type | Frequency |
|---------|-----------|----------|------|-----------|
| Connection | Client connects to SSE endpoint | P0 | Integration | Pre-release |
| Task Events | task:event fires on task update | P0 | Integration | Pre-release |
| Run Events | run:event fires on run update | P0 | Integration | Pre-release |
| UI Sync | UI updates on SSE event | P0 | E2E | Pre-release |
| Reconnection | Client reconnects on disconnect | P1 | Integration | Pre-release |

---

## 3. Pre-Release Checklist

Run through this checklist before every release.

### State Machine Transitions

- [ ] All task status transitions work (7 states)
- [ ] All column transitions work (7 columns)
- [ ] Blocked reason set correctly for question/paused/failed
- [ ] Closed reason set correctly for done/failed
- [ ] Status maps to correct preferred column
- [ ] Invalid transitions rejected

### API Endpoints

- [ ] All 51 API routes respond with correct HTTP status
- [ ] POST/PUT return created/updated entities
- [ ] DELETE removes entities
- [ ] Error responses include message
- [ ] Invalid input returns 400

### Drag & Drop

- [ ] Task drags between columns
- [ ] Column order preserved after drag
- [ ] Invalid column move rejected
- [ ] Touch devices work

### SSE Events

- [ ] Client connects successfully
- [ ] task:event fires with correct payload
- [ ] run:event fires with correct payload
- [ ] UI updates without refresh
- [ ] Connection recovers after disconnect

### Database Operations

- [ ] Migrations apply without error
- [ ] CRUD operations complete
- [ ] Relations preserved (task -> board -> project)
- [ ] Cascading deletes work correctly

### Error Handling

- [ ] Network errors show user message
- [ ] Validation errors show in UI
- [ ] API errors logged
- [ ] App does not crash on error

### Run Execution

- [ ] Run starts from task
- [ ] Run cancels correctly
- [ ] Status markers parsed
- [ ] Task status updates on run completion
- [ ] Queue respects concurrency limits

---

## 4. Breaking Change Detection

### Changes Requiring Full Regression

Any change to these files/areas requires running ALL tests:

| Area | Files/Patterns |
|------|----------------|
| Workflow Engine | `server/workflow/**/*.ts` |
| Run Queue | `server/run/runs-queue-manager.ts` |
| Task Projection | `server/run/run-task-projector.ts` |
| Database Schema | `server/db/migrations/*.sql` |
| SSE Broker | `server/events/**/*.ts` |
| API Routes | `app/api/**/*.ts` (any change) |
| Type Definitions | `types/ipc.ts`, `types/kanban.ts` |

**Full Regression Command:**
```bash
pnpm test:run && pnpm lint && pnpm build
```

### Changes Requiring Partial Regression

| Area | Required Tests |
|------|----------------|
| UI Components | E2E tests for affected component |
| Single API Endpoint | Integration test for that endpoint |
| Repository | Unit tests for affected repo |
| Utility Functions | Unit tests for affected module |

### API Versioning Requirements

Kanban AI uses a single API version. Breaking changes require:

1. **Deprecation Notice** - Add `X-Deprecated` header for 1 release
2. **Migration Guide** - Document in CHANGELOG
3. **Backward Compatibility** - Support old format for 1 release if possible

**Breaking Change Examples:**
- Removing an endpoint
- Changing required fields
- Changing response structure
- Changing error codes

**Non-Breaking Examples:**
- Adding optional fields
- Adding new endpoints
- Adding new values to enums

---

## 5. Historical Regressions Log

Track past regressions to prevent recurrence.

| Date | Issue | Cause | Fix | Prevention |
|------|-------|-------|-----|------------|
| _Template_ | _Description_ | _Root cause_ | _PR/Commit_ | _Test added_ |

### How to Log a Regression

When a regression is found and fixed:

1. Add entry to this table
2. Create test case that would have caught it
3. Link test case in Prevention column

**Example Entry:**
```
| 2026-02-15 | Task stuck in "running" after cancel | Missing status update in cancel flow | #123 | Added cancel status test |
```

---

## 6. Automated Test Requirements

### Unit Test Coverage

| Module | Minimum Coverage | Current |
|--------|------------------|---------|
| `server/workflow/` | 80% | _TBD_ |
| `server/run/` | 80% | _TBD_ |
| `server/repositories/` | 70% | _TBD_ |
| `lib/` | 70% | _TBD_ |
| **Overall** | **75%** | _TBD_ |

### Integration Test Coverage

| Area | Required Tests |
|------|----------------|
| API Routes | All endpoints return valid responses |
| Database | All CRUD operations |
| SSE | Event flow end-to-end |

### E2E Test Coverage

| Flow | Required Tests |
|------|----------------|
| Create Project | Create project -> see in list |
| Create Task | Create task -> see on board |
| Run Task | Start run -> see status change -> complete |
| Drag Task | Drag task -> see in new column |
| Cancel Run | Cancel run -> see queued status |

### Coverage Commands

```bash
# Run tests with coverage
pnpm test:run -- --coverage

# Check specific file coverage
pnpm test:run -- --coverage task-workflow-manager
```

---

## 7. Smoke Test Suite

Quick tests to run before every release (~5 minutes).

### 7.1 Project CRUD

```bash
# Create project
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test","path":"/tmp/smoke-test"}'

# List projects
curl http://localhost:3000/api/projects

# Delete project (use ID from create response)
curl -X DELETE http://localhost:3000/api/projects/{id}
```

### 7.2 Task CRUD

```bash
# Create task (requires project ID)
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"projectId":"{id}","title":"Smoke Task"}'

# List tasks
curl "http://localhost:3000/api/tasks?projectId={id}"

# Update task
curl -X PUT http://localhost:3000/api/tasks/{taskId} \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Title"}'

# Delete task
curl -X DELETE http://localhost:3000/api/tasks/{taskId}
```

### 7.3 Run Start/Cancel

```bash
# Start run
curl -X POST http://localhost:3000/api/run/start \
  -H "Content-Type: application/json" \
  -d '{"taskId":"{taskId}","roleId":"dev"}'

# Check queue stats
curl http://localhost:3000/api/run/queueStats

# Cancel run
curl -X POST http://localhost:3000/api/run/cancel \
  -H "Content-Type: application/json" \
  -d '{"runId":"{runId}"}'
```

### 7.4 Column Drag

```bash
# Move task to column
curl -X POST http://localhost:3000/api/tasks/{taskId}/move \
  -H "Content-Type: application/json" \
  -d '{"columnId":"{targetColumnId}","orderIndex":0}'
```

### 7.5 SSE Connection

```bash
# Connect to SSE (in browser console or curl)
curl -N http://localhost:3000/api/events

# Should see connection established
```

### 7.6 Automated Smoke Script

```bash
#!/bin/bash
# smoke-test.sh

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "=== Smoke Test Suite ==="

# 1. Projects
echo "Testing projects..."
PROJECT_ID=$(curl -s -X POST $BASE_URL/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke","path":"/tmp/smoke"}' | jq -r '.id')
echo "Created project: $PROJECT_ID"

# 2. Tasks
echo "Testing tasks..."
TASK_ID=$(curl -s -X POST $BASE_URL/api/tasks \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\",\"title\":\"Test\"}" | jq -r '.id')
echo "Created task: $TASK_ID"

# 3. Run
echo "Testing run..."
RUN_ID=$(curl -s -X POST $BASE_URL/api/run/start \
  -H "Content-Type: application/json" \
  -d "{\"taskId\":\"$TASK_ID\",\"roleId\":\"dev\"}" | jq -r '.runId')
echo "Started run: $RUN_ID"

# 4. Cancel
echo "Testing cancel..."
curl -s -X POST $BASE_URL/api/run/cancel \
  -H "Content-Type: application/json" \
  -d "{\"runId\":\"$RUN_ID\"}" > /dev/null
echo "Cancelled run"

# 5. Cleanup
echo "Cleaning up..."
curl -s -X DELETE $BASE_URL/api/tasks/$TASK_ID > /dev/null
curl -s -X DELETE $BASE_URL/api/projects/$PROJECT_ID > /dev/null
echo "Cleaned up"

echo "=== All smoke tests passed ==="
```

---

## 8. State Machine Reference

### Task Status Transitions

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    v                                         │
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    │
│ pending │───>│ running │───>│  done   │────┴─────────│
└─────────┘    └─────────┘    └─────────┘                 │
    │              │    │                                   │
    │              │    v                                   │
    │              │  ┌─────────┐                          │
    │              └─>│ failed  │──────────────────────────┘
    │              │  └─────────┘
    │              │       ^
    v              v       │
┌────────────┐  ┌─────────┐│
│ generating │  │ paused  ││
└────────────┘  └─────────┘│
    │              │       │
    └──────────────┴───────┘
```

### Column Transitions

```
backlog ──> ready ──> in_progress ──> review ──> closed
              ^                          │
              └──────── blocked ─────────┘
```

### Status → Column Mapping

| Status | Preferred Column | Allowed In |
|--------|------------------|------------|
| pending | ready | backlog, ready, deferred |
| running | in_progress | in_progress |
| generating | in_progress | in_progress |
| question | blocked | blocked |
| paused | blocked | blocked |
| failed | blocked | blocked, closed |
| done | review | review, closed |

---

## 9. Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture and data flows
- [SETUP.md](./SETUP.md) - Development environment setup
- [REQUIREMENTS.md](./REQUIREMENTS.md) - Feature requirements

---

*Last updated: March 2026*
