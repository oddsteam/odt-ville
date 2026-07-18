// Communities + content data client.
//
// The community resource (list / create / remove + getFeed) lives in
// `service.ts` as a typed Effect service with effect/Schema decoders. The
// helpers below are thin Promise façades over that service for the existing
// JSX call sites (VillagePage, DailyBriefShortcut). `/admin/communities`
// invokes the service directly via `runEdge`.
//
// The remaining helper (getCommunity) is still untyped fetch — it'll be
// migrated to the Effect pattern in a follow-up slice.

import { runEdge } from '../lib/runEdge.ts'
import { CommunitiesService } from './service.ts'

const BASE = '/api/v1'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    let detail = ''
    try {
      detail = await res.text()
    } catch {
      detail = ''
    }
    throw new Error(
      `Request to ${path} failed (${res.status})${detail ? `: ${detail}` : ''}`,
    )
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export function listCommunities() {
  return runEdge(CommunitiesService.list())
}

export function createCommunity(attrs) {
  return runEdge(CommunitiesService.create(attrs))
}

export function removeCommunity(id) {
  return runEdge(CommunitiesService.remove(id))
}

export function getFeed() {
  return runEdge(CommunitiesService.getFeed())
}

// GET /communities/:id -> { community, boards }
export function getCommunity(id) {
  return request(`/communities/${id}`)
}

// POST /content_items/:id/open -> decoded { id, state, opened_at, acknowledged_at }
export function openItem(id) {
  return runEdge(CommunitiesService.open(id))
}

// POST /content_items/:id/acknowledge -> decoded state shape
export function acknowledgeItem(id) {
  return runEdge(CommunitiesService.acknowledge(id))
}
