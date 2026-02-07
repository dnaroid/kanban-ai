# Что осталось сделать после текущего рефакторинга (next steps)

_Контекст_: в архитектурном отчёте два главных hotspot-модуля — `src/main/ipc/handlers.ts` и `src/main/run/opencode-session-manager.ts` — отмечены как основные источники сложности и регрессий. fileciteturn6file5

Ниже — **практический список того, что ещё стоит довести**, исходя из текущего состояния (у вас уже появились use-case’ы и repo-adapters для project/task/run, но “края” системы ещё смешаны).

---

## 1) P0 (сначала) — корректность и lifecycle

### 1.1 Авто-отписка от OpenCode events при закрытии renderer
Сейчас `task:subscribeToEvents` аккуратно чистит подписку на `destroyed`, а `opencode:subscribeToEvents` — нет (риск утечек/«висячих» SSE подписок при крашах UI или закрытии окна).

**Сделать**
- В `opencode:subscribeToEvents` добавить `webContents.once('destroyed', ...)` и вызывать:
  - `sessionManager.unsubscribeFromSessionEvents(sessionID, subscriberId)`
- Аналогично — на `crashed` / `render-process-gone` (если используете).

**Acceptance**
- Закрыли окно → `sessionManager.isSubscribedToSessionEvents(sessionID)` становится `false`
- Нет лишних логов/вызовов callback после закрытия окна

### 1.2 Стабильный порядок сообщений/частей при fallback чтении из файловой системы
В `OpenCodeSessionManager` fallback читает `readdir()` и потом `Promise.all()`. `readdir()` не гарантирует порядок, а `limit` сейчас применяется **после** чтения и без сортировки. Это даёт “прыгающий” контент и странные лимиты.

**Сделать**
- Сортировать `messageFilesFiltered` и `partsFiltered` (по имени файла как минимум; лучше — по timestamp/sequence если есть).
- Применять `limit` до чтения (после сортировки) — чтобы не читать лишнее.

**Acceptance**
- При `limit=20` всегда возвращаются последние 20 по времени (или по последовательности файлов).
- Контент сообщения стабилен между запусками.

### 1.3 Единая политика ошибок на boundary
В IPC местами кидаются “голые” `Error('...')`. У вас есть слой IPC boundary и маппинг ошибок; важно, чтобы UI получал **предсказуемый формат** ошибок.

**Сделать**
- Ввести стандарт: все IPC-хэндлеры возвращают `Result<T>` (или всегда бросают типизированные доменные ошибки, которые затем маппятся).
- Убедиться, что исключения из OpenCode/FS не пробивают «сырой» стек в UI.

---

## 2) P1 — закончить “разрез” по слоям (handlers.ts всё ещё комбайн)

В отчёте `handlers.ts` отмечен как центральный “комбайн” интеграций и use-case’ов. fileciteturn6file11  
Сейчас он реально делает всё: DI-композицию, регистрацию IPC, часть бизнес-логики, и интеграции (backup/plugins/oh-my-opencode/opencode model sync, etc.).

### 2.1 Разнести handlers по доменам + composition root
**Цель**: `src/main/ipc/handlers.ts` становится тонким “bootstrap”, а доменная регистрация уходит в модули.

**Вариант структуры**
```
src/main/ipc/
  handlers/
    index.ts                # registerAllHandlers(ctx)
    app.handlers.ts
    project.handlers.ts
    board.handlers.ts
    task.handlers.ts
    run.handlers.ts
    opencode.handlers.ts
    oh-my-opencode.handlers.ts
    plugins.handlers.ts
    backup.handlers.ts
    ...
  composition/
    create-app-context.ts   # сбор зависимостей/adapter’ов/use-case’ов
```

**Сделать**
- Вынести `const ...UseCase = new ...` в `create-app-context.ts`
- Каждый `*.handlers.ts` принимает `ctx` (use-case’ы + сервисы) и делает только `ipcHandlers.register(...)`

**Acceptance**
- `handlers.ts` ≤ ~150–200 строк
- Доменный хэндлер не импортирует “поперёк слоёв” (напр. UI/renderer, случайные db-repo напрямую)

### 2.2 Довести до use-case слоя остальные IPC группы (минимальный набор)
Сейчас use-case слой покрывает project/task/run. Это уже хорошо (и соответствует целевой диаграмме потоков). fileciteturn6file4  
Но остальные каналы всё ещё идут напрямую в repo/service.

**Сделать (минимум)**
- `board:*` → use-case’ы `GetDefaultBoard`, `UpdateBoardColumns`
- `tag:*` → use-case’ы `CreateTag`, `UpdateTag`, `DeleteTag`, `ListTags`
- `deps:*` → use-case’ы (если dependencyService содержит бизнес-правила, лучше вынести их в domain/app слой)
- `schedule:*` → use-case’ы
- `appSetting:*` → use-case’ы или хотя бы отдельный “SettingsService” как порт

**Не обязательно сразу**: analytics/plugins/backup — можно оставить как “application services”, но вынести из IPC файла (см. 2.1).

---

## 3) P1 — рефакторинг OpenCodeSessionManager: разрезать на компоненты

`opencode-session-manager.ts` в отчёте — отдельный hotspot по сложности/риску. fileciteturn6file5  
Сейчас в одном классе: кэш клиентов, SSE/stream, маппинг событий, fallback storage reader, сборка текста сообщений.

### 3.1 Разделить на 3 модуля
**Предлагаемый разрез**
1) `OpenCodeClientRegistry`
- `createClientForDirectory()`, кэши, cleanup

2) `OpenCodeStorageReader`
- `getOpenCodeStoragePath()`
- `getMessagesFromFilesystem()`, `loadPartsForMessage()`
- сортировка, limit, обработка ошибок

3) `OpenCodeEventStream`
- `subscribe(sessionID, directory, onEvent, signal)`
- логика resolveOpencodeEventList + обработка async iterable
- retry/backoff (опционально)

А `OpenCodeSessionManager` остаётся тонким фасадом:
- “найти directory”, “выбрать client”, “вызвать reader/stream”, “вызвать callback”

### 3.2 Типизация event.properties и устранение `any`
Сейчас маппинг событий сильно зависит от `as any`. Это ломается при обновлениях SDK.

**Сделать**
- Завести `typeguards`/Zod-схемы для `Event.properties` под нужные event types
- Нормализовать в ваш внутренний `SessionEvent` (который уже есть)

**Acceptance**
- В маппинге событий минимизировать `as any` до точек “границы” (1–2 места)
- Стабильные тесты на событие `message.part.updated`/`todo.updated`

---

## 4) P2 — тесты и регрессии (быстрые win’ы)

В отчёте уже перечислены тесты main-подсистем, включая `opencode-session-manager.test.ts`. fileciteturn6file7  
Но после текущих правок стоит добить именно те кейсы, которые чаще всего ломаются.

### 4.1 Добавить/обновить тесты на:
- ref-count подписчиков: 2 подписки от одного renderer → 1 SSE поток, отписка два раза → поток закрыт
- авто-отписка по `destroyed`
- filesystem fallback сортировка + limit
- маппинг event stream → `SessionEvent` (особенно part.updated/removed)

### 4.2 Смоук-тесты IPC
- “registerAllHandlers” не бросает
- ключевые каналы отвечают с корректными schema-ответами

---

## 5) P2 — улучшения, которые можно делать по ходу

- Убрать `console.log` из production-path и заменить на `logger` (у вас есть `src/main/log/logger.ts`). fileciteturn6file7
- Стандартизировать нейминг: `sessionID` vs `sessionId` (в IPC лучше единообразно).
- Вынести утилиты OhMyOpencode (mergeInPlace + modelFields extraction) в отдельный модуль `oh-my-opencode-config.ts`.
- Вынести “sync models from SDK” (`opencode:refreshModels`) в `OpencodeModelSyncService`.

---

## Definition of Done (критерии, что «план закрыт»)

1) `handlers.ts` перестал быть hotspot-комбайном: доменные модули + composition root. fileciteturn6file11  
2) OpenCodeSessionManager разрезан на reader/stream/registry; есть тесты на порядок/limit/подписки. fileciteturn6file5  
3) Подписки на события не текут при закрытии окна; всё чистится автоматически.  
4) IPC boundary возвращает предсказуемые ошибки и типизированные ответы. fileciteturn6file4
