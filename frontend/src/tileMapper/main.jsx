import { createRoot } from 'react-dom/client'
import TileMapper from './TileMapper.jsx'

// Standalone entry for the tile-object mapper (see tile-mapper.html). Like the
// sprite-mapper, it's a self-contained authoring tool with no app wiring.
createRoot(document.getElementById('root')).render(<TileMapper />)
