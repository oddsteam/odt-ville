import { useEffect, useState } from 'react'
import bus from './phaser/bus.js'

// Persist dismissal in localStorage so users who close the notice never see
// it again (issue #23 acceptance criterion). The key is namespaced under
// the game module so we can grow more notice categories later.
const STORAGE_KEY = 'odt.perfStallNotice.dismissed'

const wasDismissed = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const persistDismissal = (): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // localStorage may be unavailable (Safari private mode, quota); the
    // banner just resurfaces on the next stall event in that case.
  }
}

// Dismissible banner shown over the game canvas when the Phaser scenes detect
// the RAF loop being throttled — a symptom of a browser extension throttling
// the page. Subscribes to the bus 'perfStall' event TownScene/InteriorScene
// emit; renders nothing until the event fires, and disappears once the user
// dismisses it.
export default function PerfStallNotice() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (wasDismissed()) return undefined
    const onStall = () => setVisible(true)
    bus.on('perfStall', onStall)
    return () => {
      bus.off('perfStall', onStall)
    }
  }, [])

  if (!visible) return null

  const dismiss = () => {
    persistDismissal()
    setVisible(false)
  }

  return (
    <div className="perf-stall-notice" role="status" aria-live="polite">
      <p className="perf-stall-notice-body">
        Movement stuttering? A browser extension may be throttling the game.
        Try an Incognito window, or disable extensions on this site.
      </p>
      <button
        type="button"
        className="perf-stall-notice-dismiss"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        DON'T SHOW AGAIN
      </button>
    </div>
  )
}
