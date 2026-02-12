# План миграции в “Local web” (localhost backend + browser UI) — для код-агента GLM‑4.7

> Цель: запустить текущий продукт **в обычном браузере**, сохранив Node/SQLite/FS/Git/Plugins/AI-раннеры **на локальном backend-сервере** (localhost).  
> Минимизируем изменения UI: вместо Electron IPC используем HTTP + SSE/WS, максимально переиспользуя существующие use-cases, сервисы и репозитории.

---

## 0) Контекст текущей архитектуры (кратко, чтобы агент не потерялся)

Слепок показывает:

- **UI**: `src/renderer/` (React/Vite)
- **Backend-ядро**: `src/main/` (use-cases `src/main/app/`, сервисы, раннеры `src/main/run/`, плагины `src/main/plugins/`, Vosk `src/main/vosk/`)
- **Транспорт**: Electron IPC + preload bridge `src/preload/preload.mjs`
- **Хранилище**: SQLite через **native** `better-sqlite3`
- **Внешняя интеграция**: OpenCode server (`OPENCODE_URL:4096`) + SDK
- **IPC namespaces** (группы команд): `APP:*`, `PROJECT:*`, `BOARD:*`, `TASK:*`, `TAG:*`, `RUN:*`, `SEARCH:*`, `ANALYTICS:*`, `PLUGINS:*`, `BACKUP:*`, `DIAGNOSTICS:*`, `OPENCODE:*`, `OH_MY_OPENCODE:*`, `APP_SETTING:*`, `SCHEDULE:*`, `DEPS:*`, `ROLES:*`, `ARTIFACT:*`
- **Main → UI events**: `task:onEvent`, `opencode:onEvent`, `events:tail`

Критично:

- `better-sqlite3` потребует **rebuild** при переходе от Electron Node к system Node.
- Уже предусмотрен “резерв” `VITE_API_URL=http://localhost:3000`.

---

## 1) Результат миграции (Target Architecture)

### 1.1 Что должно получиться

- **Backend**: Node.js процесс (system Node), слушает `127.0.0.1:3000`
  - Поднимает те же DI-модули и use-cases, что сегодня в Electron main.
  - Дает API: **RPC поверх HTTP** (быстрее всего для совместимости) + **SSE или WebSocket** для событий.
  - Хранит SQLite-файл, управляет миграциями, работает с FS/Git/Plugins.

- **Frontend**: Vite/React app открывается в обычном браузере.
  - Вместо `window.electron.invoke(...)` использует `fetch(...)` к `http://localhost:3000`.
  - Подписки на события через SSE/WS.

### 1.2 Важные принципы (чтобы миграция не “развалилась”)

1. **Стабильный контракт**: сохраняем имена операций (`APP:*`, `TASK:*`, …) и Zod-схемы как единый источник истины.
2. **Максимальная переиспользуемость**: use-cases/services/repos не должны знать “Electron vs Web”.
3. **Инкрементальность**: сначала добавляем HTTP-адаптер параллельно IPC (пока Electron-сборка жива), затем делаем чистый local-web запуск.
4. **Безопасность localhost**: API привязан к `127.0.0.1`, включаем токен/ключ для защиты от чужих вкладок/процессов.

---

## 2) Выбор подхода к API: почему RPC (а не REST) на 1-й итерации

### 2.1 Проблема

У вас уже есть ~85 IPC операций, сгруппированных по namespaces. Переписать это в “правильный REST” = долго и рискованно.

### 2.2 Решение

Сделать **RPC шлюз**, который принимает:

```json
{ "method": "TASK:create", "params": { ... } }
```

и возвращает:

```json
{ "ok": true, "result": { ... } }
```

Плюсы:

- UI меняется минимально (почти 1:1 с IPC).
- Можно переиспользовать существующие Zod-схемы запрос/ответ.
- Упрощает параллельную поддержку IPC и HTTP.

---

## 3) План работ (по фазам). Формат: “что сделать → где → критерий готовности”

> Ниже — максимально подробный чек-лист для код-агента.  
> Везде, где есть выбор, предпочтение: **минимум новых зависимостей**, максимум переиспользования.

---

# ФАЗА A — Подготовка и “контрактная база” (до начала рефакторинга)

## A1) Зафиксировать базовую работоспособность

**Действия**

- Запустить текущий проект (Electron) и пройти ручной smoke:
  - Создание/открытие проекта
  - CRUD задач
  - Запуск AI run + отмена
  - События в UI (task:onEvent), лог/stream (events:tail), OpenCode (opencode:onEvent)
- Записать чек-лист и ожидаемые результаты (файл `docs/migration/local-web/smoke-baseline.md`)

**Критерий готовности**

- Есть baseline сценарии + заметки о возможных “острых” местах.

## A2) Автоматически извлечь список IPC методов (источник истины)

**Цель**: не гадать о методах, а получить список автоматически.

**Действия**

- Создать скрипт `scripts/list-ipc-methods.ts`:
  - Находит в `src/main/ipc/` все регистрации обработчиков (`ipcMain.handle`, `ipcMain.on`).
  - Печатает таблицу: `methodName | file | handlerExport`.
- Сгенерировать файл: `docs/migration/local-web/ipc-methods.csv` (или `.md`).

**Критерий готовности**

- Список методов извлечен автоматически и будет обновляться при изменениях.

## A3) Убедиться, что Zod-схемы можно переиспользовать вне IPC

**Действия**

- Проверить файл `src/main/ipc/types.ts` (или эквивалент): схемы запросов/ответов.
- Вынести схемы в общий пакет/путь, например:
  - `src/shared/contracts/ipc.ts` (переименовать смыслово в “api contracts”)
  - или `packages/shared/src/contracts/rpc.ts` (если идем к монорепе).

**Критерий готовности**

- Схемы доступны как в server, так и в web, без Electron-специфики.

---

# ФАЗА B — Структурирование репозитория под local-web

> Цель: сделать явные пакеты: `server`, `web`, `shared` (можно в рамках одного repo без публикации).

## B1) Ввести workspace структуру (pnpm/yarn/npm workspaces)

**Рекомендуемая структура**

```
/packages
  /server
  /web
  /shared
/scripts
/docs/migration/local-web
```

**Действия**

1. Создать `pnpm-workspace.yaml` (или аналог).
2. Разнести код:
   - `src/main/*` → `packages/server/src/*`
   - `src/renderer/*` → `packages/web/src/*`
   - `src/shared/*` → `packages/shared/src/*`
   - `src/preload/*` временно оставить (для совместимости Electron), позже удалить или переместить в `packages/electron`.

**Критерий готовности**

- Пакеты собираются отдельно, импорты не сломаны (или отремонтированы alias’ами).

## B2) Привести TypeScript path aliases к единому виду

**Действия**

- В корне создать `tsconfig.base.json`
- В каждом пакете `tsconfig.json` с `extends`.
- Пример aliases:
  - `@shared/*` → `packages/shared/src/*`
  - `@server/*` → `packages/server/src/*` (только внутри server)
  - `@web/*` → `packages/web/src/*` (только внутри web)

**Критерий готовности**

- IDE/TS не ругается; `pnpm -r build` проходит.

## B3) Разделить Vite конфиги: Electron vs Web

**Действия**

- Создать `packages/web/vite.config.ts` обычного web режима (без electron-vite).
- Сохранить старый electron-vite конфиг только если вы продолжаете поддерживать Electron параллельно.
- В web режиме убрать зависимости от `window.electron` напрямую — все через абстракцию транспорта (см. ФАЗА C).

**Критерий готовности**

- `pnpm --filter web dev` поднимает UI в браузере.

---

# ФАЗА C — Абстракция транспорта в UI (ключ к минимальным изменениям)

## C1) Ввести единый интерфейс “Remote API Transport”

**Файлы**

- `packages/web/src/api/transport.ts`
- `packages/web/src/api/transports/electron.ts`
- `packages/web/src/api/transports/http.ts`
- `packages/web/src/api/index.ts`

**Интерфейс**

```ts
export type RpcRequest = { method: string; params?: unknown }
export type RpcResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: { message: string; code?: string; details?: unknown } }

export interface ApiTransport {
  rpc<TReq, TRes>(method: string, params: TReq): Promise<TRes>
  subscribe?(channel: string, onMessage: (data: any) => void): () => void // optional for events
}
```

**Критерий готовности**

- В UI есть 1 точка входа: `api.rpc("TASK:create", {...})`.

## C2) Реализация ElectronTransport (для совместимости)

**Действия**

- Обернуть текущий вызов `window.electron.invoke` (или эквивалент).
- Подписки: `window.electron.on(channel, cb)`.

**Критерий готовности**

- Electron сборка продолжает работать (в идеале без изменений бизнес-логики UI).

## C3) Реализация HttpTransport (для local-web)

**Действия**

- `rpc()` делает `fetch("http://localhost:3000/rpc", { method:"POST", body: {method, params}})`
- `subscribe()` подключается к SSE или WS (см. ФАЗА E)

**Критерий готовности**

- UI может работать без Electron, дергая localhost backend.

## C4) Автовыбор транспорта

**Правило**

- Если доступен `window.electron` → ElectronTransport
- Иначе → HttpTransport

**Критерий готовности**

- Одна и та же сборка UI работает и в Electron, и в браузере (при наличии backend).

---

# ФАЗА D — Поднять local backend server из существующего main-кода

## D1) Создать server entrypoint

**Файлы**

- `packages/server/src/index.ts` (или `main.ts`)
- `packages/server/src/http/createServer.ts`

**Задача**

- Создать HTTP сервер (Fastify/Express/Node http — выбор свободный, но желательно с middleware и json body parsing).
- Слушать `127.0.0.1:3000`.

**Критерий готовности**

- Сервер стартует, отвечает `GET /health` → `{ok:true}`.

## D2) Подключить DI контейнер и “composition root”

**Действия**

- Найти текущую точку сборки зависимостей в `src/main/di/*`.
- Сделать функцию `createAppContainer({ paths, env, logger })`.
- В server entrypoint инициализировать контейнер и получить доступ к use-cases.

**Важно**

- У Electron есть `app.getPath('userData')`. В local-web нужно заменить на аналог:
  - определить директорию данных: `~/.kanban-ai` или platform-specific через `env-paths`.
  - хранить там sqlite, плагины, кэш, логи.

**Критерий готовности**

- Сервер может открыть DB, выполнить миграции, выдать простую выборку через use-case.

## D3) Выполнить DB init + миграции на старте

**Действия**

- Переиспользовать `src/main/db/schema-init.sql` + `src/main/db/migrations/v001-v018`.
- В server startup:
  - выбрать путь `DATA_DIR/db.sqlite`
  - выполнить миграции (идемпотентно)
  - логировать версию

**Критерий готовности**

- Повторный запуск сервера не ломает базу; схема совпадает с Electron версией.

## D4) Решить вопрос `better-sqlite3` (native module) на system Node

**Действия**

- Добавить скрипт:
  - `pnpm --filter server rebuild:sqlite` → `npm rebuild better-sqlite3` (или `pnpm rebuild`)
- В README миграции указать:
  - при смене Node версии — повторить rebuild.

**Критерий готовности**

- Сервер под system Node читает/пишет БД без ошибок загрузки native addon.

---

# ФАЗА E — Реализовать RPC API, совместимый с IPC

## E1) Сконструировать единый RPC endpoint

**Endpoint**

- `POST /rpc` с JSON: `{ method: string, params: unknown }`

**Ответ**

- `{ ok: true, result }` или `{ ok:false, error:{message, code, details} }`

**Критерий готовности**

- Тестовый запрос `APP:getInfo` возвращает данные (или любой простой метод).

## E2) Создать router-таблицу “method → handler”

**Действия**

- В `packages/server/src/http/rpcRouter.ts`:
  - создать Map<string, Handler>
  - зарегистрировать обработчики для всех namespaces

**Важно: минимизация изменений**

- Переиспользовать существующие IPC handlers:
  - если они сейчас экспортируют функции `handleXxx(...)`, то просто вызывать их, заменив `event`/`ipc` контекст на явный `ctx`.

**Рекомендуемый контекст**

```ts
type RpcContext = {
  container: AppContainer
  logger: Logger
  dataDir: string
  requestId: string
  authToken?: string
}
```

**Критерий готовности**

- Все методы из `docs/migration/local-web/ipc-methods.csv` либо реализованы, либо сознательно помечены как “unsupported” с понятной ошибкой.

## E3) Валидация запрос/ответ через Zod (те же схемы)

**Действия**

- Для каждого `method`:
  - `parse(params)` входной схемой
  - `parse(result)` выходной схемой (по желанию, но сильно снижает риск)
- Ошибки Zod отдавать как `400`/`ok:false` с `details`.

**Критерий готовности**

- Невалидные запросы не падают сервером; UI получает структурированную ошибку.

## E4) Стандартизировать ошибки (важно для UX)

**Действия**

- Ввести `AppError` (или использовать существующий) с:
  - `code` (например `NOT_FOUND`, `VALIDATION_FAILED`, `OPENCODE_UNAVAILABLE`)
  - `message`
  - `details`
- На сервере ловить ошибки и маппить в ответ.

**Критерий готовности**

- Ошибки предсказуемы и одинаковы между IPC и HTTP.

---

# ФАЗА F — События: замена `task:onEvent`, `opencode:onEvent`, `events:tail`

## F1) Выбор транспорта событий (рекомендация)

- **SSE** (Server-Sent Events) для main→ui потоков: проще, надежно, хватает для ваших текущих событий.
- **WS** — если нужно двустороннее/подписки/бекпрешер.

Рекомендация для 1-й версии: **SSE**.

## F2) Реализовать SSE endpoint

**Endpoint**

- `GET /events` → `text/event-stream`

**Формат**

- `event: <channel>`
- `data: <json>`

Пример события:

```
event: task:onEvent
data: {"type":"updated","taskId":"...","payload":{...}}
```

**Критерий готовности**

- Браузер получает события без разрыва в течение длительного времени.

## F3) Server-side event bus

**Действия**

- Создать `EventBus` (Node EventEmitter) в server контейнере.
- Там, где в Electron отправлялись IPC events, теперь публиковать в EventBus:
  - Task events
  - OpenCode session events
  - Tail events (лог/стрим run_events)

**Критерий готовности**

- Любое событие появляется и в Electron (IPC), и в local-web (SSE) до удаления IPC.

## F4) Web client подписки

**Действия**

- В `HttpTransport.subscribe(channel, cb)`:
  - открыть `new EventSource("http://localhost:3000/events")`
  - на `addEventListener(channel, ...)` прокинуть `cb`

**Критерий готовности**

- UI реагирует на обновления задач/ранов так же, как в Electron.

---

# ФАЗА G — Специфичные “сложные” места (FS, dialogs, Git, plugins, paths)

## G1) Замена `dialog:showOpenDialog` и выбора папки проекта

**Проблема**

- В браузере нельзя получить абсолютный путь через нативный диалог “как в Electron”.

**Решение для Local-web**

1. UI показывает поле “Project path” (строка).
2. Сервер валидирует `fileSystem:exists`/`isDirectory`.
3. (Опционально) Добавить кнопку “Browse”:
   - сервер запускает OS-диалог через платформенные утилиты (best-effort):
     - macOS: `osascript` / `choose folder`
     - Linux: `zenity --file-selection --directory`
     - Windows: PowerShell + COM dialog
   - возвращает выбранный путь.
   - если утилиты отсутствуют — graceful fallback на ручной ввод.

**Критерий готовности**

- Проект можно добавить через ручной путь на всех OS; “Browse” работает где возможно.

## G2) File system контракты

**Действия**

- Перенести методы `fileSystem:*` на server (они и так “main”-сторонние).
- В UI — только вызовы RPC.

**Критерий готовности**

- Все операции FS выполняются server-side без Electron.

## G3) Git (simple-git)

**Действия**

- Git операции остаются в server.
- UI никогда не исполняет git напрямую.

**Критерий готовности**

- Сценарии, зависящие от git, работают через RPC.

## G4) Plugins runtime

**Действия**

- `src/main/plugins/plugin-runtime.ts` перенести в server.
- Путь плагинов: `DATA_DIR/plugins` (или пользовательский).
- Безопасность: плагины — исполняемый код. В local-web минимум:
  - whitelist/подпись (опционально)
  - отдельный процесс/worker (если уже есть) и ограничение env/путей.

**Критерий готовности**

- Плагины грузятся/исполняются как и раньше локально.

## G5) App settings / userData path

**Действия**

- Ввести единый `PathsService`:
  - `getDataDir()`
  - `getDbPath()`
  - `getLogsDir()`
- Electron адаптер использует `app.getPath('userData')`
- Server адаптер использует `env-paths`/`os.homedir`.

**Критерий готовности**

- Настройки и БД сохраняются в стабильное место без Electron.

---

# ФАЗА H — Dev/Prod запуск, сборка и UX

## H1) Dev запуск (одной командой)

**Действия**

- В корне добавить скрипты:
  - `dev:server` — старт server
  - `dev:web` — старт vite web
  - `dev` — запуск обоих (concurrently/tsx/турборепо — на выбор)

**Критерий готовности**

- `pnpm dev` поднимает:
  - server на `3000`
  - web на `5173`
  - UI работает в браузере.

## H2) Prod запуск (без Vite)

**Цель**: один процесс/команда.

**Действия**

- `pnpm build:web` → собирает статику в `packages/web/dist`
- server:
  - раздает статику (например, `GET /` → index.html)
  - проксирует `/rpc`, `/events`
- добавить команду `pnpm start` → `node packages/server/dist/index.js` (или tsx)

**Критерий готовности**

- Пользователь запускает server и открывает `http://localhost:3000` в браузере.

## H3) Авто-открытие браузера

**Действия**

- Опционально: при старте server один раз вызвать `open("http://localhost:3000")` (настраиваемо).

**Критерий готовности**

- UX “как приложение”: запустил — открылось.

---

# ФАЗА I — Тестирование совместимости и регрессии

## I1) Контрактные тесты для RPC (по списку методов)

**Действия**

- На основе `ipc-methods.csv` сгенерировать тест-скелеты:
  - “вызывается и возвращает ok:false с NOT_IMPLEMENTED” для неготовых
  - “валидирует вход/выход” для готовых
- В идеале: snapshot ответов для простых методов.

**Критерий готовности**

- Нельзя случайно удалить метод: тест упадет.

## I2) E2E smoke (в браузере)

**Действия**

- Playwright:
  - открыть UI
  - создать проект (через ручной путь)
  - создать задачу
  - запустить run (если OpenCode доступен) или проверить graceful error

**Критерий готовности**

- Основные UX сценарии проходят автоматически.

## I3) Параллельная поддержка Electron (временная)

**Действия**

- Пока идет миграция:
  - Electron продолжает использовать ElectronTransport.
  - Web версия — HttpTransport.
  - Одинаковые контракты.

**Критерий готовности**

- Два рантайма живут параллельно без дублирования бизнес-логики.

---

# ФАЗА J — Депрекация Electron IPC (когда local-web стабилен)

## J1) Удалить IPC слой как обязательный путь

**Действия**

- Перевести Electron тоже на HttpTransport (опционально) или оставить только web.
- Удалить `src/preload/preload.mjs` и `src/main/ipc/*` если больше не нужны (или оставить как thin wrapper к RPC для backward compatibility).

**Критерий готовности**

- Единственный путь коммуникации UI↔backend = HTTP/SSE.

---

## 4) Маппинг IPC → RPC (шаблон таблицы)

> Агент должен сгенерировать реальную таблицу из кода. Ниже — шаблон, который нужно заполнить автоматически скриптом из A2.

| Namespace | IPC method пример      | RPC method             | Notes                  |
| --------- | ---------------------- | ---------------------- | ---------------------- |
| APP       | `APP:getInfo`          | `APP:getInfo`          | 1:1                    |
| PROJECT   | `PROJECT:create`       | `PROJECT:create`       | path вводится руками   |
| TASK      | `TASK:update`          | `TASK:update`          | события идут через SSE |
| RUN       | `RUN:start`            | `RUN:start`            | важна идемпотентность  |
| OPENCODE  | `OPENCODE:sendMessage` | `OPENCODE:sendMessage` | server-side SDK        |
| …         | …                      | …                      | …                      |

---

## 5) Минимальный “скелет” реализации (псевдокод)

### 5.1 Server: RPC endpoint

```ts
app.post('/rpc', async (req, res) => {
  const { method, params } = req.body
  const handler = rpcRouter.get(method)
  if (!handler)
    return res.send({
      ok: false,
      error: { code: 'NOT_FOUND', message: `Unknown method ${method}` },
    })

  try {
    const result = await handler(ctx, params)
    return res.send({ ok: true, result })
  } catch (e) {
    const err = normalizeError(e)
    return res.send({ ok: false, error: err })
  }
})
```

### 5.2 Web: HttpTransport.rpc

```ts
async rpc(method, params) {
  const r = await fetch(`${baseUrl}/rpc`, {
    method: "POST",
    headers: {"Content-Type":"application/json", "X-Local-Token": token},
    body: JSON.stringify({ method, params }),
  });
  const data = await r.json();
  if (!data.ok) throw new ApiError(data.error);
  return data.result;
}
```

### 5.3 Web: SSE subscribe

```ts
subscribe(channel, cb) {
  const es = getSingletonEventSource();
  const handler = (ev) => cb(JSON.parse(ev.data));
  es.addEventListener(channel, handler);
  return () => es.removeEventListener(channel, handler);
}
```

---

## 6) Безопасность localhost (минимум, но обязательно)

Даже “локальный” сервер может быть атакован через:

- вредоносный сайт, открытый в браузере (CSRF/скрытые запросы)
- другое локальное приложение

Минимальные меры:

1. Сервер слушает **только** `127.0.0.1`.
2. Генерировать токен при первом запуске и хранить в `DATA_DIR/token`.
3. UI читает токен из:
   - `.env` (dev)
   - или server отдает “bootstrap” страницу, которая инлайнит токен (prod local).
4. Сервер проверяет `X-Local-Token` на всех `/rpc` запросах.

---

## 7) Что считать “готово” (Definition of Done)

Local-web версия считается успешной, если:

- UI открывается в браузере и работает с localhost server без Electron.
- Основные use-cases работают (проекты/задачи/борды/теги/поиск/настройки).
- Runs запускаются и стримятся (или показывают корректную ошибку, если OpenCode недоступен).
- События `task:onEvent` и `events:tail` доходят в UI.
- Данные сохраняются в SQLite, миграции выполняются.
- Есть dev команда, поднимающая server+web.
- Есть хотя бы базовые контрактные тесты.

---

## 8) Приложение: Приоритеты реализации (чтобы агент делал “правильным порядком”)

1. **Инфраструктура**: workspace + сборка пакетов + запуск server/web.
2. **UI транспорт**: ApiTransport + HttpTransport + минимальная интеграция.
3. **RPC backbone**: `/rpc` + 3–5 базовых методов (APP/PROJECT/TASK).
4. **DB init/migrations**.
5. **События**: `/events` + task:onEvent + events:tail.
6. **Остальные namespaces** (RUN, SEARCH, ANALYTICS, PLUGINS, BACKUP…).
7. **Hard parts**: выбор пути, плагины, Git.
8. **Тесты**: контрактные + e2e.

---

## 9) Команды/артефакты, которые агент должен создать

**Docs**

- `docs/migration/local-web/smoke-baseline.md`
- `docs/migration/local-web/ipc-methods.csv` (генерируется)
- `docs/migration/local-web/decisions.md` (ADR кратко)

**Scripts**

- `scripts/list-ipc-methods.ts`

**Packages**

- `packages/shared` (contracts, zod schemas)
- `packages/server` (http, rpc, events, di, db)
- `packages/web` (transport, ui)

---
ФАЗА A-F ЗАВЕРШЕНА ✅
