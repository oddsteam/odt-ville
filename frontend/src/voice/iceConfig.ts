// TURN relay config for strict-NAT clients (#283, parent #159). coturn is
// provisioned by hand (HITL); the client just reads its URL + credentials from
// build-time env into iceServers. Absent VITE_TURN_URL => empty config, so a
// peer falls back to host candidates and never errors — the same-host / LAN
// case (#280) is byte-for-byte unchanged.

type TurnEnv = {
  VITE_TURN_URL?: string
  VITE_TURN_USERNAME?: string
  VITE_TURN_CREDENTIAL?: string
}

export function iceConfig(env: TurnEnv = import.meta.env as TurnEnv): RTCConfiguration {
  if (!env.VITE_TURN_URL) return {}
  return {
    iceServers: [
      {
        urls: env.VITE_TURN_URL,
        username: env.VITE_TURN_USERNAME,
        credential: env.VITE_TURN_CREDENTIAL,
      },
    ],
  }
}
