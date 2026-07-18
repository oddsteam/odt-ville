// The bundled tilesets the ground-tile mapper can pick cells from. Only those
// whose PNG is actually served from public/maps/tilesets/ belong here.
//
// `name` must match the name passed to Phaser's addTilesetImage so the game can
// resolve a (tileset, col, row) catalog entry back to a drawable cell. `cell`
// is px per tile; cols/rows are derived from the loaded image at runtime.
//
// Every tileset is category-prefixed, e.g. 'buildings/16_Office_32x32', which
// resolves to /maps/tilesets/buildings/16_Office_32x32.png. See tiled/README.md.
export const TILESETS = [
  { name: 'terrain/1_Terrains_and_Fences_32x32', cell: 32 }, // the main grass/road source
  { name: 'terrain/2_City_Terrains_32x32', cell: 32 },
  { name: 'buildings/5_Floor_Modular_Buildings_32x32', cell: 32 },
  { name: 'buildings/4_Generic_Buildings_32x32', cell: 32 },
  { name: 'interiors/Interiors_free_32x32', cell: 32 },
  { name: 'vehicles/10_Vehicles_32x32', cell: 32 },
]

export const tilesetUrl = (name) => `/maps/tilesets/${name}.png`
