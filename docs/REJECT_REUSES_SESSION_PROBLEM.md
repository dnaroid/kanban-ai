# Problem: Rejected Task Moves Back to Review

## Symptoms

A task that was rejected (via `review:reject`) moves back to the **Review** column, even though the user expects it to stay in **Ready** with status `rejected` so the same OpenCode session can be reused for another run.

## Root Cause

When `review:reject` fires, the state machine sets the task to `rejected` → column `ready`. However, **the active OpenCode run is NOT cancelled**. The projection service (`TaskStatusProjectionService.reconcileTaskStatuses`) then:

1. Finds the still-active run for the task
2. Forces the task status back to `running` / column `in_progress` (via `reconcileTaskWithActiveRuns`)
3. When the run eventually completes, `run:done` fires → task becomes `done` → column `review`

The sequence:

```
review:reject → task: rejected, column: ready
                    ↓ (reconciliation poll)
        active run detected → task: running, column: in_progress
                    ↓ (run completes)
        run:done → task: done, column: review  ← BUG
```

## Constraint: Session Reuse

The user needs to **reuse the same OpenCode session** after rejection — a new prompt should be sent into the existing session to continue work. This means:

- We cannot delete the session
- We cannot create a new run from scratch (would create a new session)
- We need the old `done` completion marker to stop influencing the task state

## Proposed Solution: `rejected` Status Marker

Add a new `"rejected"` value to `OPENCODE_STATUS_VALUES`. When `review:reject` fires:

1. Send a `noReply` prompt into the OpenCode session with content `buildOpencodeStatusLine("rejected")`
2. This creates a **user message** in the session, which naturally hides the old `done` marker from `findCompletionMarker()` (it stops scanning at user messages)
3. The `"rejected"` marker is recognized but treated as a **terminal no-op** — `resolveTransitionTrigger` returns `null` for it

### Why `noReply`

`noReply: true` sends the message without expecting an AI response. This is critical — we don't want to trigger another agent run, just inject the marker to invalidate the previous `done`.

### Changes Required

#### 1. `src/lib/opencode-status.ts`

```typescript
export const OPENCODE_STATUS_VALUES = [
  "done",
  "generated",
  "fail",
  "question",
  "test_ok",
  "test_fail",
  "rejected", // ← NEW
] as const;
```

#### 2. `src/server/opencode/session-manager.ts` — `resolveAssistantRunSignal`

```typescript
if (parsed.status === "rejected") {
  return {
    runStatus: "completed",
    signalKey: "rejected",
    messageId: "",
    messageContent: "",
  };
}
```

#### 3. `src/server/run/run-session-interpreter.ts` — `deriveMetaStatus`

```typescript
// In the completionMarker block, add:
if (marker === "rejected") {
  return { kind: "completed", marker: "rejected", content };
}
```

#### 4. `src/server/run/task-state-machine.ts` — `resolveTransitionTrigger`

```typescript
// Add before existing checks:
if (completionMarker === "rejected") {
  return null; // Terminal but no transition
}
```

#### 5. `src/server/run/run-finalizer.ts` — `resolveTriggerFromOutcome`

```typescript
// The marker "rejected" is a new RunOutcomeMarker value.
// resolveTriggerFromOutcome already handles unknown markers → returns null.
// But should be explicit:
if (outcome.marker === "rejected") {
  return null;
}
```

#### 6. Rejection handler (wherever `review:reject` is processed)

When the user rejects a task that has an active/completed run with a session:

```typescript
const markerLine = buildOpencodeStatusLine("rejected");
await sessionManager.sendPrompt(sessionId, markerLine, { /* noReply */ });
```

**Important**: This must be sent as a `noReply` prompt via the OpenCode SDK, so it injects a user message without triggering an AI response.

### What This Achieves

- `findCompletionMarker()` → hits the user message with `rejected` marker → returns it as `AssistantRunSignal` with `signalKey: "rejected"` (wait — this is a **user** message, not assistant, so `findCompletionMarker` would actually stop and return null before reaching the old `done` marker)
- Actually: `findCompletionMarker` iterates from the end, returns null on user role → the old `done` is hidden. Even if reconciliation runs, it gets `completionMarker: null` from session inspection
- If reconciliation somehow gets `"rejected"` marker via fallback: `deriveMetaStatus` returns completed/rejected → `resolveTransitionTrigger` returns null → no state change

### Alternative Considered: Consumed Marker Tracking

Instead of injecting a marker, track consumed markers in-memory:

```typescript
const consumedMarkers = new Set<string>(); // `${sessionId}:${messageId}`
```

Rejected because:
- State lost on server restart
- Requires coordination across services
- The `noReply` marker approach is self-contained and survives restarts (marker lives in OpenCode's persistent message history)

## Key Files

| File | Role |
|------|------|
| `src/lib/opencode-status.ts` | Status token, values, regex, extract/build functions |
| `src/server/run/task-state-machine.ts` | TaskStateMachine, transitions, column mappings |
| `src/server/run/task-status-projection-service.ts` | Reconciliation logic (the source of the race) |
| `src/server/run/run-session-interpreter.ts` | deriveMetaStatus, findStoryContent |
| `src/server/run/run-finalizer.ts` | RunFinalizer, resolveTriggerFromOutcome |
| `src/server/opencode/session-manager.ts` | OpencodeSessionManager, findCompletionMarker |
| `src/server/opencode/session-store.ts` | High-level session helpers |

## OpenCode SDK Session API (v2)

| Method | Description |
|--------|-------------|
| `session.create` | Create new session |
| `session.delete` | Delete entire session + all data |
| `session.get` | Get session info |
| `session.messages` | List messages |
| `session.message` | Get specific message |
| `session.prompt` | Send message (triggers AI response) |
| `session.promptAsync` | Send message asynchronously |
| `session.abort` | Abort current execution |
| `session.update` | Update metadata (title, archived) |
| `Part.delete` | Delete a part from a message |
| `Part.update` | Update a part in a message |

**No API to delete individual messages.** Only `session.delete` removes messages (entire session).
