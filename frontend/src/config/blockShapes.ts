// frontend/src/config/blockShapes.ts

export type ShapeKind =
  | 'full_cube'
  | 'half_cube'
  | 'flat_layer'
  | 'thin_panel'
  | 'door'
  | 'flat_plane'
  | 'stair_step'
  | 'post_frame'
  | 'cross_plane'
  | 'pane_cross'
  | 'fire';

export interface ShapeDefinition {
  kind: ShapeKind;
  box: [number, number, number]; // in 16px units
  offset?: [number, number, number];
  planes?: number;
  doubleSided?: boolean;
}

export const SHAPES: Record<ShapeKind, ShapeDefinition> = {
  full_cube: {
    kind: 'full_cube',
    box: [16, 16, 16],
    offset: [0, 0, 0],
  },
  half_cube: {
    kind: 'half_cube',
    box: [16, 8, 16],
    offset: [0, 0, 0],
  },
  flat_layer: {
    kind: 'flat_layer',
    box: [16, 1, 16],
    offset: [0, 0, 0],
  },
  thin_panel: {
    kind: 'thin_panel',
    box: [16, 16, 3],
    offset: [0, 0, 0],
  },
  door: {
    kind: 'door',
    box: [16, 32, 3],
    offset: [0, 0, 0],
  },
  flat_plane: {
    kind: 'flat_plane',
    box: [16, 16, 0],
    offset: [0, 0, 0],
    doubleSided: true,
  },
  stair_step: {
    kind: 'stair_step',
    box: [16, 16, 16],
    offset: [0, 0, 0],
  },
  post_frame: {
    kind: 'post_frame',
    box: [4, 16, 4],
    offset: [6, 0, 6],
  },
  cross_plane: {
    kind: 'cross_plane',
    box: [16, 16, 0],
    planes: 2,
    doubleSided: true,
  },
  pane_cross: {
    kind: 'pane_cross',
    box: [16, 16, 2],
    offset: [7, 0, 7],
  },
  fire: {
    kind: 'fire',
    box: [16, 22.4, 16],
    offset: [0, 0, 0],
    doubleSided: true,
  },
};

/**
 * Exception list for non-suffixed blocks.
 * Standard full-cube blocks (stone, dirt, planks, etc.) are NEVER listed here.
 */
const EXPLICIT_SHAPE_EXCEPTIONS: Record<string, ShapeKind> = {
  carpet: 'flat_layer',
  snow_layer: 'flat_layer',
  top_snow: 'flat_layer',
  ladder: 'flat_plane',
  vine: 'flat_plane',
  vines: 'flat_plane',
  glow_lichen: 'flat_plane',
  sculk_vein: 'flat_plane',
  rail: 'flat_plane',
  golden_rail: 'flat_plane',
  activator_rail: 'flat_plane',
  detector_rail: 'flat_plane',
  tripwire: 'flat_plane',
  iron_bars: 'pane_cross',
  glass_pane: 'pane_cross',
  fire: 'fire',
  soul_fire: 'fire',
  web: 'cross_plane',
  cobweb: 'cross_plane',
  sugar_cane: 'cross_plane',
  sweet_berry_bush: 'cross_plane',
  short_grass: 'cross_plane',
  tall_grass: 'cross_plane',
  fern: 'cross_plane',
  large_fern: 'cross_plane',
  seagrass: 'cross_plane',
  kelp: 'cross_plane',
  deadbush: 'cross_plane',
  torch: 'post_frame',
  soul_torch: 'post_frame',
  redstone_torch: 'post_frame',
  end_rod: 'post_frame',
  lightning_rod: 'post_frame',
  chain: 'post_frame',
};

/**
 * Resolves a block identifier to its 3D preview shape.
 * Follows an exception-only strategy with zero-cost implicit fallback to full_cube.
 */
export function resolveBlockShape(rawBlockId?: string | null): ShapeDefinition {
  if (!rawBlockId) return SHAPES.full_cube;

  let id = rawBlockId.toLowerCase().trim();
  if (id.startsWith('minecraft:')) {
    id = id.slice(10);
  }

  // 1. Check explicit non-cube exception map
  const exceptionShape = EXPLICIT_SHAPE_EXCEPTIONS[id];
  if (exceptionShape && SHAPES[exceptionShape]) {
    return SHAPES[exceptionShape];
  }

  // 2. High-performance suffix / keyword heuristics
  if (id.endsWith('_slab') || id.endsWith('slab')) {
    return SHAPES.half_cube;
  }
  if (id.endsWith('_stairs') || id.endsWith('stairs')) {
    return SHAPES.stair_step;
  }
  if (id.endsWith('_trapdoor') || id.endsWith('trapdoor')) {
    return SHAPES.thin_panel;
  }
  if (id.endsWith('_door') || id.endsWith('door')) {
    return SHAPES.door;
  }
  if (id.endsWith('_carpet') || id.endsWith('carpet')) {
    return SHAPES.flat_layer;
  }
  if (id.endsWith('_wall') || id.endsWith('_fence') || id.endsWith('fence') || id.endsWith('wall')) {
    return SHAPES.post_frame;
  }
  if (id.endsWith('_pane') || id.endsWith('pane')) {
    return SHAPES.pane_cross;
  }
  if (
    id.includes('sapling') ||
    id.includes('flower') ||
    id.includes('tulip') ||
    id.includes('orchid') ||
    id.includes('allium') ||
    id.includes('dandelion') ||
    id.includes('poppy') ||
    id.includes('bluet') ||
    id.includes('daisy') ||
    id.includes('cornflower') ||
    id.includes('lily') ||
    id.includes('rose') ||
    id.includes('mushroom') ||
    id.includes('fungus') ||
    id.includes('roots') ||
    id.includes('sprouts')
  ) {
    return SHAPES.cross_plane;
  }

  // 3. Implicit Default Fallback: Standard 16x16x16 Full Cube
  return SHAPES.full_cube;
}
