# LightMD (Variant C) — Мини‑парсер Markdown и React‑рендер без сторонних markdown‑пакетов

> Дата: 2026-01-31  
> Цель: сделать **безопасный и предсказуемый** рендер “лёгкого markdown” в React/Electron/Web **без `react-markdown/marked`**.  
> Подходит также для Ink/TUI (тот же AST).

---

## 0) Принципы

1) **Не поддерживать “весь Markdown”**. Поддерживать только то, что реально нужно для ответов агента.
2) Никакого HTML. Весь текст — **эскейпится** (React это делает по умолчанию).
3) Парсер должен быть:
   - линейный по времени `O(n)`
   - устойчивый к “кривому” вводу
   - с лимитами на размер/глубину

---

## 1) Спецификация LightMD (LMD v1)

### 1.1 Блоки (построчный парсинг)
Поддерживаем:

- **Heading**: `# `, `## `, `### `
- **Horizontal rule**: строка ровно `---`
- **Blockquote**: `> ` (1 уровень)
- **Unordered list**: `- ` или `* `
- **Ordered list**: `1. `, `2. ` ...
- **Checklist item**: `- [ ] `, `- [x] ` (разновидность UL)
- **Fenced code**:
  - старт: <code>```</code> или <code>```lang</code>
  - конец: <code>```</code>
  - внутри не парсим ничего

- **Paragraph**: всё остальное, группируем соседние строки в один параграф, разделитель — пустая строка.

### 1.2 Inline (внутри текстовых узлов)
Поддерживаем минимум:

- `**bold**`
- `*italic*`
- inline code: `` `code` ``
- link: `[text](url)`  
  (url валидировать/фильтровать по протоколам)

**Не поддерживаем**: изображения, таблицы, вложенные цитаты, вложенные списки глубже 2 уровней, HTML.

---

## 2) AST: единый формат для React и TUI

Создай простой тип AST (TS), чтобы:
- React рендерит в компоненты
- Ink рендерит в `<Text>` и т.д.
- можно потом экспортировать в JSON (для run artifacts)

### 2.1 Типы

```ts
export type LmdDoc = {
  blocks: LmdBlock[];
};

export type LmdBlock =
  | { type: 'heading'; level: 1 | 2 | 3; inlines: LmdInline[] }
  | { type: 'hr' }
  | { type: 'blockquote'; blocks: LmdBlock[] } // ограничиваем 1 уровень
  | { type: 'code'; lang: string | null; text: string }
  | { type: 'list'; ordered: boolean; items: LmdListItem[] }
  | { type: 'paragraph'; inlines: LmdInline[] };

export type LmdListItem = {
  checked?: boolean; // undefined => обычный li; true/false => checklist
  blocks: LmdBlock[]; // обычно один paragraph; можно расширить позже
};

export type LmdInline =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: LmdInline[] }
  | { type: 'italic'; children: LmdInline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; url: string };
```

---

## 3) Парсер: алгоритм (блоки)

### 3.1 Входные ограничения (важно)
- `maxChars`: например `200_000`
- `maxLines`: например `10_000`
- `maxDepth`: `3` (для inline nesting)
- `maxListItems`: `2_000`

Если превышено — либо “обрезать”, либо “упасть” в режим plain text.

### 3.2 Псевдокод блок‑парсера

1) Разбить на строки `lines = text.split(/\r?\n/)`.
2) Итерация `i=0..`:
   - если видим <code>```</code> → читать code fence до следующего <code>```</code>
   - если пустая строка → закрыть текущий paragraph/list и продолжить
   - если heading `^(#{1,3})\s+` → heading block
   - если `---` → hr
   - если `> ` → собрать подряд идущие строки с `> `, удалить префикс и распарсить как отдельный документ, завернуть в blockquote (без вложенных blockquote)
   - если checklist / ul / ol → собрать “пакет” списка подряд, распарсить items
   - иначе → paragraph line (накапливать до пустой строки или до другого блока)

---

## 4) Inline‑парсер

Сделай простой сканер (state machine), без сложных regex.

### 4.1 Правила приоритета
1) Inline code: пары backtick `...` имеют приоритет над `*` и `[]()`.
2) Link: `[text](url)` — парсить только если есть закрывающие `](` и `)`.
3) Bold/italic:
   - `**...**` bold
   - `*...*` italic
4) Никаких вложений больше `maxDepth`, чтобы не повесить UI.

### 4.2 URL security
Разрешить протоколы:
- `http:`, `https:`
- `mailto:` (по желанию)
- `artifact:` (для твоих артефактов)
Запретить:
- `javascript:`, `data:`, `file:`

Пример функции:
```ts
function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url, 'https://example.invalid');
    const proto = u.protocol.toLowerCase();
    return proto === 'http:' || proto === 'https:' || proto === 'mailto:' || proto === 'artifact:';
  } catch {
    return false;
  }
}
```

Если не разрешено — рендерить как `text` (не ссылка).

---

## 5) React‑рендерер (Tailwind friendly)

### 5.1 Компоненты
`<LightMdView text />`:
- вызывает `parseLightMd(text) => doc`
- рендерит `doc.blocks.map(renderBlock)`

### 5.2 Рендер блоков (пример)

```tsx
function renderInlines(inlines: LmdInline[]): React.ReactNode {
  return inlines.map((n, i) => {
    switch (n.type) {
      case 'text': return <React.Fragment key={i}>{n.text}</React.Fragment>;
      case 'bold': return <strong key={i}>{renderInlines(n.children)}</strong>;
      case 'italic': return <em key={i}>{renderInlines(n.children)}</em>;
      case 'code': return <code key={i} className="rounded px-1">{n.text}</code>;
      case 'link':
        return (
          <a key={i} href={n.url} target="_blank" rel="noreferrer" className="underline">
            {n.text}
          </a>
        );
    }
  });
}

function RenderBlock({ block }: { block: LmdBlock }) {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3';
      return <Tag className="mt-3 mb-2 font-semibold">{renderInlines(block.inlines)}</Tag>;
    }
    case 'paragraph':
      return <p className="my-2 leading-relaxed">{renderInlines(block.inlines)}</p>;
    case 'hr':
      return <hr className="my-3 opacity-40" />;
    case 'code':
      return (
        <pre className="my-2 rounded-md p-3 overflow-auto text-sm">
          <code>{block.text}</code>
        </pre>
      );
    case 'blockquote':
      return (
        <blockquote className="my-2 border-l-2 pl-3 opacity-90">
          {block.blocks.map((b, idx) => <RenderBlock key={idx} block={b} />)}
        </blockquote>
      );
    case 'list':
      return block.ordered ? (
        <ol className="my-2 ml-6 list-decimal">
          {block.items.map((it, idx) => <li key={idx}>{renderListItem(it)}</li>)}
        </ol>
      ) : (
        <ul className="my-2 ml-6 list-disc">
          {block.items.map((it, idx) => <li key={idx}>{renderListItem(it)}</li>)}
        </ul>
      );
  }
}

function renderListItem(it: LmdListItem) {
  // для v1 ожидаем один paragraph внутри
  const content = it.blocks.map((b, i) => <RenderBlock key={i} block={b} />);
  if (it.checked === undefined) return content;

  return (
    <div className="flex gap-2">
      <span className="select-none">{it.checked ? '☑' : '☐'}</span>
      <div className="flex-1">{content}</div>
    </div>
  );
}
```

---

## 6) Интеграция в проект (структура файлов)

Рекомендую:

- `src/shared/lightmd/types.ts`
- `src/shared/lightmd/parse.ts`
- `src/renderer/components/LightMarkdown.tsx`

В Electron renderer можно импортировать из `shared`.

---

## 7) Тест‑план (unit tests)

Добавь `vitest` тесты на парсер:

### 7.1 Блоки
- heading 1..3
- code fence (включая незакрытый fence — должен “поглотить до конца”)
- списки UL/OL/checklist
- blockquote
- параграфы: склейка строк и разбиение пустой строкой

### 7.2 Inline
- `**bold**`, `*italic*`, backticks
- ссылки валидные/невалидные
- edge cases: незакрытые маркеры остаются текстом

### 7.3 Security
- `<script>` остаётся текстом
- `[x](javascript:alert(1))` → не ссылка, а текст

---

## 8) Шаблон ответа агента (чтобы UI был стабильный)

Попроси агента писать:

```md
### Summary
- ...

### Steps
- [ ] ...
- [x] ...

### Notes
> ...

### Artifacts
- [patch.diff](artifact://patch/123)
```

---

## 9) Definition of Done

- Парсер отдаёт AST по LMD v1
- React рендерер отображает: h1–h3, p, ul/ol/checklist, code, quote, hr, inline bold/italic/code/link
- `javascript:`/`data:`/`file:` ссылки не кликабельны
- Есть тесты на блоки/inline/security
