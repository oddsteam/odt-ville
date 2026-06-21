import { Routes, Route, Navigate } from 'react-router-dom'
import RootLayout from './RootLayout.jsx'
import VillagePage from './VillagePage.jsx'
import AdminLayout from './admin/AdminLayout.jsx'
import CommunitiesAdminPage from './admin/CommunitiesAdminPage.jsx'
import SpriteMapper from './spriteMapper/SpriteMapper.jsx'
import TileMapper from './tileMapper/TileMapper.jsx'
import GroundTileMapper from './groundTiles/GroundTileMapper.jsx'

// Route table. RootLayout is the persistent shell (brand header + Village/Admin
// nav); the village game lives at "/" and the admin console — the four former
// standalone authoring pages plus communities CRUD — lives under "/admin".
export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<VillagePage />} />
      </Route>
      {/* The admin console is its own standalone shell (mapper-styled, dark) and
          is reachable by URL only — no link from the game UI. */}
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="communities" replace />} />
        <Route path="communities" element={<CommunitiesAdminPage />} />
        <Route path="sprites" element={<SpriteMapper />} />
        <Route path="objects" element={<TileMapper />} />
        <Route path="ground" element={<GroundTileMapper />} />
      </Route>
      {/* Unknown paths fall back to the village. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
