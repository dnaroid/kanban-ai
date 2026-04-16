export interface LmdDoc {
	blocks: LmdBlock[];
}

export type LmdColumnAlign = "left" | "center" | "right" | null;

export interface LmdTableCell {
	inlines: LmdInline[];
}

export interface LmdTableRow {
	cells: LmdTableCell[];
}

export interface LmdTable {
	type: "table";
	align: LmdColumnAlign[];
	header: LmdTableRow;
	rows: LmdTableRow[];
}

export type LmdBlock =
	| { type: "heading"; level: 1 | 2 | 3; inlines: LmdInline[] }
	| { type: "hr" }
	| { type: "blockquote"; blocks: LmdBlock[] }
	| { type: "code"; lang?: string; text: string }
	| { type: "list"; ordered: boolean; items: LmdListItem[] }
	| { type: "paragraph"; inlines: LmdInline[] }
	| LmdTable;

export interface LmdListItem {
	checked?: boolean;
	blocks: LmdBlock[];
}

export type LmdInline =
	| { type: "text"; text: string }
	| { type: "bold"; children: LmdInline[] }
	| { type: "italic"; children: LmdInline[] }
	| { type: "code"; text: string }
	| { type: "link"; text: string; url: string };
