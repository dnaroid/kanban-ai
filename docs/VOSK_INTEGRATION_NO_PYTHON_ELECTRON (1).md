# Kanban AI — Vosk без Python: как совместить с AudioWorklet и получать real‑time текст

Дата: 2026-02-01

## TL;DR

Да, можно **полностью убрать Python-скрипт** и использовать Vosk напрямую внутри Electron:

1) **Вариант 1 (рекомендую): Vosk в renderer через WebAssembly**
    - `vosk-browser` (WASM) или более лёгкий/активно поддерживаемый `Vosklet`
    - AudioWorklet остаётся полезным: он даёт стабильный **PCM16 16 kHz** чанками
    - Partial/Final результаты обновляют UI в реальном времени

2) **Вариант 2: Vosk в main через Node native bindings (`vosk` npm)**
    - Работает, но часто возникают проблемы с ABI Electron/Node и пересборкой нативных биндингов
    - Реально, но обычно больше боли, чем пользы

Ниже — подробный план реализации под Kanban AI.

---

## 1) Что ты хочешь получить

- Toggle “🎙️ Dictate” в редакторе (описание таски / story)
- RU/EN переключатель
- Real-time обновление текста “по мере речи” (partial)
- Commit “финальной фразы” (final) в поле
- Всё локально (без облака), без Python

---

## 2) Вариант 1: WASM в renderer (лучший для Electron)

### 2.1 Почему это самый простой путь

- Не нужно нативных биндингов под Electron ABI
- Работает кроссплатформенно (Windows/macOS/Linux) проще упаковывать
- Уже существуют готовые проекты/библиотеки:
    - `vosk-browser` — WASM build Vosk для браузера
    - `Vosklet` — лёгкий распознаватель в браузере (WASM), вдохновлён vosk-browser, заявляет активную поддержку

### 2.2 Где будет жить распознавание

Рекомендуется: **Web Worker** (а не main thread renderer), чтобы UI/drag&drop не лагали.

Схема:

- AudioWorklet (audio thread) → чанки PCM16 → renderer thread → worker → partial/final → renderer UI

### 2.3 Минимальный интерфейс сообщений

**renderer → worker**

```ts
type MsgIn =
  | { type: "init"; lang: "ru" | "en" }
  | { type: "audio"; pcm16: ArrayBuffer }        // 20–40ms
  | { type: "reset" }
  | { type: "setLang"; lang: "ru" | "en" }
  | { type: "dispose" };
```

**worker → renderer**

```ts
type MsgOut =
  | { type: "ready" }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; message: string };
```

---

## 3) AudioWorklet: зачем он нужен вместе с Vosk

Vosk (и большинство оффлайн движков) хотят **PCM16 mono 16kHz**.  
Микрофон даёт float32 и часто 48kHz.

Worklet решает:

- ресемплинг в 16kHz
- float32 → int16
- порционная выдача чанков (20–40ms) с низкой задержкой
- стабильность (меньше завиcит от загрузки UI)

---

## 4) Реализация (рекомендованный MVP) — пошагово

### Шаг 0. Выбор библиотеки

#### Опция A: `vosk-browser`

Плюсы: классическая библиотека, понятная интеграция.  
Минусы: обновлялась давно, модели/потоки могут быть “тяжелее” в интеграции.

#### Опция B: `Vosklet`

Плюсы: лёгкий и заявляет активное развитие, есть примеры под микрофон.  
Минусы: надо проверить под твой бандлер/политику CSP.

Для MVP я бы начал с **Vosklet**, если он нормально заводится в Electron. Если будут проблемы — перейти на vosk-browser.

---

### Шаг 1. Добавь worker для распознавания

#### `stt.vosk.worker.ts` (каркас)

- загружает модель для выбранного языка
- создаёт recognizer
- на `audio` принимает PCM16 и вызывает `acceptWaveform(...)`
- шлёт `partial`/`final`

Концептуально логика такая (псевдокод, API конкретной либы смотри в их README/Examples):

```ts
let recognizer: any;

onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    recognizer = await createRecognizerForLang(msg.lang); // load model + init
    postMessage({type: "ready"});
  }
  if (msg.type === "setLang") {
    await disposeRecognizer();
    recognizer = await createRecognizerForLang(msg.lang);
    postMessage({type: "ready"});
  }
  if (msg.type === "audio") {
    const pcm16 = new Int16Array(msg.pcm16);
    const out = recognizer.acceptWaveform?.(pcm16) ?? {};
    if (out.partial) postMessage({type: "partial", text: out.partial});
    if (out.text) postMessage({type: "final", text: out.text});
  }
  if (msg.type === "reset") recognizer.reset?.();
  if (msg.type === "dispose") {
    await disposeRecognizer();
    close();
  }
};
```

---

### Шаг 2. Renderer: создать STTController поверх worker

Функции:

- `start(lang)` → init worker + start mic
- `stop()` → stop mic + dispose worker
- `setLang(lang)` → перезапуск модели (или смена)
- events: `onPartial(text)`, `onFinal(text)`

Важно: UI обычно показывает:

- `liveText` (partial) поверх инпута (placeholder overlay)
- при `final` — вставить в поле + очистить `liveText`

---

### Шаг 3. AudioWorklet: отдавать PCM16 чанки

MVP способ:

- worklet делает int16 чанки (например 320 сэмплов = 20ms при 16kHz)
- отправляет в renderer `postMessage({ type: "audio", pcm16: chunk.buffer }, [chunk.buffer])`
- renderer транзитом шлёт worker

Если хочешь оптимизацию:

- SharedArrayBuffer ring-buffer между worklet и worker (сильно снижает overhead сообщений)
- но это можно отложить.

---

## 5) Вариант 2: без worker — Vosk в main (Node bindings)

Теоретически можно:

- поставить `vosk` npm (Node bindings)
- в main процессе держать recognizer и кормить PCM16 с renderer через IPC

Но на практике часто встречаются:

- проблемы “no native build found for runtime=electron” (ABI mismatch)
- необходимость `electron-rebuild`/сборки нативных модулей под версию Electron
- иногда проблемы совместимости нативных зависимостей с современными Node версиями

Поэтому этот вариант я рекомендую **только если WASM не устраивает** (например, CPU/латентность/размер моделей).

---

## 6) RU/EN и модели

Обычно RU и EN — это **разные модели**, поэтому переключатель языка чаще всего = **перезапуск recognizer** с другим
model path.

MVP стратегия:

- `setLang("ru"|"en")` → stop recognition → unload → load other model → start

---

## 7) UX детали для Kanban AI (как сделать приятно)

- Toggle-кнопка (🎙️) с 3 состояниями: `off` → `listening` → `stopping`
- Индикатор уровня громкости (необязательно, но очень помогает пользователю)
- Горячая клавиша: например `Ctrl+Shift+D` (Dictate)
- Авто-commit при паузе (VAD) + ручной commit кнопкой (по желанию)
- Авто-добавление пробела/перевода строки между финальными сегментами

---

## 8) Что выбрать прямо сейчас

Если цель — **быстро и надёжно**:

1) WASM (renderer+worker)
2) AudioWorklet для PCM16 16kHz
3) RU/EN = перезапуск модели

Python-скрипт становится не нужен.

---

## 9) Чеклист “готово”

- [ ] Toggle старт/стоп диктовки без утечек
- [ ] `partial` обновляет live overlay без лагов
- [ ] `final` добавляет текст в textarea
- [ ] RU/EN переключается (перезапуск модели)
- [ ] Распознавание не блокирует UI (worker)
- [ ] Модель кэшируется/не скачивается каждый раз
