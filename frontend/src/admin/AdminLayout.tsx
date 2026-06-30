import { NavLink, Outlet } from 'react-router-dom'
import LogoutButton from '../auth/LogoutButton.tsx'
import './admin.css'

// The admin console groups what used to be four separate standalone pages
// (sprite-mapper.html, tile-mapper.html, ground-mapper.html) plus the
// communities CRUD under one /admin route with a nav bar styled like the
// authoring tools. Each tool is a black box rendered into the <Outlet>; this
// layout only owns navigation.
const TOOLS = [
  { to: 'communities', label: 'Communities' },
  { to: 'sprites', label: 'Sprites' },
  { to: 'objects', label: 'Map Objects' },
  { to: 'ground', label: 'Ground Tiles' },
  { to: 'monsters', label: 'Monsters' },
]

export default function AdminLayout() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `admin-nav-link${isActive ? ' on' : ''}`

  return (
    <div className="admin-console">
      <nav className="admin-nav" aria-label="Admin tools">
        <span className="admin-nav-brand">⚙ ADMIN</span>
        {TOOLS.map((t) => (
          <NavLink key={t.to} to={t.to} className={linkClass}>
            {t.label}
          </NavLink>
        ))}
        <LogoutButton className="admin-logout" />
      </nav>
      <div className="admin-console-body">
        <Outlet />
      </div>
    </div>
  )
}
