let bridgeInitPromise: Promise<void> | null = null

export async function ensureWindowApiBridge(): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }

  if ((window as any).api) {
    return
  }

  if (!bridgeInitPromise) {
    bridgeInitPromise = import('../../../packages/web/src/api').then(() => undefined)
  }

  await bridgeInitPromise
}
