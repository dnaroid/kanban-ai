import { getSecretStore } from '../secrets/secret-store.js'
import type {
  PRProvider,
  PRProviderCreateInput,
  PRProviderCreateResult,
  PRProviderGetInput,
  PRProviderGetResult,
  PRProviderMergeInput,
  PRProviderMergeResult,
} from './pr-provider.js'

const GITHUB_API_BASE = 'https://api.github.com'
const TOKEN_SERVICE = 'provider/github'
const TOKEN_ACCOUNT = 'token'

type GitHubPull = {
  number: number
  html_url: string
  title: string
  state: 'open' | 'closed'
  draft?: boolean
  merged_at?: string | null
  head: { sha: string }
}

type GitHubStatus = {
  state: 'error' | 'failure' | 'pending' | 'success'
}

type GitHubReview = {
  state: string
}

const getGitHubToken = async (): Promise<string> => {
  const token = await getSecretStore().getPassword(TOKEN_SERVICE, TOKEN_ACCOUNT)
  if (!token) {
    throw new Error('GitHub token not configured')
  }
  return token
}

const requestGitHub = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const token = await getGitHubToken()
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`GitHub API error ${response.status}: ${message}`)
  }

  return (await response.json()) as T
}

const mapCiStatus = (state: GitHubStatus['state']): string => {
  if (state === 'success') return 'success'
  if (state === 'pending') return 'pending'
  if (state === 'failure' || state === 'error') return 'failed'
  return 'unknown'
}

const mapPrState = (pull: GitHubPull): string => {
  if (pull.merged_at) return 'merged'
  if (pull.draft) return 'draft'
  return pull.state
}

export class GitHubPRProvider implements PRProvider {
  async createPR(input: PRProviderCreateInput): Promise<PRProviderCreateResult> {
    const payload: Record<string, unknown> = {
      title: input.title,
      head: input.head,
      base: input.base,
      body: input.body,
    }

    if (input.draft !== undefined) {
      payload.draft = input.draft
    }

    const pull = await requestGitHub<GitHubPull>(`/repos/${input.repoId}/pulls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return {
      providerPrId: String(pull.number),
      url: pull.html_url,
      state: mapPrState(pull),
    }
  }

  async getPR(input: PRProviderGetInput): Promise<PRProviderGetResult> {
    const pull = await requestGitHub<GitHubPull>(
      `/repos/${input.repoId}/pulls/${input.providerPrId}`
    )

    const [status, reviews] = await Promise.all([
      requestGitHub<GitHubStatus>(`/repos/${input.repoId}/commits/${pull.head.sha}/status`),
      requestGitHub<GitHubReview[]>(`/repos/${input.repoId}/pulls/${input.providerPrId}/reviews`),
    ])

    const approvals = reviews.filter((review) => review.state === 'APPROVED').length

    return {
      state: mapPrState(pull),
      title: pull.title,
      url: pull.html_url,
      approvals,
      ciStatus: mapCiStatus(status.state),
    }
  }

  async mergePR(input: PRProviderMergeInput): Promise<PRProviderMergeResult> {
    const response = await requestGitHub<{ merged: boolean }>(
      `/repos/${input.repoId}/pulls/${input.providerPrId}/merge`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ merge_method: input.method }),
      }
    )

    if (!response.merged) {
      throw new Error('GitHub merge failed')
    }

    return { ok: true }
  }
}

export const createGitHubPRProvider = (): PRProvider => new GitHubPRProvider()
