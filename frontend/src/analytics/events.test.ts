import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { Community } from '../communities/schema.ts'
import { buildingName, trackEnterDoor, trackInteractBoard } from './events.ts'
import { captureEvent } from './posthog.ts'

vi.mock('./posthog.ts', () => ({ captureEvent: vi.fn() }))

const capture = vi.mocked(captureEvent)

function community(id: number, title: string): Community {
  return {
    id,
    title,
    color: '#000',
    logo_url: '',
    category_key: 'k',
    position_order: id,
    badges: { unread: 0, urgent: 0, requires_ack: 0 },
    boards: [],
  } as Community
}

const COMMUNITIES = [community(1, 'Frontend Guild'), community(2, 'Design Lab')]

beforeEach(() => capture.mockClear())

describe('buildingName', () => {
  it('resolves a community id to its title', () => {
    expect(buildingName(COMMUNITIES, 2)).toBe('Design Lab')
  })

  it('is undefined for an unknown id, null id, or null list', () => {
    expect(buildingName(COMMUNITIES, 99)).toBeUndefined()
    expect(buildingName(COMMUNITIES, null)).toBeUndefined()
    expect(buildingName(null, 1)).toBeUndefined()
  })
})

describe('trackEnterDoor', () => {
  it('captures one enter_door event with the building name', () => {
    trackEnterDoor(COMMUNITIES, 1)
    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledWith('enter_door', { building: 'Frontend Guild' })
  })
})

describe('trackInteractBoard', () => {
  it('captures interact_board with the active building name', () => {
    trackInteractBoard(COMMUNITIES, 2, 'must_know')
    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledWith('interact_board', {
      building: 'Design Lab',
      board_type: 'must_know',
    })
  })
})
