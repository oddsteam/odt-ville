import { createRoot } from 'react-dom/client'
import GroundTileMapper from './GroundTileMapper.jsx'

// Standalone entry for the ground-tile mapper (see ground-mapper.html). Like
// the sprite- and tile-object mappers, it's a self-contained authoring tool.
createRoot(document.getElementById('root')).render(<GroundTileMapper />)
