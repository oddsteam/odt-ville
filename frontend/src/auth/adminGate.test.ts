import { describe, it, expect } from 'vitest'

import { adminGate } from './adminGate.ts'
import type { Viewer } from '../viewer/schema.ts'

const viewer = (roles: string[]): Viewer => ({
  user: { id: 1, name: 'Test', role: 'branch_employee', external_id: 'kc-sub-1' },
  company: { id: 1, name: 'Co' },
  roles,
})

describe('adminGate', () => {
  it('allows a viewer carrying the admin role', () => {
    expect(adminGate(viewer(['admin']))).toBe('allow')
  })

  it('denies a viewer without the admin role', () => {
    expect(adminGate(viewer(['editor']))).toBe('deny')
    expect(adminGate(viewer([]))).toBe('deny')
  })

  it('holds while the viewer is still loading', () => {
    expect(adminGate(undefined)).toBe('pending')
  })

  it('denies when the viewer failed to load', () => {
    expect(adminGate(null)).toBe('deny')
  })
})
