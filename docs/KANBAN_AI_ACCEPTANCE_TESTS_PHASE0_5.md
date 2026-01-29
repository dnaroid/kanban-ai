# Kanban AI — Acceptance Tests (End-to-End) для “прокликивания” тест‑агентом (Фазы 0–5)

> Версия документа: 0.1  
> Дата: 2026-01-29  
> Назначение: пошаговые тесты, которые тест‑агент может выполнить, “прокликивая” UI и сверяя ожидаемые результаты.

---

## 0) Общие правила выполнения

- Тесты выполнять **в чистом профиле** приложения (новая БД) и отдельно — на “загруженном” профиле (после импорта).
- Если есть фича‑флаги (mock executor / real OpenCode) — тесты разделены на варианты.
- Везде, где указано “кнопка/лейбл”, допускается небольшое расхождение названий, но **поведение должно совпадать**.

### 0.1 Набор тестовых данных
Рекомендуемые значения:
- Project name: `Demo Project`
- Repo path: локальный git репозиторий (тестовый), например `~/tmp/kanban-ai-demo-repo`
- Tasks:
  - `T1: Login screen`
  - `T2: Add settings page`
  - `T3: Fix crash on startup`
- Tags: `ui`, `bug`, `perf`
- Release: `v0.1.0`

### 0.2 Проверка качества UI
Во всех тестах дополнительно проверять:
- нигде не отображается `undefined`
- есть адекватные loading/empty/error состояния
- ошибки показываются пользователю понятно (toast/inline), а не “молча”

---

## 1) Smoke: запуск приложения и Diagnostics

### AT-001 — App boots + Diagnostics заполнены
**Steps**
1. Запустить приложение.
2. Открыть экран **Diagnostics** (через sidebar).
3. Проверить карточки Runtime/Persistence/OpenCode/Logs.

**Expected**
- Runtime поля заполнены (platform/arch/electron/chrome/node/version/mode).
- Persistence: db path/size/schema version/счётчики (не обязательно большие, но не `undefined`).
- Logs: отображается либо “No logs yet”, либо хвост логов; кнопка refresh работает.

---

## 2) Projects: создание/открытие/персист

### AT-010 — Создать проект
**Steps**
1. Перейти в **Projects**.
2. Нажать **New Project**.
3. Ввести name `Demo Project` (repoPath можно оставить пустым).
4. Создать.

**Expected**
- Проект появляется в списке.
- При клике открывается Project Home (Board).

### AT-011 — Проект сохраняется после перезапуска
**Steps**
1. Создать проект как в AT-010.
2. Закрыть приложение и открыть снова.
3. Открыть **Projects**.

**Expected**
- Проект `Demo Project` присутствует.

---

## 3) Board: колонки/таски/DnD

### AT-020 — Автосоздание дефолтной доски
**Steps**
1. Открыть проект `Demo Project`.
2. Открыть Board.

**Expected**
- Есть дефолтные колонки (например Backlog/In Progress/Done) ИЛИ UI предлагает создать колонки.
- Нет ошибок/undefined.

### AT-021 — Добавить колонку
**Steps**
1. На Board нажать “Add column” (или menu → “Add column”).
2. Ввести имя `QA`.
3. Сохранить.

**Expected**
- Колонка `QA` появилась.

### AT-022 — Добавить таски (quick add)
**Steps**
1. В колонке Backlog нажать “+ Task”.
2. Создать `T1: Login screen`.
3. Создать `T2: Add settings page`.
4. Создать `T3: Fix crash on startup`.

**Expected**
- Все 3 карточки видны в Backlog.

### AT-023 — Reorder внутри колонки
**Steps**
1. В Backlog перетащить `T3` наверх списка.

**Expected**
- Порядок изменился сразу.

### AT-024 — Move между колонками + персист
**Steps**
1. Перетащить `T1` в `In Progress`.
2. Перетащить `T2` в `QA`.
3. Перезапустить приложение.
4. Открыть `Demo Project` → Board.

**Expected**
- `T1` в `In Progress`, `T2` в `QA`, `T3` в Backlog.

---

## 4) Task Details: редактирование полей

### AT-030 — Открыть Task drawer и отредактировать поля
**Steps**
1. Кликнуть по `T1: Login screen`.
2. В Details:
   - type = `story`
   - priority = High
   - tags: `ui`, `auth`
   - description: “Implement login flow”.
3. Сохранить/закрыть.

**Expected**
- При повторном открытии значения сохранены.

---

## 5) Dependencies

### AT-040 — Добавить blocked-by зависимость
**Steps**
1. Открыть `T2: Add settings page`.
2. Dependencies → “Blocked by” → выбрать `T1: Login screen`.
3. Сохранить.

**Expected**
- В `T2` видно “Blocked by T1”.
- На карточке `T2` (если предусмотрено) есть бейдж “Blocked”.

### AT-041 — Валидация циклов
**Steps**
1. Попробовать сделать `T1` blocked by `T2`.

**Expected**
- Ошибка “Cycle detected” (или аналог), связь не добавляется.

---

## 6) Timeline / Scheduling

### AT-050 — Назначить даты и увидеть на Timeline
**Steps**
1. В `T1` назначить start/due/estimate/assignee.
2. Открыть Timeline.

**Expected**
- `T1` отображается на шкале.
- Unscheduled содержит задачи без дат.

### AT-051 — Drag на таймлайне
**Steps**
1. Перетащить `T1` на +2 дня.

**Expected**
- Даты обновились и сохраняются.

---

## 7) Runs/Chat/Artifacts

### AT-060 — BA Run создаёт markdown artifact
**Steps**
1. Открыть `T1` → Runs.
2. Start Run → роль `BA`.
3. Дождаться `succeeded`.

**Expected**
- Есть события в Log/Chat.
- В Artifacts есть markdown (story + AC).
- Artifact открывается.

### AT-061 — Retry и Cancel
**Steps**
1. Запустить run.
2. Пока running — Cancel.
3. Retry.

**Expected**
- Cancel → canceled.
- Retry создаёт новый run.

### AT-062 — Replay
**Steps**
1. Открыть старый run.

**Expected**
- События и артефакты доступны без перезапуска.

---

## 8) Global Search

### AT-070 — Поиск по задачам
**Steps**
1. Search → `login`.

**Expected**
- Находит `T1`.

### AT-071 — Поиск по artifacts
**Steps**
1. Search → `Acceptance` (или слово из BA artifact).

**Expected**
- Есть результат в Artifacts/Runs.
- Открывается источник.

### AT-072 — Фильтры
**Steps**
1. Применить фильтры (entity/status/tag).

**Expected**
- Результаты соответствуют фильтрам.

---

## 9) Analytics

### AT-080 — Analytics overview
**Steps**
1. Переместить `T3` в Done.
2. Открыть Analytics.

**Expected**
- Throughput/WIP отражают изменения (в пределах выбранного диапазона).

---

## 10) Plugins

### AT-090 — Установить плагин и увидеть роль
**Preconditions**
- Есть локальный тест‑плагин (валидный manifest) который регистрирует роль `Designer`.

**Steps**
1. Settings → Plugins → Install.
2. Enable plugin.
3. Task → Runs → role dropdown.

**Expected**
- Роль `Designer` доступна для запуска.

---

## 11) Backup / Export / Import

### AT-100 — Export project
**Steps**
1. Settings → Backup → Export.

**Expected**
- zip создан, UI сообщает успех.

### AT-101 — Import project (roundtrip)
**Steps**
1. Очистить профиль/создать новый.
2. Import zip.
3. Открыть проект.

**Expected**
- Board/Tasks/Runs/Artifacts/Timeline/Dependencies восстановлены.

---

## 12) VCS (локальный git) — если включено в текущей сборке

### AT-110 — Connect repo + create branch
**Steps**
1. Project Settings → Connect repository → repoPath.
2. Task `T1` → VCS → Create Branch.

**Expected**
- Ветка создана и checkout выполнен.

### AT-111 — Diff/Commit/Push
**Steps**
1. Создать изменение в repo (Dev run или вручную).
2. VCS → Diff не пустой.
3. Commit message, затем Push.

**Expected**
- sha отображается, push успешен, repo clean.

---

## 13) Releases — если экран релизов присутствует

### AT-130 — Create release + notes generation
**Steps**
1. Releases → Create `v0.1.0`.
2. Add items: `T1`, `T3`.
3. Generate notes (run).
4. Publish.

**Expected**
- notes_md заполнены.
- релиз published.
- items отражают merged/done (по политике).

---

## 14) Регрессии

### AT-900 — Нет undefined на основных экранах
**Steps**
1. Пройти Projects/Board/Task/Runs/Search/Timeline/Analytics/Plugins/Backup/Diagnostics.

**Expected**
- Нигде нет `undefined`.

### AT-901 — Перфоманс быстрый чек
**Steps**
1. Создать 200 задач.
2. Открыть Board, Search, Run log.

**Expected**
- UI не фризит, списки виртуализированы, поиск быстрый.

---

## 15) Что тест‑агент должен логировать
Для каждого теста:
- pass/fail
- если fail: шаг, expected/actual, скриншот, хвост main logs (Diagnostics → Logs)
