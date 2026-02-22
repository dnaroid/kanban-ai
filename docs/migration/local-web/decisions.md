# Local Web Migration - Decisions (ADR)

> Архитектурные решения для миграции Electron → Local Web

## ADR-001: RPC vs REST API

**Статус:** Принято
**Дата:** 2026-02-11

### Контекст

Текущая архитектура использует ~85 IPC методов, сгруппированных по 16 неймспейсам. Переписывание в REST требует значительных изменений UI и контрактной базы.

### Решение

Использовать **RPC поверх HTTP** в первом приближении:

**Запрос:**

```json
POST /rpc
{ "method": "TASK:create", "params": { ... } }
```

**Ответ:**

```json
{ "ok": true, "result": { ... } }
// или
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {...} } }
```

### Обоснование

- **Минимальные изменения UI:** почти 1:1 соответствие с IPC
- **Переиспользование контрактов:** Zod схемы работают для IPC и RPC
- **Инкрементальность:** можно параллельно поддерживать IPC и HTTP
- **Простота реализации:** один endpoint вместо множества REST путей

### Последствия

- Типы ошибок стандартизированы через `ok` флаг
- UI использует тот же интерфейс ApiTransport
- Серверный код обрабатывает все методы единообразно

---

## ADR-002: Event Transport - SSE вместо WebSocket

**Статус:** Принято
**Дата:** 2026-02-11

### Контекст

Текущая система отправляет события через IPC (`task:onEvent`, `opencode:onEvent`, `events:tail`). Для web версии нужен реальный-time транспорт.

### Решение

Использовать **Server-Sent Events (SSE)** для main→ui событий.

**Endpoint:**

```
GET /events
text/event-stream
```

**Формат событий:**

```
event: task:onEvent
data: {"type":"updated","taskId":"...","payload":{...}}
```

### Обоснование

- **Простота:** встроен в браузер через `EventSource`
- **Надежность:** HTTP-based, автоматический reconnect
- **Однонаправленность:** соответствует current IPC паттерну (main→ui)
- **Минимум зависимостей:** не нужны дополнительные библиотеки

### Последствия

- UI использует `EventSource` вместо `window.electron.on`
- Сервер держит открытое соединение для каждого клиента
- WS не нужен на первом этапе

---

## ADR-003: Data Directory Path Strategy

**Статус:** Принято
**Дата:** 2026-02-11

### Контекст

Electron использует `app.getPath('userData')` для хранения БД и настроек. В web версии недоступен.

### Решение

Создать `PathsService` с платформенными адаптерами:

**Electron (совместимость):**

```ts
const userDataPath = app.getPath('userData') // ~/Library/Application Support/kanban-ai
```

**Local Web (Node server):**

```ts
import envPaths from 'env-paths'
const paths = envPaths('kanban-ai')
const dataDir = paths.data // ~/.config/kanban-ai or %APPDATA%/kanban-ai
```

### Обоснование

- **Кроссплатформенность:** `env-paths` корректно определяет пути на macOS/Linux/Windows
- **Изоляция:** отдельная директория от Electron данных
- **Консистентность:** единый интерфейс `getDataDir()`, `getDbPath()`

### Последствия

- Веб версия использует другую директорию данных
- Можно мигрировать данные вручную при необходимости
- Настройки не конфликтуют между Electron и Web версиями

---

## ADR-004: better-sqlite3 Native Module Rebuild

**Статус:** Принято
**Дата:** 2026-02-11

### Контекст

`better-sqlite3` — native модуль, скомпилированный для Electron Node v20. Для local web нужен rebuild для system Node.

### Решение

Добавить скрипты rebuild для разных окружений:

```json
{
  "scripts": {
    "rebuild:electron": "electron-rebuild -f -w better-sqlite3",
    "rebuild:node": "cd node_modules/.pnpm/better-sqlite3@12.6.2/node_modules/better-sqlite3 && npm run build-release",
    "rebuild:server": "pnpm --filter server rebuild:sqlite"
  }
}
```

### Обоснование

- **Автоматизация:** переключение между окружениями
- **Разделение:** разные бинарники для Electron и System Node
- **Clear path:** явные команды для разных режимов

### Последствия

- При смене версии Node.js нужно повторить rebuild
- Текущая схема `pnpm dev` и `npm test` работает
- Server package будет иметь свою команду rebuild

---

## ADR-005: Transport Abstraction Layer

**Статус:** Принято
**Дата:** 2026-02-11

### Контекст

UI сейчас вызывает `window.electron.invoke()`. Нужно переключение между Electron и HTTP без изменения бизнес-логики UI.

### Решение

Создать интерфейс `ApiTransport` с реализациями:

```ts
interface ApiTransport {
  rpc<TReq, TRes>(method: string, params: TReq): Promise<TRes>
  subscribe?(channel: string, onMessage: (data: any) => void): () => void
}
```

**Реализации:**

- `ElectronTransport` — оборачивает `window.electron.invoke`
- `HttpTransport` — использует `fetch('/rpc', ...)`
- Авто-выбор: `window.electron ? ElectronTransport : HttpTransport`

### Обоснование

- **Единая точка входа:** UI не знает деталей транспорта
- **Тестирование:** можно мокать транспорт для unit тестов
- **Совместимость:** Electron версия продолжает работать параллельно

### Последствия

- UI использует `api.rpc()` вместо `window.electron.invoke()`
- Gradual migration: можно обновлять UI постепенно
- Добавляется слой абстракции (небольшой overhead)

---

## ADR-006: Security - Localhost Token

**Статус:** Принято
**Дата:** 2026-02-11

### Контекст

Даже локальный сервер может быть атакован через другие вкладки/приложения (CSRF).

### Решение

Простейшая защита через токен:

1. Генерация токена при первом запуске сервера
2. Хранение в `DATA_DIR/token`
3. Токен отдается в UI через bootstrap страницу или `.env`
4. Сервер проверяет `X-Local-Token` header

### Обоснование

- **Минимум усилий:** базовая защита без сложной инфраструктуры
- **Локально только:** не требуется полноценная auth система
- **Просто:** токен — простая строка, не нужно JWT

### Последствия

- Нужно передавать токен в каждом запросе
- Пользователь может удалить токен для регенерации
- Достаточно для базовой защиты от внешних атак

---

## Приоритет реализации (по фазам)

1. **ФАЗА B:** Workspace структура
2. **ФАЗА C:** Transport абстракция
3. **ФАЗА D:** Server setup + DI + DB
4. **ФАЗА E:** RPC endpoint + базовые методы
5. **ФАЗА F:** SSE события
6. **ФАЗА H:** Dev/Prod запуск

---

## Open вопросы

1. Нужно ли мигрировать данные из Electron userData в web dataDir?
2. Нужно ли удалять Electron слой после успешной миграции?
3. Стоит ли добавить WebSocket для двусторонней коммуникации в будущем?
