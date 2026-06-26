import { useEffect } from 'react'
import { postResultToOpener } from './callback.ts'

// The popup lands here after posture-login redirects it back with
// session_id + status (issue #24). It posts the status hint home to the opener
// (origin-locked) and closes itself; the shell's server-to-server confirm is
// what actually opens the gate. Rendered bare (no app chrome) inside the popup.
export default function PostureCallbackPage() {
  useEffect(() => {
    postResultToOpener()
  }, [])

  return (
    <div className="loading-card">
      <p>RETURNING TO THE VILLAGE…</p>
    </div>
  )
}
