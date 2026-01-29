# PHASE 1 — Kanban MVP (план для агента GLM 4.7)

> Цель фазы 1: полноценная рабочая Kanban-доска с колонками и карточками, drag&drop, базовые поля, сохранение в SQLite, стабильная загрузка/empty states.  
> Фаза 1 **без AI-run’ов** (чат/ран-кнопки можно оставить заглушками).  
> В конце пользователь должен уметь: создать проект → увидеть доску → добавить колонки/таски → перетаскивать таски → всё сохраняется и переживает перезапуск.

---

## 0) Definition of Done (фаза 1 считается завершённой, если)

1) ✅ У каждого проекта есть **Board** (создаётся автоматически при первом открытии проекта)  
2) ✅ Можно:
   - добавлять/переименовывать/удалять колонки,
   - добавлять таски (title + минимальные поля),
   - открывать таску (details drawer),
   - перетаскивать таски между колонками и менять порядок внутри колонки  
3) ✅ Порядок карточек **персистится** в SQLite и восстанавливается при перезапуске  
4) ✅ Нет `undefined` в UI: есть loading/empty/error состояния  
5) ✅ IPC типизирован, валидируется (request/response), ошибки отображаются аккуратно  
6) ✅ Есть минимальные тесты/смоук проверки: DB + move/reorder логика

---

## 1) Модель данных (SQLite) — миграции

### 1.1 Новые таблицы
Создать миграции (примерные имена: `002_boards.sql`, `003_tasks.sql` — можно одной миграцией, но лучше разделить):

#### `boards`
- `id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `name TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `board_columns`
- `id TEXT PRIMARY KEY`
- `board_id TEXT NOT NULL`
- `name TEXT NOT NULL`
- `position INTEGER NOT NULL` (порядок колонок слева направо)
- `wip_limit INTEGER NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

#### `tasks`
- `id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `board_id TEXT NOT NULL`
- `column_id TEXT NOT NULL`
- `title TEXT NOT NULL`
- `description_md TEXT NOT NULL DEFAULT ''`
- `type TEXT NOT NULL DEFAULT 'story'`  (story/bug/spike/chore)
- `priority INTEGER NOT NULL DEFAULT 2` (0..3 или 1..5 — зафиксировать)
- `tags_json TEXT NOT NULL DEFAULT '[]'`
- `order_in_column REAL NOT NULL` (см. стратегию порядка)
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

> Важно: `order_in_column` лучше сделать REAL для “между” вставок (fractional indexing), чтобы не пересчитывать все элементы на каждый перенос.  
> MVP-альтернатива: INTEGER и пересчёт всей колонки — проще, но потенциально дороже (в MVP ок).

### 1.2 Индексы
- `CREATE INDEX idx_boards_project ON boards(project_id);`
- `CREATE INDEX idx_columns_board ON board_columns(board_id, position);`
- `CREATE INDEX idx_tasks_board_col ON tasks(board_id, column_id, order_in_column);`
- (опционально) FTS по `tasks(title, description_md)` позже

---

## 2) Репозитории (main process)

### 2.1 BoardRepository
Методы:
- `getOrCreateDefaultBoard(projectId): BoardWithColumns`
  - если нет board → создать `Board` + дефолтные колонки: `Backlog`, `In Progress`, `Done`
- `listBoards(projectId)` (необязательно в MVP, но полезно)
- `updateColumns(boardId, columns[])`
  - create/update/delete, пересчитать position

### 2.2 TaskRepository
Методы:
- `listByBoard(boardId): Task[]`
- `create(task)`
- `update(taskId, patch)`
- `move(taskId, toColumnId, toIndex)` (см. раздел “порядок”)
- `delete(taskId)` (опционально в MVP)

---

## 3) IPC контракт (preload → main) + zod

### 3.1 Минимальный набор методов
- `board.getDefault({ projectId }) -> { board, columns }`
- `board.columns.update({ boardId, columns }) -> { columns }`

- `task.list({ boardId }) -> { tasks }`
- `task.create({ boardId, columnId, title, ... }) -> { task }`
- `task.update({ taskId, patch }) -> { task }`
- `task.move({ taskId, toColumnId, toIndex }) -> { task }`

### 3.2 Схемы
- У каждого метода:
  - request zod schema
  - response zod schema
- Ошибки:
  - стандартизировать: `{ code, message, details? }`
  - в UI показывать toast/inline error

---

## 4) Стратегия порядка (важно для UX)

### Вариант A (самый простой, MVP)
- `order_in_column` = INTEGER
- При move/reorder: пересчитать order в целевой колонке (0..n-1)

**Плюсы:** просто  
**Минусы:** много UPDATE при больших колонках

### Вариант B (рекомендовано)
- `order_in_column` = REAL
- При вставке на позицию `toIndex`:
  - взять соседние orders (prev, next)
  - назначить `newOrder = (prev + next)/2`
  - если prev/next отсутствуют: `prev - 1` или `next + 1`
- Периодически (если orders слишком близки) можно “нормализовать” колонку (редко)

**Плюсы:** мало UPDATE, быстрые drag&drop  
**Минусы:** чуть сложнее логика

> Рекомендация для фазы 1: Вариант A, если хочешь быстрее. Вариант B, если сразу закладываешь масштабируемость.  
> Если сомневаешься — выбирай A (GLM проще не ошибиться).

---

## 5) UI (renderer) — экраны и компоненты

### 5.1 ProjectHome → BoardScreen
При открытии проекта:
1) вызвать `board.getDefault(projectId)`
2) загрузить `task.list(boardId)`
3) показать доску

Состояния:
- loading (skeleton)
- empty tasks (показывать CTA “Create first task”)
- error (retry)

### 5.2 BoardView
- Горизонтальный скролл колонок
- Колонка:
  - title + count
  - кнопка “+ Task”
  - список карточек
- Вверху: breadcrumb `Main / Projects / <Project>`

### 5.3 Drag & Drop
Рекомендация: `dnd-kit`
- sortable внутри колонки
- droppable между колонками
- После drop:
  - optimistic update в UI
  - IPC `task.move(...)`
  - если ошибка → rollback и показать сообщение

### 5.4 TaskCard
Поля:
- title
- badges: priority, type (минимально)
- tags (пилюли)

### 5.5 TaskDetailsDrawer
Открывается по клику на карточку:
- title (editable)
- description_md (markdown editor или textarea MVP)
- type, priority, tags (editable)
- вкладки:
  - Details
  - Chat (disabled, “Phase 2”)

---

## 6) UX обязательные мелочи (не пропускать)
- Empty states:
  - “No columns yet” (если колонок нет)
  - “No tasks yet” в колонке
- Не показывать `undefined` — всегда `—` или skeleton
- Кнопки disabled на время сохранения (или spinner)
- Мини-хоткеи:
  - Enter в форме создания таски = create
  - Esc закрывает drawer

---

## 7) Тестирование (минимально, но обязательно)

### 7.1 Unit tests (main)
- `move logic` (межколоночный перенос + reorder)
- `order recalculation` (если Integer вариант)

### 7.2 Integration smoke
- применить миграции в temp db
- создать board/columns/tasks
- move task
- убедиться, что порядок корректный

---

## 8) План работ (тикеты фазы 1)

> Правило для агента: один тикет = один маленький коммит.  
> После тикета: список файлов + команды проверки + короткий отчёт.

### T1.1 — DB миграции (boards/columns/tasks)
**Выход:** миграции + индексы, применяются без ошибок.  
**Команды:** `pnpm dev`, `pnpm typecheck`.

Коммит: `feat(db): add boards, columns, tasks tables`

---

### T1.2 — BoardRepository + getOrCreateDefaultBoard
**Выход:** при открытии проекта создаётся board+колонки, возвращаются в IPC (пока без UI).  
Коммит: `feat(board): default board creation and repository`

---

### T1.3 — TaskRepository CRUD + listByBoard
**Выход:** можно создать таску в БД и прочитать список.  
Коммит: `feat(task): repository create/list/update`

---

### T1.4 — IPC: board.getDefault + task.list/create/update
**Выход:** renderer получает board/columns/tasks через IPC.  
Коммит: `feat(ipc): board + task endpoints`

---

### T1.5 — BoardScreen (read-only rendering)
**Выход:** UI показывает колонки и задачи (пока без DnD).  
Коммит: `feat(ui): board screen read-only`

---

### T1.6 — Create task UI (quick add + drawer)
**Выход:** создать таску из колонки, открыть details drawer, редактировать title/desc.  
Коммит: `feat(ui): task create + details drawer`

---

### T1.7 — Drag&Drop reorder + move
**Выход:** перетаскивание работает, обновляет UI, вызывает `task.move`.  
Коммит: `feat(ui): drag and drop tasks`

---

### T1.8 — Persist order in DB (task.move реализация)
**Выход:** порядок сохраняется, после перезапуска не меняется.  
Коммит: `feat(task): persist move/reorder`

---

### T1.9 — Columns management (add/rename/delete) — минимально
**Выход:** можно управлять колонками, обновление хранится в DB.  
Коммит: `feat(columns): manage board columns`

---

### T1.10 — Polishing: empty/loading/error + tests
**Выход:** чистые состояния, нет `undefined`, минимальные тесты проходят.  
Коммит: `chore: polish board states + add tests`

---

## 9) Команды проверки (после ключевых тикетов)
- После T1.1, T1.4, T1.7, T1.10:
  - `pnpm typecheck`
  - `pnpm build`
- Каждый тикет:
  - `pnpm dev`

---

## 10) Выходные артефакты (что должно появиться в коде)
- `src/main/db/migrations/002_*.sql` (и далее)
- `src/main/db/repositories/BoardRepository.ts`
- `src/main/db/repositories/TaskRepository.ts`
- `src/main/ipc/boardHandlers.ts`, `taskHandlers.ts`
- `src/preload/ipc-types.ts` обновлённые типы + `window.api.board/task`
- `src/renderer/screens/BoardScreen.tsx`
- `src/renderer/components/BoardView/*`, `TaskCard`, `TaskDrawer`

---

## 11) Частые баги и как их избежать
- **DnD ломает порядок**: держать “источник истины” в state и после drop выполнять одну функцию move.
- **Дублирование запросов**: не вызывать `board.getDefault` дважды при re-render; использовать `useEffect` + guard.
- **Гонки optimistic update**: если запрос упал — rollback.
- **Сломанная миграция**: обязательно идемпотентность, версии фиксировать.

---

## 12) Что НЕ делать в фазе 1
- Runs/Jobs/AI агенты
- Git/PR
- Зависимости между тасками
- Timeline/Gantt
- Плагины

Это будет в фазах 2–4.

---

## 13) Результат фазы 1 (как пользователь проверяет)
1) Открыть проект  
2) Видеть доску с колонками  
3) Создать 3 таски  
4) Перетащить их по колонкам и поменять порядок  
5) Перезапустить приложение — убедиться, что всё сохранилось

---

## 14) Шаблон “инструкции агенту” (вставить в prompt)
- Работай по тикетам T1.1–T1.10.  
- Не делай изменений вне текущего тикета.  
- После тикета: перечисли изменённые файлы, выполни проверки и сделай коммит.  
- В UI никогда не показывай `undefined`, используй loading/empty states.
