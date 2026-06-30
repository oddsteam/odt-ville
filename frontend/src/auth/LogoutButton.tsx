import { logout } from './session.ts'

// Sign-out control shared by the game header and the admin nav. Delegates to
// logout(), which handles both the dev switcher and the prod Keycloak session.
export default function LogoutButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={logout}>
      Log out
    </button>
  )
}
