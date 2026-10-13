import { useEffect, useState } from 'react'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import { signIn } from './discord/signIn'

// The Discord Activity's composition root (ADR-0022, #568) — the second shell,
// sibling of MapPage. It lives at src/ root and in the SHELL group (see
// .dependency-cruiser.cjs) so later slices can boot the game black box the
// same way MapPage does; the discord-shell rule keeps it off auth/, voice/ and
// the web shell. Discord-specific helpers live in src/discord/.

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string

type State = { kind: 'loading' } | { kind: 'signedIn'; name: string } | { kind: 'error'; message: string }

export default function DiscordShell() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    // `new DiscordSDK` throws outside Discord (no instance_id) — construct here
    // so the failure lands in the error screen, not a blank page.
    Promise.resolve()
      .then(() => signIn(new DiscordSDK(CLIENT_ID), CLIENT_ID))
      .then(
        (user) => setState({ kind: 'signedIn', name: user.name }),
        (e: unknown) => setState({ kind: 'error', message: String((e as Error)?.message ?? e) }),
      )
  }, [])

  if (state.kind === 'loading') return <p>Signing in with Discord…</p>
  if (state.kind === 'error') return <p role="alert">Could not sign in: {state.message}</p>
  return <p>Signed in as {state.name}</p>
}
