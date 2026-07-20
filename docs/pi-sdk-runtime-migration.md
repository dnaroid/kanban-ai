# Spec: Pi SDK runtime migration

## Type

Change

## Goal

Move the production run/session execution path from the OpenCode server to the
embedded Pi SDK while preserving the current run database, HTTP payloads, and
kanban UI behavior.

## Scope

- Create, persist, restore, inspect, continue, and abort Pi agent sessions.
- Translate Pi messages and lifecycle events into the existing session DTOs and
  SSE events consumed by the UI and run reconciler.
- Resolve configured `provider/model` preferences through Pi's model runtime and
  map supported variants to Pi thinking levels.
- Stop starting the OpenCode service from application and run bootstraps.
- Keep fake-runtime behavior available for deterministic tests and E2E flows.

## Non-goals

- Renaming the existing `/api/opencode/*` compatibility routes or their DTO
  fields in this stage.
- Migrating the hidden OpenCode configuration pages and all legacy configuration
  endpoints.
- Adding a new interactive approval/question protocol. Pi sessions expose no
  pending approval requests through the initial adapter, so existing synthetic
  `<REPORT>question</REPORT>` handling remains the supported pause mechanism.
- Importing historical OpenCode sessions into Pi session files.

## Behavior

- New production sessions use `SessionManager.create(cwd)` and
  `createAgentSession`; the Pi session ID remains the value persisted in
  `runs.session_id`.
- A session is restored lazily from Pi's persisted session catalog when it is
  referenced after a server restart.
- `sendPrompt` applies an explicit configured model before prompting. An unknown
  explicit model fails the request instead of silently using another model.
- Follow-up prompts sent while a Pi session is active are queued as follow-ups;
  idle sessions start a normal Pi prompt.
- Pi user/assistant/tool messages are projected into the existing
  `OpenCodeMessage` compatibility shape with stable IDs from Pi session entries.
- Pi provider failures are exposed as failed report content so the existing run
  reconciler finalizes the run instead of leaving it permanently running.
- Session subscribers are notified after persisted message/lifecycle changes;
  the existing tracker then publishes snapshots and triggers run reconciliation.
- Aborting a session waits for Pi to become idle. Persistent history is retained.

## Contracts

- No database migration: `runs.session_id` remains an opaque string.
- Existing session snapshot, message, todo, permission, question, and SSE payload
  shapes remain compatible.
- The production manager supports the same methods currently required by run
  execution, reconciliation, session routes, and shutdown handling.
- Pending todos, permissions, questions, and child sessions are empty until Pi
  equivalents are intentionally added.

## Invariants

- One live `AgentSession` instance exists per Pi session ID in a server process.
- Model/auth state is supplied by one shared Pi `ModelRuntime`.
- Restoring or inspecting a session never creates a replacement session ID.
- The fake manager remains selected only by `AI_RUNTIME_MODE=fake`.

## Edge cases

- Missing persisted session: inspection reports `not_found`; mutating operations
  throw a clear error.
- Concurrent restoration of the same session is coalesced.
- Repeated subscribe/unsubscribe calls do not duplicate Pi event bindings.
- A provider error or exhausted Pi retry is visible to reconciliation as failure.
- A cancelled/aborted assistant response does not overwrite the run's explicit
  cancellation state.

## Related files

- `packages/next-js/src/server/pi/`
- `packages/next-js/src/server/opencode/session-store.ts`
- `packages/next-js/src/server/opencode/session-tracker.ts`
- `packages/next-js/src/server/run/run-executor.ts`
- `packages/next-js/src/server/run/runs-queue-manager.ts`
- `packages/next-js/src/server/run/run-service.ts`

## Verification

- Unit tests for Pi message projection, model selection, events, restoration, and
  abort behavior with an injected SDK boundary.
- Existing run/session tests.
- TypeScript `tsc --noEmit`, full test suite, Next build, and `git diff --check`.

## Risks / unknowns

- Pi SDK requires Node.js 22.19.0 or newer.
- Pi extension-driven interactive UI requests are not yet bridged to the web UI.
- Compatibility route/type names still mention OpenCode until a later public API
  cleanup.

## Evidence

- Confirmed by code: run/session persistence and reconciliation currently depend
  on opaque session IDs plus the session-manager method contract.
- Confirmed by tests: fake session scenarios cover completion, failure, and
  pause/resume reconciliation behavior.
- Confirmed by docs: Pi SDK supports embedded persistent sessions, event
  subscriptions, model runtime selection, prompts, abort, and disposal.
- Unknown: whether every installed Pi extension can operate headlessly without a
  future web UI bridge.
