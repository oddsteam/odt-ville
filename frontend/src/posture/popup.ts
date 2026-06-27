// Browser glue for the posture gate's popup (issue #24). Thin window/postMessage
// wrappers fed to runPostureGate; the orchestration + the gate decision live in
// runGate.ts (unit-tested). Browser-only, proven by the live integration run.

import { POSTURE_MESSAGE } from './callback.ts'

// Open the hosted verification page centred-ish. Returns null if blocked.
export function openGatePopup(url: string): Window | null {
  const w = 460
  const h = 720
  const left = Math.max(0, (window.screen.width - w) / 2)
  const top = Math.max(0, (window.screen.height - h) / 2)
  return window.open(url, 'posture-login', `popup,width=${w},height=${h},left=${left},top=${top}`)
}

// Resolve when the popup posts its result back from OUR origin, or when it
// closes without one (treated as a cancel). Always cleans up its listeners.
export function awaitGateResult(popup: Window): Promise<{ status: string | null }> {
  return new Promise((resolve) => {
    let done = false
    const finish = (status: string | null) => {
      if (done) return
      done = true
      window.removeEventListener('message', onMessage)
      clearInterval(poll)
      resolve({ status })
    }

    const onMessage = (e: MessageEvent) => {
      // Origin-lock: only our own callback page may report the result; the
      // popup itself loads a foreign (posture-login) origin we never trust.
      if (e.origin !== window.location.origin) return
      if (e.source !== popup) return
      if (e.data?.type !== POSTURE_MESSAGE) return
      finish(typeof e.data.status === 'string' ? e.data.status : null)
    }
    window.addEventListener('message', onMessage)

    // The callback page closes itself; if the user closes the popup first we
    // get no message, so fall back to a closed-poll → cancelled.
    const poll = setInterval(() => {
      if (popup.closed) finish('cancelled')
    }, 400)
  })
}
