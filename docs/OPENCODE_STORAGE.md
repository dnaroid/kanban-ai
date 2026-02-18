# OpenCode Storage & Data Access

## Database Overview

- **Technology**: SQLite with Drizzle ORM
- **Path**: `~/.local/share/opencode/opencode.db`
- **PRAGMA Settings**: WAL journal, foreign keys enabled

---

## Schema

### Session Table

| Column            | Type    | Description                   |
| ----------------- | ------- | ----------------------------- |
| id                | text    | Primary key (e.g., `ses_xxx`) |
| project_id        | text    | FK → ProjectTable             |
| parent_id         | text    | Parent session (for forks)    |
| slug              | text    | URL-friendly identifier       |
| directory         | text    | Working directory             |
| title             | text    | Session title                 |
| version           | integer | Schema version                |
| share_url         | text    | Sharing URL                   |
| summary_additions | text    | Summary additions             |
| summary_deletions | text    | Summary deletions             |
| summary_files     | text    | Summary files                 |
| summary_diffs     | text    | JSON summary diffs            |
| revert            | text    | JSON revert data              |
| permission        | text    | JSON permission rules         |
| time_created      | integer | Creation timestamp            |
| time_updated      | integer | Last update timestamp         |
| time_compacting   | integer | Compaction timestamp          |
| time_archived     | integer | Archive timestamp             |

**Indexes**: `session_project_idx`, `session_parent_idx`

### Message Table

| Column       | Type    | Description                    |
| ------------ | ------- | ------------------------------ |
| id           | text    | Primary key                    |
| session_id   | text    | FK → SessionTable (cascade)    |
| time_created | integer | Creation timestamp             |
| data         | text    | JSON (InfoData with role, etc) |

**Index**: `message_session_idx`

### Part Table

| Column       | Type    | Description                 |
| ------------ | ------- | --------------------------- |
| id           | text    | Primary key                 |
| message_id   | text    | FK → MessageTable (cascade) |
| session_id   | text    | Session reference           |
| time_created | integer | Creation timestamp          |
| data         | text    | JSON (PartData)             |

**Indexes**: `part_message_idx`, `part_session_idx`

### Todo Table

| Column       | Type    | Description                 |
| ------------ | ------- | --------------------------- |
| session_id   | text    | FK → SessionTable (cascade) |
| content      | text    | Todo content                |
| status       | text    | pending / in_progress / etc |
| priority     | text    | high / medium / low         |
| position     | integer | Order position              |
| time_created | integer | Creation timestamp          |
| time_updated | integer | Last update timestamp       |

**PK**: `(session_id, position)`, **Index**: `todo_session_idx`

---

## Access Methods

### 1. CLI (Recommended for quick access)

```bash
# List sessions
opencode session list

# JSON output
opencode session list --format json

# Limit results
opencode session list -n 20
```

### 2. HTTP API (Server must be running)

**Base URL**: `http://localhost:4096`

```bash
# List all sessions
curl http://localhost:4096/session

# Filter by directory
curl "http://localhost:4096/session?directory=/path/to/project"

# Get specific session
curl http://localhost:4096/session/ses_xxx

# Get session messages
curl http://localhost:4096/session/ses_xxx/message

# Get specific message
curl http://localhost:4096/session/ses_xxx/message/msg_xxx

# Get child sessions (forks)
curl http://localhost:4096/session/ses_xxx/children

# Get todos
curl http://localhost:4096/session/ses_xxx/todo
```

### 3. SDK (TypeScript/JavaScript)

```typescript
import { client } from '@opencode-ai/sdk'

// List sessions
const sessions = await client.listSessions({
  query: { directory: '/path/to/project' },
})

// Get session info
const session = await client.getSession({
  path: { sessionID: 'ses_xxx' },
})

// Get messages
const messages = await client.getSessionMessages({
  path: { sessionID: 'ses_xxx' },
  query: { limit: 100 },
})

// Get specific message
const message = await client.getSessionMessage({
  path: { sessionID: 'ses_xxx', messageID: 'msg_xxx' },
})

// Fork session
const forked = await client.forkSession({
  path: { sessionID: 'ses_xxx' },
  body: { messageID: 'msg_xxx' }, // optional: fork up to this message
})
```

### 4. Direct SQLite (Server NOT running)

```bash
# Database path
DB=~/.local/share/opencode/opencode.db

# List all sessions
sqlite3 "$DB" "SELECT id, title, directory, time_created, time_updated FROM session ORDER BY time_updated DESC;"

# Get specific session
sqlite3 "$DB" "SELECT * FROM session WHERE id = 'ses_xxx';"

# Get all messages for session
sqlite3 "$DB" "SELECT id, time_created, data FROM message WHERE session_id = 'ses_xxx' ORDER BY time_created;"

# Get all parts for session
sqlite3 "$DB" "SELECT id, message_id, data FROM part WHERE session_id = 'ses_xxx';"

# Full session export (messages + parts)
sqlite3 "$DB" "
  SELECT 'MESSAGES:';
  SELECT id, time_created, data FROM message WHERE session_id = 'ses_xxx';
  SELECT 'PARTS:';
  SELECT id, message_id, time_created, data FROM part WHERE session_id = 'ses_xxx';
"
```

---

## Session Restoration Scenarios

### Server Running → Use API/CLI

```bash
# Export session to JSON
curl http://localhost:4096/session/ses_xxx > session.json
curl http://localhost:4096/session/ses_xxx/message > messages.json
```

### Server NOT Running → Use SQLite

```bash
# Export session data
sqlite3 ~/.local/share/opencode/opencode.db -json "
  SELECT
    s.id, s.title, s.directory, s.time_created,
    m.id as message_id, m.data as message_data,
    p.id as part_id, p.data as part_data
  FROM session s
  LEFT JOIN message m ON m.session_id = s.id
  LEFT JOIN part p ON p.session_id = s.id
  WHERE s.id = 'ses_xxx'
  ORDER BY m.time_created, p.time_created;
" > session_export.json
```

---

## API Reference Summary

| Method | Endpoint                           | Description             |
| ------ | ---------------------------------- | ----------------------- |
| GET    | `/session`                         | List sessions           |
| GET    | `/session/status`                  | Session status map      |
| GET    | `/session/:sessionID`              | Get session info        |
| GET    | `/session/:sessionID/children`     | Get child sessions      |
| GET    | `/session/:sessionID/todo`         | Get todos               |
| GET    | `/session/:sessionID/message`      | Get all messages        |
| GET    | `/session/:sessionID/message/:msg` | Get specific message    |
| POST   | `/session`                         | Create session          |
| POST   | `/session/:sessionID/fork`         | Fork session            |
| POST   | `/session/:sessionID/message`      | Send message            |
| POST   | `/session/:sessionID/abort`        | Abort session           |
| DELETE | `/session/:sessionID`              | Delete session          |
| PATCH  | `/session/:sessionID`              | Update (title, archive) |
