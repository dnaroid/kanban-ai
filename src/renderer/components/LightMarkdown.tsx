import React from "react"
import {LmdBlock, LmdInline} from "@/shared/lightmd/types"
import {parseLightMd} from "@/shared/lightmd/parse"

function renderInlines(inlines: LmdInline[]): React.ReactNode {
  return inlines.map((n, i) => {
    switch (n.type) {
      case "text":
        return <React.Fragment key={i}>{n.text}</React.Fragment>
      case "bold":
        return (
          <strong key={i} className="font-semibold">
            {renderInlines(n.children)}
          </strong>
        )
      case "italic":
        return (
          <em key={i} className="italic">
            {renderInlines(n.children)}
          </em>
        )
      case "code":
        return (
          <code
            key={i}
            className="rounded bg-slate-800/50 border border-slate-700/50 px-1.5 py-0.5 text-[13px] font-mono text-slate-200"
          >
            {n.text}
          </code>
        )
      case "link":
        return (
          <a
            key={i}
            href={n.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-blue-400 underline decoration-blue-400/30 hover:decoration-blue-400 transition-all"
          >
            {n.text}
          </a>
        )
      default:
        return null
    }
  })
}

function RenderBlock({block}: { block: LmdBlock }) {
  switch (block.type) {
    case "heading": {
      const Tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3"
      const className =
        block.level === 1
          ? "text-lg font-bold text-slate-100 mt-6 mb-3 first:mt-0"
          : block.level === 2
            ? "text-base font-bold text-slate-200 mt-5 mb-2"
            : "text-sm font-bold text-slate-300 mt-4 mb-2"
      return <Tag className={className}>{renderInlines(block.inlines)}</Tag>
    }
    case "paragraph":
      return (
        <p className="my-2 leading-relaxed text-sm text-slate-300">
          {renderInlines(block.inlines)}
        </p>
      )
    case "hr":
      return <hr className="my-4 border-t border-slate-800"/>
    case "code":
      return (
        <pre
          className="my-3 rounded-lg bg-[#0D1117] border border-slate-800 p-3 overflow-auto text-xs font-mono text-slate-300">
          <code className="whitespace-pre">{block.text}</code>
        </pre>
      )
    case "blockquote":
      return (
        <blockquote className="my-3 border-l-2 border-slate-700 pl-4 text-sm text-slate-400 italic">
          {block.blocks.map((b, idx: React.Key | null | undefined) => (
            <RenderBlock key={idx} block={b}/>
          ))}
        </blockquote>
      )
    case "list":
      return block.ordered ? (
        <ol className="my-2 ml-6 list-decimal space-y-1 text-sm text-slate-300 marker:text-slate-500">
          {block.items.map((it: { checked?: boolean; blocks: LmdBlock[] }, idx: React.Key | null | undefined) => (
            <li key={idx}>{renderListItem(it)}</li>
          ))}
        </ol>
      ) : (
        <ul className="my-2 ml-6 list-disc space-y-1 text-sm text-slate-300 marker:text-slate-500">
          {block.items.map((it: { checked?: boolean; blocks: LmdBlock[] }, idx: React.Key | null | undefined) => (
            <li key={idx}>{renderListItem(it)}</li>
          ))}
        </ul>
      )
    default:
      return null
  }
}

function renderListItem(it: { checked?: boolean; blocks: LmdBlock[] }) {
  const content = it.blocks.map((b, i) => <RenderBlock key={i} block={b}/>)
  if (it.checked === undefined) return content

  return (
    <div className="flex gap-2 items-start">
      <span className={it.checked ? "text-blue-400" : "text-slate-600"}>
        {it.checked ? "☑" : "☐"}
      </span>
      <div className={`flex-1 ${it.checked ? "line-through text-slate-500" : ""}`}>{content}</div>
    </div>
  )
}

interface LightMarkdownProps {
  text: string
  className?: string
}

export function LightMarkdown({text, className}: LightMarkdownProps) {
  const doc = parseLightMd(text)

  return (
    <div className={className}>
      {doc.blocks.map((block, idx) => (
        <RenderBlock key={idx} block={block}/>
      ))}
    </div>
  )
}
