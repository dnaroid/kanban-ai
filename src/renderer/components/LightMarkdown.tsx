import React from 'react'
import { parseLightMd, type LmdBlock, type LmdInline } from '../../shared/lightmd/parse'

function renderInlines(inlines: LmdInline[]): React.ReactNode {
  return inlines.map((n, i) => {
    switch (n.type) {
      case 'text':
        return <React.Fragment key={i}>{n.text}</React.Fragment>
      case 'bold':
        return (
          <strong key={i} className="font-semibold">
            {renderInlines(n.children)}
          </strong>
        )
      case 'italic':
        return (
          <em key={i} className="italic">
            {renderInlines(n.children)}
          </em>
        )
      case 'code':
        return (
          <code
            key={i}
            className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-sm font-mono"
          >
            {n.text}
          </code>
        )
      case 'link':
        return (
          <a
            key={i}
            href={n.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-blue-600 dark:text-blue-400 underline hover:no-underline"
          >
            {n.text}
          </a>
        )
      default:
        return null
    }
  })
}

function RenderBlock({ block }: { block: LmdBlock }) {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3'
      const className =
        block.level === 1
          ? 'text-xl font-bold mt-4 mb-2'
          : block.level === 2
            ? 'text-lg font-semibold mt-3 mb-2'
            : 'text-base font-semibold mt-2 mb-1'
      return <Tag className={className}>{renderInlines(block.inlines)}</Tag>
    }
    case 'paragraph':
      return <p className="my-2 leading-relaxed text-sm">{renderInlines(block.inlines)}</p>
    case 'hr':
      return <hr className="my-3 border-t border-gray-200 dark:border-gray-700" />
    case 'code':
      return (
        <pre className="my-2 rounded-md bg-gray-50 dark:bg-gray-900 p-3 overflow-auto text-xs font-mono">
          <code className="whitespace-pre">{block.text}</code>
        </pre>
      )
    case 'blockquote':
      return (
        <blockquote className="my-2 border-l-2 border-gray-300 dark:border-gray-600 pl-3 text-sm opacity-90">
          {block.blocks.map((b, idx) => (
            <RenderBlock key={idx} block={b} />
          ))}
        </blockquote>
      )
    case 'list':
      return block.ordered ? (
        <ol className="my-2 ml-6 list-decimal space-y-1 text-sm">
          {block.items.map((it, idx) => (
            <li key={idx}>{renderListItem(it)}</li>
          ))}
        </ol>
      ) : (
        <ul className="my-2 ml-6 list-disc space-y-1 text-sm">
          {block.items.map((it, idx) => (
            <li key={idx}>{renderListItem(it)}</li>
          ))}
        </ul>
      )
    default:
      return null
  }
}

function renderListItem(it: { checked?: boolean; blocks: LmdBlock[] }) {
  const content = it.blocks.map((b, i) => <RenderBlock key={i} block={b} />)
  if (it.checked === undefined) return content

  return (
    <div className="flex gap-2 items-start">
      <span className="select-none mt-0.5">{it.checked ? '☑' : '☐'}</span>
      <div className="flex-1">{content}</div>
    </div>
  )
}

interface LightMarkdownProps {
  text: string
  className?: string
}

export function LightMarkdown({ text, className }: LightMarkdownProps) {
  const doc = parseLightMd(text)

  return (
    <div className={className}>
      {doc.blocks.map((block, idx) => (
        <RenderBlock key={idx} block={block} />
      ))}
    </div>
  )
}
