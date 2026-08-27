import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { bootstrapAuth } from './auth/session.ts'
import { RealmChooser } from './auth/RealmChooser.tsx'
import { initAnalytics } from './analytics/posthog.ts'
import './styles.css'

// PostHog: no-op without VITE_POSTHOG_KEY; subscribes so it identifies the user
// once bootstrapAuth (or the dev switcher) publishes a token.
initAnalytics()

// Sign in before rendering (prod redirects to Keycloak; dev resolves at once).
// 'choose' = dual-realm prod with no realm picked yet (#539): render the
// chooser instead — picking a realm reloads into the redirect login.
bootstrapAuth().then((state) => {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {state === 'choose' ? (
        <RealmChooser />
      ) : (
        <BrowserRouter>
          <App />
        </BrowserRouter>
      )}
    </React.StrictMode>,
  )
})
