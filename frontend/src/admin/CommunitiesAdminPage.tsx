import { useCallback, useEffect, useState } from 'react'
import CommunitiesAdminPanel from '../communities/CommunitiesAdminPanel.tsx'
import { CommunitiesService } from '../communities/service.ts'
import type { Community } from '../communities/schema.ts'
import { runEdge } from '../lib/runEdge.ts'

// Route wrapper for the communities CRUD panel. Owns the list it edits and
// runs every read at the React edge via `runEdge` — the canonical pattern
// the Effect data layer is being rolled out behind (PRD #3 / issue #5).
export default function CommunitiesAdminPage() {
  const [communities, setCommunities] = useState<readonly Community[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setCommunities(await runEdge(CommunitiesService.list()))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="admin-msg admin-msg-error">{error}</p>
  if (!communities) return <p className="admin-msg">Loading communities…</p>

  return <CommunitiesAdminPanel communities={communities} onChanged={load} />
}
