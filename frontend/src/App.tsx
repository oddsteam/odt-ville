import { Routes, Route, Navigate } from 'react-router-dom'
import RootLayout from './RootLayout.tsx'
import VillagePage from './VillagePage.tsx'
import AdminLayout from './admin/AdminLayout.tsx'
import RequireAdmin from './auth/RequireAdmin.tsx'
import CommunitiesAdminPage from './admin/CommunitiesAdminPage.tsx'
import SpriteMapper from './spriteMapper/SpriteMapper.tsx'
import TileMapper from './tileMapper/TileMapper.tsx'
import GroundTileMapper from './groundTiles/GroundTileMapper.tsx'
import MonstersAdminPage from './admin/MonstersAdminPage.tsx'
import PostureCallbackPage from './posture/CallbackPage.tsx'
import MapPage from './maps/MapPage.tsx'

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
          is reachable by URL only — no link from the game UI. RequireAdmin gates
          the whole subtree on the `admin` realm role (#100). */}
      <Route element={<RequireAdmin />}>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="communities" replace />} />
          <Route path="communities" element={<CommunitiesAdminPage />} />
          <Route path="sprites" element={<SpriteMapper />} />
          <Route path="objects" element={<TileMapper />} />
          <Route path="ground" element={<GroundTileMapper />} />
          <Route path="monsters" element={<MonstersAdminPage />} />
        </Route>
      </Route>
      {/* posture-login popup return (issue #24) — bare page, no app chrome;
          it posts the result home to the opener and closes. */}
      <Route path="posture/callback" element={<PostureCallbackPage />} />
      {/* Authored map (ADR-0004) — loads a baked map by slug and renders it
          through the map-agnostic runtime. The editor that authors these lands
          in later slices (#80+); this route proves load-and-render end-to-end. */}
      <Route path="maps/:slug" element={<MapPage />} />
      {/* Unknown paths fall back to the village. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
