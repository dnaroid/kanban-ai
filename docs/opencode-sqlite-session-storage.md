# OpenCode Session Storage: SQLite Migration Guide

This document describes the current SQLite-based session storage in OpenCode and provides everything needed to rewrite `OpencodeStorageReader` from filesystem-based to raw SQL queries.

## What changed

OpenCode previously stored sessions as individual JSON files on disk (`storage/session/`, `storage/message/`, `storage/part/`). It now stores everything in a single SQLite database.

**Old (filesystem)**:

- Sessions: `{storage}/session/{sessionId}.json`
- Messages: `{storage}/message/{sessionId}/msg_*.json`
- Parts: `{storage}/part/{messageId}/prt_*.json`
- Base path: `~/Library/Application Support/opencode/storage/` (macOS)

**New (SQLite)**:

- Single database file: `~/Library/Application Support/opencode/opencode.db` (macOS)
- Tables: `session`, `message`, `part`, `todo`, `session_entry`
- Data stored in JSON columns (`data`) alongside relational metadata

## Database location

| Platform | Path                                                 |
| -------- | ---------------------------------------------------- |
| macOS    | `~/Library/Application Support/opencode/opencode.db` |
| Linux    | `~/.local/share/opencode/opencode.db`                |
| Windows  | `%APPDATA%/opencode/opencode.db`                     |

If using a non-default channel (beta, etc.), the file is `opencode-{channel}.db`.

## SQLite schema

### `session` table

```sql
CREATE TABLE session (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  workspace_id      TEXT,
  parent_id         TEXT,
  slug              TEXT NOT NULL,
  directory         TEXT NOT NULL,
  title             TEXT NOT NULL,
  version           TEXT NOT NULL,
  share_url         TEXT,
  summary_additions INTEGER,
  summary_deletions INTEGER,
  summary_files     INTEGER,
  summary_diffs     TEXT,  -- JSON: Snapshot.FileDiff[]
  revert            TEXT,  -- JSON: { messageID, partID?, snapshot?, diff? }
  permission        TEXT,  -- JSON: Permission.Ruleset
  time_created      INTEGER NOT NULL,
  time_updated      INTEGER NOT NULL,
  time_compacting   INTEGER,
  time_archived     INTEGER
);

CREATE INDEX session_project_idx ON session(project_id);
CREATE INDEX session_workspace_idx ON session(workspace_id);
CREATE INDEX session_parent_idx ON session(parent_id);
```

### `message` table

```sql
CREATE TABLE message (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL,
  data         TEXT NOT NULL  -- JSON: message info (role, content, metadata...)
);

CREATE INDEX message_session_time_created_id_idx ON message(session_id, time_created, id);
```

### `part` table

```sql
CREATE TABLE part (
  id           TEXT PRIMARY KEY,
  message_id   TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  session_id   TEXT NOT NULL,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL,
  data         TEXT NOT NULL  -- JSON: part data (type, text, tool info, etc.)
);

CREATE INDEX part_message_id_id_idx ON part(message_id, id);
CREATE INDEX part_session_idx ON part(session_id);
```

### `todo` table

```sql
CREATE TABLE todo (
  session_id   TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  status       TEXT NOT NULL,
  priority     TEXT NOT NULL,
  position     INTEGER NOT NULL,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL,
  PRIMARY KEY (session_id, position)
);

CREATE INDEX todo_session_idx ON todo(session_id);
```

## JSON column structures

### `message.data` — User message

```jsonc
{
  "role": "user",
  "time": { "created": 1719000000000 },
  "format": { "type": "text" }, // optional
  "summary": {
    // optional
    "title": "...",
    "body": "...",
    "diffs": [],
  },
  "agent": "build",
  "model": {
    "providerID": "anthropic",
    "modelID": "claude-sonnet-4-20250514",
    "variant": "thinking", // optional
  },
  "system": "...", // optional
  "tools": { "toolName": true }, // optional
}
```

### `message.data` — Assistant message

```jsonc
{
  "role": "assistant",
  "time": {
    "created": 1719000000000,
    "completed": 1719000001000, // optional
  },
  "error": null, // optional, error object
  "parentID": "msg_abc123", // ID of the user message this responds to
  "modelID": "claude-sonnet-4-20250514",
  "providerID": "anthropic",
  "mode": "code",
  "agent": "build",
  "path": { "cwd": "/path/to/project", "root": "/path/to/project" },
  "summary": false, // optional
  "cost": 0.003,
  "tokens": {
    "total": 1000,
    "input": 500,
    "output": 400,
    "reasoning": 100,
    "cache": { "read": 0, "write": 0 },
  },
  "structured": null, // optional
  "variant": "thinking", // optional
  "finish": "stop", // optional
}
```

### `part.data` — Text part

```json
{ "type": "text", "text": "Hello, how can I help?" }
```

### `part.data` — Reasoning part

```json
{
  "type": "reasoning",
  "text": "Let me think about this...",
  "time": { "start": 1719000000000, "end": 1719000000500 }
}
```

### `part.data` — Tool part

```jsonc
{
  "type": "tool",
  "callID": "call_abc123",
  "tool": "read",
  "state": {
    // One of 4 shapes (discriminated by state.status):
    "status": "completed", // "pending" | "running" | "completed" | "error"
    "input": { "filePath": "..." },
    "output": "file contents...",
    "title": "Read file.ts",
    "metadata": {},
    "time": { "start": 1719000000000, "end": 1719000001000 },
  },
}
```

**Tool state variants**:

| `status`    | Required fields                                                  |
| ----------- | ---------------------------------------------------------------- |
| `pending`   | `input`, `raw`                                                   |
| `running`   | `input`, `time.start`                                            |
| `completed` | `input`, `output`, `title`, `metadata`, `time.start`, `time.end` |
| `error`     | `input`, `error` (string), `time.start`, `time.end`              |

### `part.data` — File part

```json
{
  "type": "file",
  "mime": "image/png",
  "url": "data:image/png;base64,...",
  "filename": "screenshot.png"
}
```

### `part.data` — Agent part

```json
{ "type": "agent", "name": "build" }
```

### `part.data` — Step start part

```json
{ "type": "step-start" }
```

### `part.data` — Snapshot part

```json
{ "type": "snapshot", "snapshot": "..." }
```

### `part.data` — Subtask part

```json
{
  "type": "subtask",
  "prompt": "...",
  "description": "...",
  "agent": "build",
  "model": { "providerID": "anthropic", "modelID": "claude-sonnet-4-20250514" },
  "command": "..."
}
```

### Other part types stored: `patch`, `retry`, `compaction`

These are less common but may appear in the database.

## How to reconstruct the full data from DB

The key insight: **IDs and relational fields are stored as proper columns**, while the **type-specific data blob is stored in the `data` JSON column**. To reconstruct a complete object, you merge columns with the JSON data:

### Reconstructing a message

```sql
SELECT id, session_id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created ASC, id ASC;
```

Then merge: `{ ...JSON.parse(row.data), id: row.id, sessionID: row.session_id }`

### Reconstructing parts for a message

```sql
SELECT id, message_id, session_id, data FROM part WHERE message_id = ? ORDER BY id ASC;
```

Then merge: `{ ...JSON.parse(row.data), id: row.id, sessionID: row.session_id, messageID: row.message_id }`

### Reconstructing a full conversation (messages + parts) in one query

```sql
-- Get messages
SELECT m.id, m.session_id, m.time_created, m.data
FROM message m
WHERE m.session_id = ?
ORDER BY m.time_created ASC, m.id ASC
LIMIT ?;

-- Then get all parts for those messages in one batch
SELECT p.id, p.message_id, p.session_id, p.data
FROM part p
WHERE p.message_id IN (?, ?, ...)  -- message IDs from above
ORDER BY p.message_id, p.id;
```

## Required SQL queries for OpencodeStorageReader

### 1. Get session directory (replaces `getSessionDirectoryFromStorage`)

```sql
SELECT directory FROM session WHERE id = ?;
```

### 2. Get messages with parts (replaces `getMessagesFromFilesystem`)

```sql
-- Step 1: Get messages, newest first, limited
SELECT id, session_id, time_created, data
FROM message
WHERE session_id = ?
ORDER BY time_created ASC, id ASC
LIMIT ?;

-- Step 2: Get all parts for those messages
SELECT p.id, p.message_id, p.session_id, p.data
FROM part p
WHERE p.message_id IN (?, ?, ...)
ORDER BY p.message_id, p.id;
```

### 3. Get todos for a session

```sql
SELECT content, status, priority
FROM todo
WHERE session_id = ?
ORDER BY position ASC;
```

### 4. Get session list

```sql
SELECT id, slug, title, directory, time_created, time_updated, time_archived
FROM session
WHERE time_archived IS NULL
ORDER BY time_updated DESC
LIMIT 100;
```

## TypeScript types to preserve (from kanban-ai)

The existing types in `@/types/ipc.ts` should remain unchanged. The mapping from DB data to these types:

```typescript
// Existing type that must be preserved:
interface OpenCodeMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  parts: Part[]
  timestamp: number
  modelID?: string
  providerID?: string
  variant?: string
  tokens?: MessageTokens
}

// Mapping from DB row to OpenCodeMessage:
// row = { id, session_id, time_created, data: JSON }
// data = { role, model?, tokens?, ... }
//
// OpenCodeMessage {
//   id: row.id,
//   role: data.role,                              // "user" | "assistant"
//   content: extract from parts (see below),
//   parts: reconstructed parts array,
//   timestamp: row.time_created,
//   modelID: data.modelID,                        // assistant only
//   providerID: data.providerID,                  // assistant only
//   variant: data.variant,                        // assistant only
//   tokens: data.tokens,                          // assistant only
// }
```

### Content extraction logic

The `content` field of `OpenCodeMessage` is built from parts:

1. If the message has text parts → concatenate their `text` fields
2. If no text content → use `buildMessageContent(parts)` callback
3. Fallback → use `data.summary?.title` or empty string

## Important notes for the implementer

1. **Part types in the DB are richer** than the current `Part` union in kanban-ai. New types include: `subtask`, `retry`, `compaction`, `step-finish`, `patch`. The `normalizePart` method should handle these (can map unknown types to `{ type: "other" }`).

2. **Tool state shape changed significantly**. It's now always an object with `status` field, not a string. The `status` discriminator determines which other fields are present.

3. **Messages are no longer sorted by filename**. Sort by `time_created ASC, id ASC`.

4. **No more `msg_` or `prt_` prefixes** to worry about — IDs are stored directly in the `id` column.

5. **The `buildMessageContent` callback pattern** should be preserved — it's injected via constructor for good reason (keeps the reader decoupled from UI rendering logic).

6. **Connection**: Use `better-sqlite3` or `bun:sqlite` to open the database. It uses WAL mode so concurrent reads are safe. Open in read-only mode if possible.

7. **Session `directory` field** is now directly in the `session` table — no need to parse JSON to get it.

8. **The database is per-user** (single file), not per-project. Sessions are scoped to projects via `project_id`.

## Source files in OpenCode repo for reference

| File                                           | Purpose                                                    |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `packages/opencode/src/session/session.sql.ts` | Drizzle schema (table definitions)                         |
| `packages/opencode/src/session/session.ts`     | Session CRUD, `fromRow`/`toRow` mapping                    |
| `packages/opencode/src/session/message-v2.ts`  | Message/Part types, hydration logic (`hydrate()` function) |
| `packages/opencode/src/session/schema.ts`      | ID types (SessionID, MessageID, PartID)                    |
| `packages/opencode/src/storage/db.ts`          | Database connection, migration, path logic                 |
| `packages/opencode/src/storage/schema.sql.ts`  | Shared timestamp columns                                   |
| `packages/opencode/src/global/index.ts`        | `Global.Path.data` — base directory for DB file            |

## The current (obsolete) code being replaced

Located at: `packages/next-js/src/server/opencode/opencode-storage-reader.ts`

Key methods to reimplement:

- `getMessagesFromFilesystem(sessionId, limit?)` → query `message` + `part` tables
- `getSessionDirectoryFromStorage(sessionId)` → query `session.directory`
- `loadPartsForMessage(messageId)` → query `part` table
- `normalizePart(raw)` → parse `part.data` JSON instead of filesystem JSON
