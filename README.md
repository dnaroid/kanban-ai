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


Примечание: Команда `pnpm dev` автоматически перестраивает native модули для Electron перед запуском.

## Quality Gates

- **TypeScript**: `pnpm typecheck`
- **Linting**: `pnpm lint`
- **Formatting**: `pnpm format:check`
- **Tests**: `pnpm test:run`
- **Все проверки**: `pnpm quality`
