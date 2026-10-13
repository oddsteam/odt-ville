import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import DiscordShell from '../DiscordShell'

// Entry for discord.html (ADR-0022 decision 4). Deliberately no PostHog and no
// bootstrapAuth/Keycloak — the Activity signs in through Discord instead.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DiscordShell />
  </StrictMode>,
)
