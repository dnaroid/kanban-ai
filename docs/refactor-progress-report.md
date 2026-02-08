# Статус реализации плана рефакторинга Kanban AI

Дата проверки: 2026-02-08
План: `docs/kanban-ai-refactor-plan.md`

---

## Итоговая статистика

| Статус            | Количество PR | %   |
| ----------------- | ------------- | --- |
| ✅ Полностью      | 10            | 71% |
| ⚠️ Частично       | 2             | 14% |
| ❌ Не реализовано | 2             | 14% |

---

## ✅ Полностью реализованные PR (10/14)

### **PR-00: База тестовой инфраструктуры**

- ✅ `src/tests/helpers/test-db.ts` — TestDatabase класс с create(), get(), cleanup()
- ✅ Директории: `src/tests/unit/`, `src/tests/integration/`
- ✅ Smoke тест: `db-smoke.test.ts`
- ✅ 27 тестовых файлов

**DoD выполнен:**

- ✅ есть `pnpm test` с тестами
- ✅ CI локально проходит `pnpm quality`

---

### **PR-01: withTransaction (на better-sqlite3)**

- ✅ `src/main/db/transaction.ts` — реализация `withTransaction<T>(fn: () => Result<T>): Result<T>`
- ✅ Rollback через `TransactionAbortError` при `Result.ok === false`
- ✅ Тесты: `transaction.test.ts`

**DoD выполнен:**

- ✅ транзакция откатывает изменения на `Result(false)`
- ✅ тест подтверждает откат

---

### **PR-02: buildContextSnapshot Result-ориентированный**

- ✅ `src/main/run/context-snapshot-builder.ts` использует `Result` вместо throw
- ✅ Валидация `boardId`/`columnId` (строки 43-49)
- ✅ Возвращает `Result<{id: string}>`
- ✅ Использует порты, не прямые импорты `db/*`
- ✅ Тесты: `context-snapshot-builder.test.ts`

**DoD выполнен:**

- ✅ нет `throw` из `buildContextSnapshot`
- ✅ ошибки возвращаются как `Result(false)` с предсказуемым кодом/сообщением

---

### **PR-03: StartRunUseCase атомарный**

- ✅ `src/main/app/run/commands/start-run.use-case.ts` использует `withTransaction`
- ✅ Порядок: get task → build snapshot → create run → move → update status
- ✅ `enqueueRun` вызван **ПОСЛЕ** commit (строка 86)
- ✅ `updateTaskAndEmit` возвращает `Result<void>`
- ✅ Тесты: `start-run.use-case.test.ts`

**DoD выполнен:**

- ✅ нет гонки `enqueue` до статуса `running`
- ✅ сценарий атомарен по DB
- ✅ тесты покрывают rollback и enqueue

---

### **PR-05: Composition root как фабрика**

- ✅ `src/main/di/app-container.ts` — функция `createAppContainer()` (фабрика, не singleton)
- ✅ `create-app-context.ts` — тонкий фасад (8 строк)

**DoD выполнен:**

- ✅ appContext не экспортирует `db/*` репозитории наружу
- ✅ фабричный паттерн вместо singleton экспорта

---

### **PR-06: Модульный DI**

- ✅ `src/main/di/modules/`:
  - `repositories.module.ts`
  - `services.module.ts`
  - `usecases.module.ts`
- ✅ `app-container.ts` собирает модули (~50 строк)

**DoD выполнен:**

- ✅ `create-app-context.ts` тонкий
- ✅ DI расширяется добавлением модуля, а не правками в один файл

---

### **PR-07: system_key в board_columns**

- ✅ Миграция `v017_system_key.ts`: `ALTER TABLE ... ADD COLUMN system_key`
- ✅ Backfill: устанавливает `system_key='in_progress'` по нормализованным названиям ('in progress', 'в работе', etc.)
- ✅ `resolveInProgressColumnId` использует `system_key` вместо угадывания по имени

**DoD выполнен:**

- ✅ нет строк "битой" кодировки в коде
- ✅ определение колонки детерминированное

---

### **PR-08: ContextSnapshotBuilder как сервис с портами**

- ✅ Builder использует порты: `TaskRepoPort`, `ProjectRepoPort`, `BoardRepoPort`, `ContextSnapshotRepoPort`, `RolePresetProvider`
- ✅ Никаких прямых импортов `db/*`

**DoD выполнен:**

- ✅ `buildContextSnapshot` больше не импортирует `db/*` напрямую
- ✅ builder тестируем изолированно

---

### **PR-09: Декомпозиция run-service**

- ✅ `queue-manager.ts` — управление очередью, конкурентность по provider'ам
- ✅ `run-state-machine.ts` — статусы, переходы, timestamp'ы
- ✅ `opencode-executor-sdk.ts` — интеграция OpenCode SDK
- ✅ `job-runner.ts` — исполнитель с JobRunner классом
- ✅ `run-service.ts` — фасад (541 байт, тонкий)

**DoD выполнен:**

- ✅ `run-service.ts` стал фасадом, а не комбайном
- ✅ поведение отмены/конкурентности покрыто тестами

---

### **PR-10: Split search service + пагинация**

- ✅ Отдельные сервисы:
  - `tasks-search.service.js`
  - `runs-search.service.js`
  - `artifacts-search.service.js`
- ✅ Пагинация: `limit=50, offset=0` по умолчанию
- ✅ `search-service.ts` — фасад с методами `queryTasks`, `queryRuns`, `queryArtifacts`
- ✅ Тесты: `search-service.test.ts`

**DoD выполнен:**

- ✅ каждый домен поиска отдельным сервисом
- ✅ нет "хвостов" без лимитов

---

### **PR-12: Retention + maintenance jobs**

- ✅ `src/main/maintenance/retention-maintenance.service.ts`
- ✅ Удаление старых `run_events` и `artifacts` по `created_at`
- ✅ Опции: `dryRun`, `maxDeletes` (лимит 5000 по умолчанию)
- ✅ Настройки в `app_settings` (`getRetentionEnabled/setRetentionEnabled`)
- ✅ Транзакция для удаления

**DoD выполнен:**

- ✅ база не раздувается бесконечно
- ✅ операции безопасны и ограничены по времени

---

### **PR-13: Минимальная наблюдаемость**

- ✅ Таблица `app_metrics` (v018_app_metrics.ts)
- ✅ `appMetricsRepo.record()` — запись метрик
- ✅ `QueueManager.recordQueueDepth()` — метрики `run.queue.depth`, `run.queue.running` с тегами `{providerKey}`
- ✅ Индекс на `(metric_name, created_at DESC)`

**DoD выполнен:**

- ✅ можно понять, что тормозит, и почему падают run'ы

---

## ⚠️ Частично реализованные PR (2/14)

### **PR-04: AppError и единый IPC Result**

- ✅ `AppError` интерфейс существует (`src/shared/errors/app-error.ts`)
- ✅ `ErrorCode` enum и `Result<T>` тип
- ✅ `toResultError` mapper в `map-error.ts`
- ✅ Большинство IPC handlers используют `createValidatedHandler` который возвращает `Result<T>`
- ✅ Тесты: `ipc-result.test.ts`, `map-error.test.ts`

⚠️ **ОДИН НАРУШЕНИЕ:**

```typescript
// src/main/ipc/handlers/opencode.handlers.ts:234
return z.object({ success: z.boolean() }).parse({ success: true })
// Должно быть: ok({ success: true })
```

**DoD:**

- ✅ единый формат ошибок по IPC (большинство)
- ⚠️ UI показывает понятные ошибки (проверить для одного legacy случая)
- ⚠️ есть ОДИН legacy формат (нужно исправить)

---

### **PR-11: Миграции разбиты на файлы по версиям**

- ✅ Миграции v017 (`system_key`) и v018 (`app_metrics`) — отдельные файлы
- ✅ Реестр миграций существует в `migrations.ts`
- ✅ Тесты: `migrations-registry.test.ts`

⚠️ **ОДНО НАРУШЕНИЕ:**

- Миграция v016 содержит весь `INIT_DB_SQL` — все предыдущие миграции v001-v015 в одном файле (457 строк)

**DoD:**

- ✅ миграции v017-v018 читаемы
- ⚠️ v001-v016 нужно разбить на отдельные файлы

---

## ❌ Не реализованные PR (2/14)

### **PR-14: Довести слои до консистентности**

**КРИТИЧНЫЕ ПРОБЛЕМЫ:**

#### 1. `services.module.ts` — прямые импорты из `db/*`

```typescript
// src/main/di/modules/services.module.ts
import { taskRepo } from '../../db/task-repository.js'
import { boardRepo } from '../../db/board-repository.js'
import { runEventRepo } from '../../db/run-event-repository.js'
// ... и другие прямые импорты
```

**Нарушение:** helper'ы и сервисы должны использовать порты/адаптеры, а не прямые репозитории

#### 2. `usecases.module.ts` — прямой вызов `dbManager.connect()`

```typescript
// src/main/di/modules/usecases.module.ts (строки 41-77)
const db = dbManager.connect()
// Прямые SQL запросы вместо использования репозиториев
```

**Нарушение:** use-case'ы не должны знать про подключение к DB

**DoD:**

- ❌ чистая зависимость по слоям (НАРУШЕНО)
- ❌ use-case'ы не импортируют `db/*` (НАРУШЕНО)
- ❌ проще масштабировать фичи и тестировать (НАРУШЕНО)

---

## 🚨 Критичные проблемы (блокеры)

| Проблема                                              | PR    | Влияет на                       |
| ----------------------------------------------------- | ----- | ------------------------------- |
| `services.module.ts` импортирует `db/*` напрямую      | PR-14 | Чистота слоёв, масштабируемость |
| `usecases.module.ts` использует `dbManager.connect()` | PR-14 | Чистота слоёв, тестируемость    |
| `opencode.handlers.ts:234` legacy формат              | PR-04 | Единообразие IPC контрактов     |
| INIT_DB_SQL v016 не разбит на файлы                   | PR-11 | Читаемость миграций             |

---

## 📝 Сквозные задачи

### **A) Идемпотентность StartRun**

- ⚠️ **Не проверено**: возвращается ли существующий `running/queued` run при повторном нажатии "Start"

### **B) Стандартизировать IPC контракты**

- ✅ `Result<T>` почти везде
- ⚠️ **Не проверено**: документация `docs/IPC.md` с примерами

### **C) Убрать дубли в модели данных**

- ⚠️ **Не проверено**: `tasks` vs `task_schedule`, `tags_json` vs `tags`

---

## 📋 Рекомендуемые следующие шаги

### Приоритет 1 (Критичный — блокирует финальную чистку)

1. **Исправить `services.module.ts`**: убрать прямые импорты `db/*`, использовать порты/адаптеры
2. **Исправить `usecases.module.ts`**: убрать `dbManager.connect()`, использовать инжектированные репозитории

### Приоритет 2 (Быстрый фикс)

3. **Исправить `opencode.handlers.ts:234`**: вернуть `Result<T>` вместо legacy формата

### Приоритет 3 (Рефакторинг)

4. **Разбить INIT_DB_SQL на v001-v016**: создать отдельные файлы миграций для каждой версии

### Приоритет 4 (Документация)

5. **Создать `docs/IPC.md`**: задокументировать все IPC контракты с примерами

---

## 🔍 Чек-лист для код-агента (текущее состояние)

| Проверка                                                      | Статус |
| ------------------------------------------------------------- | ------ |
| PR маленький (<400–600 строк diff)                            | ✅     |
| Добавлены/обновлены тесты на изменённую логику                | ✅     |
| `pnpm quality` проходит локально                              | ✅     |
| Нет прямых импортов `db/*` в use-case'ах                      | ❌     |
| Нет `throw` из бизнес‑логики (использовать Result)            | ✅     |
| Транзакционные UC: `enqueue`/side effects только после commit | ✅     |
| Обновлена документация (1–2 абзаца, если менялись контракты)  | ⚠️     |

---

## 🎯 Прогресс по фазам

| Фаза                                  | Статус      | %    |
| ------------------------------------- | ----------- | ---- |
| Фаза 0 — Страховка и подготовка       | ✅          | 100% |
| Фаза 1 — Корректность StartRun        | ✅          | 100% |
| Фаза 2 — Выравнивание ошибок и IPC    | ⚠️ Частично | 90%  |
| Фаза 3 — Рефакторинг composition root | ✅          | 100% |
| Фаза 4 — system_key                   | ✅          | 100% |
| Фаза 5 — ContextSnapshotBuilder DI    | ✅          | 100% |
| Фаза 6 — Декомпозиция run-service     | ✅          | 100% |
| Фаза 7 — Search service               | ✅          | 100% |
| Фаза 8 — Миграции по версиям          | ⚠️ Частично | 90%  |
| Фаза 9 — Retention и maintenance      | ✅          | 100% |
| Фаза 10 — Observability               | ✅          | 100% |
| Фаза 11 — Финальная чистка слоёв      | ❌          | 0%   |

**Общий прогресс: 71%**

---

## Приложение A — Что осталось сделать

### Файлы для изменения:

1. **src/main/di/modules/services.module.ts**:
   - Убрать прямые импорты из `db/*`
   - Использовать порты/адаптеры из `repositories.module.ts`

2. **src/main/di/modules/usecases.module.ts**:
   - Убрать `dbManager.connect()`
   - Использовать инжектированные репозитории

3. **src/main/ipc/handlers/opencode.handlers.ts:234**:
   - Заменить на `ok({ success: true })`

4. **src/main/db/migrations/v001_init.ts** ... **v016\_...ts**:
   - Разбить INIT_DB_SQL на отдельные миграции

### Тесты для добавления:

1. **services.module.test.ts**: проверить что нет прямых db/\* зависимостей
2. **usecases.module.test.ts**: проверить что используются только порты
3. **opencode.handlers.test.ts**: проверить что все методы возвращают Result<T>
4. **migrations-split.test.ts**: проверить что все миграции v001-v016 работают

---

**Конец отчета**
