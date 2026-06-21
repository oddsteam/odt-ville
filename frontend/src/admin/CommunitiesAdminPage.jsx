import { useCallback, useEffect, useState } from 'react'
import CommunitiesAdminPanel from '../communities/CommunitiesAdminPanel.jsx'
import { listCommunities } from '../communities/client.js'

// Route wrapper for the communities CRUD panel. The panel owns its own
// create/delete calls and asks for a refetch via onChanged; this wrapper owns
// the list it edits. (The village route loads communities independently and
// refetches on its own mount, so there's no shared state to keep in sync.)
export default function CommunitiesAdminPage() {
  const [communities, setCommunities] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setCommunities(await listCommunities())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="admin-msg admin-msg-error">{error}</p>
  if (!communities) return <p className="admin-msg">Loading communities…</p>

  return <CommunitiesAdminPanel communities={communities} onChanged={load} />
}
