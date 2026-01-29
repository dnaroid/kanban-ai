# Kanban AI — Итоговая структура БД + структура Zod (Фазы 0–5)

> Дата: 2026-01-29  
> Назначение: единая “карта” схемы SQLite после всех миграций фаз 0–5 + рекомендуемая структура `zod`-схем для контрактов IPC/Domain.  
> Примечание: ниже — **ожидаемая итоговая схема**, согласованная с планами фаз 1–5. Если у тебя в коде немного другие имена/поля — используй этот документ как канон и сделай короткий маппинг (alias) в миграциях/DAO.

---

## 1) Общие допущения по БД

- Локальная БД: **SQLite** (однофайловая).
- Миграции: через собственный migration runner (таблица `migrations`) **или** `PRAGMA user_version`.
- Все timestamps: `TEXT` в ISO-формате (например `2026-01-29T12:34:56.000Z`) либо локальный ISO без timezone — главное **консистентно**.
- Все `id`: `TEXT` (UUID/ULID). Рекомендуется ULID/UUIDv7 ради упорядочивания по времени (но не обязательно).

---

## 2) ER (связи на уровне домена)

- `projects` 1—N `boards`
- `boards` 1—N `columns`
- `columns` 1—N `tasks`
- `tasks` 1—N `runs`
- `runs` 1—N `run_events`
- `runs` 1—N `artifacts`
- `tasks` 1—N `context_snapshots` (которые выбираются в `runs.context_snapshot_id`)
- `projects` 1—1 `vcs_projects` (настройки репо)
- `tasks` 1—1 `task_vcs_links` (ветка/PR/sha)
- `tasks` 1—N `pull_requests` (обычно 0..1 на таску, но оставляем N на будущее)
- `projects` 1—N `releases`
- `releases` 1—N `release_items` (каждый item указывает на `task_id`, опционально `pr_id`)
- `projects` 1—N `task_links` (зависимости между тасками)
- `tasks` 1—1 `task_schedule` (таймлайн/оценки)
- `projects` 1—N `analytics_daily` (если агрегаты сохраняются)
- `plugins` — реестр локальных плагинов

---

## 3) Таблицы (итоговая структура)

Ниже — “канонический” список таблиц и полей.

### 3.1 Служебные

#### `migrations` (если используешь таблицу миграций)
- `id TEXT PRIMARY KEY` — имя/версия миграции (например `2026_01_29_0001_init`)
- `applied_at TEXT NOT NULL`

---

### 3.2 Core: проекты/доски/колонки/таски

#### `projects`
- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `description TEXT NOT NULL DEFAULT ''`
- `repo_path TEXT NOT NULL DEFAULT ''` *(если не выделено в `vcs_projects`)*
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Индексы:
- `idx_projects_updated_at` (`updated_at`)

#### `boards`
- `id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `name TEXT NOT NULL`
- `is_default INTEGER NOT NULL DEFAULT 1` *(0/1)*
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Индексы:
- `idx_boards_project` (`project_id`)

#### `columns`
- `id TEXT PRIMARY KEY`
- `board_id TEXT NOT NULL`
- `name TEXT NOT NULL`
- `order_index INTEGER NOT NULL` *(порядок в доске)*
- `wip_limit INTEGER NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Индексы:
- `idx_columns_board` (`board_id`, `order_index`)

#### `tasks`
- `id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `board_id TEXT NOT NULL`
- `column_id TEXT NOT NULL`
- `title TEXT NOT NULL`
- `description_md TEXT NOT NULL DEFAULT ''`
- `type TEXT NOT NULL DEFAULT 'story'` *(story|bug|spike|chore)*
- `priority INTEGER NOT NULL DEFAULT 0` *(0..N или 1..5 — как договоришься)*
- `tags_json TEXT NOT NULL DEFAULT '[]'` *(JSON array string)*
- `order_in_column REAL NOT NULL DEFAULT 0` *(для стабильного reorder; можно REAL для “между” вставок)*
- `blocked INTEGER NOT NULL DEFAULT 0` *(0/1, вычисляемое или сохранённое)*
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Индексы:
- `idx_tasks_project` (`project_id`, `updated_at`)
- `idx_tasks_column` (`column_id`, `order_in_column`)

> Если `blocked` вычисляется динамически по `task_links`, можно не хранить поле (тогда документируй как computed).

---

### 3.3 Runs/Chat/Artifacts/Context

#### `agent_roles`
- `id TEXT PRIMARY KEY` *(например `ba`, `dev`, `qa`)*
- `name TEXT NOT NULL`
- `description TEXT NOT NULL DEFAULT ''`
- `preset_json TEXT NOT NULL DEFAULT '{}'` *(инструкции/параметры запуска)*
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `context_snapshots`
- `id TEXT PRIMARY KEY`
- `task_id TEXT NOT NULL`
- `kind TEXT NOT NULL` *(например `run_input_v1`)*
- `summary TEXT NOT NULL DEFAULT ''`
- `payload_json TEXT NOT NULL`
- `hash TEXT NOT NULL`
- `created_at TEXT NOT NULL`

Индексы:
- `idx_context_task` (`task_id`, `created_at`)
- `idx_context_hash` (`hash`)

#### `runs`
- `id TEXT PRIMARY KEY`
- `task_id TEXT NOT NULL`
- `role_id TEXT NOT NULL`
- `mode TEXT NOT NULL DEFAULT 'execute'` *(plan-only|execute|critique)*
- `status TEXT NOT NULL` *(queued|running|succeeded|failed|canceled)*
- `started_at TEXT NULL`
- `finished_at TEXT NULL`
- `error_text TEXT NOT NULL DEFAULT ''`
- `budget_json TEXT NOT NULL DEFAULT '{}'`
- `context_snapshot_id TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Индексы:
- `idx_runs_task` (`task_id`, `created_at`)
- `idx_runs_status` (`status`, `updated_at`)

#### `run_events`
- `id TEXT PRIMARY KEY`
- `run_id TEXT NOT NULL`
- `ts TEXT NOT NULL`
- `event_type TEXT NOT NULL` *(stdout|stderr|message|tool|artifact|status|debug)*
- `payload_json TEXT NOT NULL`

Индексы:
- `idx_events_run` (`run_id`, `ts`)

#### `artifacts`
- `id TEXT PRIMARY KEY`
- `run_id TEXT NOT NULL`
- `kind TEXT NOT NULL` *(markdown|json|patch|file_ref|link)*
- `title TEXT NOT NULL`
- `content TEXT NOT NULL`
- `metadata_json TEXT NOT NULL DEFAULT '{}'`
- `created_at TEXT NOT NULL`

Индексы:
- `idx_artifacts_run` (`run_id`, `created_at`)

---

### 3.4 VCS / PR

#### `vcs_projects`
- `project_id TEXT PRIMARY KEY`
- `repo_path TEXT NOT NULL`
- `remote_url TEXT NOT NULL DEFAULT ''`
- `default_branch TEXT NOT NULL DEFAULT 'main'`
- `provider_type TEXT NOT NULL DEFAULT ''` *(github|gitlab|)*
- `provider_repo_id TEXT NOT NULL DEFAULT ''` *(owner/repo или numeric id)*
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `task_vcs_links`
- `task_id TEXT PRIMARY KEY`
- `branch_name TEXT NOT NULL DEFAULT ''`
- `pr_id TEXT NOT NULL DEFAULT ''`
- `pr_url TEXT NOT NULL DEFAULT ''`
- `last_commit_sha TEXT NOT NULL DEFAULT ''`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `pull_requests`
- `id TEXT PRIMARY KEY` *(внутренний UUID)*
- `task_id TEXT NOT NULL`
- `provider_pr_id TEXT NOT NULL`
- `title TEXT NOT NULL`
- `state TEXT NOT NULL` *(open|closed|merged|draft)*
- `url TEXT NOT NULL`
- `base_branch TEXT NOT NULL`
- `head_branch TEXT NOT NULL`
- `ci_status TEXT NOT NULL DEFAULT 'unknown'` *(unknown|pending|success|failed)*
- `approvals_count INTEGER NOT NULL DEFAULT 0`
- `required_approvals INTEGER NOT NULL DEFAULT 0`
- `last_synced_at TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

---

### 3.5 Releases

#### `releases`
- `id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `name TEXT NOT NULL`
- `status TEXT NOT NULL` *(draft|in_progress|published|canceled)*
- `target_date TEXT NULL` *(YYYY-MM-DD)*
- `notes_md TEXT NOT NULL DEFAULT ''`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `release_items`
- `id TEXT PRIMARY KEY`
- `release_id TEXT NOT NULL`
- `task_id TEXT NOT NULL`
- `pr_id TEXT NOT NULL DEFAULT ''`
- `state TEXT NOT NULL DEFAULT 'planned'` *(planned|merged|dropped)*
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

---

### 3.6 Dependencies / Scheduling / Analytics / Plugins

#### `task_links`
- `id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `from_task_id TEXT NOT NULL`
- `to_task_id TEXT NOT NULL`
- `link_type TEXT NOT NULL` *(blocks|relates|duplicates)*
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

> Интерпретация blocked-by: A blocks B = (from=A, to=B, type=blocks).

#### `task_schedule`
- `task_id TEXT PRIMARY KEY`
- `start_date TEXT NULL` *(YYYY-MM-DD)*
- `due_date TEXT NULL`
- `estimate_points REAL NOT NULL DEFAULT 0`
- `estimate_hours REAL NOT NULL DEFAULT 0`
- `assignee TEXT NOT NULL DEFAULT ''`
- `updated_at TEXT NOT NULL`

#### `analytics_daily` *(если агрегаты сохраняются; иначе можно отсутствовать)*
- `id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `day TEXT NOT NULL` *(YYYY-MM-DD)*
- `wip_count INTEGER NOT NULL`
- `done_count INTEGER NOT NULL`
- `created_count INTEGER NOT NULL`
- `avg_cycle_time_hours REAL NOT NULL`
- `runs_count INTEGER NOT NULL`
- `runs_success_count INTEGER NOT NULL`
- `runs_avg_duration_sec REAL NOT NULL`
- `ai_tokens_in INTEGER NOT NULL DEFAULT 0`
- `ai_tokens_out INTEGER NOT NULL DEFAULT 0`
- `ai_cost_usd REAL NOT NULL DEFAULT 0`
- `updated_at TEXT NOT NULL`

#### `plugins`
- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `version TEXT NOT NULL`
- `enabled INTEGER NOT NULL` *(0/1)*
- `type TEXT NOT NULL` *(role|executor|integration|ui)*
- `manifest_json TEXT NOT NULL`
- `installed_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

---

### 3.7 Search (FTS) — если реализовано

Если используешь SQLite FTS5:

- `tasks_fts` (task_id, title, description_md, tags_text)
- `runs_fts` (run_id, task_id, role_id, status, summary)
- `artifacts_fts` (artifact_id, run_id, title, content_snippet)

+ triggers на insert/update/delete.

---

## 4) “Есть ли база сидов?” (Seeds)

Да, на этом этапе **сидовые данные** должны быть (и это рекомендовано), минимум:

### 4.1 Обязательные seeds
1) `agent_roles`: `ba`, `dev`, `qa` с дефолтными `preset_json`.
2) Дефолтная доска/колонки при создании проекта:
   - Board “Default”
   - Columns: `Backlog`, `In Progress`, `Done` (и опционально `QA`)

### 4.2 Где и как сидить
- Рекомендуется `bootstrapSeeds()` на старте:
  - `if count(agent_roles)==0 -> insert defaults`
- И в `createProject()`:
  - после insert проекта → создать board/columns (если UI не требует ручного).

### 4.3 Идемпотентность
Все seeds должны быть idempotent (upsert по `id`, без дублей).

---

## 5) Структура `zod` (рекомендуемая)

### 5.1 Папки
- `src/shared/zod/base.ts` — общие примитивы (Id, IsoDate, enums)
- `src/shared/zod/domain/*.ts` — доменные сущности (Task, Run, ...)
- `src/shared/zod/ipc/*.ts` — контракты IPC (request/response)
- `src/shared/zod/plugin/*.ts` — manifest + plugin API контракты

---

## 6) Zod: базовые примитивы и enums (канон)

```ts
import { z } from "zod";

export const Id = z.string().min(1);
export const IsoDateTime = z.string().min(10); // ISO-ish; строгий regex опционально
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TaskType = z.enum(["story", "bug", "spike", "chore"]);
export const RunStatus = z.enum(["queued", "running", "succeeded", "failed", "canceled"]);
export const RunMode = z.enum(["plan-only", "execute", "critique"]);

export const EventType = z.enum(["stdout","stderr","message","tool","artifact","status","debug"]);
export const ArtifactKind = z.enum(["markdown","json","patch","file_ref","link"]);

export const PrState = z.enum(["open","closed","merged","draft"]);
export const CiStatus = z.enum(["unknown","pending","success","failed"]);

export const ReleaseStatus = z.enum(["draft","in_progress","published","canceled"]);
export const ReleaseItemState = z.enum(["planned","merged","dropped"]);

export const LinkType = z.enum(["blocks","relates","duplicates"]);
```

---

## 7) Zod: доменные сущности (domain)

```ts
import { z } from "zod";
import {
  Id, IsoDate, IsoDateTime,
  TaskType, RunStatus, RunMode,
  EventType, ArtifactKind,
  PrState, CiStatus,
  ReleaseStatus, ReleaseItemState,
  LinkType
} from "./base";
```

### 7.1 Project / Board / Column

```ts
export const Project = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().default(""),
  repoPath: z.string().default(""),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const Board = z.object({
  id: Id,
  projectId: Id,
  name: z.string().min(1),
  isDefault: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const Column = z.object({
  id: Id,
  boardId: Id,
  name: z.string().min(1),
  orderIndex: z.number().int(),
  wipLimit: z.number().int().nullable().optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
```

### 7.2 Task / Schedule / Links

```ts
export const Task = z.object({
  id: Id,
  projectId: Id,
  boardId: Id,
  columnId: Id,
  title: z.string().min(1),
  descriptionMd: z.string().default(""),
  type: TaskType,
  priority: z.number().int(),
  tags: z.array(z.string()),
  orderInColumn: z.number(),
  blocked: z.boolean().optional(), // optional если computed
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const TaskSchedule = z.object({
  taskId: Id,
  startDate: IsoDate.nullable().optional(),
  dueDate: IsoDate.nullable().optional(),
  estimatePoints: z.number(),
  estimateHours: z.number(),
  assignee: z.string().default(""),
  updatedAt: IsoDateTime,
});

export const TaskLink = z.object({
  id: Id,
  projectId: Id,
  fromTaskId: Id,
  toTaskId: Id,
  linkType: LinkType,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
```

### 7.3 Roles / Context / Run / Event / Artifact

```ts
export const AgentRole = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().default(""),
  preset: z.record(z.any()),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const ContextSnapshot = z.object({
  id: Id,
  taskId: Id,
  kind: z.string().min(1),
  summary: z.string().default(""),
  payload: z.record(z.any()),
  hash: z.string().min(8),
  createdAt: IsoDateTime,
});

export const Run = z.object({
  id: Id,
  taskId: Id,
  roleId: Id,
  mode: RunMode,
  status: RunStatus,
  startedAt: IsoDateTime.nullable().optional(),
  finishedAt: IsoDateTime.nullable().optional(),
  errorText: z.string().default(""),
  budget: z.record(z.any()),
  contextSnapshotId: Id,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const RunEvent = z.object({
  id: Id,
  runId: Id,
  ts: IsoDateTime,
  eventType: EventType,
  payload: z.record(z.any()),
});

export const Artifact = z.object({
  id: Id,
  runId: Id,
  kind: ArtifactKind,
  title: z.string().min(1),
  content: z.string(),
  metadata: z.record(z.any()).default({}),
  createdAt: IsoDateTime,
});
```

### 7.4 VCS / PR / Release / Analytics / Plugin

```ts
export const VcsProject = z.object({
  projectId: Id,
  repoPath: z.string().min(1),
  remoteUrl: z.string().default(""),
  defaultBranch: z.string().default("main"),
  providerType: z.string().default(""),
  providerRepoId: z.string().default(""),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const TaskVcsLink = z.object({
  taskId: Id,
  branchName: z.string().default(""),
  prId: z.string().default(""),
  prUrl: z.string().default(""),
  lastCommitSha: z.string().default(""),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const PullRequest = z.object({
  id: Id,
  taskId: Id,
  providerPrId: z.string().min(1),
  title: z.string().min(1),
  state: PrState,
  url: z.string().min(1),
  baseBranch: z.string().min(1),
  headBranch: z.string().min(1),
  ciStatus: CiStatus,
  approvalsCount: z.number().int(),
  requiredApprovals: z.number().int(),
  lastSyncedAt: IsoDateTime,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const Release = z.object({
  id: Id,
  projectId: Id,
  name: z.string().min(1),
  status: ReleaseStatus,
  targetDate: IsoDate.nullable().optional(),
  notesMd: z.string().default(""),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const ReleaseItem = z.object({
  id: Id,
  releaseId: Id,
  taskId: Id,
  prId: z.string().default(""),
  state: ReleaseItemState,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const AnalyticsDaily = z.object({
  id: Id,
  projectId: Id,
  day: IsoDate,
  wipCount: z.number().int(),
  doneCount: z.number().int(),
  createdCount: z.number().int(),
  avgCycleTimeHours: z.number(),
  runsCount: z.number().int(),
  runsSuccessCount: z.number().int(),
  runsAvgDurationSec: z.number(),
  aiTokensIn: z.number().int(),
  aiTokensOut: z.number().int(),
  aiCostUsd: z.number(),
  updatedAt: IsoDateTime,
});

export const PluginRecord = z.object({
  id: Id,
  name: z.string().min(1),
  version: z.string().min(1),
  enabled: z.boolean(),
  type: z.enum(["role","executor","integration","ui"]),
  manifest: z.record(z.any()),
  installedAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
```

---

## 8) Zod: IPC контракты (минимальный каркас)

```ts
export const Ok = z.object({ ok: z.literal(true) });
export const Err = z.object({ ok: z.literal(false), error: z.string() });
export const Result = z.union([Ok, Err]);
```

Примеры:
```ts
export const ProjectCreateReq = z.object({ name: z.string().min(1), description: z.string().optional() });
export const ProjectCreateRes = z.object({ project: Project });

export const RunStartReq = z.object({ taskId: Id, roleId: Id, mode: RunMode.optional() });
export const RunStartRes = z.object({ runId: Id });
```

---

## 9) Практический совет: чтобы схема не расходилась с реальностью

Добавь команду `pnpm db:dump-schema` и сохраняй вывод в `docs/DB_SCHEMA.sql`/`docs/DB_SCHEMA.md`:

```sql
SELECT name, sql
FROM sqlite_master
WHERE type IN ('table','index','trigger','view')
ORDER BY type, name;
```

И обновляй этот файл при каждом PR с миграциями.

