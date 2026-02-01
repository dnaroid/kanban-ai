# Kanban AI — Realtime STT (RU/EN) со стримингом: почему падает и как починить (GA протокол)

> Цель: дешёвый realtime-стриминг транскрипта (RU/EN) в редакторе user story (live text), с toggle/переключением языка.

---

## 1) Что означают ваши ошибки

### Ошибка: `invalid_model` про `gpt-4o-mini-transcribe`
```
Model "gpt-4o-mini-transcribe" is not supported in realtime mode.
```

**Причина:** вы пытаетесь использовать STT-модель как *realtime model* (то есть как `?model=...` в WebSocket URL).  
**Как правильно:** `gpt-4o-mini-transcribe` задаётся **внутри** настройки transcription session (`audio.input.transcription.model`), а не как `?model=`. citeturn7view0turn8view0

### Ошибка: `Invalid value: 'tra...ate' ... Supported values are: 'session.update', ...`
**Причина:** вы отправляете событие `transcription_session.update` (или payload “как для него”) в **GA** Realtime протокол, где конфигурация задаётся **через `session.update`**. citeturn8view0

### Ошибка: `Passing a transcription session update event to a realtime session is not allowed.`
**Причина:** сервер создал сессию типа `realtime`, а вы пытаетесь применить конфиг transcription-сессии. В GA это решается тем, что **первый же `session.update` задаёт `session.type: "transcription"`** и корректную структуру `session.audio.input.*`. citeturn8view0turn11view0

---

## 2) Самая дешёвая модель для STT со стримингом

Для потоковой транскрипции (дельты в реальном времени) в transcription session самая дешёвая опция:
- **`gpt-4o-mini-transcribe`** — ориентировочно **$0.003 / minute**. citeturn10search0

Для сравнения:
- `gpt-4o-transcribe` — ~$0.006 / minute. citeturn10search0

---

## 3) Правильный протокол realtime transcription (GA)

### 3.1 URL и авторизация

**Если вы в Electron:** API key нельзя хранить в renderer. Делайте так:
1) В **main-процессе** (или на backend) создавайте ephemeral client secret через REST `realtime/client_secrets`.
2) В renderer (или где живёт WebSocket) подключайтесь по WS уже с `Authorization: Bearer <client_secret>`.

GA документация про WebSocket прямо описывает server-to-server подключение и `session.update`. citeturn11view0

> Если вы всё держите в main-процессе и не светите ключ — можно подключаться напрямую с API key, но **первый `session.update` должен быть корректным**.

### 3.2 Правильный `session.update` для transcription

Официальный гайд по realtime transcription показывает структуру **`session.audio.input.*`** и формат **`audio/pcm` 24 kHz**. citeturn7view0turn8view0

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
          "prompt": "Expect product and engineering terms: Kanban, user story, acceptance criteria, PR, merge, OpenCode."
        },
        "turn_detection": {
          "type": "server_vad",
          "threshold": 0.5,
          "prefix_padding_ms": 300,
          "silence_duration_ms": 500,
          "create_response": false,
          "interrupt_response": false
        }
      }
    }
  }
}
```

**Важно:** для `audio/pcm` поддерживается **только rate=24000**. citeturn7view0turn8view0

---

## 4) Патч к вашему TypeScript-клиенту

### 4.1 Исправляем `sendSessionUpdate()`

В вашем коде вы шлёте `transcription_session.update` и верхнеуровневые поля `input_audio_format`, `input_audio_transcription` — это и ломает.

Замените на:

```ts
private sendSessionUpdate(): void {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

  const sessionUpdate = {
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: 24000 },
          noise_reduction: { type: 'near_field' },
          transcription: {
            model: this.config.model,       // "gpt-4o-mini-transcribe"
            language: this.config.language, // "ru" | "en"
            prompt:
              'Expect product and engineering terms: Kanban, user story, acceptance criteria, PR, merge, OpenCode.',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: this.config.vadThreshold,
            prefix_padding_ms: this.config.vadPrefixPaddingMs,
            silence_duration_ms: this.config.vadSilenceDurationMs,
            create_response: false,
            interrupt_response: false,
          },
        },
      },
    },
  };

  this.ws.send(JSON.stringify(sessionUpdate));
  console.log('[RealtimeTranscriptionClient] Sent session.update (transcription)');
}
```

Источники структуры: Realtime transcription guide + Realtime client events. citeturn7view0turn8view0

### 4.2 Обработайте `session.created`
Вы логируете `Unhandled event type: session.created`. Это не ошибка — просто добавьте обработчик:

```ts
interface SessionCreatedEvent extends OpenAIClientEvent {
  type: 'session.created'
}

type ServerEvent =
  | SessionCreatedEvent
  | SessionUpdatedEvent
  | InputAudioBufferSpeechStartedEvent
  | InputAudioBufferSpeechStoppedEvent
  | InputAudioBufferCommittedEvent
  | ConversationItemInputAudioTranscriptionDeltaEvent
  | ConversationItemInputAudioTranscriptionCompletedEvent
  | ConversationItemInputAudioTranscriptionFailedEvent
  | ErrorEvent;
```

И в `switch`:

```ts
case 'session.created':
  console.log('[RealtimeTranscriptionClient] Session created');
  break;
```

### 4.3 Аудио: обязательно 24 kHz mono PCM16
Вы сейчас используете `pcm16` как “формат” без sample rate. В GA протоколе нужно:
- Downsample микрофон (часто 48k) → **24k**
- Float32 [-1..1] → Int16 LE
- base64 → `input_audio_buffer.append`

---

## 5) RU/EN toggle без реконнекта

Переключение языка = повторный `session.update` с новым `language`:

```ts
updateLanguage(language: STTLanguage): void {
  this.config.language = language;
  this.sendSessionUpdate();
}
```

---

## 6) Expected flow (как понять, что всё работает)

1) WS open → приходит `session.created`
2) Вы шлёте **корректный** `session.update` (type=transcription, audio.input.*)
3) Приходит `session.updated`
4) Во время речи приходят:
   - `input_audio_buffer.speech_started`
   - пачка `conversation.item.input_audio_transcription.delta` (у GPT-4o transcribe/mini-transcribe — инкрементально) citeturn7view0
   - `conversation.item.input_audio_transcription.completed`

---

## 7) FAQ по вашим двум выборам (A/B)

- **A (Realtime transcription session)** — то, что вы делаете. Для него **нельзя** ставить `?model=gpt-4o-mini-transcribe`; модель транскрипции ставится в `audio.input.transcription.model`. citeturn7view0turn8view0  
- **B (Conversation realtime + отдельный ASR)** — работает, но вы платите за realtime модель, даже если вам нужен только текст. Для “дешево и быстро” A лучше.

---

## Источники
- Realtime transcription guide (структура transcription session, пример `session.update`, delta/completed события, 24kHz PCM). citeturn7view0  
- Realtime client events reference (`session.update` и поля `audio.input.*`, список поддерживаемых моделей транскрипции). citeturn8view0  
- Realtime WebSocket guide (пример подключения и `session.update`). citeturn11view0  
- Pricing (стоимость `gpt-4o-mini-transcribe` vs `gpt-4o-transcribe`). citeturn10search0
