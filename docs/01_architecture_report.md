# Kanban AI — отчет по архитектуре

_Дата: 2026-02-07_

Документ основан на текущем описании архитектуры в `ARCHITECTURE.md` и отражает рекомендации по улучшению поддерживаемости, масштабируемости и UX (в частности — снижения фризов и упрощения бизнес-логики).

---

## 1) Краткое резюме

### Что уже сделано хорошо
- Четкое разделение процессов Electron: **main / preload / renderer**.
- Типобезопасный IPC с Zod-валидацией (контракт + валидация).
- Data Access Layer: репозитории поверх SQLite + отдельный `DatabaseManager`.
- Наличие подсистем: search/analytics/run/plugins/opencode — видно намерение к модульности.
- Отдельные экраны в renderer (Projects/Board/Timeline/Analytics/Settings/Diagnostics).

### Главные риски (по приоритету)
1. **Синхронная работа с SQLite в main** (через `better-sqlite3`) может приводить к фризам UI/IPC при росте объема данных и при тяжелых запросах (FTS, аналитика, массовые операции).
2. **Слишком “умный” слой IPC handlers**: бизнес-правила неизбежно расползутся по обработчикам → сложнее тестировать и менять поведение.
3. **Разные форматы ошибок/ответов по IPC** → в renderer появляется “зоопарк” обработок.
4. Дублирование/размытость границ в данных (например, schedule/description в нескольких местах) усложняет миграции и отчетность.
5. Событийные каналы (`run:events:tail` и т.п.) не унифицированы → сложно поддерживать консистентность UI.

---

## 2) Текущая архитектура (как зафиксировано в ARCHITECTURE.md)

### Технологии
- **Frontend**: React 19.2.4 + TypeScript
- **Desktop**: Electron 40.0.0
- **Build Tool**: Vite + electron-vite
- **Database**: SQLite (better-sqlite3)
- **Styling**: Tailwind CSS 4.1.18
- **Validation**: Zod 4.3.6
- **Drag & Drop**: @dnd-kit (sortable core)
- **Voice**: vosk-browser (WASM Speech-to-Text)
- **AI Integration**: @opencode-ai/sdk/v2/client
- **Package Manager**: pnpm

### IPC категории (срез)
Ниже — перечень категорий IPC, указанный в документе:

| Категория        | Каналы                                                                                                                                                                                                      | Ответственность                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **app**          | `getInfo`, `openPath`                                                                                                                                                                                       | Информация о приложении           |
| **project**      | `selectFolder`, `create`, `getAll`, `getById`, `update`, `delete`                                                                                                                                           | CRUD проектов                     |
| **board**        | `getDefault`, `updateColumns`                                                                                                                                                                               | Управление досками                |
| **task**         | `create`, `listByBoard`, `update`, `move`, `delete`                                                                                                                                                         | CRUD задач + drag-drop            |
| **tag**          | `create`, `update`, `delete`, `list`                                                                                                                                                                        | Управление тегами                 |
| **deps**         | `list`, `add`, `remove`                                                                                                                                                                                     | Зависимости задач                 |
| **schedule**     | `get`, `update`                                                                                                                                                                                             | Расписание задач                  |
| **search**       | `query`                                                                                                                                                                                                     | Полнотекстовый поиск              |
| **analytics**    | `getOverview`, `getRunStats`                                                                                                                                                                                | Метрики и аналитика               |
| **run**          | `start`, `cancel`, `delete`, `listByTask`, `get`, `events:tail`                                                                                                                                             | Запуск AI задач                   |
| **artifact**     | `list`, `get`                                                                                                                                                                                               | Артефакты AI запусков             |
| **plugins**      | `list`, `install`, `enable`, `reload`                                                                                                                                                                       | Плагин-система                    |
| **roles**        | `list`                                                                                                                                                                                                      | Роли AI-агентов                   |
| **backup**       | `exportProject`, `importProject`                                                                                                                                                                            | Бэкап/восстановление              |
| **diagnostics**  | `getLogs`, `getLogTail`, `getSystemInfo`, `getDbInfo`                                                                                                                                                       | Диагностика                       |
| **appSetting**   | `getLastProjectId`, `setLastProjectId`, `getSidebarCollapsed`, `setSidebarCollapsed`                                                                                                                        | Настройки                         |
| **opencode**     | `listModels`, `refreshModels`, `toggleModel`, `updateModelDifficulty`, `generateUserStory`, `sendMessage`, `getSessionStatus`, `getActiveSessions`, `getSessionMessages`, `getSessionTodos`, `logProviders` | Интеграция с OpenCode             |
| **ohMyOpencode** | `readConfig`, `saveConfig`, `listPresets`, `loadPreset`, `savePreset`, `backupConfig`, `restoreConfig`                                                                                                      | Управление конфигурацией OpenCode |
| **stt**          | `downloadModel`                                                                                                                                                                                             | Загрузка голосовых моделей        |

### Данные и БД
- SQLite + `better-sqlite3` (синхронный драйвер).
- Есть FTS (полнотекстовый поиск).
- Репозитории: `TaskRepository`, `RunRepository` и т.п.
- Есть таблицы событий (например, для задач/запусков), что хорошо ложится на event-driven подход.

---

## 3) Рекомендации по изменениям

### 3.1 Вынести БД и тяжелые операции из main процесса (High impact)
**Цель:** гарантировать отзывчивость UI и стабильность IPC.

**Как:**
- Запуск DB-слоя в **Worker Thread** (или отдельном процессе) и взаимодействие через message passing.
- В main оставить: IPC-adapter + оркестрация + lifecycle Electron.
- Перенести туда же тяжелые операции: FTS-запросы, подсчет аналитики, большие импорты/экспорты (кроме backup/plugins — они вне текущего плана).

**DoD:**
- main не выполняет синхронных SQL-запросов;
- массовые операции не блокируют UI;
- есть метрики времени выполнения запросов и логирование “медленных” операций.

### 3.2 Ввести слой Application (use-cases) между IPC и репозиториями (High impact)
**Цель:** чтобы бизнес-правила жили в одном месте и тестировались без Electron.

**Как:**
- `src/main/ipc/*` → только адаптер: валидация, маппинг ошибок, вызов use-case.
- `src/main/app/*` → use-cases (команды/запросы).
- Репозитории/интеграции → `src/main/infra/*`.

**DoD:**
- обработчики IPC не обращаются к репозиториям напрямую;
- use-case покрыт тестами (хотя бы на важные ветки).

### 3.3 Единый протокол ответов и ошибок IPC (High impact)
**Цель:** упростить renderer и стабилизировать UX.

**Рекомендуемый формат:**
- Успех: `{ ok: true, data }`
- Ошибка: `{ ok: false, error: { code, message, details? } }`

**DoD:**
- в renderer один `unwrap()`/`handleResult()` для всех вызовов;
- коды ошибок ограничены перечислением (enum) и задокументированы.

### 3.4 Унифицировать event-stream (Medium impact)
**Цель:** консистентная модель “события → обновление UI”.

**Как:**
- Ввести единый `events.subscribe({ topics })` + формат события:
  - `type`, `entityId`, `ts`, `payload`.
- Для долгих операций (run/opencode) использовать поток событий + периодический `resync`.

### 3.5 Укрепить границы renderer (Medium impact)
**Цель:** избежать “комбайна” в `BoardScreen`.

**Как:**
- Вынести state и side-effects в `features/board/*`:
  - `model` (store/selectors), `api`, `ui`.
- В `screens/*` оставить композицию и маршрутизацию.

### 3.6 Нормализация данных: убрать JSON там, где нужны запросы (Medium → later)
**Цель:** надежная фильтрация, аналитика, целостность.

**Кандидаты:**
- `tags_json` → `task_tags(task_id, tag_id)` + индексы.
- устранить дубли `schedule` (если он есть и в `tasks`, и отдельно) → оставить один источник истины.

---

## 4) Риски внедрения и как их снять

- **Риск:** перенос БД в worker может затронуть много кода.  
  **Снятие:** сначала вводим интерфейсы (`DbPort`, `TaskRepoPort`) и прокси-адаптер; потом переносим реализацию.

- **Риск:** большие изменения структуры папок ломают импорты.  
  **Снятие:** делать по модулю (project → task → run → opencode), не “взрывом”.

- **Риск:** совместимость IPC в процессе рефакторинга.  
  **Снятие:** временно поддерживать старые каналы через thin-wrapper к новым use-cases (с флагом/префиксом).

---

## 5) Чеклист: что проверить в коде
- main: есть ли синхронные SQL вызовы на горячих путях?
- есть ли тяжелые расчеты в IPC handlers?
- единообразны ли ошибки?
- есть ли единый event bus?
- где живут бизнес-правила перемещения задач/зависимостей/ранов?
