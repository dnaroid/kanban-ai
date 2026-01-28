# PHASE 0 — Каркас Electron Kanban + Headless OpenCode (план для агента GLM 4.7)

> Цель: зафиксировать прочный фундамент (Electron + IPC + SQLite + Secrets + Logging + базовый UI), чтобы в следующих фазах безболезненно добавлять Kanban, Runs, Git/PR и интеграцию OpenCode.

---

## 0) Критерии готовности (Definition of Done)

В конце фазы 0 должно быть:

1) ✅ Приложение запускается в dev и собирается в prod  
2) ✅ Renderer безопасен: `contextIsolation=true`, `nodeIntegration=false`, доступ к ноде только через `preload`  
3) ✅ SQLite хранится в `app.getPath("userData")`, миграции применяются автоматически и идемпотентно  
4) ✅ Минимальный UI:
   - экран списка проектов
   - создание проекта
   - открытие проекта (экран-заглушка “Board coming soon”)
   - экран Diagnostics (версии/пути/статусы)
5) ✅ IPC контракт типизирован и валидируется (request/response), ошибки не крашат процесс  
6) ✅ Secrets: `secrets.set/get/delete` работают, **нет plaintext** хранения (keychain или safeStorage fallback)  
7) ✅ Логи main-процесса пишутся в файл + dev console  
8) ✅ В репо есть `README` (команды) и `docs/decisions/PHASE0.md` (ключевые решения)

---

## 1) Стартовые решения (зафиксировать в `docs/decisions/PHASE0.md`)

### Рекомендуемый стек
- Electron + React + TypeScript (через Vite)
- IPC: `contextBridge` + `ipcRenderer.invoke` + схемы `zod`
- DB: SQLite через `better-sqlite3` + SQL-миграции (без ORM)
- Логи: `pino` (main) в файл `userData/logs`
- Secrets: интерфейс `SecretStore`
  - primary: `keytar` (если доступно)
  - fallback: `electron.safeStorage` + encrypted blob storage

### Принцип
- Renderer не трогает FS/секреты напрямую.
- Любая операция = IPC вызов.
- Любой важный шаг логируется.

---

## 2) Структура проекта (рекомендуемая)

```
/app
  /src
    /main
      main.ts
      ipc/
      db/
      secrets/
      log/
    /preload
      preload.ts
      ipc-types.ts
    /renderer
      main.tsx
      app/
      screens/
      components/
  package.json
  tsconfig.json
  vite*.ts
  README.md
/docs
  /decisions
    PHASE0.md
```

---

## 3) Правила работы для GLM 4.7 (обязательно соблюдать)

### Режим
- Делай **маленькие тикеты** (T0.1…T0.8).  
- После каждого тикета:  
  1) список изменённых файлов  
  2) команды проверки  
  3) короткий отчёт  
  4) **коммит**

### Запрещено в фазе 0
- Большие рефакторинги “на будущее”
- Подключать тяжёлые фреймворки/ORM/генераторы
- “Улучшать архитектуру” без требований тикета

### Обязательные команды проверки (после каждого тикета)
- `pnpm dev` (или npm/yarn эквивалент)
- `pnpm typecheck`
- `pnpm build` (хотя бы периодически: после T0.1, T0.4, T0.7)

---

## 4) Тикеты фазы 0 (в правильном порядке)

### T0.1 — Инициализация проекта и dev loop
**Цель:** поднять Electron + renderer + build pipeline.

**Шаги:**
1) Создать Vite React TS проект
2) Добавить Electron интеграцию (например, electron-vite / vite-plugin-electron)
3) Настроить скрипты:
   - `dev`: старт renderer + старт electron
   - `build`: сборка renderer + упаковка electron
4) Убедиться, что окно открывается и билд собирается

**Acceptance Criteria:**
- `pnpm dev` открывает окно
- `pnpm build` создаёт запускаемый билд (хотя бы unpacked)

**Коммит:** `chore: init vite + electron skeleton`

---

### T0.2 — Безопасная модель процессов (preload bridge)
**Цель:** renderer работает только через `window.api`.

**Шаги:**
1) В `BrowserWindow`:
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - `preload: <path>`
2) В `preload.ts`:
   - `contextBridge.exposeInMainWorld("api", { ... })`
3) Добавить метод `app.getInfo()` (пока заглушка в main)

**Acceptance Criteria:**
- В renderer нет доступа к `fs/process/require`
- `window.api.app.getInfo()` возвращает объект и рендерится в UI

**Коммит:** `security: enable contextIsolation + preload bridge`

---

### T0.3 — IPC контракт + валидация (zod)
**Цель:** типизированный контракт и безопасная обработка ошибок.

**Шаги:**
1) Завести список каналов (enum/const)
2) Для каждого метода описать:
   - request schema
   - response schema
3) В main: `ipcMain.handle(channel, handler)` + валидация input/output
4) В preload: обёртки `window.api.project.*`, `window.api.secrets.*`

**Методы (минимум):**
- `app.getInfo`
- `project.list`
- `project.create({ name, repoPath? })`
- `project.open({ projectId })` (может быть stub)
- `secrets.set/get/delete` (пока можно stub, но лучше готовить реализацию)

**Acceptance Criteria:**
- Некорректные данные дают понятную ошибку (без краша)
- UI может вызвать `project.list()` и получить массив

**Коммит:** `feat(ipc): typed invoke layer with zod validation`

---

### T0.4 — SQLite + миграции + ProjectRepository
**Цель:** локальная БД и первый реальный доменный CRUD.

**Шаги:**
1) `DbManager`: открыть SQLite в `userData/app.db`
2) `MigrationRunner`:
   - создать таблицу `schema_migrations`
   - применять `migrations/*.sql` по порядку
3) Добавить миграцию `001_init.sql`:
   - `projects(id, name, repo_path, created_at, updated_at)`
   - `app_kv(key, value)`
4) `ProjectRepository`:
   - `list()`, `create()`, `getById()`
5) Привязать IPC `project.list/create/open` к репозиторию

**Acceptance Criteria:**
- После перезапуска приложение видит созданные проекты
- Миграции применяются один раз (идемпотентно)

**Коммиты:**
- `feat(db): sqlite + migrations`
- `feat(projects): repository + ipc handlers`

---

### T0.5 — SecretStore (keytar + safeStorage fallback)
**Цель:** безопасное хранение токенов/секретов.

**Интерфейс:**
```ts
interface SecretStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}
```

**Шаги:**
1) Реализация A: `KeytarSecretStore` (если пакет ставится и работает)
2) Реализация B: `SafeStorageFileSecretStore`:
   - `safeStorage.encryptString(value)`
   - хранить encrypted blob в `userData/secrets.json` (или в sqlite таблице)
3) Автовыбор: если keytar доступен — использовать, иначе fallback
4) Пробросить IPC `secrets.set/get/delete`

**Acceptance Criteria:**
- Секреты не хранятся plaintext
- `secrets.get` возвращает то, что записали
- Удаление работает

**Коммит:** `feat(secrets): secret store with keytar fallback to safeStorage`

---

### T0.6 — Логи main + Diagnostics screen
**Цель:** база для отладки следующих фаз (OpenCode runs, git, PR).

**Шаги:**
1) Подключить `pino` в main
2) Логи в `userData/logs/main.log`
3) `app.getInfo` возвращает:
   - версии electron/node/chrome
   - appVersion
   - userDataPath
4) UI экран Diagnostics отображает `getInfo()` и путь логов

**Acceptance Criteria:**
- Логи создаются и пополняются
- Diagnostics показывает корректные данные

**Коммиты:**
- `chore(log): pino file logger`
- `feat(ui): diagnostics screen`

---

### T0.7 — UI: Projects + навигация
**Цель:** минимально “полезный продукт”.

**Шаги:**
1) Экран `Projects`:
   - список проектов
   - модалка/форма “Add project”
2) Экран `ProjectHome`:
   - заголовок проекта
   - заглушка “Board coming soon”
3) Навигация (простая или через router)
4) Обработка ошибок IPC (toast/alert)

**Acceptance Criteria:**
- Создать проект → увидеть в списке
- Открыть проект → перейти на экран проекта
- После рестарта всё сохраняется

**Коммит:** `feat(ui): project list + create + open`

---

### T0.8 — Quality gates (минимальные)
**Цель:** чтобы дальше не развалилось.

**Шаги:**
1) Formatter/Linter (Biome или ESLint+Prettier — выбрать 1)
2) Скрипт `typecheck`
3) Мини-smoke test:
   - проверка, что DB открывается и миграции применяются (node test runner)
4) Обновить `README`:
   - dev/build/typecheck/test команды

**Acceptance Criteria:**
- `pnpm typecheck` проходит
- `pnpm test` проходит (если добавлен)
- `README` актуален

**Коммиты:**
- `chore: add formatter + typecheck`
- `test: add db migration smoke test`
- `docs: add phase0 decisions + readme`

---

## 5) Итоговый чеклист (копировать в PR описание фазы 0)

- [ ] `dev` запускается, окно открывается  
- [ ] `build` собирается  
- [ ] `contextIsolation=true`, `nodeIntegration=false`  
- [ ] `window.api.*` работает  
- [ ] SQLite создана в `userData`, миграции идемпотентны  
- [ ] CRUD проектов работает и переживает перезапуск  
- [ ] SecretStore работает без plaintext  
- [ ] Логи пишутся в файл  
- [ ] Есть Diagnostics screen  
- [ ] `README` + `docs/decisions/PHASE0.md` готовы

---

## 6) Подсказка: “шаблон поведения агента” (можно вставить в system/policy)

- Работай строго по тикетам T0.1…T0.8.
- Не делай изменений вне текущего тикета.
- После каждого тикета:
  - перечисли изменённые файлы
  - выполни команды проверки
  - сделай маленький коммит с осмысленным сообщением
