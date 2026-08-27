// Pre-login realm chooser (#539). Rendered by main.tsx instead of the app when
// an external clients realm is configured and no realm has been picked yet.
// Picking one persists the choice and reloads — bootstrapAuth then redirects to
// that realm's Keycloak login.

import React from 'react'
import { loginRealms, chooseRealm } from './realmChoice.ts'

export function RealmChooser(): React.JSX.Element {
  const pick = (realm: string) => {
    chooseRealm(realm)
    window.location.reload()
  }

  return (
    <div className="login-chooser">
      <h1>ODT Ville</h1>
      <p>Choose your login method</p>
      {loginRealms().map(({ realm, label }) => (
        <button key={realm} type="button" onClick={() => pick(realm)}>
          {label}
        </button>
      ))}
    </div>
  )
}
