export interface PRProviderCreateInput {
  repoId: string
  base: string
  head: string
  title: string
  body: string
  draft?: boolean
}

export interface PRProviderCreateResult {
  providerPrId: string
  url: string
  state: string
}

export interface PRProviderGetInput {
  repoId: string
  providerPrId: string
}

export interface PRProviderGetResult {
  state: string
  title: string
  url: string
  approvals: number
  ciStatus: string
}

export interface PRProviderMergeInput {
  repoId: string
  providerPrId: string
  method: 'merge' | 'squash' | 'rebase'
}

export interface PRProviderMergeResult {
  ok: true
}

export interface PRProvider {
  createPR(input: PRProviderCreateInput): Promise<PRProviderCreateResult>
  getPR(input: PRProviderGetInput): Promise<PRProviderGetResult>
  mergePR(input: PRProviderMergeInput): Promise<PRProviderMergeResult>
}
