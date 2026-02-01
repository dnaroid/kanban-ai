# Голосовой ввод в Kanban AI

Интеграция стримингового голосового ввода через OpenAI Realtime Transcription API для надиктовки User Story, Description и Acceptance Criteria.

## Возможности

- **Языки**: Русский (RU) и Английский (EN) с переключателем
- **Потоковая транскрипция**: Живое отображение распознаваемого текста (delta)
- **Server-side VAD**: Автоматическое определение пауз и финализация фраз
- **Безопасность**: API ключ хранится в main process, изолирован от renderer
- **Удобный UX**: Кнопка микрофона, статус "слушаю/говорит", автоматическая вставка текста

## Настройка

### 1. Получить OpenAI API ключ

1. Зарегистрируйтесь на [platform.openai.com](https://platform.openai.com)
2. Создайте API ключ в разделе [API Keys](https://platform.openai.com/api-keys)
3. Убедитесь, что у вас есть доступ к Realtime API (может требовать настройки биллинга)

### 2. Настроить API ключ

#### Вариант 1: Через `.env` файл (для разработки)

```bash
# Скопируйте .env.example в .env
cp .env.example .env

# Добавьте ваш OpenAI API ключ
echo "OPENAI_API_KEY=sk-proj-..." >> .env
```

#### Вариант 2: Через переменную окружения

```bash
export OPENAI_API_KEY="sk-proj-..."
```

### 3. Запустить приложение

```bash
pnpm dev
```

## Использование

### Голосовой ввод в описании задачи

1. Откройте задачу (Task Details)
2. В секции **Description** нажмите на кнопку 🎙 (микрофон)
3. Выберите язык: **RU** или **EN**
4. Разрешите доступ к микрофону (если запрашивается)
5. Говорите — текст будет появляться в реальном времени
6. После паузы (600ms) фраза финализируется и добавляется в поле
7. Нажмите кнопку микрофона снова, чтобы остановить запись

### Статусы

- **Idle** — ожидание
- **Listening** — слушаю (микрофон активен)
- **Speaking** — говорите (обнаружена речь)
- **Processing** — обработка фразы
- **Error** — ошибка (см. сообщение)

## Архитектура

```
┌─────────────────────────────────────────────────────┐
│ Renderer (React)                                    │
│  ┌──────────────────┐    ┌────────────────────────┐│
│  │ VoiceInputButton │◄───┤ VoiceCapture           ││
│  │  (UI Component)  │    │  - AudioContext        ││
│  │  - RU/EN toggle  │    │  - AudioWorklet        ││
│  │  - Status UI     │    │  - PCM16 conversion    ││
│  └──────────────────┘    └────────────────────────┘│
│           │ IPC                       │              │
└───────────┼───────────────────────────┼──────────────┘
            │                           │
            ▼                           ▼
┌─────────────────────────────────────────────────────┐
│ Preload Bridge                                      │
│  window.api.stt.*                                   │
│   - start/stop/setLanguage/sendAudio                │
│   - onStatus/onDelta/onFinal/onError                │
└─────────────────────────────────────────────────────┘
            │ IPC
            ▼
┌─────────────────────────────────────────────────────┐
│ Main Process (Node.js)                              │
│  ┌─────────────────────────────────────────────────┐│
│  │ STTController                                   ││
│  │  - Session management                           ││
│  │  - Editor-to-item mapping                       ││
│  └─────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────┐│
│  │ RealtimeTranscriptionClient                     ││
│  │  - WebSocket to OpenAI Realtime API             ││
│  │  - session.update (language, VAD)               ││
│  │  - input_audio_buffer.append                    ││
│  │  - Parse server events (delta/completed)        ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
            │ WebSocket (WSS)
            ▼
┌─────────────────────────────────────────────────────┐
│ OpenAI Realtime API                                 │
│  wss://api.openai.com/v1/realtime                   │
│  - gpt-4o-mini-transcribe (default)                 │
│  - Server-side VAD                                  │
│  - Streaming transcription                          │
└─────────────────────────────────────────────────────┘
```

## Файлы проекта

### Main Process (Node.js)

- `src/main/stt/RealtimeTranscriptionClient.ts` — WebSocket клиент
- `src/main/stt/STTController.ts` — контроллер сессий
- `src/main/ipc/handlers.ts` — IPC handlers (stt:\*)

### Preload

- `src/preload/preload.ts` — IPC bridge
- `src/preload/ipc-contract.ts` — типы контракта

### Renderer (React)

- `src/renderer/voice/VoiceCapture.ts` — управление микрофоном
- `src/renderer/components/voice/VoiceInputButton.tsx` — UI компонент
- `public/pcm16-worklet.js` — AudioWorklet processor

### Shared

- `src/shared/types/ipc.ts` — типы STT IPC

## Устранение неполадок

### Микрофон не работает

1. **Проверьте права доступа**: Убедитесь, что браузер/приложение имеет доступ к микрофону
   - macOS: System Settings → Privacy & Security → Microphone
   - Windows: Settings → Privacy → Microphone

2. **Проверьте консоль**: Откройте DevTools (Cmd+Option+I / Ctrl+Shift+I) и проверьте ошибки

### Ошибка "No API key"

- Убедитесь, что `OPENAI_API_KEY` установлен в `.env` файле
- Перезапустите приложение после добавления ключа

### Ошибка "Connection failed"

- Проверьте интернет-соединение
- Убедитесь, что API ключ действителен
- Проверьте, что у вас есть доступ к Realtime API (может требовать настройки биллинга)

### Транскрипция обрывает слова

- Увеличьте `silence_duration_ms` в `RealtimeTranscriptionClient.ts`:
  ```typescript
  silence_duration_ms: 800 // default: 600
  ```

## Стоимость

- Модель по умолчанию: `gpt-4o-mini-transcribe` (самая дешевая)
- Альтернатива: `gpt-4o-transcribe` (лучше качество, дороже)
- Цены см. на [OpenAI Pricing](https://openai.com/pricing)

## Лицензия

См. основной LICENSE файл проекта.
