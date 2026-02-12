# Kanban AI

Веб-приложение для управления проектами с интеграцией Headless OpenCode и oh-my-opencode.

## Phase 0: Каркас приложения

Текущая версия (Phase 0) включает:

- **Vite + React + TypeScript**: Быстрая разработка с горячей перезагрузкой
- **SQLite**: Локальное хранилище с миграциями (через better-sqlite3)
- **Server**: Node.js сервер для backend логики
- **Логирование**: Структурированные логи с системой диагностики
- **UI**: Базовые экраны (Projects, Diagnostics)

## Установка

```bash
pnpm install
```

## STT (Vosk, офлайн)

В приложении используется локальное распознавание речи на базе `vosk-browser` (WASM). Модель загружается один раз и кешируется, а распознавание работает без Python и без IPC для аудио.

**Архитектура:**

- AudioWorklet (PCM16 16kHz) -> renderer
- STTWorkerController (singleton в renderer)
- Vosk WASM (model + recognizer)

**Кеширование модели:**

- Модель скачивается main-процессом и кешируется в `~/Library/Application Support/kanban-ai/vosk-models/`
- В renderer модель передается как base64 и создается `blob:` URL
- Контроллер STT переиспользуется между задачами (singleton), поэтому модель не переинициализируется при переключении тасок

**Где используется:**

- `src/renderer/components/kanban/drawer/sections/TaskDetailsDescription.tsx` — диктовка в описание задачи
- `src/renderer/voice/STTWorkerController.ts` — управление Vosk
- `src/renderer/voice/VoiceCapture.ts` — аудиозахват (PCM16)
- `src/renderer/voice/sttControllerSingleton.ts` — кеш контроллера

**Модели:**

Сейчас используются модели Vosk small (RU/EN) из официального источника. Пути задаются в `TaskDetailsDescription.tsx`:

```ts
const VOSK_MODEL_PATHS = {
  ru: 'https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip',
  en: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
} as const
```

**Важно:** модель должна быть zip-архивом. Распакованные директории не поддерживаются.

## Troubleshooting

### Проблема: OpenCode ищет сессию в другом проекте (NotFoundError)

**Симптомы:**

- `NotFoundError: Resource not found: .../storage/session/<wrong_project_id>/<session_id>.json`
- Сессия создается, но `prompt` или чтение сообщений падает

**Корневая причина:**

`@opencode-ai/sdk` определяет проект по заголовку `x-opencode-directory`. Если не передать `directory` при создании клиента, сервер использует дефолтную директорию и вычисляет другой `projectId`.

**Решение:**

Передавайте `directory` при создании клиента:

```ts
const client = createOpencodeClient({
  baseUrl: process.env.OPENCODE_URL || 'http://127.0.0.1:4096',
  throwOnError: true,
  directory: projectPath,
})
```

### Проблема: Electron binary не устанавливается

**Симптомы:**

- `Error: Electron failed to install correctly`
- Отсутствует директория `node_modules/.pnpm/electron@*/node_modules/electron/dist/`

**Решение:**

1. Удалите старую установку Electron:

   ```bash
   rm -rf node_modules/.pnpm/electron@* node_modules/electron
   ```

2. Переустановите Electron:

   ```bash
   pnpm install --force electron@40.0.0
   ```

3. Принудительно запустите скрипт установки бинарника:

   ```bash
   EPOCH=$(date +%s) node node_modules/.pnpm/electron@40.0.0/node_modules/electron/install.js
   ```

4. Проверьте, что бинарник скачался:
   ```bash
   ls -la node_modules/.pnpm/electron@40.0.0/node_modules/electron/dist/
   ```
   Должна быть директория `Electron.app` (macOS) или `electron` (Linux/Windows)

### Проблема: Native модули не работают с Electron и тестами

**Симптомы:**

- Ошибки при импорте `better-sqlite3` или других native модулей
- Error: `The module ... was compiled against a different Node.js version using NODE_MODULE_VERSION X. This version of Node.js requires NODE_MODULE_VERSION Y`
- Тесты проходят, но Electron приложение падает при запуске (или наоборот)

**Корневая причина:**

Тесты запускаются с системным Node.js (например, v22 с NODE_MODULE_VERSION 127), а Electron использует встроенный Node.js (Electron 40.0.0 использует Node.js v20.x с NODE_MODULE_VERSION 143). Native модули (как `better-sqlite3`) нужно компилировать для каждого окружения отдельно.

**Автоматическое решение:**

Добавлены два скрипта в package.json для автоматического переключения сборок:

```json
{
  "scripts": {
    "dev": "npm run rebuild:electron && electron-vite dev",
    "test": "npm run rebuild:node && vitest",
    "rebuild:electron": "electron-rebuild -f -w better-sqlite3",
    "rebuild:node": "cd node_modules/.pnpm/better-sqlite3@12.6.2/node_modules/better-sqlite3 && npm run install"
  }
}
```

**Как пользоваться:**

```bash
# Запуск Electron приложения - автоматически пересобирает для Electron
pnpm dev

# Запуск тестов - автоматически пересобирает для системного Node.js
npm test

# Ручная пересборка для Electron
npm run rebuild:electron

# Ручная пересборка для Node.js (тесты)
npm run rebuild:node
```

**Как это работает:**

- `pnpm dev` → запускает `rebuild:electron` → компилирует better-sqlite3 для Electron (NODE_MODULE_VERSION 143)
- `npm test` → запускает `rebuild:node` → компилирует better-sqlite3 для системного Node.js (NODE_MODULE_VERSION 127)

Больше не нужно вручную переключаться между версиями Node.js или пересобирать модули — всё происходит автоматически перед запуском.

### Проблема: Ошибка zsh при настройке pnpm config

**Симптомы:**

- `zsh: no matches found: ignored-built-dependencies[]`

**Решение:**

Используйте JSON формат:

```bash
pnpm config set ignored-built-dependencies --json '["better-sqlite3", "esbuild"]'
```

### Проблема: Тесты падают с ошибкой NODE_MODULE_VERSION

**Симптомы:**

- Error: `The module ... was compiled against a different Node.js version using NODE_MODULE_VERSION 143. This version of Node.js requires NODE_MODULE_VERSION 127`
- Тесты better-sqlite3 не запускаются

**Решение:**

Пересоберите better-sqlite3 вручную:

```bash
# Перейдите в директорию better-sqlite3 и соберите модуль
cd node_modules/.pnpm/better-sqlite3@12.6.2/node_modules/better-sqlite3
npm run build-release
cd -

# Запустите тесты
npm test
```

Или используйте `pnpm rebuild`:

```bash
pnpm rebuild better-sqlite3
npm test
```

### Полная процедура переустановки при проблемах

Если ничего не помогает, выполните полную переустановку:

```bash
# Удалите node_modules и lockfile
rm -rf node_modules pnpm-lock.yaml

# Установите зависимости
pnpm install

# Пересоберите native модули для Electron
pnpm electron-rebuild

# Принудительно установите Electron binary
EPOCH=$(date +%s) node node_modules/.pnpm/electron@40.0.0/node_modules/electron/install.js

# Запустите dev сервер
pnpm dev
```

## Разработка

```bash
pnpm dev
```

Примечание: Команда `pnpm dev` автоматически перестраивает native модули для Electron перед запуском.

## Quality Gates

- **TypeScript**: `pnpm typecheck`
- **Linting**: `pnpm lint`
- **Formatting**: `pnpm format:check`
- **Tests**: `pnpm test:run`
- **Все проверки**: `pnpm quality`

## Структура проекта

```
src/
├── main/           # Main process (Electron)
│   ├── ipc/        # IPC handlers + validation
│   ├── db/         # SQLite + репозитории
│   ├── secrets/    # SecretStore
│   └── log/        # Logger
├── preload/        # Preload bridge (contextIsolation)
├── renderer/       # React UI
│   ├── screens/    # Экраны приложений
│   └── components/ # React компоненты
└── shared/         # Общие типы
```

## Фаза 0 завершена

Следующие фазы будут включать:

- Git integration (clone, status, branch-per-task)
- AI agents (Sisyphus, Oracle, Librarian)
- PR workflow (автоматизация через OpenCode)
- Канбан доска с drag-and-drop

## Лицензия

MIT
