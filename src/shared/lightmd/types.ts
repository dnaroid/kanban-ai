export type LmdDoc = {
  blocks: LmdBlock[]
}

export type LmdBlock =
  | { type: "heading"; level: 1 | 2 | 3; inlines: LmdInline[] }
  | { type: "hr" }
  | { type: "blockquote"; blocks: LmdBlock[] }
  | { type: "code"; lang: string | null; text: string }
  | { type: "list"; ordered: boolean; items: LmdListItem[] }
  | { type: "paragraph"; inlines: LmdInline[] }

export type LmdListItem = {
  checked?: boolean
  blocks: LmdBlock[]
}

export type LmdInline =
  | { type: "text"; text: string }
  | { type: "bold"; children: LmdInline[] }
  | { type: "italic"; children: LmdInline[] }
  | { type: "code"; text: string }
  | { type: "link"; text: string; url: string }
