import { Routes, Route, Navigate } from 'react-router-dom'
import RootLayout from './RootLayout.tsx'
import VillagePage from './VillagePage.tsx'
import AdminLayout from './admin/AdminLayout.tsx'
import CommunitiesAdminPage from './admin/CommunitiesAdminPage.tsx'
import SpriteMapper from './spriteMapper/SpriteMapper.tsx'
import TileMapper from './tileMapper/TileMapper.tsx'
import GroundTileMapper from './groundTiles/GroundTileMapper.tsx'
import MonstersAdminPage from './admin/MonstersAdminPage.tsx'
import PostureCallbackPage from './posture/CallbackPage.tsx'

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
        <Route path="monsters" element={<MonstersAdminPage />} />
      </Route>
      {/* posture-login popup return (issue #24) — bare page, no app chrome;
          it posts the result home to the opener and closes. */}
      <Route path="posture/callback" element={<PostureCallbackPage />} />
      {/* Unknown paths fall back to the village. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
