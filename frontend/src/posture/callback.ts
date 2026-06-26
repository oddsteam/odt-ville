// The posture-login callback page's glue (issue #24). After the user performs
// the posture, the service redirects the popup to our callback page with
// session_id + status. The page parses them, posts the result back to the
// opener (origin-locked), and closes. The status is a UX hint only — the gate
// is opened by the shell's server-to-server confirm, never by this redirect.

export const CALLBACK_PATH = '/posture/callback'

// The message shape the popup posts to its opener.
export const POSTURE_MESSAGE = 'posture-callback'

export function parseCallbackParams(search: string): {
  sessionId: string | null
  status: string | null
} {
  const q = new URLSearchParams(search)
  return { sessionId: q.get('session_id'), status: q.get('status') }
}

// Post the result home to the opener (locked to our own origin) and close the
// popup. No-ops gracefully when there is no opener (e.g. full-page fallback).
export function postResultToOpener(
  win: Window = window,
  status: string | null = parseCallbackParams(win.location.search).status,
): void {
  const opener = win.opener as Window | null
  if (opener) {
    opener.postMessage({ type: POSTURE_MESSAGE, status }, win.location.origin)
  }
  win.close()
}
