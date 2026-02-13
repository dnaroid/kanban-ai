import { describe, it, expect, vi } from 'vitest'

describe('Example Test', () => {
  it('should pass', () => {
    expect(true).toBe(true)
  })

  it('should handle async operations', async () => {
    const promise = Promise.resolve(42)
    await expect(promise).resolves.toBe(42)
  })

  it('should mock functions', () => {
    const mockFn = vi.fn()
    mockFn('hello')
    expect(mockFn).toHaveBeenCalledWith('hello')
    expect(mockFn).toHaveBeenCalledTimes(1)
  })
})
