# Kanban AI — Фаза 0 завершена: ревью по скриншотам + стартовый план фазы 1

## 1) Фаза 0: что уже выглядит готовым
По скриншотам видно, что каркас “живой” и визуально цельный:

- ✅ Есть навигация: **Projects / Diagnostics** (левый sidebar)
- ✅ Есть статусы инфраструктуры внизу: **OpenCode Connection: Headless Link Active**, индикатор **SQLite**
- ✅ Есть базовый экран Projects с CTA (**New Project / Get Started**) и поиском
- ✅ Есть отдельный экран **System Diagnostics** + место под **Main Process Logs**
- ✅ Есть “DEV MODE” бейдж, что удобно для dev/prod ветвления UI

Это соответствует духу фазы 0: UI-скелет + системные панели + место под наблюдаемость.

---

## 2) Gap list: что стоит поправить в фазе 0 “до идеала”
Фаза 0 может считаться завершённой, но по диагностике видно несколько незавершённых проводок данных (не критично, но лучше закрыть прямо сейчас).

### 2.1 Diagnostics показывает `undefined`
На карточках **Runtime** (Platform/Arch/Electron/Chrome/Node) и **Environment** (Version/Mode) сейчас `undefined`.

**Что сделать:**
- В main реализовать `app.getInfo()` так, чтобы он возвращал:
  - platform (`process.platform`)
  - arch (`process.arch`)
  - versions:
    - electron (`process.versions.electron`)
    - chrome (`process.versions.chrome`)
    - node (`process.versions.node`)
  - appVersion (`app.getVersion()`)
  - mode (`isDev` или env flag)
  - userDataPath (`app.getPath("userData")`)
- В renderer:
  - обработать отсутствие данных (loading state / “—” вместо `undefined`)

**Definition of Done:** никаких `undefined` в UI (кроме осмысленного loading).

---

### 2.2 Persistence продублирована и не заполнена
На экране две одинаковые карточки **PERSISTENCE**; поля Projects/Tasks/Size — `undefined`, Schema = `0`.

**Что сделать:**
- Уточнить замысел второй карточки (варианты):
  - заменить на **OpenCode / Queue / VCS / Security**,
  - либо разделить: “DB Stats” и “FTS/Indexes”.
- Добавить IPC метод `db.getStats()`:
  - projectsCount
  - tasksCount (пока может быть 0, если таблицы ещё нет)
  - dbFileSizeBytes
  - schemaVersion (последняя применённая миграция)
- Показать это в Diagnostics.

**Definition of Done:** обе карточки уникальны и заполняются реальными значениями.

---

### 2.3 Main Process Logs — панель пустая
Панель “Main Process Logs” визуально есть, но пустая.

**Что сделать (MVP-вариант):**
- В main:
  - писать логи в файл `userData/logs/main.log`
  - реализовать IPC:
    - `logs.tail({ lines: number })` — вернуть последние N строк
    - `logs.subscribe()` — стримить новые строки (опционально)
- В renderer:
  - кнопка refresh уже есть → привязать к `logs.tail(200)`
  - показать placeholder “No logs yet” если файл пуст

**Definition of Done:** хотя бы tail последних строк работает.

---

### 2.4 Projects экран: “Workspace is empty”
Это нормально для нового запуска, но важно проверить “петлю” создания проекта.

**Проверить:**
- `New Project` открывает форму и создаёт запись в SQLite
- После перезапуска проект остаётся в списке

**Если пока нет формы:**
- добавить минимальную модалку: name + repo path (optional) + create

---

## 3) Мини-патч лист (если хочешь “закрыть” фазу 0 на 100%)
Если есть желание “дополировать” фазу 0 перед фазой 1:

1) Реализовать `app.getInfo()` (убрать `undefined`)
2) Добавить `db.getStats()` и заменить/переименовать дублирующую Persistence карточку
3) Подключить tail логов в Diagnostics

Эти три пункта делают “каркас” не просто красивым, а реально диагностируемым — дальше будет сильно легче дебажить OpenCode runs и git/PR.

---

## 4) Фаза 1: Kanban MVP — стартовый план (для агента)
Цель фазы 1: получить рабочую доску с колонками и тасками + drag&drop + базовые поля и сохранение в SQLite.

### 4.1 Модель данных (миграции)
Добавить миграции:
- `boards`
- `board_columns`
- `tasks` (минимальная)
- (опционально) `task_events` (аудит)

**Минимальные поля для tasks:**
- id, project_id, board_id, column_id
- title, description_md
- type, priority, tags_json
- created_at, updated_at
- order_in_column (для сортировки)

### 4.2 IPC контракты (минимум)
- `board.getDefault(projectId)` (создаёт дефолтную доску при отсутствии)
- `board.updateColumns(boardId, columns[])`
- `task.create({ projectId, boardId, columnId, ... })`
- `task.update(taskId, patch)`
- `task.move({ taskId, toColumnId, toIndex })`
- `task.listByBoard(boardId)`

### 4.3 UI: Board
- Колонки в горизонтальном скролле
- Drag&Drop:
  - перетаскивание карточек между колонками
  - reorder внутри колонки
- Quick add:
  - “+” в колонке для быстрой таски
- Task details drawer:
  - title/description
  - tags/priority/type

### 4.4 Хранилище порядка
- При move/reorder пересчитывать `order_in_column`
- Сохранять в DB и восстанавливать при загрузке

### 4.5 Мини-Definition of Done для фазы 1
- Можно создать таску, она появляется в колонке
- Можно перетащить таску между колонками, состояние сохраняется
- После перезапуска доска и порядок не теряются
- Нет “undefined” в UI (loading/empty states корректны)

---

## 5) Рекомендованные “следующие роли” (под AI в фазе 2+)
Фаза 1 специально без AI. Но уже сейчас можно подготовить UI-места:

- Task details: вкладка **Chat** (пока пустая)
- Кнопка **Start Run** (disabled) + tooltip “Phase 2”

Это позволит начать фазу 2 без редизайна.

---

## 6) Коммит-стратегия (чтобы агент не утонул)
Для фазы 1 — короткими пачками:

1) db migrations + repositories  
2) ipc handlers + zod contracts  
3) board UI (read-only)  
4) create task  
5) drag&drop move + persist order  
6) polish (empty states, errors)

---

**Статус:** фаза 0 выглядит завершённой.  
**Рекомендация:** закрыть 3 мини-gap (info/stats/logs) и начинать фазу 1 (kanban MVP).
