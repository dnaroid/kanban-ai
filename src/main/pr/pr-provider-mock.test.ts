import { describe, expect, it } from 'vitest'
import type { PRProvider } from './pr-provider'

class MockPRProvider implements PRProvider {
  private store = new Map<
    string,
    { state: string; title: string; url: string; approvals: number; ciStatus: string }
  >()

  async createPR(input: {
    repoId: string
    base: string
    head: string
    title: string
    body: string
    draft?: boolean
  }): Promise<{ providerPrId: string; url: string; state: string }> {
    const id = `pr-${this.store.size + 1}`
    const url = `https://example.com/${input.repoId}/${id}`
    const state = input.draft ? 'draft' : 'open'
    this.store.set(id, { state, title: input.title, url, approvals: 0, ciStatus: 'pending' })
    return { providerPrId: id, url, state }
  }

  async getPR(input: { repoId: string; providerPrId: string }): Promise<{
    state: string
    title: string
    url: string
    approvals: number
    ciStatus: string
  }> {
    const record = this.store.get(input.providerPrId)
    if (!record) {
      throw new Error('PR not found')
    }
    return {
      state: record.state,
      title: record.title,
      url: record.url,
      approvals: record.approvals,
      ciStatus: record.ciStatus,
    }
  }

  async mergePR(): Promise<{ ok: true }> {
    return { ok: true }
  }
}

describe('MockPRProvider', () => {
  it('creates and fetches pull requests', async () => {
    const provider = new MockPRProvider()
    const created = await provider.createPR({
      repoId: 'owner/repo',
      base: 'main',
      head: 'task/123',
      title: 'Test PR',
      body: 'Details',
    })

    expect(created.providerPrId).toBe('pr-1')
    expect(created.state).toBe('open')

    const fetched = await provider.getPR({
      repoId: 'owner/repo',
      providerPrId: created.providerPrId,
    })
    expect(fetched.title).toBe('Test PR')
    expect(fetched.ciStatus).toBe('pending')
  })
})
