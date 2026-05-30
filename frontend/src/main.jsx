import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import keycloak, { authEnabled } from './auth/keycloak.js'

// Initialise Keycloak before mounting React so the very first render already
// has a token. With `login-required`, an unauthenticated visitor is redirected
// to the Keycloak login page and returns here authenticated.
async function bootstrap() {
  if (authEnabled) {
    try {
      await keycloak.init({
        onLoad: 'login-required',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      })
      keycloak.onTokenExpired = () => {
        keycloak.updateToken(30).catch(() => keycloak.login())
      }
    } catch (e) {
      // Keycloak unreachable: mount anyway so the user sees the app's own
      // error UI (the API falls back to the seeded user) instead of a blank
      // screen. The console line tells a developer what actually happened.
      console.error('Keycloak init failed — continuing without auth:', e)
    }
  }

  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

bootstrap()
