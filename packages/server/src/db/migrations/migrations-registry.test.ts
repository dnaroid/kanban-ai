import { describe, expect, it } from 'vitest'
import { migrations } from '../migrations'

describe('migrations registry', () => {
  it('contains ordered versions including app_metrics migration', () => {
    const versions = migrations.map((migration) => migration.version)
    expect(versions).toEqual([16, 17, 18])
  })
})
