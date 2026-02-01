# Kanban AI — стриминговый голосовой ввод (RU/EN) через OpenAI Realtime Transcription (Electron)

Цель: встроить в Kanban AI удобный **стриминговый диктофон** для надиктовки **User Story / Description / AC**, с:
- языками **RU / EN** (переключатель)
- **потоковыми частичными результатами** (partial / delta)
- финализацией фразы по VAD (server-side)
- безопасным хранением ключа и изоляцией renderer от API-key
- быстрым UX: push-to-talk / start-stop, статус “слушаю”, вставка текста в поле

> Основа: Realtime transcription sessions + события `conversation.item.input_audio_transcription.delta` / `...completed`, аудио в `audio/pcm` 24kHz mono, чанки через `input_audio_buffer.append`, VAD `server_vad` commits буфер сам.  
> См. OpenAI docs: Realtime transcription guide + client/server events reference.

---

## 0) Важно про форматы и события (коротко)

**Аудио формат (рекомендуемый):**
- `audio/pcm`, **24 kHz**, mono, **PCM16LE** (int16 little-endian).

**Ключевые client events:**
- `session.update` — настраиваем transcription session (`type: "transcription"`), язык, VAD, noise reduction.
- `input_audio_buffer.append` — шлём base64-байты аудио (чанки).
- (опционально) `input_audio_buffer.commit` — если VAD отключён. При `server_vad` можно не слать.

**Ключевые server events:**
- `input_audio_buffer.speech_started` / `speech_stopped` — для UI-индикатора “говорит/тишина”.
- `input_audio_buffer.committed` — сервер закоммитил буфер -> появится item.
- `conversation.item.input_audio_transcription.delta` — стриминговая расшифровка (частичная).
- `conversation.item.input_audio_transcription.completed` — финальный текст фразы.
- `conversation.item.input_audio_transcription.failed` — ошибка распознавания.

**Важно:** порядок `completed` между разными фразами не гарантирован — связывай по `item_id` и `previous_item_id` из committed.

---

## 1) UX/продуктовые требования (что сделать в UI)

### 1.1. Где появляется микрофон
- В редакторе Story/Description (и/или в редакторе AC) рядом с textarea:
  - кнопка 🎙 **Start / Stop**
  - переключатель языка: **RU / EN**
  - индикатор статуса: `Idle / Listening / Speech / Finalizing / Error`
  - опция “Авто-оформление BA” (не в этой фазе, но полезно)

### 1.2. Поведение вставки текста
- Пока идут `delta`:
  - показывай “серый” **live текст** (не финальный) в оверлее или как временный tail в поле
- На `completed`:
  - **фиксируй** текст в поле (добавляя пробел/перенос по правилам)
  - очищай live tail
- Если пользователь печатает руками во время диктовки:
  - live tail должен вставляться в **позицию курсора** или в конец (выбери и зафиксируй правило).
  - предпочтительнее: “вставка в позицию курсора” (сложнее) или “в конец” (проще, стабильнее).

### 1.3. Управление паузами и финализацией
- Использовать `server_vad`:
  - фраза завершается после тишины `silence_duration_ms` (настроим ~500–800ms)
- Push-to-talk:
  - (опционально) режим, когда запись идёт только пока удерживается кнопка.

---

## 2) Архитектура интеграции в Electron

### 2.1. Почему ключ в Main, а не в Renderer
- Renderer легко инспектируется.
- API ключ хранить и использовать в `main` (Node) и общаться с UI через IPC.

### 2.2. Компоненты
**Renderer**
- `VoiceCapture` (WebAudio + AudioWorklet) → выдаёт PCM16 24kHz чанки
- UI-компонент `VoiceInputButton` + `LanguageToggle`
- IPC client `sttClient` (через preload)

**Preload**
- expose ограниченный API: `window.stt.start() / stop() / setLanguage() / onDelta() / onFinal()`

**Main**
- `RealtimeTranscriptionClient` (WebSocket) — соединение с OpenAI
- `STTController` — связывает IPC и клиента, маршрутизирует события по `windowId`/`editorId`

---

## 3) IPC контракт (обязательный минимум)

### 3.1. Каналы (renderer -> main)
- `stt:start` `{ editorId: string, language: "ru"|"en", mode?: "ptt"|"toggle" }`
- `stt:stop` `{ editorId: string }`
- `stt:language` `{ editorId: string, language: "ru"|"en" }`
- `stt:audio` `{ editorId: string, pcm16Base64: string }`  *(или binary через MessagePort, но base64 проще)*

### 3.2. Каналы (main -> renderer)
- `stt:status` `{ editorId, status: "idle"|"listening"|"speech"|"finalizing"|"error", details? }`
- `stt:delta` `{ editorId, itemId, textDelta: string }`
- `stt:final` `{ editorId, itemId, transcript: string }`
- `stt:error` `{ editorId, error: { code?: string, message: string } }`

> `editorId` — чтобы поддержать несколько открытых редакторов/окон чата.

---

## 4) Realtime WebSocket: настройка и жизненный цикл

### 4.1. URL и аутентификация
Использовать WebSocket к Realtime API:
- URL (типовой): `wss://api.openai.com/v1/realtime?model=<MODEL>`
- заголовок: `Authorization: Bearer ${OPENAI_API_KEY}`

**MODEL** для transcription-only:
- практический выбор: `gpt-4o-mini-transcribe` (дёшево) или `gpt-4o-transcribe` (чуть лучше качество).

### 4.2. session.update (transcription session)
Сразу после `ws.on("open")` отправь:

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
          "silence_duration_ms": 600,
          "create_response": false,
          "interrupt_response": false
        }
      }
    }
  }
}
```

**Замечания:**
- `create_response: false` — важно, чтобы модель **не генерировала ответы**, только транскрипцию.
- `language` меняется через повторный `session.update` при переключателе RU/EN.
- `prompt` — помогает “не ломать” терминологию.

### 4.3. Отправка аудио чанков
Каждый чанк — `input_audio_buffer.append`:

```json
{
  "type": "input_audio_buffer.append",
  "audio": "<base64 PCM16LE bytes>"
}
```

Рекомендации по чанкам:
- 20ms на чанк при 24kHz:
  - 480 samples * 2 bytes = 960 bytes raw
  - ~1.3KB base64
  - 50 событий/сек — нормально
- Если UI/IPC тяжёлый: 40ms чанки (25/сек) тоже ок, но VAD реагирует чуть медленнее.

### 4.4. Остановка
- При `server_vad` не обязательно `commit`, но при “Stop” удобно:
  - остановить захват микрофона
  - отправить `input_audio_buffer.commit` (на всякий случай, если в буфере есть звук)
  - затем `input_audio_buffer.clear` (чтобы не смешивались фразы)

---

## 5) Захват микрофона в Renderer (AudioWorklet)

### 5.1. Почему AudioWorklet
- стабильный low-latency поток
- можно делать ресемплинг и PCM16 конверсию внутри worklet

### 5.2. Структура файлов
Предложение (адаптируй под ваш проект):

```
src/
  main/
    stt/
      RealtimeTranscriptionClient.ts
      STTController.ts
  preload/
    sttBridge.ts
  renderer/
    voice/
      VoiceCapture.ts
      pcm16-worklet.ts
    ui/
      VoiceInputButton.tsx
      LanguageToggle.tsx
```

### 5.3. Worklet: вывод PCM16 @ 24kHz
Псевдо-алгоритм:
1) input frames приходят как float32 @ sampleRate (обычно 48k)
2) ресемплинг до 24k (простейший linear interpolation)
3) clamp [-1..1], convert → int16
4) группировать в чанки по N samples (например 480)
5) postMessage `Int16Array` в Renderer

Скелет `pcm16-worklet.ts` (идея, не готовый код):

```ts
class PCM16Worklet extends AudioWorkletProcessor {
  private inRate = sampleRate;     // rate of AudioContext (e.g. 48000)
  private outRate = 24000;
  private ratio = this.inRate / this.outRate;

  private carry: Float32Array = new Float32Array(0);
  private outBuffer: number[] = [];

  process(inputs: Float32Array[][]) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    // 1) concat carry + input
    const merged = new Float32Array(this.carry.length + input.length);
    merged.set(this.carry, 0);
    merged.set(input, this.carry.length);

    // 2) resample -> fill outBuffer with int16
    // (linear interpolation)
    let t = 0;
    while (t + this.ratio < merged.length) {
      const i0 = Math.floor(t);
      const i1 = i0 + 1;
      const frac = t - i0;
      const s = merged[i0] * (1 - frac) + merged[i1] * frac;

      const clamped = Math.max(-1, Math.min(1, s));
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      this.outBuffer.push(int16 | 0);

      t += this.ratio;

      // 3) chunking
      if (this.outBuffer.length >= 480) {
        const chunk = new Int16Array(this.outBuffer.splice(0, 480));
        this.port.postMessage(chunk, [chunk.buffer]);
      }
    }

    // 4) keep leftover in carry
    const consumed = Math.floor(t);
    this.carry = merged.slice(consumed);
    return true;
  }
}
registerProcessor("pcm16-worklet", PCM16Worklet);
```

> Код-агенту: сделай аккуратную реализацию с корректным `t`/carry, тестом на 44.1kHz, и без аллокаций в горячем цикле (по возможности).

### 5.4. Renderer: VoiceCapture
- создаёт AudioContext
- грузит worklet module
- подключает `MediaStreamAudioSourceNode` → `AudioWorkletNode`
- подписывается на `workletNode.port.onmessage` и отправляет chunks в main по IPC

Рекомендации:
- ограничить запись в фоне (сворачивается окно) — по UX решить.
- просить permission аккуратно: “Нужен микрофон для диктовки…”

---

## 6) Main: WebSocket клиент Realtime Transcription

### 6.1. Реализация `RealtimeTranscriptionClient`
Требования:
- `connect({ language, model, ... })`
- `updateLanguage(lang)` → `session.update` только `transcription.language`
- `appendAudio(base64)` → `input_audio_buffer.append`
- `stop()` → optionally commit+clear, close ws
- parse all server events and отдавать наружу типизированные callbacks

### 6.2. Маппинг item_id → editorId
Стратегия:
- при `stt:start(editorId)` → стартуем сессию и храним `activeEditorId`
- `input_audio_buffer.committed` приходит с `item_id` → записываем mapping `itemId -> editorId`
- `delta/completed` приходят с `item_id` → находим editorId по mapping, шлём в UI

Если потенциально несколько редакторов одновременно:
- либо 1 активная сессия на окно (проще)
- либо мультисессии: `Map<editorId, Client>` (дороже, но ок)

### 6.3. Обработка событий (минимум)
- `session.updated` → статус `listening`
- `input_audio_buffer.speech_started` → статус `speech`
- `input_audio_buffer.speech_stopped` → статус `finalizing`
- `conversation.item.input_audio_transcription.delta` → `stt:delta`
- `conversation.item.input_audio_transcription.completed` → `stt:final` + статус `listening`
- `conversation.item.input_audio_transcription.failed` или `error` → `stt:error`

### 6.4. Авто-реконнект
Минимально:
- если сокет упал → статус error + кнопка “Retry”
Лучше:
- backoff (250ms → 1s → 2s → 5s max)
- очередь чанков не хранить долго (иначе будет “догонять” прошлое)

---

## 7) Безопасность и хранение ключа

### 7.1. Хранение ключа
- Не хранить ключ в renderer.
- Хранить:
  - либо в `.env` (dev)
  - либо в OS keychain/secure storage (prod)
- В UI: Settings → “OpenAI API Key” (ввод пользователем).

### 7.2. Минимальные меры
- IPC whitelist: только нужные каналы
- `contextIsolation: true`, `nodeIntegration: false`
- Preload экспортирует только `window.stt.*`

---

## 8) Интеграция с Kanban: куда класть текст

### 8.1. Точки интеграции
- `TaskDetailsPanel` → поле `story`
- `AcceptanceCriteriaEditor`
- (опционально) `ChatInput` для надиктовки сообщений

### 8.2. Правило вставки (рекомендуемое по стабильности)
- Всё надиктованное добавляется **в конец текущего текста**, с:
  - если нет пробела перед вставкой → добавить пробел
  - если completed заканчивается на пунктуацию → добавить пробел после
  - если это AC editor → после completed добавлять `\n- ` (если включён режим “список”)

---

## 9) Тест-план (чтобы QA/тест-агент мог проверить)

### 9.1. Smoke (ручной)
1) Открыть таску → Story editor → нажать 🎙
2) Сказать RU фразу “Сделать кнопку создания PR”
3) Видеть live текст (delta), затем финал
4) Переключить на EN → сказать “Add acceptance criteria checklist”
5) Нажать Stop → убедиться, что запись остановилась и ничего не “дописывает”

### 9.2. Негативные сценарии
- запрет микрофона: показать понятную ошибку + CTA открыть настройки ОС
- нет ключа: “Добавьте OpenAI API key”
- сеть пропала: статус error, retry
- слишком шумно: проверить VAD (подкрутить threshold/silence_duration_ms)
- быстро переключать RU/EN во время речи: язык переключится на следующую фразу (допустимо)

### 9.3. Автотесты (без микрофона)
Сделай режим “playback file”:
- читает WAV/PCM fixture
- режет на 20ms чанки
- шлёт в `input_audio_buffer.append`
- ожидает `completed` содержит нужный текст (примерно, допускай вариативность)

---

## 10) Бюджет и настройки по умолчанию (рекомендуемые)

### 10.1. Модель
- default: `gpt-4o-mini-transcribe`
- optional toggle “High accuracy”: `gpt-4o-transcribe`

### 10.2. VAD
- `threshold: 0.5`
- `prefix_padding_ms: 300`
- `silence_duration_ms: 600` (если “обрывает” слова — увеличить до 800)

### 10.3. Chunk size
- 20ms (best UX)
- 40ms если IPC/CPU тяжело

---

## 11) Definition of Done (DoD)

- [ ] В Story editor есть микрофон, RU/EN toggle, status UI
- [ ] Дельты приходят и отображаются “живым” текстом
- [ ] Completed фиксирует текст в поле
- [ ] Stop останавливает запись и не оставляет висящий сокет
- [ ] Ошибки отображаются понятно (mic permission / no key / network)
- [ ] Ключ не доступен renderer (нет утечек через preload)
- [ ] Есть режим автотеста через WAV fixtures

---

## 12) Ссылки на первичные спецификации (для код-агента)
(добавь/обнови по мере надобности)

- Realtime transcription guide (OpenAI docs)
- Realtime client events (`session.update`, `input_audio_buffer.append/commit/clear`)
- Realtime server events (`speech_started/stopped`, transcription delta/completed/failed`)
