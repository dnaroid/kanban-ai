import React from 'react'
import { File, Image, ExternalLink, X } from 'lucide-react'
import { LmdBlock, LmdInline } from '@/shared/lightmd/types'
import { parseLightMd } from '@/shared/lightmd/parse'

function renderInlines(
  inlines: LmdInline[],
  onRemoveLink?: (url: string) => void
): React.ReactNode {
  return inlines.map((n, i) => {
    switch (n.type) {
      case 'text':
        return <React.Fragment key={i}>{n.text}</React.Fragment>
      case 'bold':
        return (
          <strong key={i} className="font-semibold">
            {renderInlines(n.children, onRemoveLink)}
          </strong>
        )
      case 'italic':
        return (
          <em key={i} className="italic">
            {renderInlines(n.children, onRemoveLink)}
          </em>
        )
      case 'code':
        return (
          <code
            key={i}
            className="rounded bg-slate-800/50 border border-slate-700/50 px-1.5 py-0.5 text-[13px] font-mono text-slate-200"
          >
            {n.text}
          </code>
        )
      case 'link': {
        const isFile = n.url.startsWith('file://')
        const isImage =
          /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(n.text) ||
          /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(n.url)

        const handleClick = (e: React.MouseEvent) => {
          if (isFile) {
            e.preventDefault()
            const filePath = n.url.replace('file://', '')
            try {
              const decodedPath = decodeURI(filePath).replace(/^\/([A-Za-z]:)/, '$1')
              window.api.app.openPath(decodedPath)
            } catch (err) {
              console.error('Failed to open path:', err)
            }
          }
        }

        return (
          <span key={i} className="inline-flex items-center mx-0.5 my-0.5 group/pill">
            <a
              href={n.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={handleClick}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-800/40 border border-slate-700/50 rounded-md text-blue-300 hover:text-blue-200 hover:bg-slate-700/50 hover:border-slate-600 transition-all no-underline group"
            >
              {isFile ? (
                isImage ? (
                  <Image className="w-3 h-3 text-blue-400" />
                ) : (
                  <File className="w-3 h-3 text-slate-400" />
                )
              ) : (
                <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-blue-400" />
              )}
              <span className="truncate max-w-[240px] font-medium text-[12px]">{n.text}</span>
            </a>
            {onRemoveLink && isFile && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onRemoveLink(n.url)
                }}
                className="ml-1 p-0.5 text-slate-500 hover:text-red-400 opacity-0 group-hover/pill:opacity-100 transition-opacity"
                title="Remove attachment"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        )
      }
      default:
        return null
    }
  })
}

function RenderBlock({
  block,
  onRemoveLink,
}: {
  block: LmdBlock
  onRemoveLink?: (url: string) => void
}) {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3'
      const className =
        block.level === 1
          ? 'text-lg font-bold text-slate-100 mt-6 mb-3 first:mt-0'
          : block.level === 2
            ? 'text-base font-bold text-slate-200 mt-5 mb-2'
            : 'text-sm font-bold text-slate-300 mt-4 mb-2'
      return <Tag className={className}>{renderInlines(block.inlines, onRemoveLink)}</Tag>
    }
    case 'paragraph':
      return (
        <p className="my-2 leading-relaxed text-sm text-slate-300 whitespace-pre-wrap">
          {renderInlines(block.inlines, onRemoveLink)}
        </p>
      )
    case 'hr':
      return <hr className="my-4 border-t border-slate-800" />
    case 'code':
      return (
        <pre className="my-3 rounded-lg bg-[#0D1117] border border-slate-800 p-3 overflow-auto text-xs font-mono text-slate-300">
          <code className="whitespace-pre">{block.text}</code>
        </pre>
      )
    case 'blockquote':
      return (
        <blockquote className="my-3 border-l-2 border-slate-700 pl-4 text-sm text-slate-400 italic">
          {block.blocks.map((b, idx: React.Key | null | undefined) => (
            <RenderBlock key={idx} block={b} onRemoveLink={onRemoveLink} />
          ))}
        </blockquote>
      )
    case 'list':
      return block.ordered ? (
        <ol className="my-2 ml-6 list-decimal space-y-1 text-sm text-slate-300 marker:text-slate-500">
          {block.items.map(
            (it: { checked?: boolean; blocks: LmdBlock[] }, idx: React.Key | null | undefined) => (
              <li key={idx}>{renderListItem(it, onRemoveLink)}</li>
            )
          )}
        </ol>
      ) : (
        <ul className="my-2 ml-6 list-disc space-y-1 text-sm text-slate-300 marker:text-slate-500">
          {block.items.map(
            (it: { checked?: boolean; blocks: LmdBlock[] }, idx: React.Key | null | undefined) => (
              <li key={idx}>{renderListItem(it, onRemoveLink)}</li>
            )
          )}
        </ul>
      )
    default:
      return null
  }
}

function renderListItem(
  it: { checked?: boolean; blocks: LmdBlock[] },
  onRemoveLink?: (url: string) => void
) {
  const content = it.blocks.map((b, i) => (
    <RenderBlock key={i} block={b} onRemoveLink={onRemoveLink} />
  ))
  if (it.checked === undefined) return content

  return (
    <div className="flex gap-2 items-start">
      <span className={it.checked ? 'text-blue-400' : 'text-slate-600'}>
        {it.checked ? '☑' : '☐'}
      </span>
      <div className={`flex-1 ${it.checked ? 'line-through text-slate-500' : ''}`}>{content}</div>
    </div>
  )
}

interface LightMarkdownProps {
  text: string
  className?: string
  onRemoveLink?: (url: string) => void
}

export function LightMarkdown({ text, className, onRemoveLink }: LightMarkdownProps) {
  const doc = parseLightMd(text)

  return (
    <div className={className}>
      {doc.blocks.map((block, idx) => (
        <RenderBlock key={idx} block={block} onRemoveLink={onRemoveLink} />
      ))}
    </div>
  )
}
