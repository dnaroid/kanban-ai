# Kanban AI — Voice Toggle (RU/EN) + State Machine для Realtime Transcription (`gpt-4o-mini-transcribe`)

> Дата: 2026-02-01  
> Аудитория: код-агент (GLM 4.7 / Dev-агент)  
> Цель: реализовать голосовой ввод **в режиме toggle** (Start/Stop) со **стримингом текста** (delta) и **надёжной финализацией** (commit + ожидание completed).

---

## 1) Выбор модели и почему именно она

### 1.1 Модель
- Default: `gpt-4o-mini-transcribe` — самая дешёвая, при этом даёт **инкрементальные delta** в Realtime transcription.

### 1.2 Требование
- Показывать надиктованное **в real-time** → значит нужен Realtime transcription session и обработка `...delta`/`...completed`.

---

## 2) UX (toggle) — спецификация поведения

### 2.1 Кнопка 🎙
- Нажал **Start** → начинает слушать/показывать live текст.
- Нажал **Stop** → останавливает микрофон и **дожидается финализации последней фразы**, затем завершает сессию.

### 2.2 Язык RU/EN
- Переключатель **RU / EN** (без Auto, чтобы было предсказуемо).
- Изменение языка применяется:
  - если диктовка не активна → на следующем Start
  - если активна → через `session.update`; считается допустимым, что это повлияет на **следующую** фразу (после speech_stopped/commit).

### 2.3 Live overlay
- `delta` отображается как **liveText** (серый overlay под полем).
- `completed` фиксируется в поле (или в финальный буфер), overlay очищается.

### 2.4 Правило вставки (рекомендация)
- Вставлять финальные `completed` **в конец поля** (стабильно и не ломает курсор).
- Добавлять пробел/перенос по правилам:
  - если конец поля не whitespace → добавить `' '`
  - если завершение фразы не содержит пунктуации и поле — description → добавить `' '`
  - если редактор AC в режиме списка → добавлять `'\n- '` после финала

---

## 3) State machine (обязательно реализовать)

### 3.1 Состояния
- `idle` — ничего не происходит
- `requesting_mic` — запрос доступа к микрофону
- `connecting` — поднимаем ws сессию Realtime
- `listening` — микрофон захвачен, чанки идут, но речи может не быть
- `speech` — сервер сообщает, что обнаружил речь
- `finalizing` — Stop нажат или `speech_stopped`, ждём финал `completed`
- `error` — ошибка (network/auth/mic/format)

### 3.2 События (внешние)
UI/Renderer:
- `UI_START(editorId)`
- `UI_STOP(editorId)`
- `UI_SET_LANG(editorId, ru|en)`

Realtime server:
- `EVT_SESSION_UPDATED`
- `EVT_SPEECH_STARTED`
- `EVT_SPEECH_STOPPED`
- `EVT_COMMITTED(itemId, previousItemId?)`
- `EVT_DELTA(itemId, textDelta)`
- `EVT_COMPLETED(itemId, transcript)`
- `EVT_FAILED(itemId, error)`
- `EVT_WS_CLOSED`
- `EVT_WS_ERROR`

### 3.3 Переходы (таблица)

#### `idle`
- `UI_START` → `requesting_mic`

#### `requesting_mic`
- mic granted → `connecting`
- mic denied → `error(mic_permission)`

#### `connecting`
- ws open → send `session.update` → `listening`
- ws error/close → `error(network)`

#### `listening`
- `EVT_SPEECH_STARTED` → `speech`
- `UI_STOP` → `finalizing(stop_requested)`

#### `speech`
- `EVT_SPEECH_STOPPED` → `finalizing(vad_pause)`
- `UI_STOP` → `finalizing(stop_requested)`

#### `finalizing`
- On enter:
  - stop sending audio
  - send `input_audio_buffer.commit` (best-effort)
  - start timer `FINALIZE_TIMEOUT_MS` (1500–2000ms)
- `EVT_COMPLETED(any tracked item)` → if no more pending → `idle` (after cleanup)
- timeout → `idle` (after cleanup)
- ws error → `error(network)` (but still cleanup)

#### `error`
- user can press Start again → `requesting_mic`
- (optional) show Retry button

### 3.4 Инварианты (важно для гонок)
- В один момент времени **одна активная диктовка на окно** (MVP).  
  Если нужен мультиредактор — делай `Map<editorId, session>` и не пересекай аудиопотоки.
- UI не должен получать `delta/completed` без `activeEditorId` → иначе игнорировать.
- После Stop обязательно:
  - остановить mic tracks
  - остановить AudioContext/worklet
  - перестать слать чанки
  - commit+wait+clear+close ws

---

## 4) Архитектура (renderer/preload/main)

### 4.1 Renderer
- `VoiceToggleController`:
  - управляет state в UI (через events от main)
  - держит `liveTextByItemId` и `currentLiveText`
- `VoiceCapture`:
  - AudioWorklet: float32 → resample 24k → PCM16 → чанки 20–40ms
  - на каждый чанк вызывает `window.stt.sendAudio(editorId, base64)`

### 4.2 Preload
Экспортирует API:
- `stt.start({ editorId, language })`
- `stt.stop({ editorId })`
- `stt.setLanguage({ editorId, language })`
- `stt.sendAudio({ editorId, pcm16Base64 })`
- `stt.onStatus(cb)` / `onDelta(cb)` / `onFinal(cb)` / `onError(cb)`

### 4.3 Main
- `STTController`:
  - 1 активная сессия на окно
  - принимает `start/stop/language/audio`
  - создаёт `RealtimeTranscriptionClient`
- `RealtimeTranscriptionClient`:
  - WS connect
  - send `session.update` (transcription-only)
  - `appendAudio()`
  - parse events → callbacks

---

## 5) Realtime messages (точные payloads, минимум)

### 5.1 `session.update` (transcription-only)
Отправить на connect:

```json
{
  "type": "session.update",
  "session": {
    "type": "transcription",
    "audio": {
      "input": {
        "format": { "type": "audio/pcm", "rate": 24000 },
        "noise_reduction": { "type": "near_field" },
        "transcription": {
          "model": "gpt-4o-mini-transcribe",
          "language": "ru",
          "prompt": "Kanban, user story, acceptance criteria, PR, merge, OpenCode."
        },
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 600,
          "create_response": false,
          "interrupt_response": false
        }
      }
    }
  }
}
```

### 5.2 Append audio
```json
{
  "type": "input_audio_buffer.append",
  "audio": "<base64 pcm16 bytes>"
}
```

### 5.3 Commit/Clear (на Stop)
```json
{ "type": "input_audio_buffer.commit" }
{ "type": "input_audio_buffer.clear" }
```

### 5.4 Update language (без реконнекта)
```json
{
  "type": "session.update",
  "session": {
    "audio": {
      "input": {
        "transcription": { "language": "en" }
      }
    }
  }
}
```

---

## 6) Логика сборки live текста (delta/completed)

### 6.1 Хранение
- `currentItemId` определяется через `EVT_COMMITTED(itemId)`
- `liveTextByItemId: Map<itemId, string>`
- На `delta(itemId, textDelta)` → `liveTextByItemId[itemId] += textDelta`
- Показывать:
  - если есть `currentItemId` → overlay = `liveTextByItemId[currentItemId]`
  - если нет → overlay = concat последних активных (но лучше ждать committed)

### 6.2 Финализация
- На `completed(itemId, transcript)`:
  - вставить `transcript` в поле
  - удалить `liveTextByItemId[itemId]`
  - overlay очистить если это был `currentItemId`

### 6.3 Stop и “хвост”
При Stop иногда последний `completed` не успевает прийти мгновенно → поэтому:
- Enter `finalizing`:
  - `commit`
  - ждать `completed` или timeout 2000ms
- По таймауту: 
  - если есть overlay текст → можно вставить его как “best effort”, пометив (опционально), но лучше **не вставлять** и предложить Retry.
  - Рекомендуемый MVP: если timeout и overlay не пуст → вставить overlay в конец (лучше, чем потерять).

---

## 7) Настройки и дефолты

- `MODEL_DEFAULT = "gpt-4o-mini-transcribe"`
- `LANG_DEFAULT = "ru"`
- `CHUNK_MS = 40` (проще для IPC) или 20 (лучше UX)
- `FINALIZE_TIMEOUT_MS = 2000`
- VAD: `threshold=0.5`, `silence_duration_ms=600`, `prefix_padding_ms=300`
- Noise reduction: `near_field`

---

## 8) Observability (диагностика)

Логировать в Diagnostics (main):
- start/stop timestamps
- ws connect/open/close/error
- bytes sent, chunks count, duration
- event counts (delta/completed/failed)
- finalize timeouts

---

## 9) Тест-план (минимум)

### 9.1 Manual smoke
1. Start, сказать RU 2–3 фразы, увидеть live overlay.
2. Пауза (VAD) → увидеть completed вставку.
3. Switch EN, сказать 1–2 фразы.
4. Stop во время речи → убедиться, что последняя фраза финализировалась (commit+wait) и вставилась.

### 9.2 Негатив
- denied mic
- no api key
- ws disconnect mid-stream
- rapid Start/Stop (debounce)

### 9.3 Fixture playback (авто)
- проигрывание WAV fixture → ожидаем non-empty transcript + наличие completed.

---

## 10) Definition of Done

- [ ] Toggle Start/Stop стабильно работает
- [ ] Live overlay обновляется по delta
- [ ] Completed фиксирует текст в поле и очищает overlay
- [ ] Stop делает commit+wait и не обрезает хвост
- [ ] RU/EN toggle работает (влияние на следующую фразу допустимо)
- [ ] Ключ не утекает в renderer
- [ ] Ошибки понятны пользователю + есть Retry
