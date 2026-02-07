# Kanban AI — подробный план полного рефакторинга (для код‑агента)

Дата: 2026‑02‑07  
Репозиторий: `kanban-ai` (Electron + React + SQLite/better-sqlite3)  
Цель документа: дать пошаговый, проверяемый план рефакторинга **без потери функциональности** и с постепенным снижением риска регрессий.

---

## TL;DR (что болит больше всего)
1) **StartRun неатомарен**: `enqueue` выполняется раньше move/status, `buildContextSnapshot` кидает исключения, возможны “висячие snapshot’ы”.  
2) **Composition root (`create-app-context.ts`) смешивает слои**: helper’ы ходят напрямую в `db/*` репозитории, DI — singleton, связность высокая.  
3) **Нет транзакционных границ и UoW**, нет единых ошибок IPC, мало тестов.

---

## Принципы рефакторинга
- **Инкрементально**: маленькие PR, каждый зелёный, без “Big Bang”.
- **Сначала корректность → потом архитектура → потом улучшения**.
- Любое изменение IPC контрактов — отдельный PR с миграцией UI.
- Новые абстракции вводить только там, где они снижают риск: `Result`, транзакции, DI-модули, порты.

---

## Определения (единые термины)
- **Result**: `ok<T>(data)` / `err(error)` или существующий у вас формат.
- **AppError**: унифицированная ошибка с `code`, `message`, `details`, `cause?`.
- **UoW (Unit of Work)**: единая транзакционная граница на базе `better-sqlite3 db.transaction`.
- **Composition root**: место, где создаются зависимости (DI). Должно быть “тонким”.

---

## Целевое состояние (Target Architecture)
### Main (Electron)
- `src/main/di/` — модульная сборка зависимостей (use-cases, repos, services).
- `src/main/app/` — use-case’ы, **не знают** про `db/*` напрямую.
- `src/main/domain/` — политики/инварианты (например, перемещение задач).
- `src/main/infra/` — адаптеры и интеграции.
- `src/main/db/` — конкретная реализация SQLite + миграции по файлам.
- `src/main/shared/` — общие утилиты main процесса (tx, logger, etc).

### IPC
- Все IPC методы возвращают единый `Result` с `AppError`.
- В `renderer` один общий обработчик ошибок.

### DB/Consistency
- `StartRun` и подобные UC выполняют DB-часть в **транзакции**, `enqueue` — **после commit**.
- `buildContextSnapshot` не кидает исключения, а возвращает `Result`.
- Колонки доски имеют `system_key/kind` (например `in_progress`) вместо угадывания по имени.

### Тесты
- Unit тесты на критичные use-case’ы.
- Integration тесты на SQLite (миграции, FTS, транзакции).

---

## План работ по фазам (PR‑ами)

> В каждом PR:  
> ✅ `pnpm quality` зелёный  
> ✅ линтер/формат пройдены  
> ✅ добавлены/обновлены тесты, если изменение затрагивает бизнес‑логику  
> ✅ changelog заметка (кратко)

---

# Фаза 0 — Страховка и подготовка

## PR‑00: База тестовой инфраструктуры + утилиты
**Цель:** быстро получить возможность писать unit/integration тесты, не меняя архитектуру.

**Шаги:**
1. Создать `src/tests/` структуру:
   - `src/tests/unit/`
   - `src/tests/integration/`
   - `src/tests/helpers/`
2. Добавить helper для временной SQLite:
   - создание temp файла
   - инициализация миграций
   - очистка
3. Добавить smoke тест, который:
   - создаёт DB
   - выполняет минимальный CRUD (task/project)
   - проверяет, что migrations применяются.

**DoD:**
- есть `pnpm test` с хотя бы 1–2 тестами
- CI локально проходит `pnpm quality`

**Риски:** низкие.

---

# Фаза 1 — Корректность StartRun и транзакции

## PR‑01: Ввести `withTransaction` (на better-sqlite3)
**Почему:** у вас `dbManager.connect()` кеширует **одно** соединение. Значит `db.transaction(...)` корректно накрывает цепочки вызовов репозиториев.

**Шаги:**
1. Создать `src/main/db/transaction.ts`:
   - `withTransaction<T>(fn: () => Result<T>): Result<T>`
   - rollback на `Result.ok === false` через контролируемое исключение (`TxAbort`)
2. Покрыть unit тестом:
   - внутри транзакции сделать insert snapshot, затем вернуть `err`
   - убедиться, что записи нет (rollback).
   - (Если удобнее — тест на любой таблице.)

**DoD:**
- транзакция откатывает изменения на `Result(false)`
- тест подтверждает откат

**Риски:** средние (если какие-то репозитории используют отдельный connection — проверить; по вашему `connect()` — один).

---

## PR‑02: Сделать `buildContextSnapshot` Result‑ориентированным и безопасным
**Проблема:** сейчас `buildContextSnapshot` кидает `throw`, и может создавать “висячие snapshot’ы”.

**Шаги:**
1. Обновить `src/main/run/context-snapshot-builder.ts`:
   - заменить `throw` на `Result` (через `toResultError`)
   - добавить валидации `boardId`/`columnId` (они nullable по схеме)
2. Обновить места вызова:
   - `StartRunUseCase` должен принимать `buildSnapshot` как `(...) => Result<{id:string}>`
3. Добавить unit тест:
   - отсутствует task → возвращается `Result(false)` и ничего не записано в snapshots

**DoD:**
- нет `throw` из `buildContextSnapshot`
- ошибки возвращаются как `Result(false)` с предсказуемым кодом/сообщением

**Риски:** низкие/средние (затронет типы и несколько импортов).

---

## PR‑03: Исправить `StartRunUseCase`: порядок шагов + транзакция + enqueue после commit
**Проблема:** `enqueue` раньше move/status; часть ошибок теряется (`updateTaskAndEmit: void`).

**Шаги:**
1. Изменить `StartRunUseCase`:
   - DB‑часть обернуть в `withTransaction`
   - порядок: `get task → build snapshot → create run → move → update status`
   - `enqueueRun` выполнить **после** успешной транзакции
2. Поменять сигнатуру `updateTaskAndEmit` на `(...) => Result<void>`
3. В `create-app-context.ts`:
   - инжектировать `withTransaction`
   - привести `updateTaskAndEmit` к Result (не глотать ошибки)
4. Тесты:
   - если updateTask возвращает `err`, то `enqueueRun` **не вызван**, а snapshot/run не созданы (rollback).
   - если всё ok → enqueue вызван 1 раз после commit (можно проверить через mock).

**DoD:**
- нет гонки `enqueue` до статуса `running`
- сценарий атомарен по DB
- тесты покрывают rollback и enqueue

**Риски:** средние (затрагивает wiring + типы).

---

# Фаза 2 — Выравнивание ошибок и Result во всём IPC

## PR‑04: Ввести каталог ошибок (AppError) и единый IPC Result
**Проблема:** “зоопарк” ответов `{ok}`, `boolean`, DTO; нет единых кодов.

**Шаги:**
1. Создать `src/shared/errors/`:
   - `AppError` (code, message, details?, cause?)
   - ошибки: `NotFound`, `Validation`, `Conflict`, `DbError`, `Internal`
2. Обновить `toResultError`:
   - маппить DB/SQLite ошибки в `DbError`/`Conflict` (например unique constraint)
3. Обновить IPC handlers:
   - всегда возвращать `Result<T>`
4. Обновить renderer:
   - один helper `unwrapOrToast(result)` / `handleIpcError(error)`
5. Документация:
   - описать коды ошибок и правила.

**DoD:**
- единый формат ошибок по IPC
- UI показывает понятные ошибки
- не осталось `boolean`/`{ok}` без `Result` в публичных IPC методах (или помечено как legacy)

**Риски:** средние/высокие (затрагивает много интерфейсов). Делать постепенно: начать с `run/*`, затем `task/*`, затем остальное.

---

# Фаза 3 — Рефакторинг composition root и DI

## PR‑05: Превратить `create-app-context.ts` в фабрику + убрать прямые `db/*` из helper’ов
**Проблема:** helper’ы ходят в `taskRepo/boardRepo` напрямую; singleton wiring.

**Шаги:**
1. Заменить `export const appContext = ...` на:
   - `export function createAppContext(): AppContext`
2. Удалить из appContext экспорт “сырых” db реп:
   - `taskRepo`, `boardRepo`, и т.п. (оставить только через порты/адаптеры)
3. Helper’ы `emitTaskUpdated`, `resolveInProgressColumnId`:
   - переписать, чтобы использовали **порты**/адаптеры (или отдельный `BoardRepoPort`)
4. Обновить места импорта в IPC handlers (они должны вызывать `createAppContext()` один раз при старте).

**DoD:**
- appContext не экспортирует `db/*` репозитории наружу
- больше нет смешения слоёв в DI

**Риски:** средние (импорт/инициализация).

---

## PR‑06: Ввести модульный DI (`src/main/di/`)
**Цель:** разнести wiring по модулям: use-cases / repos / services.

**Структура:**
- `src/main/di/modules/repositories.module.ts`
- `src/main/di/modules/services.module.ts`
- `src/main/di/modules/usecases.module.ts`
- `src/main/di/app-container.ts` (или `createContainer()`)

**Шаги:**
1. Перенести создание адаптеров/репозиториев/сервисов в модули
2. Composition root = 10–30 строк: собрать модули, вернуть контекст
3. Тест: контейнер создаётся, базовые методы доступны.

**DoD:**
- `create-app-context.ts` тонкий
- DI расширяется добавлением модуля, а не правками в 1 гигантском файле

**Риски:** средние.

---

# Фаза 4 — Устранить “угадывание In Progress” и убрать битую кодировку

## PR‑07: Добавить `system_key` (или `kind`) в `board_columns`
**Проблема:** `resolveInProgressColumnId` угадывает по имени, есть мусорная строка кодировки.

**Шаги:**
1. Миграция:
   - `ALTER TABLE board_columns ADD COLUMN system_key TEXT NOT NULL DEFAULT ''`
2. Backfill:
   - для существующих колонок попробовать установить `system_key='in_progress'` по нормализованному имени (один раз в миграции)
   - остальные оставить `''`
3. Обновить `resolveInProgressColumnId`:
   - сначала искать `system_key='in_progress'`
   - fallback: orderIndex==1 (как сейчас)
4. UI (если есть настройка колонок):
   - добавить возможность пометить колонку как “In Progress” (установить system_key)

**DoD:**
- нет строк “битой” кодировки в коде
- определение колонки детерминированное

**Риски:** средние (миграции/данные).

---

# Фаза 5 — Привести snapshot builder к нормальному DI и убрать прямые `db/*` зависимости

## PR‑08: `ContextSnapshotBuilder` как сервис с портами
**Проблема:** builder сейчас тянет `taskRepo/projectRepo/boardRepo/contextSnapshotRepo` глобально.

**Шаги:**
1. Создать порты:
   - `ProjectRepoPort.getById`
   - `BoardRepoPort.getColumns`
   - `ContextSnapshotRepoPort.create`
2. Создать `ContextSnapshotBuilder` (класс) и инжектить порты + `RolePresetProvider`
3. Обновить `StartRunUseCase` и все места, где нужен builder
4. Тесты:
   - builder не трогает глобальные singletons
   - builder возвращает `Result(false)` на missing data

**DoD:**
- `buildContextSnapshot` больше не импортирует `db/*` напрямую
- builder тестируем изолированно

**Риски:** средние.

---

# Фаза 6 — Декомпозиция `run-service` (очередь/состояния/исполнитель)

## PR‑09: Разделить run‑подсистему на компоненты
**Цель:** снизить связность и сделать поведение предсказуемым.

**Разделение (минимум):**
- `QueueManager` — enqueue/dequeue, concurrency, fairness
- `RunStateMachine` — статусы, timestamp’ы, разрешённые переходы
- `RunExecutor` — интеграция OpenCode SDK, обработка событий
- `RunEventWriter` — запись `run_events`/`artifacts`
- `Cancellation` — токены отмены, cleanup

**Шаги:**
1. Вынести из `run-service.ts` логику очереди в `queue-manager.ts`
2. Вынести статусы/переходы в `run-state.ts`
3. Вынести executor в `opencode-run-executor.ts`
4. Обновить `runService` как фасад для IPC совместимости
5. Тесты:
   - unit: state transitions
   - unit: queue concurrency (мок executor)

**DoD:**
- `run-service.ts` стал фасадом (координатором), а не комбайном
- поведение отмены/конкурентности покрыто тестами

**Риски:** средние/высокие (много поведения).

---

# Фаза 7 — Search service: разделить и добавить пагинацию

## PR‑10: Split `search-service.ts` + pagination
**Шаги:**
1. Создать:
   - `tasks-search.service.ts`
   - `runs-search.service.ts`
   - `artifacts-search.service.ts`
2. Добавить `limit/offset` (или cursor) во входные параметры IPC `search:query`
3. Индексы/оптимизация:
   - проверить `EXPLAIN QUERY PLAN` на основных запросах
4. Тесты: basic search returns, pagination stable.

**DoD:**
- каждый домен поиска отдельным сервисом
- нет “хвостов” без лимитов (особенно `run_events` tail)

**Риски:** низкие/средние.

---

# Фаза 8 — Миграции: один файл → по версиям

## PR‑11: Разнести миграции на файлы
**Шаги:**
1. `src/main/db/migrations/`:
   - `v001_init.ts`, `v002_...ts` … `v016_...ts`
2. `migrations.ts` превращается в “реестр”:
   - массив {version, up(db)}
3. Тест:
   - прогон миграций на пустой базе до последней версии
   - прогон миграции на “старой” базе (если есть fixture)

**DoD:**
- миграции читаемы, легко ревьюить и точечно фиксить

**Риски:** средние (аккуратность версий).

---

# Фаза 9 — Ретенция данных и обслуживание БД

## PR‑12: Retention + maintenance jobs (run_events/artifacts/FTS)
**Шаги:**
1. Ввести настройки ретенции (например, `app_settings`):
   - хранить N дней/месяцев
2. Добавить сервис обслуживания:
   - удалить старые `run_events`, `artifacts` (по `created_at`)
   - пересобрать/оптимизировать FTS (в разумных пределах)
   - опционально `VACUUM` по кнопке или на idle
3. UI/Settings:
   - переключатель “Auto cleanup”
4. Тест: удаление старых записей, FTS остаётся консистентным (через триггеры).

**DoD:**
- база не раздувается бесконечно
- операции безопасны и ограничены по времени

**Риски:** средние.

---

# Фаза 10 — Observability: метрики/трейсинг/репортинг ошибок

## PR‑13: Минимальная наблюдаемость без внешней инфраструктуры
**Шаги:**
1. Метрики в лог или таблицу `app_metrics`:
   - latency IPC handlers
   - queue depth
   - run success/fail counts
2. Трейсинг (минимум):
   - correlation id на runId
   - span’ы в StartRun/Executor
3. Error reporting (локально):
   - запись важных ошибок в `diagnostics` лог + возможность экспортировать

**DoD:**
- можно понять, что тормозит, и почему падают run’ы

**Риски:** низкие/средние.

---

# Фаза 11 — Финальная чистка слоёв и договорённости

## PR‑14: Довести слои до консистентности
**Цели:**
- use-case’ы не импортируют `db/*`
- IPC handlers не знают реализаций, только вызывают use-case’ы
- все “внешние эффекты” (enqueue, запуск сервера, файловые операции) находятся в `infra/services`

**DoD:**
- чистая зависимость по слоям
- проще масштабировать фичи и тестировать

---

## Сквозные задачи (делаются постепенно)
### A) Идемпотентность StartRun
- если user повторно нажал “Start”:
  - либо возвращать существующий `running/queued` run
  - либо создавать новый, но строго по правилам (желательно первое)
- добавить уникальные ограничения/проверки на “active run per task” (если нужно).

### B) Стандартизировать IPC контракты
- `Result<T>` везде
- единые error codes
- документация в `docs/IPC.md` с примерами.

### C) Убрать дубли в модели данных (план на будущее)
- решить источник истины: `tasks` vs `task_schedule`, `tags_json` vs `tags`.
- сделать отдельную фазу миграций данных + адаптация UI.

---

## Рекомендованный порядок выполнения (строго)
1) PR‑00 (tests base)  
2) PR‑01 (withTransaction)  
3) PR‑02 (buildContextSnapshot → Result)  
4) PR‑03 (StartRun атомарный + enqueue после commit)  
5) PR‑04 (errors + IPC Result) — по модулям  
6) PR‑05–06 (DI фабрика + модули)  
7) PR‑07 (board_columns.system_key)  
8) PR‑08 (ContextSnapshotBuilder через порты)  
9) PR‑09 (run-service декомпозиция)  
10) PR‑10 (search split + pagination)  
11) PR‑11 (migrations split)  
12) PR‑12 (retention)  
13) PR‑13 (observability)  
14) PR‑14 (финальная чистка)

---

## Чек‑лист для код‑агента (на каждый PR)
- [ ] PR маленький (желательно < 400–600 строк diff без автогенерации)
- [ ] Добавлены/обновлены тесты на изменённую логику
- [ ] `pnpm quality` проходит локально
- [ ] Нет прямых импортов `db/*` в use-case’ах (если это цель PR)
- [ ] Нет `throw` из бизнес‑логики (использовать Result)
- [ ] Транзакционные UC: `enqueue`/side effects только после commit
- [ ] Обновлена документация (1–2 абзаца, если менялись контракты)

---

## Приложение A — конкретные правки, которые уже выявлены
1) `StartRunUseCase`:
   - перенести `enqueueRun` в конец
   - сделать шаги Result-aware
   - обернуть DB изменения в транзакцию
2) `buildContextSnapshot`:
   - убрать исключения
   - валидировать `boardId` nullable
3) `create-app-context.ts`:
   - убрать прямой доступ к `taskRepo/boardRepo`
   - сделать фабрику контекста
4) `resolveInProgressColumnId`:
   - убрать угадывание по названию и мусорную строку кодировки
   - заменить на `system_key`/настройку

---

## Приложение B — быстрые тесты “на регрессии”
- StartRun rollback: snapshot не создаётся при ошибке в move/update
- StartRun enqueue: enqueue вызывается только после commit
- SnapshotBuilder: missing task/project → Result(false)
- Transaction util: откат на Result(false)

---

**Конец документа**
