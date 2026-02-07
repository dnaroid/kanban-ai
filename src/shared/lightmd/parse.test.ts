import { describe, it, expect } from 'vitest'
import { parseLightMd, parseInline } from './parse'

describe('LightMD Parser - Blocks', () => {
  it('parse heading levels 1-3', () => {
    const text = '# H1\n## H2\n### H3'
    const doc = parseLightMd(text)

    expect(doc.blocks).toHaveLength(3)
    expect(doc.blocks[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(doc.blocks[1]).toMatchObject({ type: 'heading', level: 2 })
    expect(doc.blocks[2]).toMatchObject({ type: 'heading', level: 3 })
  })

  it('parse heading with inline content', () => {
    const text = '# **Bold** heading'
    const doc = parseLightMd(text)

    const head = doc.blocks[0]
    expect(head.type).toBe('heading')
    if (head.type === 'heading') {
      expect(head.inlines).toHaveLength(2)
      expect(head.inlines[0]).toMatchObject({ type: 'bold' })
    }
  })

  it('parse horizontal rule', () => {
    const text = '---'
    const doc = parseLightMd(text)

    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0]).toMatchObject({ type: 'hr' })
  })

  it('parse code fence with language', () => {
    const text = '```ts\nconst x = 1;\n```'
    const doc = parseLightMd(text)

    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0]).toMatchObject({
      type: 'code',
      lang: 'ts',
      text: 'const x = 1;',
    })
  })

  it('parse code fence without language', () => {
    const text = '```\ncode\n```'
    const doc = parseLightMd(text)

    expect(doc.blocks[0]).toMatchObject({
      type: 'code',
      lang: null,
      text: 'code',
    })
  })

  it('parse unclosed code fence', () => {
    const text = '```\ncode without closing'
    const doc = parseLightMd(text)

    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0]).toMatchObject({
      type: 'code',
      text: 'code without closing',
    })
  })

  it('parse unordered list', () => {
    const text = '- Item 1\n- Item 2\n* Item 3'
    const doc = parseLightMd(text)

    const list = doc.blocks[0]
    expect(doc.blocks).toHaveLength(1)
    expect(list).toMatchObject({
      type: 'list',
      ordered: false,
    })
    if (list.type === 'list') {
      expect(list.items).toHaveLength(3)
    }
  })

  it('parse ordered list', () => {
    const text = '1. First\n2. Second'
    const doc = parseLightMd(text)

    const list = doc.blocks[0]
    expect(doc.blocks).toHaveLength(1)
    expect(list).toMatchObject({
      type: 'list',
      ordered: true,
    })
    if (list.type === 'list') {
      expect(list.items).toHaveLength(2)
    }
  })

  it('parse checklist', () => {
    const text = '- [ ] Todo\n- [x] Done'
    const doc = parseLightMd(text)

    const list = doc.blocks[0]
    expect(doc.blocks).toHaveLength(1)
    if (list.type === 'list') {
      expect(list.items).toHaveLength(2)
      expect(list.items[0].checked).toBe(false)
      expect(list.items[1].checked).toBe(true)
    }
  })

  it('parse blockquote', () => {
    const text = '> Quote line 1\n> Quote line 2'
    const doc = parseLightMd(text)

    const quote = doc.blocks[0]
    expect(doc.blocks).toHaveLength(1)
    expect(quote).toMatchObject({ type: 'blockquote' })
    if (quote.type === 'blockquote') {
      expect(quote.blocks).toHaveLength(1)
    }
  })

  it('parse paragraph', () => {
    const text = 'First line\nSecond line'
    const doc = parseLightMd(text)

    const para = doc.blocks[0]
    expect(doc.blocks).toHaveLength(1)
    expect(para).toMatchObject({ type: 'paragraph' })
    if (para.type === 'paragraph') {
      expect((para as any).inlines[0].type).toBe('text')
    }
  })

  it('split paragraphs with empty line', () => {
    const text = 'Para 1\n\nPara 2'
    const doc = parseLightMd(text)

    expect(doc.blocks).toHaveLength(2)
    expect(doc.blocks[0].type).toBe('paragraph')
    expect(doc.blocks[1].type).toBe('paragraph')
  })
})

describe('LightMD Parser - Inline', () => {
  it('parse bold text', () => {
    const result = parseInline('**bold** text')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ type: 'bold' })
    expect(result[1]).toMatchObject({ type: 'text', text: ' text' })
  })

  it('parse italic text', () => {
    const result = parseInline('*italic* text')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ type: 'italic' })
    expect(result[1]).toMatchObject({ type: 'text', text: ' text' })
  })

  it('parse inline code', () => {
    const result = parseInline('`code` text')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ type: 'code', text: 'code' })
    expect(result[1]).toMatchObject({ type: 'text', text: ' text' })
  })

  it('parse link', () => {
    const result = parseInline('[text](https://example.com)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'link',
      text: 'text',
      url: 'https://example.com',
    })
  })

  it('parse multiple inline elements', () => {
    const result = parseInline('**bold** *italic* `code`')
    expect(result).toHaveLength(5)
    expect(result[0]).toMatchObject({ type: 'bold' })
    expect(result[1]).toMatchObject({ type: 'text', text: ' ' })
    expect(result[2]).toMatchObject({ type: 'italic' })
    expect(result[3]).toMatchObject({ type: 'text', text: ' ' })
    expect(result[4]).toMatchObject({ type: 'code' })
  })

  it('leave unclosed markers as text', () => {
    const result = parseInline('**unclosed')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'text', text: '**unclosed' })
  })

  it('inline code takes priority over bold/italic', () => {
    const result = parseInline('`**code**`')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'code', text: '**code**' })
  })

  it('nested inline elements', () => {
    const result = parseInline('**bold**')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'bold' })
    const node = result[0]
    if (node.type === 'bold') {
      expect(node.children).toHaveLength(1)
      expect(node.children[0]).toMatchObject({ type: 'text', text: 'bold' })
    }
  })

  it('do not confuse bold with single asterisk', () => {
    const result = parseInline('*not bold* but **bold**')
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ type: 'italic' })
    expect(result[1]).toMatchObject({ type: 'text', text: ' but ' })
    expect(result[2]).toMatchObject({ type: 'bold' })
  })
})

describe('LightMD Parser - Security', () => {
  it('keep HTML tags as plain text', () => {
    const result = parseInline('<script>alert(1)</script>')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'text',
      text: '<script>alert(1)</script>',
    })
  })

  it('block javascript: URLs', () => {
    const result = parseInline('[click](javascript:alert(1))')
    const hasLink = result.some((n) => n.type === 'link')
    expect(hasLink).toBe(false)
  })

  it('block data: URLs', () => {
    const result = parseInline('[click](data:text/html,<script>)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'text',
      text: '[click](data:text/html,<script>)',
    })
  })

  it('allow file: URLs', () => {
    const result = parseInline('[click](file:///etc/passwd)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'link',
      url: 'file:///etc/passwd',
    })
  })

  it('allow https: URLs', () => {
    const result = parseInline('[link](https://example.com)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'link',
      url: 'https://example.com',
    })
  })

  it('allow http: URLs', () => {
    const result = parseInline('[link](http://example.com)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'link',
      url: 'http://example.com',
    })
  })

  it('allow mailto: URLs', () => {
    const result = parseInline('[email](mailto:test@example.com)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'link',
      url: 'mailto:test@example.com',
    })
  })

  it('allow artifact: URLs', () => {
    const result = parseInline('[patch](artifact://patch/123)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'link',
      url: 'artifact://patch/123',
    })
  })
})

describe('LightMD Parser - Edge Cases', () => {
  it('handle empty string', () => {
    const doc = parseLightMd('')
    expect(doc.blocks).toHaveLength(0)
  })

  it('handle only empty lines', () => {
    const doc = parseLightMd('\n\n\n')
    expect(doc.blocks).toHaveLength(0)
  })

  it('handle excessive characters (fallback to plain text)', () => {
    const largeText = 'x'.repeat(200_001)
    const doc = parseLightMd(largeText)
    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0].type).toBe('paragraph')
    // @ts-expect-error: inlines is of type 'unknown' due to internal API access
    expect(doc.blocks[0].inlines[0].type).toBe('text')
  })

  it('respect maxListItems limit', () => {
    const items = Array(2_001)
      .fill(0)
      .map((_, i) => `- Item ${i}`)
    const text = items.join('\n')
    const doc = parseLightMd(text)
    const block = doc.blocks[0]
    expect(block.type).toBe('list')
    if (block.type === 'list') {
      expect(block.items.length).toBeLessThanOrEqual(2_000)
    }
  })

  it('respect maxDepth limit for nested inlines', () => {
    const nested = '***'.repeat(10) + 'text' + '***'.repeat(10)
    const result = parseInline(nested)
    // Should not crash, should render as text when depth exceeded
    expect(result.length).toBeGreaterThan(0)
  })
})
