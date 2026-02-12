export type MergeConflictFile = {
  path: string
  base: string
  ours: string
  theirs: string
  markers: string
}

export type MergeConflictPackage = {
  task: { id: string; title: string }
  pr: { id: string; base: string; head: string }
  files: MergeConflictFile[]
  rules: {
    style: string
    denylist: string[]
  }
}
