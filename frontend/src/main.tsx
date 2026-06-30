import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { bootstrapAuth } from './auth/session.ts'
import { initAnalytics } from './analytics/posthog.ts'
import './styles.css'

// PostHog: no-op without VITE_POSTHOG_KEY; subscribes so it identifies the user
// once bootstrapAuth (or the dev switcher) publishes a token.
initAnalytics()

// Sign in before rendering (prod redirects to Keycloak; dev resolves at once).
bootstrapAuth().then(() => {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
})
