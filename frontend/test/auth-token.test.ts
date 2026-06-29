import { describe, expect, it, beforeEach } from 'vitest'

import {
  getAuthToken,
  setAuthToken,
  subscribeAuthToken,
} from '../src/lib/authToken.ts'

describe('auth token store', () => {
  beforeEach(() => {
    setAuthToken(null)
  })

  it('starts empty', () => {
    expect(getAuthToken()).toBeNull()
  })

  it('stores and returns the current token', () => {
    setAuthToken('abc.def.ghi')
    expect(getAuthToken()).toBe('abc.def.ghi')
  })

  it('notifies subscribers on change and supports unsubscribe', () => {
    const seen: Array<string | null> = []
    const unsubscribe = subscribeAuthToken(() => seen.push(getAuthToken()))

    setAuthToken('first')
    setAuthToken('second')
    unsubscribe()
    setAuthToken('third')

    expect(seen).toEqual(['first', 'second'])
  })
})
