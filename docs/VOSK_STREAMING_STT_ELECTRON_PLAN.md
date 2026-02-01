# Vosk как локальный стриминговый STT для Kanban AI (Electron)

Дата: 2026-02-01

## Короткий ответ
Да — **Vosk отлично подходит для real-time обновления распознанного текста**, если запускать его как отдельный процесс и **кормить PCM-аудио чанками**.  
Он отдаёт **partial** результаты (для “живой” строки) и **final** результаты (для фиксации фразы) — прямо во время речи.

---

## 1) Почему Vosk может быть проще, чем Realtime API
- **Оффлайн**, без ключей и без “модели не поддерживаются”
- Стриминг из коробки: `PartialResult()` / `Result()`
- Легко вынести в отдельный процесс (Python/Node), чтобы не трогать renderer

Минусы:
- Качество обычно хуже Whisper/OpenAI STT (особенно шум/акценты)
- Пунктуация/капитализация слабее (часто нужна пост-обработка)
- Модели могут быть крупными (ru/en), но это один раз скачать

---

## 2) Архитектура (рекомендуемая для Electron)

### Поток данных
1) **Renderer**: захват микрофона → ресемпл до **16kHz mono PCM16LE** → чанки 20–40ms  
2) **Main**: получает чанки через IPC → пишет в stdin дочернего процесса `vosk-stt.py`  
3) **Vosk процесс**: читает raw PCM, прогоняет recognizer и печатает JSON-ивенты в stdout  
4) **Main**: парсит stdout построчно → шлёт в Renderer события:
   - `stt:delta` (partial)
   - `stt:final` (final)

### Почему отдельный процесс — хорошо
- Vosk/модель не грузят UI
- Перезапуск/обновление модели проще
- Можно держать 1 процесс на окно или 1 глобальный

---

## 3) Аудио формат (критично)
**Vosk обычно ожидает 16 kHz, mono, PCM16LE.**  
Значит, в renderer нужно делать ресемпл (WebAudio/AudioWorklet) до **16000 Hz** и конвертацию float→int16.

> Если сейчас у тебя уже есть worklet под 24kHz — адаптировать под 16kHz даже проще.

---

## 4) Вариант A: Vosk через Python-скрипт (самый прямой)

### 4.1 Установка (локально)
- `pip install vosk`
- скачать модели:
  - EN: `vosk-model-small-en-us-0.15` (легче)
  - RU: `vosk-model-small-ru-0.22` (легче)
(Можно использовать “small” для скорости.)

> Хранить модели в `assets/vosk/` или в user-data dir приложения.

### 4.2 Протокол общения main ↔ python
- stdin: raw PCM bytes
- stdout: строки JSON
- stderr: логи

### 4.3 Python: `vosk-stt.py` (скелет)
```python
import sys, json, argparse
from vosk import Model, KaldiRecognizer

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--rate", type=int, default=16000)
    args = ap.parse_args()

    model = Model(args.model)
    rec = KaldiRecognizer(model, args.rate)
    rec.SetWords(True)

    # читаем непрерывный поток PCM16LE
    while True:
        data = sys.stdin.buffer.read(4000)  # ~125ms at 16kHz *2 bytes
        if not data:
            break

        if rec.AcceptWaveform(data):
            # финальный результат для фразы
            res = rec.Result()
            sys.stdout.write(json.dumps({"type":"final","data":json.loads(res)}) + "\n")
            sys.stdout.flush()
        else:
            # частичный результат
            pres = rec.PartialResult()
            sys.stdout.write(json.dumps({"type":"partial","data":json.loads(pres)}) + "\n")
            sys.stdout.flush()

    # добить остаток
    fres = rec.FinalResult()
    sys.stdout.write(json.dumps({"type":"final","data":json.loads(fres)}) + "\n")
    sys.stdout.flush()

if __name__ == "__main__":
    main()
```

**Что приходит:**
- partial: `{"partial":"..."}`
- final: `{"text":"...", "result":[...words...]}`

---

## 5) Node/Electron main: запуск процесса и стриминг

### 5.1 Spawn
```ts
import { spawn } from "node:child_process";
import readline from "node:readline";

const proc = spawn("python3", [
  "vosk-stt.py",
  "--model", "/path/to/vosk-model-small-ru-0.22",
  "--rate", "16000",
], {
  stdio: ["pipe", "pipe", "pipe"],
});

const rl = readline.createInterface({ input: proc.stdout });

rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.type === "partial") {
      const text = msg.data?.partial ?? "";
      // -> отправь в renderer как delta/liveText
    }
    if (msg.type === "final") {
      const text = msg.data?.text ?? "";
      // -> отправь в renderer как completed
    }
  } catch {}
});

proc.stderr.on("data", (d) => console.log("[vosk]", d.toString()));
```

### 5.2 Кормим аудио чанками
```ts
function appendPcmChunk(buf: Buffer) {
  // buf = PCM16LE mono 16kHz
  proc.stdin.write(buf);
}
```

### 5.3 Stop / restart (toggle)
- Start: spawn процесс + открыть микрофон
- Stop:
  - остановить микрофон
  - `proc.stdin.end()`
  - дождаться last final (или таймаут)
  - `proc.kill()` если завис

---

## 6) RU/EN переключатель
Самый простой и надёжный:
- при смене языка **перезапускать процесс** с другой моделью:
  - EN → `vosk-model-small-en-us-0.15`
  - RU → `vosk-model-small-ru-0.22`

Почему не переключать “на лету”:
- Vosk recognizer привязан к модели при создании.

---

## 7) Как отрисовывать real-time в UI
- На `partial`:
  - обновляешь overlay (liveText)
- На `final`:
  - вставляешь `text` в поле
  - очищаешь overlay
- Важно: `partial` может часто “переигрываться” (текст меняется) — это нормально.

---

## 8) Качество и улучшения
- `SetWords(True)` — полезно для таймкодов/подсветки
- Пост-обработка:
  - trim, нормализация пробелов
  - простая пунктуация по паузам
  - опционально: LLM-рефакторинг диктовки в User Story/AC

---

## 9) Рекомендованный MVP план
1) Renderer: AudioWorklet 16kHz PCM16 mono
2) Main: spawn python vosk, pipe stdin/stdout
3) UI: toggle кнопка + RU/EN + overlay partial + commit final
4) Health: таймауты, перезапуск процесса, понятные ошибки
5) Bench: latency и CPU

---

## 10) Ответ на вопрос
**Да**, Vosk позволяет **обновлять распознанный текст в реальном времени** (partial) и фиксировать фразы (final).
