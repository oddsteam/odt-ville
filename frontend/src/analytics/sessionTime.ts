// Active session-duration tracking (issue #104). Measures how long the user
// actively spends on the game tab — counting only foreground time — and sends
// it to PostHog as `session_active_time` { active_seconds } when the session
// ends (tab close / pagehide). Background time (user on another tab) is
// excluded via the Page Visibility API. Wired at the app shell (RootLayout),
// independent of the game black box. Email rides along automatically (#101).

import { captureEvent } from './posthog.ts'

interface SessionTimerDeps {
  // Monotonic millisecond clock — `performance.now()` in the browser, a fake
  // in tests. Only deltas matter, so the origin is irrelevant.
  now: () => number
  // Sink for the final active duration, in whole seconds.
  capture: (seconds: number) => void
}

export interface SessionTimer {
  // The tab became foreground/visible — start (or resume) counting.
  visible(): void
  // The tab became hidden/background — bank the running foreground span.
  hidden(): void
  // The session is ending — bank any running span and emit the total once.
  end(): void
}

// Pure foreground-time accumulator. Keeps a running total of visible time plus
// the start of the current visible span (null while hidden), so away time is
// never counted. end() is idempotent — pagehide can fire more than once.
export function createSessionTimer({ now, capture }: SessionTimerDeps): SessionTimer {
  let accumulatedMs = 0
  let visibleSince: number | null = null
  let ended = false

  // Bank the in-progress foreground span (if any) into the running total.
  const bank = (): void => {
    if (visibleSince !== null) {
      accumulatedMs += now() - visibleSince
      visibleSince = null
    }
  }

  return {
    visible(): void {
      if (ended || visibleSince !== null) return
      visibleSince = now()
    },
    hidden(): void {
      if (ended) return
      bank()
    },
    end(): void {
      if (ended) return
      bank()
      ended = true
      capture(Math.round(accumulatedMs / 1000))
    },
  }
}

// Wire the foreground-time tracker to the live page: count only while the tab
// is visible and emit `session_active_time` on pagehide. Uses the SDK's
// sendBeacon transport so the final value survives the page going away.
// Returns a cleanup that detaches the listeners (without emitting).
export function trackSessionActiveTime(): () => void {
  const timer = createSessionTimer({
    now: () => performance.now(),
    capture: (active_seconds) =>
      captureEvent('session_active_time', { active_seconds }, { transport: 'sendBeacon' }),
  })

  // Seed from the current visibility so a tab opened in the foreground starts
  // counting immediately (no visibilitychange fires for the initial state).
  if (!document.hidden) timer.visible()

  const onVisibility = (): void =>
    document.hidden ? timer.hidden() : timer.visible()
  const onPageHide = (): void => timer.end()

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
  }
}
