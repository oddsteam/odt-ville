// The bundled tilesets the ground-tile mapper can pick cells from. Only those
// whose PNG is actually served from public/maps/tilesets/ belong here — several
// .tsx files point their <image source> at a local authoring path (a Downloads
// folder) and have no served PNG, so they're unusable for coordinate refs.
//
// `name` must match the name passed to Phaser's addTilesetImage so the game can
// resolve a (tileset, col, row) catalog entry back to a drawable cell. `cell`
// is px per tile; cols/rows are derived from the loaded image at runtime.
export const TILESETS = [
  { name: '1_Terrains_and_Fences_32x32', cell: 32 }, // the main grass/road source
  { name: '2_City_Terrains_32x32', cell: 32 },
  { name: '5_Floor_Modular_Buildings_32x32', cell: 32 },
  { name: '4_Generic_Buildings_32x32', cell: 32 },
  { name: 'Interiors_free_32x32', cell: 32 },
  { name: '10_Vehicles_32x32', cell: 32 },
]

export const tilesetUrl = (name) => `/maps/tilesets/${name}.png`
