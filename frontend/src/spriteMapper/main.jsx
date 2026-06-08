import { createRoot } from 'react-dom/client'
import SpriteMapper from './SpriteMapper.jsx'
import './styles.css'

// Standalone entry for the character sprite mapper (see sprite-mapper.html).
// No Keycloak/App wiring — it's a self-contained authoring tool.
createRoot(document.getElementById('root')).render(<SpriteMapper />)
