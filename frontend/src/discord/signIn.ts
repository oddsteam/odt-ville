import { setAuthToken } from '../lib/authToken'

// The slice of the embedded-app SDK sign-in needs. Structural, so tests pass a
// fake and the real DiscordSDK satisfies it without an adapter.
export interface DiscordAuthSdk {
  ready(): Promise<void>
  commands: {
    authorize(args: {
      client_id: string
      response_type: 'code'
      state: string
      prompt: 'none'
      scope: 'identify'[]
    }): Promise<{ code: string }>
    authenticate(args: { access_token: string }): Promise<unknown>
  }
}

export interface DiscordUser {
  name: string
}

// Discord sign-in (#568, ADR-0022 decision 3): the Activity asks Discord for an
// OAuth code, the backend trades it for the player's identity and our own
// `dsc.` session token. That token goes into the shared token store, so every
// later REST call and the presence socket authenticate with no Keycloak.
export async function signIn(
  sdk: DiscordAuthSdk,
  clientId: string,
  fetchFn: typeof fetch = fetch,
): Promise<DiscordUser> {
  await sdk.ready()
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  })
  const res = await fetchFn('/api/v1/discord/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) throw new Error(`Discord sign-in failed (${res.status})`)
  const session = (await res.json()) as { token: string; access_token: string; user: DiscordUser }
  setAuthToken(session.token)
  // Most SDK commands beyond authorize need an authenticated SDK.
  await sdk.commands.authenticate({ access_token: session.access_token })
  return session.user
}
