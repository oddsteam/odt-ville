import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'

import { runEdge } from '../lib/runEdge.ts'
import { ViewerService } from '../viewer/service.ts'
import type { Viewer } from '../viewer/schema.ts'
import { adminGate } from './adminGate.ts'

// Route guard for /admin (#100): fetch the viewer, then gate on the `admin`
// realm role. Non-admins — and failed loads — are redirected to the village;
// we render nothing while the check is in flight so no admin UI flashes.
export default function RequireAdmin() {
  const [viewer, setViewer] = useState<Viewer | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    runEdge(ViewerService.get())
      .then((v) => active && setViewer(v))
      .catch(() => active && setViewer(null))
    return () => {
      active = false
    }
  }, [])

  const gate = adminGate(viewer)
  if (gate === 'pending') return null
  if (gate === 'deny') return <Navigate to="/" replace />
  return <Outlet />
}
