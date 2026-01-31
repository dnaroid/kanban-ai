# Голосовой ввод в Electron: самый простой путь (и варианты) — Kanban AI

> Дата: 2026-01-31

Ниже — практическая “шпаргалка” **как проще всего добавить голосовой ввод** в Electron-приложение (в твоём случае — Kanban AI).  
Ключевой вывод: **Web Speech API (SpeechRecognition) часто не работает в Electron**, поэтому “самое простое и надёжное” обычно = **запись аудио + отправка в STT API** (онлайн) или **локальный движок (whisper.cpp / Vosk)**.

---

## 1) Варианты по сложности (сверху — проще)

### Вариант A — “самый простой и надёжный”: MediaRecorder → STT API (облако)
**Плюсы**
- минимальная интеграция
- качество обычно высокое
- кроссплатформенно (macOS/Windows/Linux)
- можно быстро сделать “диктовку в любое поле”

**Минусы**
- нужен интернет
- стоимость и ключи
- приватность (аудио уходит наружу)

**Когда выбирать**
- “просто чтобы работало” и без возни с моделями/библиотеками.

---

### Вариант B — “просто, но оффлайн”: whisper.cpp (локально) через CLI
**Плюсы**
- оффлайн и приватно
- хорошее качество (особенно на `base`/`small`)
- кроссплатформенно, есть готовые бинарники/сборки

**Минусы**
- нужно тянуть модель (десятки/сотни МБ)
- скорость зависит от CPU/GPU
- надо конвертировать звук в нужный формат (обычно 16kHz mono PCM/WAV)

**Когда выбирать**
- хочешь оффлайн-first и приватность.

---

### Вариант C — “лёгкий оффлайн для streaming”: Vosk (локально)
**Плюсы**
- очень лёгкий и быстрый, умеет потоковое распознавание
- работает на слабых машинах, много языков

**Минусы**
- качество часто хуже Whisper (особенно на шуме/акцентах)
- иногда нужен подбор модели/словари

**Когда выбирать**
- нужен “live captions” / мгновенные частичные результаты и низкие требования к железу.

---

### Вариант D — Web Speech API (`window.SpeechRecognition`)
**Почему обычно НЕ рекомендую для Electron**
- в браузерах это “магия”, а в Electron часто упирается в то, что распознавание отключено/ломается “network error” и поведение нестабильно.

Если вдруг у тебя уже работает — супер, это действительно “3 строки кода”, но как базовый путь для продукта — риск.

---

## 2) Рекомендация для Kanban AI (после фазы 5)

Сделай **Voice Input Service** с двумя режимами:

1) **Default (быстро)**: Cloud STT (вариант A)  
2) **Offline (optional)**: whisper.cpp (вариант B)  
(а Vosk — как “ультра-лайт streaming” если понадобится)

UI при этом один: кнопка 🎙 “диктовать” рядом с полями ввода.

---

## 3) Минимальная UX-спека (чтобы было удобно)

### Где включать голос
- Quick add task (в колонке)
- Task title / description editor
- Global search input
- Chat message в “окне чата таски”
- Release notes editor

### Поведение (MVP)
- кнопка 🎙 рядом с инпутом
- режим **push-to-talk**:
  - нажал → запись
  - отпустил → остановка → транскрипт
- вставка результата:
  - для `input`: вставить в курсор
  - для `textarea/markdown`: вставить с пробелом/переносом
- “Confirm overlay” (опционально):
  - показать распознанный текст
  - кнопки: Insert / Retry / Cancel

### Quality-of-life (через пару итераций)
- авто-пунктуация (если движок умеет)
- hotkey: `Ctrl/Cmd + Shift + D` (диктовка)
- выбор языка (ru/pl/en) + remember per project

---

## 4) Архитектура в Electron (самая простая)

### Вариант 1 (чаще всего лучший): запись в Renderer → транскрипция в Main
1) Renderer:
   - захватывает микрофон (`navigator.mediaDevices.getUserMedia`)
   - записывает `MediaRecorder` → blob
2) Renderer отправляет blob/ArrayBuffer через IPC в Main
3) Main:
   - либо вызывает STT API
   - либо запускает локальный распознаватель (whisper.cpp / vosk)
4) Main возвращает текст обратно в Renderer
5) Renderer вставляет текст в активный input/textarea

Плюс: в Main проще управлять ключами/секретами и запускать бинарники.

---

## 5) Реализация: “самый простой” (Cloud STT) — скелет

### 5.1 Renderer: запись голоса (MediaRecorder)
```ts
async function recordOnce(): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
  const chunks: BlobPart[] = [];

  return await new Promise((resolve, reject) => {
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onerror = (e) => reject(e);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: rec.mimeType }));
    };

    rec.start();

    // MVP: max duration cap (например 10s)
    setTimeout(() => rec.stop(), 10_000);
  });
}
```

### 5.2 Renderer → Main IPC: отправка
```ts
const blob = await recordOnce();
const buf = Buffer.from(await blob.arrayBuffer());

const { text } = await window.ipc.invoke("stt.transcribe", {
  mime: blob.type,
  audio: buf,
  language: "ru" // optional
});

insertIntoActiveField(text);
```

### 5.3 Main: транскрипция через STT API (псевдо)
```ts
ipcMain.handle("stt.transcribe", async (_evt, req) => {
  // 1) сохранить во временный файл (если API ждёт файл)
  // 2) вызвать STT API клиента (fetch/axios) с auth из SecretStore/env
  // 3) вернуть текст
  return { text: "..." };
});
```

> Важно: многие облачные STT API предпочитают WAV/MP3.  
> Самый простой путь — использовать ffmpeg для конвертации `webm → wav` (16kHz mono).

---

## 6) Реализация: whisper.cpp локально (оффлайн режим)

### 6.1 Поток
1) Renderer записал `webm`
2) Main:
   - конвертнул в `wav 16kHz mono`
   - вызвал `whisper.cpp` CLI
   - прочитал stdout/файл результата
   - вернул текст

### 6.2 Почему это реально “просто”
- Whisper можно дергать как CLI, что упрощает интеграцию (не нужно городить bindings).
- Отлично подходит под offline-first и приватность.

---

## 7) Реализация: Vosk (streaming/offline)

Если тебе нужен “почти realtime” текст:
- запускать Vosk в отдельном worker/process
- передавать аудио чанками (PCM)
- отображать partial results “серым”
- финализировать по `final` событиям

---

## 8) Важные edge cases (MVP checklist)

- [ ] Запрос permission на микрофон (и корректная ошибка если запретили)
- [ ] “Залипание” микрофона: always stop tracks в finally
- [ ] Ограничение длительности записи (например 10–20 сек)
- [ ] Отмена (Esc) во время записи
- [ ] Язык распознавания (ru/pl/en)
- [ ] Дебаунс: не стартовать 2 записи одновременно
- [ ] Логи: писать в diagnostics события start/stop/error

---

## 9) Быстрый выбор (если нужно принять решение за 10 секунд)

- **Надёжно и быстро:** Cloud STT (A)  
- **Приватно и оффлайн:** whisper.cpp (B)  
- **Самый лёгкий streaming оффлайн:** Vosk (C)  
- **Web Speech API:** только если реально проверил, что работает в твоей сборке (D)

---

## 10) Источники (почему Web Speech API в Electron риск)

- Electron issue: SpeechRecognition “network error” и т.п.
- MDN: SpeechRecognition отмечен как Limited availability (не baseline).
- whisper.cpp и Vosk — оффлайн инструменты.

