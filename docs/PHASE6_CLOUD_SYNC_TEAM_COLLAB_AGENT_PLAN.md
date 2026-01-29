# PHASE 6 — Team Collaboration + Cloud Sync (offline‑first) + Access Control (план для агента GLM 4.7)

> Цель фазы 6: сделать приложение пригодным для команды: **аккаунты, рабочие пространства, шаринг проектов, синхронизация между устройствами, совместная работа в реальном времени** (или near‑real‑time), аудит/история и базовая эксплуатация (деплой/мониторинг).  
> Сохраняем философию: клиент остаётся **offline‑first** (SQLite локально), сервер — только **синхронизация/координация**.

---

## 0) Definition of Done

Фаза 6 завершена, если:

1) ✅ Пользователь может **войти** (email+magic link / OAuth) и создать **Workspace**  
2) ✅ Проект можно “подключить к облаку” и **расшарить** другим пользователям (roles: Owner/Admin/Member/Viewer)  
3) ✅ Два клиента видят **одни и те же данные**:
   - проекты/борды/таски/раны/артефакты/релизы
   - изменения на одном устройстве появляются на другом (polling или websocket)  
4) ✅ Оффлайн режим работает:
   - можно редактировать без сети
   - после восстановления сети изменения синхронизируются  
5) ✅ Конфликты синхронизации обрабатываются предсказуемо:
   - детерминированная стратегия (LWW/field‑merge)
   - UI показывает “Conflict” и позволяет выбрать версию/слить  
6) ✅ Есть **Audit log** (кто/что/когда изменил)  
7) ✅ Security baseline:
   - auth tokens в SecretStore
   - TLS
   - server‑side RBAC
   - rate limits / abuse protection
8) ✅ Есть минимальная эксплуатация:
   - docker compose/prod deployment guide
   - health checks + metrics
   - backups БД  
9) ✅ Тесты:
   - sync engine (delta upload/download)
   - conflict merge logic
   - permission checks

---

## 1) Scope / Non‑scope

### Входит
- Backend “Sync Service” + API
- Auth + Workspace + RBAC
- Offline‑first sync (delta events)
- Near‑real‑time updates (WebSocket/SSE) или polling (MVP)
- Audit log
- Multi‑device consistency
- Ops: deploy, migrations, backups, observability

### Не входит (будущие фазы)
- Полноценный live‑cursor/Google‑Docs‑style editing (CRDT для markdown) — позже
- Публичные boards
- Marketplace плагинов (пока локальные/enterprise)

---

## 2) Ключевые решения (зафиксировать в `docs/decisions/PHASE6.md`)

1) **Offline‑first**: источник истины на клиенте — SQLite + локальный change‑log  
2) Sync модель: **delta‑sync через event log** (change events), а не “полный дамп”  
3) Конфликты: MVP = **LWW per field** + ручной UI для спорных случаев  
4) Near‑real‑time: MVP = **WebSocket** (или SSE). Если сложно — polling каждые 5–10 сек  
5) Серверное хранилище: **PostgreSQL**  
6) Идентификаторы: **ULID/UUIDv7** (упорядочиваемые по времени)  
7) Безопасность: RBAC строго на сервере, токены — только в SecretStore, все запросы через TLS  
8) Артефакты (крупные): вынести в объектное хранилище (S3‑совместимое) или оставить в Postgres до лимита (MVP)

---

## 3) Архитектура (высокоуровнево)

### 3.1 Компоненты
- **Electron Client**
  - Local DB (SQLite)
  - Sync Engine (uplink/downlink)
  - Conflict Resolver UI
- **Sync Service (Backend)**
  - REST API (CRUD + sync endpoints)
  - Realtime channel (WS/SSE)
  - RBAC + audit
  - Storage: Postgres (+ optional S3)
- **Identity/Auth**
  - Magic link / OAuth (Google/GitHub) / email+password (если надо)
  - Token: short‑lived access + refresh

### 3.2 Поток sync (MVP)
- Клиент пишет изменения в локальную БД + записывает **change events**
- При sync:
  1) `POST /sync/push` — отправить batch событий
  2) `GET /sync/pull?since=<cursor>` — получить новые события от сервера
  3) применить события локально
- Realtime:
  - сервер пушит “new cursor available” → клиент делает pull

---

## 4) DB на клиенте: change log

### 4.1 Новые таблицы (SQLite)
#### `local_changes`
- `id TEXT PRIMARY KEY` (ulid)
- `entity_type TEXT NOT NULL` (task/run/artifact/…)
- `entity_id TEXT NOT NULL`
- `op TEXT NOT NULL` (`insert|update|delete`)
- `patch_json TEXT NOT NULL` (минимальный patch, например JSON Patch или partial object)
- `base_rev INTEGER NOT NULL` (ревизия сущности на момент изменения)
- `device_id TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `synced_at TEXT NULL`

#### `sync_state`
- `key TEXT PRIMARY KEY`
- `value TEXT NOT NULL` (cursor, deviceId, lastPullTs, …)

### 4.2 Ревизии сущностей
Добавить поля ревизий в основные таблицы (tasks/runs/…):
- `rev INTEGER NOT NULL DEFAULT 0`
- `updated_by TEXT NOT NULL DEFAULT ''` (userId)
- `updated_at TEXT NOT NULL`

> Любое локальное изменение: инкремент rev и запись в local_changes.

---

## 5) Backend: модель данных (Postgres)

### 5.1 Multi‑tenant
#### `users`
- id, email, name, created_at

#### `workspaces`
- id, name, owner_user_id, created_at

#### `workspace_members`
- workspace_id, user_id, role (`owner|admin|member|viewer`), created_at

#### `projects_cloud`
- id, workspace_id, name, created_at, updated_at

> Вариант: хранить “project” сущности общими (как в клиенте), но обязательно с `workspace_id`.

### 5.2 Sync event log
#### `sync_events`
- `id BIGSERIAL` (или ulid)
- `workspace_id`
- `project_id`
- `entity_type`
- `entity_id`
- `op`
- `patch_json`
- `server_ts`
- `device_id`
- `user_id`
- `base_rev`
- `result_rev` (какой rev стал после применения)
- индексы: `(workspace_id, project_id, id)`, `(entity_type, entity_id)`

### 5.3 Materialized state (опционально, рекомендовано)
Чтобы не восстанавливать весь проект из event‑log каждый раз:
- хранить “текущие таблицы” (tasks/runs/… в Postgres) и применять patch на сервере тоже
- event log остаётся для sync и аудита

### 5.4 Audit log
Можно использовать `sync_events` как audit, но лучше выделить:
- `audit_log(id, workspace_id, user_id, action, target, ts, meta_json)`

---

## 6) Sync API (контракты)

### 6.1 Auth
- `POST /auth/login` (magic link / oauth exchange)
- `POST /auth/refresh`
- `POST /auth/logout`

### 6.2 Workspaces
- `POST /workspaces`
- `GET /workspaces`
- `POST /workspaces/{id}/invite`
- `POST /workspaces/{id}/members/{userId}` (role change/remove)

### 6.3 Projects
- `POST /projects`
- `GET /projects`
- `GET /projects/{id}`

### 6.4 Sync
#### Push
`POST /sync/push`
```json
{
  "workspaceId": "...",
  "projectId": "...",
  "deviceId": "...",
  "clientCursor": "123",
  "changes": [
    { "id":"...", "entityType":"task", "entityId":"...", "op":"update", "patch":{...}, "baseRev":12, "ts":"..." }
  ]
}
```
Response:
```json
{
  "accepted": [{ "changeId":"...", "resultRev":13 }],
  "rejected": [{ "changeId":"...", "reason":"conflict", "serverRev":15, "serverState":{...} }],
  "newCursor": "456"
}
```

#### Pull
`GET /sync/pull?workspaceId=...&projectId=...&since=456&limit=500`
Response:
```json
{ "events":[ ... ], "nextCursor":"789" }
```

### 6.5 Realtime
- `WS /realtime` → события: `{ type:"project_updated", projectId, cursor }`

---

## 7) Conflict strategy (MVP)

### 7.1 Базовая схема
- Сервер применяет change только если `baseRev == currentRev`  
- Если `baseRev < currentRev` → conflict:
  - сервер возвращает `serverState` (текущую версию)
  - клиент помечает конфликт и предлагает варианты:
    - keep mine (форс‑patch поверх serverState)
    - keep theirs
    - manual merge (UI)

### 7.2 Field‑merge (улучшение)
Для некоторых сущностей можно делать автоматический merge:
- tags: union
- description_md: LWW (пока)
- status/column: LWW
- title: LWW

> CRDT для markdown — не в MVP.

---

## 8) Client: Sync Engine v1

### 8.1 Требования
- фоновые sync‑циклы:
  - push pending changes
  - pull new events
- backoff при ошибках
- offline detection
- “Sync indicator” в UI (ok/working/error)

### 8.2 Алгоритм (псевдо)
1) если offline → stop  
2) push batch (<=N изменений)  
3) отметить accepted как synced  
4) для rejected:
   - записать `conflicts` таблицу
   - показать badge/notification
5) pull events since cursor:
   - применить транзакционно
   - обновить cursor  
6) повторить по таймеру (или по realtime сигналу)

### 8.3 Новая таблица конфликтов (SQLite)
#### `sync_conflicts`
- `id TEXT PRIMARY KEY`
- `entity_type`
- `entity_id`
- `local_change_id`
- `server_rev`
- `server_state_json`
- `status` (`open|resolved|ignored`)
- `created_at`, `updated_at`

---

## 9) UI изменения

### 9.1 Auth / Workspace
- Login screen
- Workspace picker
- Members/Invites screen

### 9.2 Project “Cloud connect”
- toggle: Local only / Cloud synced
- показать:
  - last sync
  - device id
  - sync status

### 9.3 Conflict Center
- список конфликтов
- diff viewer (local vs server)
- кнопки Resolve:
  - Keep Mine (force update)
  - Keep Theirs
  - Manual (edit + save)

### 9.4 Presence (опционально)
- “X users online in project”
- “last active” (без курсоров)

---

## 10) Security & Ops

### 10.1 Security baseline
- JWT access tokens (short TTL) + refresh tokens
- server RBAC checks на каждый endpoint
- rate limiting per IP/user
- audit trail
- secrets in SecretStore на клиенте

### 10.2 Deploy
- Docker compose:
  - api
  - postgres
  - (optional) redis for sessions/rate limit
  - (optional) minio (S3)
- Migrations (prisma/knex/sql) — выбрать и зафиксировать

### 10.3 Observability
- `/healthz`, `/readyz`
- structured logs
- metrics (prometheus) минимум: request count/latency, sync push/pull sizes, auth failures
- backups postgres (daily)

---

## 11) Тестирование (минимум)

### Unit (backend)
- permission matrix (workspace roles)
- conflict detection (baseRev mismatch)
- patch apply

### Unit (client)
- queue push batching
- pull apply transaction
- conflict creation/resolution

### Integration
- 2 клиента (mock) → edits offline → reconcile → consistent end state
- realtime notification triggers pull

---

## 12) План работ (тикеты фазы 6)

> Правило: один тикет = один небольшой коммит.  
> После тикета: список файлов + команды проверки + краткий итог.

### T6.1 — Decisions + skeleton backend (Node) + Postgres + migrations scaffold
Коммит: `chore(phase6): backend skeleton + migrations scaffold`

### T6.2 — Auth v1 (magic link / oauth stub) + токены
Коммит: `feat(auth): login/refresh/logout`

### T6.3 — Workspaces + RBAC (members, roles, invites)
Коммит: `feat(workspaces): multi-tenant rbac`

### T6.4 — Projects cloud entities + connect flow (server)
Коммит: `feat(projects): cloud projects endpoints`

### T6.5 — Client DB: local_changes + sync_state + deviceId
Коммит: `feat(sync): local change log and state`

### T6.6 — Sync push endpoint (server) + apply patches + conflict response
Коммит: `feat(sync): push endpoint with conflict detection`

### T6.7 — Sync pull endpoint (server) + cursor paging
Коммит: `feat(sync): pull endpoint with cursor paging`

### T6.8 — Client Sync Engine v1 (polling push/pull + backoff)
Коммит: `feat(sync): client engine v1`

### T6.9 — Conflict Center UI + resolve actions (keep mine/theirs)
Коммит: `feat(ui): conflict center and resolution`

### T6.10 — Realtime notifications (WS/SSE) + client trigger pull
Коммит: `feat(realtime): project update notifications`

### T6.11 — Audit log + admin screens (minimal)
Коммит: `feat(audit): audit log and viewer`

### T6.12 — Ops: healthchecks, metrics, backups guide, docker-compose prod
Коммит: `ops: health/metrics/deploy guide`

### T6.13 — Tests: sync engine + permissions + conflicts (integration)
Коммит: `test: phase6 sync and rbac coverage`

---

## 13) Команды проверки
- Backend:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm dev:api`
- Client:
  - `pnpm dev`
  - `pnpm build`
- После T6.6, T6.8, T6.10, T6.13 — гонять весь набор.

---

## 14) UX проверка фазы 6 (user acceptance)
1) Логин → создать workspace → пригласить второго пользователя  
2) Подключить проект к облаку  
3) На устройстве A создать/переместить таску → на устройстве B увидеть изменения  
4) На A уйти оффлайн, изменить title; на B онлайн изменить title иначе → получить конфликт → решить в UI  
5) Проверить audit log: кто делал изменения

---

## 15) Инструкции агенту (вставить в prompt)
- Реализуй фазу 6 по тикетам T6.1–T6.13 маленькими коммитами.  
- Сначала RBAC+sync endpoints, потом клиентский sync engine, потом realtime.  
- Конфликты обрабатывай детерминированно (baseRev mismatch → conflict).  
- Все токены храни только в SecretStore.  
- Любые изменения БД — через миграции.
