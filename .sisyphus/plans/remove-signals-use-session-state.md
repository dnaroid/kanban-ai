# Plan: Replace Signal-Based Workflow with Session-State

## Problem

Two systemic bugs cause tasks to get stuck:

1. **Zombie runs**: OpenCode process crashes → run stays `running` forever → task stuck. Example: task `35e9a7d1` has run `3d2a8f34` stuck in `running` status with no `finished_at` — the process died before the agent could write a completion marker.
2. **Network error skip**: When `executeRun()` catches a network error like `fetch failed`, the code intentionally **skips** projecting the failure to the task. The run is marked `failed` in DB, but the task stays in `running`/`in_progress`. Example: task `998a6641`, run `a8dc88be`.

**Root cause**: The system relies on status markers (`__OPENCODE_STATUS__::uuid::done`) embedded in assistant message content. If the agent never writes the marker (crash, disconnect, timeout), the pipeline stalls forever. The signal rule engine (`resolveTaskStatusBySignal`) is an indirection layer that adds complexity without solving these failure cases.

## Solution

Replace the signal pipeline with **session-state-based transitions**. The OpenCode session already exposes everything needed through `inspectSession()`:

- `completionMarker` — parsed from the last assistant message (done/generated/fail/test_ok/test_fail)
- `pendingQuestions` — question objects waiting for user input
- `pendingPermissions` — permission objects waiting for approval
- `probeStatus` — `alive` | `not_found` | `transient_error`

The change: instead of "agent writes marker → marker parsed → signal key emitted → signal rule matched → task status changed", use "inspect session → derive outcome from session state → apply task status change".

The key improvement: if the session is unreachable (`not_found`) or transiently failing, we can still make progress — mark the run as failed and move the task to `blocked`. No more zombie runs.

---

## Key Types & Interfaces (defined here for reference)

These are the types the agent will work with. All file paths are relative to the project root `kanban-ai/`.

**`RunStatus`** — defined in `packages/next-js/src/types/ipc.ts`:
```typescript
type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "timeout" | "paused";
```

**`SessionInspectionResult`** — defined in `packages/next-js/src/server/opencode/session-manager.ts`:
```typescript
interface SessionInspectionResult {
  probeStatus: "alive" | "not_found" | "transient_error";
  messages: OpenCodeMessage[];
  todos: OpenCodeTodo[];
  pendingPermissions: PermissionData[];
  pendingQuestions: QuestionData[];
  completionMarker: AssistantRunSignal | null;
}

interface AssistantRunSignal {
  runStatus: RunStatus;
  signalKey: string; // "done" | "generated" | "fail" | "question" | "test_ok" | "test_fail"
}
```

**`PermissionData`**, **`QuestionData`** — also defined in `session-manager.ts`.

**Task status values** (called `WorkflowTaskStatus` in code): `"pending" | "running" | "generating" | "done" | "failed" | "paused" | "question"`

**Task status → column mapping** (defined in `packages/next-js/src/server/workflow/task-workflow-manager.ts` as `STATUS_TO_WORKFLOW_COLUMN_FALLBACK`):
- `pending` → `ready`
- `running` → `in_progress`
- `generating` → `backlog`
- `done` → `review`
- `failed` → `blocked`
- `question` → `blocked`
- `paused` → `blocked`

---

## Phase 1: Define RunOutcome + deriveMetaStatus

**Goal**: Create the new types and the single function that replaces all scattered signal-resolution logic.

### Step 1.1: Define RunOutcome in run-task-projector.ts

**File**: `packages/next-js/src/server/run/run-task-projector.ts`

Add at the top of the file (after imports), before the `RunTaskProjector` class:

```typescript
/**
 * Represents the outcome of a run as derived from session state.
 * Replaces the old signalKey-based approach.
 *
 * - "done" / "generated" / "test_ok" → run completed successfully
 * - "fail" / "test_fail" → run failed
 * - "dead" → session not found or unreachable (replaces the network-error-skip bug)
 * - "question" → run paused for user question
 * - "resumed" → run resumed after question/permission resolved
 * - "cancelled" → run was cancelled by user
 * - "timeout" → run timed out
 */
export type RunOutcomeMarker =
  | "done"
  | "generated"
  | "fail"
  | "test_ok"
  | "test_fail"
  | "dead"
  | "question"
  | "resumed"
  | "cancelled"
  | "timeout";

export interface RunOutcome {
  marker: RunOutcomeMarker;
  content: string;
}
```

### Step 1.2: Define SessionMetaStatus + deriveMetaStatus

**File**: `packages/next-js/src/server/run/runs-queue-manager.ts`

Add near the top of the file (after imports, before the `RunsQueueManager` class), replacing the existing `AssistantRunSignal` type and `resolveAssistantRunSignal` function:

```typescript
import type { RunOutcome, RunOutcomeMarker } from "./run-task-projector";

type SessionMetaStatus =
  | { kind: "completed"; marker: "done" | "generated" | "test_ok"; content: string }
  | { kind: "failed"; marker: "fail" | "test_fail"; content: string }
  | { kind: "question"; questions: QuestionData[] }
  | { kind: "permission"; permission: PermissionData }
  | { kind: "running" }
  | { kind: "dead" };

/**
 * Derives the session meta-status from an inspection result.
 * This is the single source of truth for "what state is this run in"
 * based on its OpenCode session.
 *
 * Replaces the old resolveAssistantRunSignal + checkRunCompletion logic.
 */
function deriveMetaStatus(
  inspection: SessionInspectionResult,
): SessionMetaStatus {
  // 1. Completion marker in last assistant message → done/generated/fail/test_ok/test_fail
  if (inspection.completionMarker) {
    const marker = inspection.completionMarker.signalKey as RunOutcomeMarker;
    const content = findCompletionContent(inspection);
    if (marker === "done" || marker === "generated" || marker === "test_ok") {
      return { kind: "completed", marker, content };
    }
    if (marker === "fail" || marker === "test_fail") {
      return { kind: "failed", marker, content };
    }
    if (marker === "question") {
      // Marker says question — but also check for pending question objects
      if (inspection.pendingQuestions.length > 0) {
        return { kind: "question", questions: inspection.pendingQuestions };
      }
      // Question marker without pending question object — treat as paused waiting
      return { kind: "running" };
    }
  }

  // 2. Session not found → dead (this is the key fix for zombie runs)
  if (inspection.probeStatus === "not_found") {
    return { kind: "dead" };
  }

  // 3. Transient error → treat as running (don't kill the run yet)
  if (inspection.probeStatus === "transient_error") {
    return { kind: "running" };
  }

  // 4. Pending permission → pause for permission
  const permission = inspection.pendingPermissions[0];
  if (permission) {
    return { kind: "permission", permission };
  }

  // 5. Pending question → pause for question
  const question = inspection.pendingQuestions[0];
  if (question) {
    return { kind: "question", questions: inspection.pendingQuestions };
  }

  // 6. Nothing pending, no completion marker → still running
  return { kind: "running" };
}

/**
 * Extracts the content from the last assistant message in the inspection.
 * Used as the content field for completed/failed meta-statuses.
 */
function findCompletionContent(
  inspection: SessionInspectionResult,
): string {
  for (let i = inspection.messages.length - 1; i >= 0; i--) {
    const msg = inspection.messages[i];
    if (msg.role === "assistant") {
      return msg.content;
    }
  }
  return "";
}
```

**After this step**: Delete the old `AssistantRunSignal` type and `resolveAssistantRunSignal` function that were at the top of `runs-queue-manager.ts` (the local copies, lines 60-111 approximately — search for `function resolveAssistantRunSignal`). The `AssistantRunSignal` from `session-manager.ts` still exists but won't be imported here anymore.

---

## Phase 2: Refactor runs-queue-manager.ts to use deriveMetaStatus

**Goal**: Replace all signal-based call sites with session-state-based logic. Fix the network error skip bug.

### Step 2.1: Rewrite pollActiveRuns() — the main polling loop

**File**: `packages/next-js/src/server/run/runs-queue-manager.ts`
**Method**: `pollActiveRuns()`

**Current behavior**: For each active run, it calls `checkRunCompletion()` (which manually scans messages for markers), then separately checks `listPendingPermissions()` and `listPendingQuestions()`. Three separate API calls, three separate code paths.

**New behavior**: Single `inspectSession()` call per run → `deriveMetaStatus()` → switch on kind.

Replace the body of the `for (const [runId, sessionId] of this.activeRunSessions.entries())` loop in `pollActiveRuns()` with:

```typescript
// For running runs: inspect session and derive meta-status
if (run.status === "running") {
  const inspection = await this.sessionManager.inspectSession(sessionId);
  const meta = deriveMetaStatus(inspection);

  switch (meta.kind) {
    case "completed":
    case "failed": {
      const runStatus = meta.kind === "completed" ? "completed" as RunStatus : "failed" as RunStatus;
      const outcome: RunOutcome = { marker: meta.marker, content: meta.content };
      await this.finalizeRunFromSession(runId, runStatus, outcome);
      break;
    }
    case "dead":
      await this.finalizeDeadRun(runId);
      break;
    case "question":
      await this.pauseRunForPendingQuestion(runId, meta.questions[0]);
      break;
    case "permission":
      await this.pauseRunForPendingPermission(runId, meta.permission);
      break;
    case "running":
      break; // continue polling
  }
  continue;
}
```

The `paused` run handling (checking if permission/question resolved → resume) stays exactly the same — it's already session-state-based.

After this change, **delete the `checkRunCompletion()` method** — it's no longer called.

### Step 2.2: Add finalizeDeadRun() method

**File**: `packages/next-js/src/server/run/runs-queue-manager.ts`

Add a new private method:

```typescript
/**
 * Finalizes a run whose session is dead (not found).
 * Marks the run as failed and projects the failure to the task.
 */
private async finalizeDeadRun(runId: string): Promise<void> {
  const run = runRepo.getById(runId);
  if (!run) return;

  // Don't re-finalize if already done
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    this.activeRunSessions.delete(runId);
    return;
  }

  const finishedAt = new Date().toISOString();
  let failedRun = runRepo.update(runId, {
    status: "failed",
    finishedAt,
    errorText: "Session not found or unreachable",
    durationSec: this.durationSec(run.startedAt ?? finishedAt, finishedAt),
  });
  failedRun = await this.syncRunWorkspaceState(failedRun);

  runEventRepo.create({
    runId,
    eventType: "status",
    payload: { status: "failed", message: "Session not found" },
  });

  this.taskProjector.projectRunOutcome(failedRun, {
    marker: "dead",
    content: "Session not found or unreachable",
  });

  publishRunUpdate(failedRun);
  this.activeRunSessions.delete(runId);
  if (this.activeRunSessions.size === 0) {
    this.stopPolling();
  }
  this.runInputs.delete(runId);
}
```

### Step 2.3: Fix executeRun() catch block — remove network error skip

**File**: `packages/next-js/src/server/run/runs-queue-manager.ts`
**Method**: `executeRun()` — the `catch (error)` block

**Current code** (find the block that checks `isNetworkError(error)`):
```typescript
// CURRENT — BUG: skips projection for network errors
if (!networkError) {
  this.taskProjector.projectRunOutcome(
    failedRun,
    "failed",
    "fail",
    message,
  );
} else {
  log.info("Skipping task failure projection for network run error", { ... });
}
```

**Replace with** — always project the failure:
```typescript
// FIXED: always project failure, no network-error special case
this.taskProjector.projectRunOutcome(failedRun, {
  marker: "fail",
  content: message,
});
```

This directly fixes the bug where task `998a6641` got stuck because of a `fetch failed` error.

### Step 2.4: Update finalizeRunFromSession() signature

**File**: `packages/next-js/src/server/run/runs-queue-manager.ts`
**Method**: `finalizeRunFromSession()`

**Current signature**:
```typescript
private async finalizeRunFromSession(
  runId: string,
  status: RunStatus,
  signalKey: string,
  assistantContent: string,
): Promise<void>
```

**New signature**:
```typescript
private async finalizeRunFromSession(
  runId: string,
  status: RunStatus,
  outcome: RunOutcome,
): Promise<void>
```

Inside the method body, replace:
- `signalKey` → `outcome.marker`
- `assistantContent` → `outcome.content`
- The `this.taskProjector.projectRunOutcome(nextRun, status, signalKey, assistantContent)` call → `this.taskProjector.projectRunOutcome(nextRun, outcome)`

### Step 2.5: Simplify tryFinalizeFromSessionSnapshot()

**File**: `packages/next-js/src/server/run/runs-queue-manager.ts`
**Method**: `tryFinalizeFromSessionSnapshot()`

**Current**: Manually scans messages backward, calls `resolveAssistantRunSignal()` on each assistant message.

**Replace with**:
```typescript
private async tryFinalizeFromSessionSnapshot(
  runId: string,
  sessionId: string,
): Promise<void> {
  const run = runRepo.getById(runId);
  if (!run || (run.status !== "running" && run.status !== "queued")) {
    return;
  }

  const inspection = await this.sessionManager.inspectSession(sessionId);
  const meta = deriveMetaStatus(inspection);

  if (meta.kind === "completed" || meta.kind === "failed") {
    const runStatus = meta.kind === "completed" ? "completed" as RunStatus : "failed" as RunStatus;
    await this.finalizeRunFromSession(runId, runStatus, { marker: meta.marker, content: meta.content });
  }
}
```

### Step 2.6: Simplify reconcileRun() / applyInspectionResult()

**File**: `packages/next-js/src/server/run/runs-queue-manager.ts`

**Method `applyInspectionResult()`** — replace the cascade of `if` checks:

**Current**:
```typescript
if (inspection.completionMarker) {
  // ... manual content extraction ...
  await this.finalizeRunFromSession(run.id, completionMarker.runStatus, completionMarker.signalKey, assistantContent);
  return;
}
if (inspection.probeStatus === "not_found") { ... }
if (inspection.probeStatus === "transient_error") { ... }
// ... then check pendingPermissions, pendingQuestions ...
```

**Replace with**:
```typescript
private async applyInspectionResult(
  run: Run,
  sessionId: string,
  inspection: SessionInspectionResult,
): Promise<void> {
  const meta = deriveMetaStatus(inspection);

  switch (meta.kind) {
    case "completed":
    case "failed": {
      const runStatus = meta.kind === "completed" ? "completed" as RunStatus : "failed" as RunStatus;
      await this.finalizeRunFromSession(run.id, runStatus, { marker: meta.marker, content: meta.content });
      return;
    }
    case "dead":
      await this.failRunDuringReconciliation(run, "Session not found during reconciliation", "Session not found");
      return;
    case "running":
      // Session alive, no completion marker, no pending interactions
      break;
    case "permission": {
      const nextRun = this.ensureRunPausedForPermission(run, meta.permission);
      this.attachReconciledSession(nextRun.id, sessionId);
      return;
    }
    case "question": {
      const nextRun = this.ensureRunPausedForQuestion(run, meta.questions[0]);
      this.attachReconciledSession(nextRun.id, sessionId);
      return;
    }
  }

  // Session alive, run was queued — reattach as running
  if (run.status === "queued") {
    // ... keep existing queued→running reattach logic ...
  }

  // Reattach active run
  this.attachReconciledSession(run.id, sessionId);
}
```

### Step 2.7: Simplify recoverOrphanedRuns()

**File**: `packages/next-js/src/server/run/runs-queue-manager.ts`
**Method**: `recoverOrphanedRuns()`

**Current**: Manually scans messages of failed `fetch failed` runs.

**Replace with**:
```typescript
public async recoverOrphanedRuns(): Promise<void> {
  const failedRuns = runRepo.listByStatus("failed");
  const recoverableRuns = failedRuns.filter(
    (run) =>
      run.sessionId.trim().length > 0 &&
      getRunErrorText(run).toLowerCase() === "fetch failed",
  );

  for (const run of recoverableRuns) {
    try {
      const inspection = await this.sessionManager.inspectSession(run.sessionId);
      const meta = deriveMetaStatus(inspection);

      if (meta.kind === "completed" || meta.kind === "failed") {
        const runStatus = meta.kind === "completed" ? "completed" as RunStatus : "failed" as RunStatus;
        await this.finalizeRunFromSession(run.id, runStatus, { marker: meta.marker, content: meta.content });
      }
    } catch (error) {
      log.warn("Failed to recover orphaned run from session", {
        runId: run.id,
        sessionId: run.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
```

### Step 2.8: Update all resume call sites to use RunOutcome

These methods currently call `projectRunOutcome(run, "running", "resume_run", message)`. Update each to:

```typescript
this.taskProjector.projectRunOutcome(resumedRun, { marker: "resumed", content: "..." });
```

The methods to update (find each by name):
- `resumeRunAfterPermissionApproval()` — content: `"Permission approved: ${permissionId}"`
- `resumeRunAfterQuestionAnswered()` — content: `"Question answered"`
- `resumeOrphanedPausedRun()` — content: `"Resumed orphaned paused run"`
- The reconciliation reattach in `applyInspectionResult()` — content: `"Run resumed during reconciliation"`

### Step 2.9: Update pause + cancel call sites

- `pauseRunForPendingPermission()`: `projectRunOutcome(pausedRun, { marker: "question", content: "Permission requested: ..." })`
- `pauseRunForPendingQuestion()`: `projectRunOutcome(pausedRun, { marker: "question", content: "Question asked" })`
- `cancelRun()`: `projectRunOutcome(cancelled, { marker: "cancelled", content: "" })`

### Step 2.10: Remove unused imports

After all changes, remove from `runs-queue-manager.ts`:
- `import { extractOpencodeStatus } from "@/lib/opencode-status"` — no longer used here
- Any remaining references to the old `AssistantRunSignal` type

---

## Phase 3: Simplify RunTaskProjector

**Goal**: Replace signal-based resolution with direct outcome-based mapping.

### Step 3.1: Add resolveTaskStatusFromOutcome to run-task-projector.ts

**File**: `packages/next-js/src/server/run/run-task-projector.ts`

Add this function before the `RunTaskProjector` class:

```typescript
/**
 * Maps a RunOutcome to a task status.
 * Replaces the old resolveTaskStatusBySignal signal rule engine.
 */
function resolveTaskStatusFromOutcome(
  outcome: RunOutcome,
  runKind: string | null,
): TaskStatus | null {
  switch (outcome.marker) {
    case "resumed":
      return "running";
    case "cancelled":
      return "pending";
    case "timeout":
      return "failed";
    case "dead":
      return "failed";
  }

  // Generation runs (task-description-improve)
  if (runKind === "task-description-improve") {
    switch (outcome.marker) {
      case "generated":
      case "done":
      case "test_ok":
        return "pending";
      case "fail":
      case "test_fail":
        return "failed";
      case "question":
        return "question";
    }
  }

  // Execution runs (default)
  switch (outcome.marker) {
    case "done":
    case "test_ok":
      return "done";
    case "fail":
    case "test_fail":
      return "failed";
    case "question":
      return "question";
    case "generated":
      return "pending"; // shouldn't happen for execution runs, but handle gracefully
  }

  return null;
}
```

### Step 3.2: Rewrite projectRunOutcome()

**File**: `packages/next-js/src/server/run/run-task-projector.ts`
**Class**: `RunTaskProjector`

**Current signature**: `projectRunOutcome(run: Run, runStatus: RunStatus, signalKey: string, assistantContent: string): void`
**New signature**: `projectRunOutcome(run: Run, outcome: RunOutcome): void`

Replace the entire method body. The key change: instead of calling `this.resolveStatusBySignal(task, run, runStatus, signalKey)`, call `resolveTaskStatusFromOutcome(outcome, run.metadata?.kind ?? null)`.

The logic for "is this a description-improve run" stays the same — check `isTaskDescriptionImproveRun(run)` and parse the content for title/description/tags updates. Just pass `outcome.content` instead of `assistantContent`.

### Step 3.3: Rewrite projectRunStarted()

**Current**: Derives a signalKey from run kind, then calls `resolveStatusBySignal`.

**New**: Directly determine the next status from `run.kind`:

```typescript
public projectRunStarted(run: Run): void {
  const task = taskRepo.getById(run.taskId);
  if (!task) return;

  let nextStatus: TaskStatus;
  if (isTaskDescriptionImproveRun(run)) {
    nextStatus = "generating";
  } else if (isQaTestingRun(run)) {
    nextStatus = "running";
  } else {
    nextStatus = "running";
  }

  this.updateTaskAndPublish(task.id, this.buildStatusPatch(task, nextStatus));
}
```

### Step 3.4: Remove old resolveStatusBySignal method

Delete the `resolveStatusBySignal` private method from `RunTaskProjector` — it's replaced by `resolveTaskStatusFromOutcome`.

### Step 3.5: Remove unused imports

From `run-task-projector.ts`, remove:
- `resolveTaskStatusBySignal` import from `@/server/workflow/task-workflow-manager`
- `isWorkflowTaskStatus` import (if no longer used — check first)

---

## Phase 4: Remove dead signal infrastructure from task-workflow-manager.ts

**File**: `packages/next-js/src/server/workflow/task-workflow-manager.ts`

### Step 4.1: Delete signal types and constants

Delete the following (search for each by name):
- `WorkflowSignalConfig` interface
- `WorkflowSignalRuleConfig` interface
- `createSignal()` function
- `createSignalRule()` function
- `WORKFLOW_SIGNALS_FALLBACK` constant array (24 signal definitions)
- `WORKFLOW_SIGNAL_RULES_FALLBACK` constant array (33 rule definitions)
- `resolveTaskStatusBySignal()` function

### Step 4.2: Remove signal fields from config interfaces

Remove from `WorkflowRuntimeConfig`:
- `signalByKey` field
- `signalRulesBySignalKey` field

Remove from `WorkflowConfig`:
- `signals` field
- `signalRules` field

Remove from `createWorkflowConfig()`:
- The `signals:` and `signalRules:` entries

Remove any helper functions that only serve the signal system (check what becomes dead code after the above deletions).

### Step 4.3: Keep these exports intact

Do NOT touch:
- All `STATUS_*_FALLBACK` constants
- All `COLUMN_*_FALLBACK` constants
- `WorkflowColumnSystemKey`, `WorkflowColumnTemplate`, `WorkflowColumnConfig`
- `WorkflowStatusConfig`, `WorkflowTaskStatus`
- `WorkflowConfig`, `WorkflowRuntimeConfig`
- `getRuntimeConfig()`, `canTransitionColumn()`, `getPreferredColumnIdForStatus()`
- `getWorkflowColumnSystemKey()`, `isStatusAllowedInWorkflowColumn()`
- `getDefaultStatusForWorkflowColumn()`, `isWorkflowTaskStatus()`
- `getBlockedReasonForStatus()`, `getClosedReasonForStatus()`
- `resolveTaskStatusReasons()`
- All column/status transition logic

### Step 4.4: Remove startRunsBySignal from run-service.ts

**File**: `packages/next-js/src/server/run/run-service.ts`

Delete the `startRunsBySignal(projectId, signalKey)` method and its return type `StartRunsBySignalResult`.

Replace with:

```typescript
public async startReadyTasks(projectId: string): Promise<StartRunsBySignalResult> {
  const board = boardRepo.getByProjectId(projectId);
  if (!board) {
    throw new Error(`Board not found for project: ${projectId}`);
  }

  // Find the "ready" column
  const readyColumn = board.columns.find(col => col.systemKey === "ready");
  if (!readyColumn) {
    return { startedCount: 0, skippedNoRuleCount: 0, skippedActiveRunCount: 0, taskIds: [], runIds: [] };
  }

  // Get tasks in ready column with pending status, ordered by position
  const candidateTasks = [...taskRepo.listByBoard(board.id)]
    .filter(task => task.columnId === readyColumn.id && task.status === "pending")
    .sort((a, b) => a.orderInColumn - b.orderInColumn);

  const taskIds: string[] = [];
  const runIds: string[] = [];
  let skippedActiveRunCount = 0;

  for (const task of candidateTasks) {
    const hasActiveRun = runRepo
      .listByTask(task.id)
      .some((run) => activeExecutionRunStatuses.has(run.status));
    if (hasActiveRun) {
      skippedActiveRunCount += 1;
      continue;
    }

    const started = await this.start({ taskId: task.id });
    taskIds.push(task.id);
    runIds.push(started.runId);
  }

  return {
    startedCount: runIds.length,
    skippedNoRuleCount: 0,
    skippedActiveRunCount,
    taskIds,
    runIds,
  };
}
```

Remove the `resolveTaskStatusBySignal` import from this file.

---

## Phase 5: Update API surface

### Step 5.1: Rename API route

**Rename directory**: `packages/next-js/src/app/api/run/startBySignal/` → `packages/next-js/src/app/api/run/startReadyTasks/`

**File**: `packages/next-js/src/app/api/run/startReadyTasks/route.ts`

Replace the handler body. Remove `signalKey` from the request body parsing. Call `runService.startReadyTasks(projectId)` instead of `runService.startRunsBySignal(projectId, signalKey)`.

### Step 5.2: Update api-client.ts

**File**: `packages/next-js/src/lib/api-client.ts`

Find the `startBySignal` method and replace it with:

```typescript
startReadyTasks: async ({ projectId }: { projectId: string }) => {
  const response = await fetch(`${this.baseUrl}/api/run/startReadyTasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  // ... same error handling pattern as other methods ...
}
```

### Step 5.3: Update use-board-model.ts

**File**: `packages/next-js/src/features/board/model/use-board-model.ts`

Find `handleStartSignalRuns` (search for `startBySignal`). Replace:

```typescript
const handleStartReadyTasks = async () => {
  setIsQueueingSignalRuns(true);
  try {
    const result = await api.run.startReadyTasks({ projectId });
    await refreshBoardTasksFromServer();
    addToast("Tasks queued for execution", "success");
    return result;
  } catch (startError) {
    console.error("Failed to queue runs:", startError);
    addToast("Failed to queue tasks", "error");
    throw new Error(
      startError instanceof Error
        ? startError.message
        : "Failed to queue runs",
    );
  } finally {
    setIsQueueingSignalRuns(false);
  }
};
```

Update all references to `handleStartSignalRuns` → `handleStartReadyTasks`.

### Step 5.4: Clean up useWorkflowDisplayConfig.ts

**File**: `packages/next-js/src/components/kanban/useWorkflowDisplayConfig.ts`

Remove the `SIGNALS` and `SIGNAL_RULES` arrays. Keep status visuals and column mapping config. Search for any remaining references to `signal` or `signalRule` and remove/update them.

---

## Phase 6: Update tests

### Step 6.1: run-task-projector.test.ts

**File**: `packages/next-js/src/server/run/run-task-projector.test.ts`

- Replace `resolveTaskStatusBySignal` mocks with `resolveTaskStatusFromOutcome` logic
- Update `projectRunOutcome` calls to use `RunOutcome` object instead of `(run, runStatus, signalKey, content)`
- Update `projectRunStarted` to test `run.kind`-based status derivation

### Step 6.2: run-task-projector-integration.test.ts

**File**: `packages/next-js/src/server/run/run-task-projector-integration.test.ts`

- Update all `projectRunOutcome(run, runStatus, signalKey, content)` calls to `projectRunOutcome(run, { marker, content })`
- Remove signal-related assertions

### Step 6.3: task-workflow-manager.test.ts

**File**: `packages/next-js/src/server/workflow/task-workflow-manager.test.ts`

- Remove tests for `resolveTaskStatusBySignal`
- Remove tests for signal rules
- Keep all column/status transition tests, status→column mapping tests, `isStatusAllowedInWorkflowColumn` tests

### Step 6.4: runs-queue-manager.test.ts

**File**: `packages/next-js/src/server/run/runs-queue-manager.test.ts`

- Update `projectRunOutcome` mock signature to accept `RunOutcome` object
- Update all assertions that check `signalKey` parameter
- Update test for `executeRun` network error — verify projection IS called (not skipped)

---

## QA Scenarios

### QA-1: Dead session → run finalized → task to blocked
**Tool**: `pnpm vitest run packages/next-js/src/server/run/runs-queue-manager.test.ts`
**Steps**:
1. Create a run in `running` status with a session ID
2. Mock `inspectSession` to return `{ probeStatus: "not_found", completionMarker: null, messages: [], todos: [], pendingPermissions: [], pendingQuestions: [] }`
3. Call `pollActiveRuns()` or `reconcileRun()`
**Expected**: Run status → `failed`, `projectRunOutcome` called with `{ marker: "dead" }`, task status → `failed`, task column → `blocked`

### QA-2: Network error in executeRun → task projection still happens
**Tool**: `pnpm vitest run packages/next-js/src/server/run/runs-queue-manager.test.ts`
**Steps**:
1. Mock `sendPrompt` to throw `new Error("fetch failed")`
2. Run `executeRun(runId)`
3. Check `projectRunOutcome` was called with `{ marker: "fail", content: "fetch failed" }`
**Expected**: No special-case skip for network errors. Both run AND task get updated.

### QA-3: Generation run completes with `generated` marker
**Tool**: `pnpm vitest run packages/next-js/src/server/run/run-task-projector.test.ts`
**Steps**:
1. Create a task in `generating` status / `backlog` column
2. Create a run with `kind = "task-description-improve"`
3. Call `projectRunOutcome(run, { marker: "generated", content: "<META>...</META><STORY>...</STORY>" })`
**Expected**: Task status → `pending`, column → `ready`, description/title/tags updated from parsed content

### QA-4: Permission approved → resume → task back to running
**Tool**: `pnpm vitest run packages/next-js/src/server/run/runs-queue-manager.test.ts`
**Steps**:
1. Create a run in `paused` status with an awaiting permission ID
2. Mock `listPendingPermissions` to return empty array
3. Call `pollActiveRuns()`
**Expected**: `projectRunOutcome` called with `{ marker: "resumed", content: "..." }` → task status → `running`, column → `in_progress`

### QA-5: startReadyTasks finds correct tasks
**Tool**: `pnpm vitest run packages/next-js/src/server/run/run-service.test.ts`
**Steps**:
1. Create board with `ready` column (systemKey `"ready"`) containing 3 tasks with status `pending` + 1 task with status `running`
2. Call `runService.startReadyTasks(projectId)`
**Expected**: Only the 3 `pending` tasks in `ready` column get runs. The `running` task is skipped. `skippedActiveRunCount` and `skippedNoRuleCount` are correct.

### QA-6: Typecheck passes
**Tool**: `pnpm typecheck`
**Expected**: Zero errors

### QA-7: Full test suite passes
**Tool**: `pnpm test:run`
**Expected**: All tests pass. If pre-existing failures exist, they must be the same as before the change.

### QA-8: Quality gate
**Tool**: `pnpm quality`
**Expected**: All checks pass (typecheck + lint + format + tests)

---

## Execution Order

Phases must be executed in order. Each phase depends on the previous one.

1. **Phase 1** → Define types (no behavior change yet)
2. **Phase 2** → Refactor queue manager (behavioral changes — the core fix)
3. **Phase 3** → Simplify projector (API change — RunOutcome)
4. **Phase 4** → Remove dead code (cleanup)
5. **Phase 5** → API + frontend rename
6. **Phase 6** → Update tests (should be done alongside each phase, but final pass here)

After each phase: run `pnpm typecheck` to verify no type errors.

---

## What NOT to Change

- **Status token in prompts**: `__OPENCODE_STATUS__::uuid::` stays in prompt templates. Agents still write these markers. `findCompletionMarker()` in `session-manager.ts` still reads them. What changes is where the parsed result feeds into (session inspection instead of scattered call sites).
- **`opencode-status.ts` module**: Keep as-is. It's still used by `session-manager.ts` for parsing and by prompt templates for building markers.
- **Column/status infrastructure**: All `STATUS_*_FALLBACK` and `COLUMN_*_FALLBACK` constants, transition maps, allowed statuses — these stay. Only the signal rule engine is removed.
- **Permission/question pause/resume flow**: The existing flow in `pollActiveRuns()` for paused runs stays the same — it's already session-state-based.
- **SSE events**: `run:permission`, `run:question`, `task:event` event types stay the same.
- **Session manager**: `inspectSession()`, `findCompletionMarker()`, `listPendingPermissions()`, `listPendingQuestions()` — no changes to session-manager.ts.

---

## Immediate Fix for Stuck Tasks (Phase 0 — do this first)

Run these SQL statements against `kanban-ai.db` at the project root:

```sql
-- Task 35e9a7d1: run 3d2a8f34 stuck running, mark as failed
UPDATE runs SET status = 'failed', finished_at = datetime('now'), error_text = 'Run abandoned (process crash)'
WHERE id = '3d2a8f34-3ffd-482d-950d-98454a80abfc';

UPDATE tasks SET status = 'pending', column_id = '173ba2fb-a3b6-41a3-a5ce-79eae151e6a5'
WHERE id = '35e9a7d1-b324-4da5-a78d-5988fa800b51';

-- Task 998a6641: run a8dc88be already failed, but task was never updated
UPDATE tasks SET status = 'failed', column_id = '04eecdc3-01bc-4cf5-a02a-4da546cb845b', blocked_reason = 'Run failed: fetch failed'
WHERE id = '998a6641-df63-42c2-8c53-09b8df0c5e53';
```
