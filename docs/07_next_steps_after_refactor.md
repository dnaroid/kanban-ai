# Next steps после текущего рефакторинга (актуально по присланным файлам)

_Дата: 2026-02-07_

Ты уже сделал важный шаг: IPC-хэндлеры разнесены по модулям (`src/main/ipc/handlers/*`), появился composition root (`src/main/ipc/composition/create-app-context.ts`) и use-case слой для `project/task/run`.

Ниже — **что ещё стоит сделать**, в порядке приоритета, на основе текущих файлов.

---

## P0 — баги/корректность (исправить в первую очередь)

### P0.1 Opencode subscribe/unsubscribe: рассинхрон ref-count
В `OpenCodeSessionManager.subscribeToSessionEvents()` есть ref-count по `subscriberId`.  
А в `opencode.handlers.ts` ты используешь фиксированный `subscriberId = renderer:{rendererId}` **и** хранение `rendererSubscriptions` как `Set<string>`.

Если renderer вызовет `opencode:subscribeToEvents` 2+ раза для одной и той же сессии:
- `sessionManager` увеличит `refs`,
- а твой `Set` останется с одной записью,
- cleanup/unsubscribe вызовется один раз → `refs` не дойдут до нуля → SSE может остаться висеть.

**Вариант А (простой, рекомендую): сделать subscribe идемпотентным на IPC-слое**
- Если `rendererSubscriptions[rendererId]` уже содержит `sessionID` — **не** вызывать `sessionManager.subscribeToSessionEvents` повторно.

**Вариант B (если реально нужны несколько подписчиков в одном renderer): хранить ref-count**
- `Map<number, Map<string, number>>` и дергать `unsubscribe` столько раз, сколько подписок.

**DoD**
- 10 повторных subscribe → 10 unsubscribe → подписка реально закрылась.

---

### P0.2 create-app-context: битая строка "в работе" (mojibake)
В `resolveInProgressColumnId` у тебя сейчас есть странная строка:
- `'–≤ —А–∞–±–Њ—В–µ'` и `'—А–∞–±–Њ—В'`

Это явно поломанная кодировка и приведёт к тому, что колонка “в работе” может не определяться.

**Сделать**
- Вернуть нормальные варианты: `'в работе'`, `'в процессе'`, `'in progress'` и т.п.
- Идеально: вместо хардкода — хранить `inProgressColumnId` в настройках board (или дефолт: orderIndex=1).

---

### P0.3 Единообразие именования `sessionID` vs `sessionId`
Сейчас часть IPC использует `sessionID` (subscribe/unsubscribe/isSubscribed), а другая часть — `sessionId` (прочие opencode методы).

**Сделать**
- Привести IPC контракт к одному варианту (`sessionId`), а для совместимости (если нужно) временно принимать оба.

---

## P1 — архитектурные долги, которые сейчас видны по структуре

### P1.1 task.handlers.ts всё ещё «комбайн»
`task.handlers.ts` сейчас включает:
- board
- task CRUD (use-cases)
- tags (repo напрямую)
- deps (service напрямую)
- schedule (repo напрямую)
- search (service напрямую)
- vosk
- ohMyOpencode*

Это снова создаёт большой файл и смешивает домены.

**Сделать (минимально) — разнести по файлам**
- `board.handlers.ts`
- `tags.handlers.ts`
- `deps.handlers.ts`
- `schedule.handlers.ts`
- `search.handlers.ts`
- `vosk.handlers.ts`
- `oh-my-opencode.handlers.ts`
- оставить `task.handlers.ts` только для `task:*`

И подключить их в `handlers/index.ts`.

**DoD**
- каждый файл отвечает за 1 домен/набор команд
- `task.handlers.ts` становится коротким и читаемым

---

### P1.2 Вынести oh-my-opencode utils из AppContext
Сейчас `create-app-context.ts` тащит:
- `isPlainObject`, `mergeInPlace`, `buildOhMyOpencodeModelFields`
- константы preset suffix/original name

Это **не DI-зависимости**, а утилиты. AppContext от этого разрастается и становится «мешком всего».

**Сделать**
- `src/main/oh-my-opencode/config-utils.ts` (или `shared/oh-my-opencode/*`)
- хэндлер `oh-my-opencode.handlers.ts` импортирует utils напрямую (без прокидывания через context)

---

### P1.3 plugin.handlers.ts содержит backup
Сейчас `plugin.handlers.ts` регистрирует и `plugins:*`, и `backup:*`.

**Сделать**
- вынести `backup:*` в `backup.handlers.ts` (даже если backup “не нужен сейчас”, структура должна быть чистой)

---

## P1 — довести «use-case слой» там, где уже растёт бизнес-логика

Сейчас use-cases есть для project/task/run, но для остальных доменов много прямых обращений к repo/service.

**Рекомендую следующий минимум:**
- board:
  - `GetDefaultBoardUseCase`, `UpdateBoardColumnsUseCase`
- tags:
  - `CreateTagUseCase`, `UpdateTagUseCase`, `DeleteTagUseCase`, `ListTagsUseCase`
- deps:
  - `ListDepsUseCase`, `AddDepUseCase`, `RemoveDepUseCase`
- schedule:
  - `GetScheduleUseCase`, `UpdateScheduleUseCase`

Можно начать не с «идеальной» DDD, а с простого app-layer, который вызывает repo/service, но:
- изолирует бизнес-правила,
- легче тестируется,
- убирает логику из IPC handlers.

---

## P2 — Observability и performance (очень полезно на росте данных)

### P2.1 Логирование slow operations
Даже если DB пока в main (better-sqlite3), добавь:
- измерение длительности ключевых операций (search, analytics, run events tail)
- порог, например 50–100ms
- лог параметров (без PII)

### P2.2 DB в worker (цель)
Оставить как большой следующий шаг:
- прокси-репозитории в main
- реальная реализация репозитория в worker_thread/process
- main перестаёт блокироваться

---

## P2 — тесты, которые реально ловят регрессии

### P2.1 OpenCode подписки
- повторный subscribe (idempotent или ref-count) + корректная отписка
- cleanup при `destroyed` / `render-process-gone`

### P2.2 Storage fallback
- сортировка сообщений/parts
- корректный `limit`

---

## Рекомендованный порядок PR (чтобы быстро закрыть риски)

1) **PR1:** P0.1 + P0.2 + P0.3 (подписки, mojibake, naming)  
2) **PR2:** разнести `task.handlers.ts` на доменные файлы + вынести backup из plugin.handlers  
3) **PR3:** вынести oh-my-opencode utils из AppContext  
4) **PR4:** добавить use-cases для board/tags/deps/schedule (минимально)  
5) **PR5:** slow logs + метрики  
6) **PR6:** DB worker (если будет нужно)

---

## Быстрая правка для P0.1 (идея)

В `opencode:subscribeToEvents`:

- перед `sessionManager.subscribeToSessionEvents`:
  - проверить, что renderer уже подписан на этот sessionID
  - если да — вернуть `{ ok: true, subscribed: true }` без повторной подписки

Это сразу убирает риск зависших SSE из-за ref-count.
