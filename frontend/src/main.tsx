import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { bootstrapAuth } from './auth/session.ts'
import './styles.css'

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
