import type { LmdDoc, LmdBlock, LmdListItem, LmdInline } from './types'

// === Конфигурация ограничений ===
const LIMITS = {
  maxChars: 200_000,
  maxLines: 10_000,
  maxDepth: 3,
  maxListItems: 2_000,
} as const

// === URL Security ===
function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url, 'https://example.invalid')
    const proto = u.protocol.toLowerCase()
    return proto === 'http:' || proto === 'https:' || proto === 'mailto:' || proto === 'artifact:'
  } catch {
    return false
  }
}

// === Inline Parser ===
function parseInline(text: string, depth = 0): LmdInline[] {
  if (depth >= LIMITS.maxDepth) {
    return [{ type: 'text', text }]
  }

  const inlines: LmdInline[] = []
  let i = 0
  let lastTextStart = 0

  while (i < text.length) {
    // Inline code: `...` (приоритет 1)
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        if (i > lastTextStart) {
          inlines.push({ type: 'text', text: text.slice(lastTextStart, i) })
        }
        inlines.push({
          type: 'code',
          text: text.slice(i + 1, end),
        })
        i = end + 1
        lastTextStart = i
        continue
      }
    }

    // Link: [text](url) (приоритет 2)
    if (text[i] === '[') {
      const closeBracket = text.indexOf(']', i + 1)
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2)

        if (closeParen !== -1 && closeParen > closeBracket + 1) {
          const linkText = text.slice(i + 1, closeBracket)
          const url = text.slice(closeBracket + 2, closeParen)

          // Добавляем текст перед ссылкой только если он есть
          if (i > lastTextStart) {
            inlines.push({ type: 'text', text: text.slice(lastTextStart, i) })
          }

          if (isAllowedUrl(url)) {
            inlines.push({ type: 'link', text: linkText, url })
          } else {
            // Небезопасная ссылка как обычный текст
            inlines.push({ type: 'text', text: `[${linkText}](${url})` })
          }

          i = closeParen + 1
          lastTextStart = i
          continue
        }
      } else {
        // Нет закрывающей скобки или неправильный формат - пропускаем символ
        i++
        continue
      }
    }

    // Bold: **...** (приоритет 3)
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        if (i > lastTextStart) {
          inlines.push({ type: 'text', text: text.slice(lastTextStart, i) })
        }

        const inner = text.slice(i + 2, end)
        inlines.push({
          type: 'bold',
          children: parseInline(inner, depth + 1),
        })

        i = end + 2
        lastTextStart = i
        continue
      }
    }

    // Italic: *...* (приоритет 4)
    // Пропускаем первую * из **
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1 && end !== i + 1 && text[end + 1] !== '*') {
        if (i > lastTextStart) {
          inlines.push({ type: 'text', text: text.slice(lastTextStart, i) })
        }

        const inner = text.slice(i + 1, end)
        inlines.push({
          type: 'italic',
          children: parseInline(inner, depth + 1),
        })

        i = end + 1
        lastTextStart = i
        continue
      }
    }

    i++
  }

  if (i > lastTextStart) {
    inlines.push({ type: 'text', text: text.slice(lastTextStart, i) })
  }

  return inlines
}

// === Block Parser ===
export function parseLightMd(text: string): LmdDoc {
  // Проверка ограничений
  if (text.length > LIMITS.maxChars) {
    // Fallback: возврат plain text как один параграф
    return { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text }] }] }
  }

  const lines = text.split(/\r?\n/)
  if (lines.length > LIMITS.maxLines) {
    return { blocks: [{ type: 'paragraph', inlines: [{ type: 'text', text }] }] }
  }

  const blocks: LmdBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code fence
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || null
      i++

      const codeLines: string[] = []
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // Пропустить закрывающий ```

      blocks.push({
        type: 'code',
        lang,
        text: codeLines.join('\n'),
      })
      continue
    }

    // Пустая строка - скипаем (разделитель параграфов)
    if (line.trim() === '') {
      i++
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3
      const content = headingMatch[2] || ''
      blocks.push({
        type: 'heading',
        level,
        inlines: parseInline(content),
      })
      i++
      continue
    }

    // Horizontal rule
    if (line === '---') {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2))
        i++
      }

      const quoteText = quoteLines.join('\n')
      const quoteDoc = parseLightMd(quoteText)
      blocks.push({
        type: 'blockquote',
        blocks: quoteDoc.blocks,
      })
      continue
    }

    // List (UL/OL/checklist)
    const ulMatch = line.match(/^[-*]\s+(.*)$/)
    const olMatch = line.match(/^\d+\.\s+(.*)$/)
    const checklistMatch = line.match(/^[-*]\s+\[([ x])\]\s+(.*)$/)

    if (ulMatch || olMatch || checklistMatch) {
      const ordered = olMatch !== null
      const items: LmdListItem[] = []
      let itemCount = 0

      while (
        i < lines.length &&
        itemCount < LIMITS.maxListItems &&
        (lines[i].match(/^[-*]\s+/) || lines[i].match(/^\d+\.\s+/))
      ) {
        const listLine = lines[i]
        const checkMatch = listLine.match(/^[-*]\s+\[([ x])\]\s+(.*)$/)
        const ulMatch2 = listLine.match(/^[-*]\s+(.*)$/)
        const olMatch2 = listLine.match(/^\d+\.\s+(.*)$/)

        if (checkMatch) {
          items.push({
            checked: checkMatch[1] === 'x',
            blocks: [
              {
                type: 'paragraph',
                inlines: parseInline(checkMatch[2]),
              },
            ],
          })
        } else if (ulMatch2) {
          items.push({
            blocks: [
              {
                type: 'paragraph',
                inlines: parseInline(ulMatch2[1]),
              },
            ],
          })
        } else if (olMatch2) {
          items.push({
            blocks: [
              {
                type: 'paragraph',
                inlines: parseInline(olMatch2[1]),
              },
            ],
          })
        }

        i++
        itemCount++
      }

      blocks.push({
        type: 'list',
        ordered,
        items,
      })
      continue
    }

    // Paragraph (собираем строки до пустой строки или другого блока)
    const paragraphLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !lines[i].match(/^#{1,3}\s+/) &&
      !lines[i].startsWith('> ') &&
      !lines[i].match(/^[-*]\s+/) &&
      !lines[i].match(/^\d+\.\s+/)
    ) {
      paragraphLines.push(lines[i])
      i++
    }

    const paragraphText = paragraphLines.join('\n')
    blocks.push({
      type: 'paragraph',
      inlines: parseInline(paragraphText),
    })
  }

  return { blocks }
}

export { parseInline }
