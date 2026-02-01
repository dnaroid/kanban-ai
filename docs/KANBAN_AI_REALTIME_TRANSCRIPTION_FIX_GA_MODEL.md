# Kanban AI — Fix ошибки `invalid_parameter`: “Passing a transcription session update event to a realtime session is not allowed.”

Дата: 2026-02-01

## 1) Симптом

Сервер отвечает:

- `invalid_request_error`
- `code: "invalid_parameter"`
- `message: "Passing a transcription session update event to a realtime session is not allowed."`

## 2) Причина (в твоём текущем коде)

Ты открываешь WebSocket как **realtime conversation session** через legacy/preview realtime-модель:

```
wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview
```

А затем отправляешь:

- `type: "session.update"`
- `session.type: "transcription"`

То есть пытаешься “переключить” realtime-сессию в transcription-сессию. В GA протоколе это запрещено для legacy/preview модели — отсюда ошибка.

## 3) Правильный GA путь

### 3.1 Подключайся к GA realtime модели
Используй:

- `gpt-realtime` (база)
- или `gpt-realtime-mini` (дешевле)

И открывай сокет так:

```
wss://api.openai.com/v1/realtime?model=gpt-realtime
```

(или `gpt-realtime-mini`)

### 3.2 Транскрипт-модель задавай внутри `session.update`
Твоя транскрипция должна быть настроена в:

- `session.type = "transcription"`
- `session.audio.input.transcription.model = "gpt-4o-mini-transcribe"`
- `session.audio.input.format = { type: "audio/pcm", rate: 24000 }`

То есть WS **модель** = `gpt-realtime*`, а **STT модель** = `gpt-4o-mini-transcribe` внутри payload.

## 4) Минимальный патч в твоём коде

### A) Поменять дефолт realtimeModel

Было:
```ts
realtimeModel: config.realtimeModel ?? "gpt-4o-realtime-preview",
```

Стало:
```ts
realtimeModel: config.realtimeModel ?? "gpt-realtime-mini", // или "gpt-realtime"
```

### B) URL оставить как есть (он уже собирается из realtimeModel)

```ts
const url = `wss://api.openai.com/v1/realtime?model=${this.config.realtimeModel}`
```

После (A) получится:
- `...model=gpt-realtime-mini` или `...model=gpt-realtime`

### C) `sendSessionUpdate()` у тебя уже правильный
Твой текущий payload:

- `type: "session.update"`
- `session.type: "transcription"`
- `audio.input.format: audio/pcm 24000`
- `audio.input.transcription.model: gpt-4o-mini-transcribe`
- `turn_detection: server_vad`

— выглядит корректно.

## 5) Критичный нюанс: аудио действительно должно быть 24 kHz PCM16 mono

Раз ты указываешь:

```ts
format: { type: "audio/pcm", rate: 24000 }
```

то в `input_audio_buffer.append` нужно отправлять **PCM16LE mono**, реально ресемпленный до **24 kHz**.
Если ты шлёшь 48k/44.1k/16k “как есть”, VAD/качество/дельты могут работать странно.

## 6) Что должно произойти после фикса

После смены `realtimeModel`:

1) На коннекте увидишь `session.created`
2) После `session.update` — `session.updated`
3) После начала речи:
   - `input_audio_buffer.speech_started`
   - затем `conversation.item.input_audio_transcription.delta`
4) После паузы/stop:
   - `conversation.item.input_audio_transcription.completed`

## 7) Быстрый чеклист

- [ ] WS URL: `.../realtime?model=gpt-realtime-mini` (или gpt-realtime)
- [ ] `session.update` отправляется **после** open
- [ ] `session.type = "transcription"`
- [ ] `audio.input.format = audio/pcm rate=24000`
- [ ] Реально шлёшь PCM16 mono 24kHz в `append`
