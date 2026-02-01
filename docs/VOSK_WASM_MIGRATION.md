# Vosk WASM Migration Guide

Дата: 2026-02-01

## Что изменилось

Заменили Python-based Vosk на **WASM-based Vosk** в renderer process через Web Worker.

### Преимущества новой архитектуры

✅ **Нет потери чанков** - данные идут напрямую Worker → WASM, минуя IPC  
✅ **Кроссплатформенность** - WASM работает везде, без нативных биндингов  
✅ **Простота** - не нужен Python, процессы, subprocess management  
✅ **Производительность** - Worker не блокирует UI

## Новая архитектура

```
AudioWorklet (audio thread)
    ↓ PCM16 chunks
VoiceCapture (renderer)
    ↓ Int16Array
STTWorkerController (renderer)
    ↓ postMessage
Web Worker (stt.vosk.worker.ts)
    ↓ Vosk WASM API
partial/final результаты
    ↓ onmessage
VoiceInputButton (UI updates)
```

## Файлы

### Новые файлы

- `src/renderer/voice/stt.vosk.worker.ts` - Web Worker для Vosk WASM
- `src/renderer/voice/STTWorkerController.ts` - Управление Worker из renderer
- `src/renderer/voice/VoiceCapture.ts` - Обновлён для работы с Worker

### Изменённые файлы

- `src/renderer/components/voice/VoiceInputButton.tsx` - Обновлён API
- `src/renderer/components/kanban/drawer/sections/TaskDetailsDescription.tsx` - Передача modelPaths

### Удалить после проверки

- `src/main/stt/STTController.ts` (old IPC-based)
- `src/main/stt/VoskTranscriptionClient.ts` (Python subprocess wrapper)
- `scripts/vosk-stt.py` (больше не нужен)

## Настройка моделей

### Вариант 1: Использование CDN (рекомендуется для старта)

Модели загружаются автоматически из CDN Vosk при первом запуске:

```tsx
<VoiceInputButton
  modelPaths={{
    ru: 'https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip',
    en: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
  }}
  onDelta={handleVoiceDelta}
  onTranscript={handleVoiceTranscript}
/>
```

**Плюсы:**

- Не нужно скачивать модели вручную
- vosk-browser автоматически кэширует в IndexedDB
- При следующих запусках модель грузится из кэша

**Минусы:**

- Первая загрузка требует интернета (~45 МБ для RU, ~40 МБ для EN)
- Задержка ~5-10 сек при первом запуске

### Вариант 2: Локальные модели (для оффлайн использования)

1. Скачайте `.zip` архивы:

```bash
wget https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip
wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
```

2. Положите в `public/vosk-models/`:

```bash
mkdir -p public/vosk-models
mv vosk-model-small-ru-0.22.zip public/vosk-models/ru.zip
mv vosk-model-small-en-us-0.15.zip public/vosk-models/en.zip
```

3. Обновите пути:

```tsx
<VoiceInputButton
  modelPaths={{
    ru: '/vosk-models/ru.zip',
    en: '/vosk-models/en.zip',
  }}
/>
```

**Важно:** Храните `.zip` архивы, не распаковывайте! `vosk-browser` сам распакует и загрузит.

## API изменения

### Старый API (Python-based)

```tsx
// Старый
<VoiceInputButton
  editorId="task-123" // ❌ Больше не используется
/>
```

### Новый API (WASM-based)

```tsx
// Новый
<VoiceInputButton
  modelPaths={{ ru: '/path/to/ru', en: '/path/to/en' }} // ✅ Обязательно
  onTranscript={(text) => console.log('Final:', text)}
  onDelta={(text) => console.log('Partial:', text)}
/>
```

## STTWorkerController API

```ts
const controller = new STTWorkerController({
  ru: '/vosk-models/ru/model',
  en: '/vosk-models/en/model',
})

// Инициализация
await controller.init('ru')

// События
controller.on('status', (status) => {
  console.log('Status:', status) // idle | initializing | ready | speech | error
})

controller.on('partial', (text) => {
  console.log('Partial:', text)
})

controller.on('final', (text) => {
  console.log('Final:', text)
})

// Отправка аудио
controller.sendAudioChunk(pcm16Array)

// Смена языка
await controller.setLanguage('en')

// Сброс
controller.reset()

// Очистка
controller.dispose()
```

## Проверка работы

1. Запустите dev сервер: `pnpm dev`
2. Откройте любую задачу
3. Нажмите кнопку микрофона
4. Начните говорить
5. Проверьте консоль браузера:
   - `[PCM16Processor] Chunks generated: 50` - worklet работает
   - Partial/Final результаты приходят в UI

## Troubleshooting

### Worker не загружается

**Причина**: CSP или неправильный path  
**Решение**: Проверьте `new Worker(new URL('./stt.vosk.worker.ts', import.meta.url), { type: 'module' })`

### Модель не найдена

**Причина**: Неправильный путь к модели  
**Решение**: Модели должны быть в `public/vosk-models/` и доступны через HTTP

### Нет распознавания

**Причина**: Модель не загрузилась или микрофон не работает  
**Решение**: Проверьте консоль на ошибки, убедитесь что микрофон работает (индикатор Chrome)

## Производительность

- **Первая загрузка модели**: ~2-5 сек (зависит от модели)
- **Смена языка**: ~2-5 сек (перезагрузка модели)
- **Латентность распознавания**: ~50-200ms (partial результаты)

## Следующие шаги

- [ ] Удалить Python-зависимый код после проверки
- [ ] Добавить прогресс бар загрузки модели
- [ ] Добавить VAD (Voice Activity Detection) для авто-паузы
- [ ] Кэшировать загруженные модели в IndexedDB
