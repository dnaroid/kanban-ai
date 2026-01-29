# PHASE 2 — Runs/Jobs + Task Chat + минимальная интеграция OpenCode (план для агента GLM 4.7)

> Цель фазы 2: добавить “исполнение” к таскам: **запуски (runs/jobs)**, **чат/лог выполнения**, **стриминг событий**, **отмена/повтор**, **артефакты**.  
> В конце пользователь должен уметь: открыть таску → нажать “Run (BA/Dev/QA)” → видеть поток сообщений/лог → получить результат (story/patch/отчёт) → сохранить артефакт → повторить/отменить.

---

## 0) Definition of Done

Фаза 2 завершена, если:

1) ✅ У каждой таски есть вкладка **Runs / Chat** с историей запусков  
2) ✅ Можно запустить run с ролью (минимум: **BA, Dev, QA**)  
3) ✅ Run имеет состояния: `queued → running → succeeded/failed/canceled`  
4) ✅ В UI виден **стрим событий** (stdout/log + структурированные сообщения)  
5) ✅ Работают **Cancel** и **Retry**  
6) ✅ Результаты сохраняются в SQLite:
   - run metadata
   - run events (для replay)
   - artifacts (вывод/файлы/патчи/отчёты)
   - context snapshot (какой контекст был передан агенту)
7) ✅ Есть минимальная защита: redaction секретов, denylist файлов, safe-mode для команд  
8) ✅ Тесты: очередь + сохранение событий + базовая интеграция (mock adapter)

---

## 1) Scope / Non-scope

### Входит
- Runs/Jobs (очередь, состояния, отмена, повтор)
- Task Chat/Log UI
- Стриминг run events
- Artifacts (текстовые: markdown output, JSON, patch/diff)
- Context snapshot builder (MVP)
- OpenCode execution adapter (MVP; через spawn или через “headless link” если он уже есть)

### Не входит (будущие фазы)
- Git ветки/PR/CI
- AI merge conflict resolver
- Dependencies graph / timeline
- Plugin system
- Advanced cost dashboard

---

## 2) DB: модель данных и миграции

### 2.1 Таблицы

#### `agent_roles`
- `id TEXT PRIMARY KEY` (например `ba`, `dev`, `qa`)
- `name TEXT NOT NULL`
- `description TEXT NOT NULL DEFAULT ''`
- `preset_json TEXT NOT NULL DEFAULT '{}'`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `context_snapshots`
- `id TEXT PRIMARY KEY`
- `task_id TEXT NOT NULL`
- `kind TEXT NOT NULL` (например `run_input_v1`)
- `summary TEXT NOT NULL DEFAULT ''`
- `payload_json TEXT NOT NULL`
- `hash TEXT NOT NULL`
- `created_at TEXT NOT NULL`

#### `runs`
- `id TEXT PRIMARY KEY`
- `task_id TEXT NOT NULL`
- `role_id TEXT NOT NULL`
- `mode TEXT NOT NULL DEFAULT 'execute'` (`plan-only|execute|critique`)
- `status TEXT NOT NULL` (`queued|running|succeeded|failed|canceled`)
- `started_at TEXT NULL`
- `finished_at TEXT NULL`
- `error_text TEXT NOT NULL DEFAULT ''`
- `budget_json TEXT NOT NULL DEFAULT '{}'`
- `context_snapshot_id TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `run_events`
- `id TEXT PRIMARY KEY`
- `run_id TEXT NOT NULL`
- `ts TEXT NOT NULL`
- `event_type TEXT NOT NULL` (`stdout|stderr|message|tool|artifact|status|debug`)
- `payload_json TEXT NOT NULL`

#### `artifacts`
- `id TEXT PRIMARY KEY`
- `run_id TEXT NOT NULL`
- `kind TEXT NOT NULL` (`markdown|json|patch|file_ref|link`)
- `title TEXT NOT NULL`
- `content TEXT NOT NULL` (MVP: хранить прямо в sqlite)
- `metadata_json TEXT NOT NULL DEFAULT '{}'`
- `created_at TEXT NOT NULL`

### 2.2 Индексы
- `idx_runs_task` on `runs(task_id, created_at)`
- `idx_events_run` on `run_events(run_id, ts)`
- `idx_artifacts_run` on `artifacts(run_id, created_at)`

### 2.3 Seed
При первом запуске: если `agent_roles` пусто — создать `ba/dev/qa`.

---

## 3) Execution layer: Job Runner (очередь)

### 3.1 Требования
- Очередь queued runs
- Concurrency limit (MVP: 1–2)
- Cancel:
  - queued → canceled
  - running → graceful terminate (kill child / cancel token)
- Retry:
  - новый run с новым id (metadata в budget_json)

### 3.2 События
- Любой статус → `run_events(status)`
- stdout/stderr → соответствующие events
- структурированный результат → `artifact` event + запись в `artifacts`

### 3.3 Интерфейс
```ts
interface RunExecutor {
  start(run: RunRecord): Promise<void>;
  cancel(runId: string): Promise<void>;
}
```

---

## 4) OpenCode интеграция (MVP)

### 4.1 Driver A: spawn CLI (рекомендовано как базовый)
- запускаем `opencode ...` подпроцессом
- cwd = путь репо проекта
- env = конфиг oh-my-opencode/модели/ключи

### 4.2 Driver B: подключение к существующему headless link
- если есть стабильный API — подключить feature-flag’ом
- если нестабильно — оставить на фазу 2.5/3

### 4.3 Формат событий (best-effort)
- всё непарсибельное → `stdout` строка
- JSON-подобное → попытка распарсить в `message/tool/artifact`

---

## 5) Context Snapshot Builder (MVP)

### 5.1 Что включаем
- Task: title/description/type/priority/tags/AC
- Board: название колонки
- Project: name, repoPath
- Role preset: instructions + expected output
- Limits: max time / max output

### 5.2 Security
- denylist путей: `.env`, `*.key`, `id_rsa`, `secrets.*`
- redaction по шаблонам токенов
- если включаем файлы — проверять allowlist/denylist

---

## 6) UI: Runs / Chat / Artifacts

### 6.1 Task Details: вкладка Runs
- список запусков
- кнопки Start/Cancel/Retry
- выбор роли (dropdown)

### 6.2 Execution Log (чат/лог)
- показывать события по выбранному run:
  - message
  - stdout/stderr
  - status
- auto-scroll + “jump to end”
- фильтр “errors only” (опционально)

### 6.3 Artifacts
- список артефактов run’а
- viewers:
  - markdown
  - json
  - patch (diff)

### 6.4 Replay
- открыть старый run и показать run_events без запуска

---

## 7) IPC методы (минимум)

### Runs
- `run.start({ taskId, roleId, mode? }) -> { runId }`
- `run.cancel({ runId }) -> { ok: true }`
- `run.listByTask({ taskId }) -> { runs }`
- `run.get({ runId }) -> { run }`

### Events (MVP polling)
- `run.events.tail({ runId, afterTs?, limit }) -> { events }`

### Artifacts
- `artifact.list({ runId }) -> { artifacts }`
- `artifact.get({ artifactId }) -> { artifact }`

### Roles
- `roles.list() -> { roles }`

---

## 8) Тестирование (минимум)

### Unit (main)
- queue FIFO + concurrency=1
- cancel queued
- cancel running (mock)
- persistence runs/events/artifacts

### Integration (mock executor)
- executor пишет 5–10 событий + 1 artifact
- UI получает события через tail polling

---

## 9) План работ (тикеты)

### T2.1 — DB миграции (roles/runs/events/artifacts/context_snapshots)
Коммит: `feat(db): add runs/events/artifacts/context tables`

### T2.2 — Seed ролей BA/DEV/QA
Коммит: `feat(roles): seed default BA/DEV/QA presets`

### T2.3 — Репозитории: Runs/Events/Artifacts/Context
Коммит: `feat(run): repositories for runs/events/artifacts/context`

### T2.4 — JobRunner (queue + state machine)
Коммит: `feat(run): job runner queue and state machine`

### T2.5 — MockExecutor + смоук тесты
Коммит: `test(run): add mock executor and smoke tests`

### T2.6 — IPC: run.start/cancel/list/get + events.tail + artifacts.get
Коммит: `feat(ipc): runs endpoints + polling events tail`

### T2.7 — UI: Runs tab (list + start/cancel/retry)
Коммит: `feat(ui): runs list and controls`

### T2.8 — UI: Execution Log (polling + auto-scroll)
Коммит: `feat(ui): run log viewer with polling`

### T2.9 — UI: Artifacts panel (list + viewers)
Коммит: `feat(ui): artifacts panel and viewers`

### T2.10 — OpenCodeAdapter v1 (spawn CLI) + wiring
Коммит: `feat(opencode): spawn adapter v1 wired to job runner`

### T2.11 — ContextSnapshotBuilder v1
Коммит: `feat(context): snapshot builder for runs`

### T2.12 — Security MVP: denylist + redaction + safe-mode
Коммит: `security: denylist and redaction for run logs`

---

## 10) Команды проверки
- После T2.1, T2.6, T2.10, T2.12:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Каждый тикет:
  - `pnpm dev`

---

## 11) Мини-шаблоны presets (MVP)

### BA (markdown artifact)
- User Story (As a… I want… so that…)
- Acceptance Criteria
- Edge cases
- Questions/Assumptions

### Dev (пока без изменения файлов)
- Implementation plan (files/modules)
- Risks

### QA
- Test plan
- Negative cases
- Regression checklist

---

## 12) Что пользователь должен увидеть после фазы 2
- В таске есть Runs/Chat/Artifacts
- Run (BA) генерирует story + AC → сохраняется как artifact
- Есть replay старых run’ов
- Cancel/Retry работают
