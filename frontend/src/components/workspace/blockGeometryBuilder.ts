import * as THREE from 'three';
import { ShapeDefinition } from '../../config/blockShapes';

export interface FaceMaterials {
  east: THREE.Material;  // Right (+X)
  west: THREE.Material;  // Left (-X)
  up: THREE.Material;    // Top (+Y)
  down: THREE.Material;  // Bottom (-Y)
  south: THREE.Material; // Front (+Z)
  north: THREE.Material; // Back (-Z)
}

interface FaceUvMap {
  east?: [number, number, number, number];  // [uMin, vMin, uMax, vMax]
  west?: [number, number, number, number];
  up?: [number, number, number, number];
  down?: [number, number, number, number];
  south?: [number, number, number, number];
  north?: [number, number, number, number];
}

/**
 * Three.js BoxGeometry face order:
 * 0: Right (+X, East)
 * 1: Left (-X, West)
 * 2: Top (+Y, Up)
 * 3: Bottom (-Y, Down)
 * 4: Front (+Z, South)
 * 5: Back (-Z, North)
 * Each face has 4 vertices with 2 UV floats each = 8 floats per face.
 */
function adjustBoxUVs(geom: THREE.BoxGeometry, uvMap: FaceUvMap) {
  const uvAttr = geom.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uvAttr) return;

  const array = uvAttr.array as Float32Array;

  const faceKeys: (keyof FaceUvMap)[] = ['east', 'west', 'up', 'down', 'south', 'north'];

  faceKeys.forEach((key, faceIndex) => {
    const crop = uvMap[key];
    if (!crop) return;

    const [uMin, vMin, uMax, vMax] = crop;
    const offset = faceIndex * 8;

    // Standard Three.js BoxGeometry vertex UV layout for each face:
    // (uMin, vMax), (uMax, vMax), (uMin, vMin), (uMax, vMin)
    array[offset + 0] = uMin;
    array[offset + 1] = vMax;

    array[offset + 2] = uMax;
    array[offset + 3] = vMax;

    array[offset + 4] = uMin;
    array[offset + 5] = vMin;

    array[offset + 6] = uMax;
    array[offset + 7] = vMin;
  });

  uvAttr.needsUpdate = true;
}

/**
 * Builds a Three.js Object3D (Mesh or Group) for the given shape definition.
 */
export function buildBlockMesh(
  shape: ShapeDefinition,
  mats: FaceMaterials,
  primaryMaterial: THREE.Material
): THREE.Object3D {
  const boxMats: THREE.Material[] = [
    mats.east,
    mats.west,
    mats.up,
    mats.down,
    mats.south,
    mats.north,
  ];

  switch (shape.kind) {
    case 'half_cube': {
      // Slab: width 1, height 0.5, depth 1. Bottom sits at y = -0.5
      const geom = new THREE.BoxGeometry(1, 0.5, 1);
      // Adjust UVs for side faces (East, West, South, North) so vertical texture is cropped, not squished
      adjustBoxUVs(geom, {
        east: [0, 0, 1, 0.5],
        west: [0, 0, 1, 0.5],
        south: [0, 0, 1, 0.5],
        north: [0, 0, 1, 0.5],
      });
      const mesh = new THREE.Mesh(geom, boxMats);
      mesh.position.set(0, -0.25, 0);
      return mesh;
    }

    case 'flat_layer': {
      // Carpet / Snow: height 1px (1/16 = 0.0625)
      const h = 1 / 16;
      const geom = new THREE.BoxGeometry(1, h, 1);
      adjustBoxUVs(geom, {
        east: [0, 0, 1, h],
        west: [0, 0, 1, h],
        south: [0, 0, 1, h],
        north: [0, 0, 1, h],
      });
      const mesh = new THREE.Mesh(geom, boxMats);
      mesh.position.set(0, -0.5 + h / 2, 0);
      return mesh;
    }

    case 'thin_panel': {
      // Trapdoor: width 1, height 1, depth 3/16 (0.1875)
      const d = 3 / 16;
      const geom = new THREE.BoxGeometry(1, 1, d);
      adjustBoxUVs(geom, {
        east: [0, 0, d, 1],
        west: [0, 0, d, 1],
        up: [0, 0, 1, d],
        down: [0, 0, 1, d],
      });
      const mesh = new THREE.Mesh(geom, boxMats);
      mesh.position.set(0, 0, -0.5 + d / 2);
      return mesh;
    }

    case 'door': {
      // Bedrock Door: stacked 2-block structure.
      // Lower half uses mats.down (representing the lower door half),
      // Upper half uses mats.up/north/south (representing the upper door half).
      // Depth is 3/16 (3 pixels).
      const d = 3 / 16;
      const group = new THREE.Group();

      // Transparent invisible material for interior touching faces (no middle seam)
      const invisibleMat = new THREE.MeshBasicMaterial({ visible: false });

      // Lower box: [0, 0, -0.5 + d/2] relative to base, height 1. Center Y = 0
      const lowerGeom = new THREE.BoxGeometry(1, 1, d);
      adjustBoxUVs(lowerGeom, {
        east: [0, 0, d, 1],
        west: [0, 0, d, 1],
        down: [0, 0, 1, d],
      });
      const lowerMats: THREE.Material[] = [
        mats.down,     // +X East
        mats.down,     // -X West
        invisibleMat,  // +Y Up (internal seam facing upper block - removed)
        mats.down,     // -Y Down (bottom edge)
        mats.down,     // +Z South (front)
        mats.down,     // -Z North (back)
      ];
      const lowerMesh = new THREE.Mesh(lowerGeom, lowerMats);
      lowerMesh.position.set(0, 0, -0.5 + d / 2);

      // Upper box: height 1, stacked directly above lower box. Center Y = 1
      const upperGeom = new THREE.BoxGeometry(1, 1, d);
      adjustBoxUVs(upperGeom, {
        east: [0, 0, d, 1],
        west: [0, 0, d, 1],
        up: [0, 0, 1, d], // Match the very bottom texture UV edge [0, 0, 1, d]
      });
      // Upper materials use north/south/up (side texture), but the top (+Y) uses mats.down (exact same bottom texture)
      const upperMat = mats.north || mats.up || mats.south;
      const upperMats: THREE.Material[] = [
        upperMat,      // +X East
        upperMat,      // -X West
        mats.down,     // +Y Up (top edge, using exact same bottom texture)
        invisibleMat,  // -Y Down (internal seam facing lower block - removed)
        upperMat,      // +Z South (front)
        upperMat,      // -Z North (back)
      ];
      const upperMesh = new THREE.Mesh(upperGeom, upperMats);
      upperMesh.position.set(0, 1, -0.5 + d / 2);

      group.add(lowerMesh);
      group.add(upperMesh);
      return group;
    }

    case 'flat_plane': {
      // Ladder / Vine / Rail: single plane
      const geom = new THREE.PlaneGeometry(1, 1);
      const mesh = new THREE.Mesh(geom, primaryMaterial);
      mesh.position.set(0, 0, 0);
      return mesh;
    }

    case 'cross_plane': {
      // Flowers / Saplings / Fire / Web: two crossed planes at 90 deg (Y-axis 45 deg & -45 deg)
      const group = new THREE.Group();
      const geom1 = new THREE.PlaneGeometry(1, 1);
      const mesh1 = new THREE.Mesh(geom1, primaryMaterial);
      mesh1.rotation.y = Math.PI / 4;

      const geom2 = new THREE.PlaneGeometry(1, 1);
      const mesh2 = new THREE.Mesh(geom2, primaryMaterial);
      mesh2.rotation.y = -Math.PI / 4;

      group.add(mesh1);
      group.add(mesh2);
      return group;
    }

    case 'pane_cross': {
      // Glass pane / Iron bars: cross with thin depth
      const group = new THREE.Group();
      const d = 2 / 16;
      const geom1 = new THREE.BoxGeometry(1, 1, d);
      const mesh1 = new THREE.Mesh(geom1, boxMats);

      const geom2 = new THREE.BoxGeometry(d, 1, 1);
      const mesh2 = new THREE.Mesh(geom2, boxMats);

      group.add(mesh1);
      group.add(mesh2);
      return group;
    }

    case 'button': {
      // Minecraft button: unpressed 6 wide x 4 high x 2 deep (in 16px block units: 6/16, 4/16, 2/16)
      const w = 6 / 16;
      const h = 4 / 16;
      const d = 2 / 16;
      const geom = new THREE.BoxGeometry(w, h, d);
      adjustBoxUVs(geom, {
        // Sample center of full texture so it matches wood/stone grain
        east: [0.3125, 0.375, 0.4375, 0.625],
        west: [0.3125, 0.375, 0.4375, 0.625],
        up: [0.3125, 0.375, 0.6875, 0.5],
        down: [0.3125, 0.375, 0.6875, 0.5],
        south: [0.3125, 0.375, 0.6875, 0.625],
        north: [0.3125, 0.375, 0.6875, 0.625],
      });
      const mesh = new THREE.Mesh(geom, boxMats);
      mesh.position.set(0, 0, 0);
      return mesh;
    }

    case 'pressure_plate': {
      // Minecraft pressure plate: 14/16 wide x 1/16 high x 14/16 deep (1px inset from block borders)
      const w = 14 / 16;
      const h = 1 / 16;
      const geom = new THREE.BoxGeometry(w, h, w);
      adjustBoxUVs(geom, {
        // Top and bottom sample the 14x14 interior (1/16 to 15/16)
        up: [0.0625, 0.0625, 0.9375, 0.9375],
        down: [0.0625, 0.0625, 0.9375, 0.9375],
        // Side edges: 14px wide x 1px tall
        east: [0.0625, 0, 0.9375, h],
        west: [0.0625, 0, 0.9375, h],
        south: [0.0625, 0, 0.9375, h],
        north: [0.0625, 0, 0.9375, h],
      });
      const mesh = new THREE.Mesh(geom, boxMats);
      mesh.position.set(0, 0, 0);
      return mesh;
    }

    case 'fence_gate': {
      // 1:1 Minecraft Fence Gate:
      // Total block width: 16px. Depth: 2px (z in [7/16, 9/16]).
      // 1. Left Post: 2px wide (x=0..2), height 12px (y=4..16) -> 1px lower bottom stub down to y=4
      // 2. Right Post: 2px wide (x=14..16), height 12px (y=4..16) -> 1px lower bottom stub down to y=4
      // 3. Middle Section: spans x=2..14 (12px total), height 11px (y=5..16) -> NO bottom stub, elevated to y=5
      //    - Top rail: x in [2, 14], y in [12, 15] (3px high)
      //    - Bottom rail: x in [2, 14], y in [6, 9] (3px high)
      //    - Center vertical post: 4px span (x in [6, 10]), height 10px (y in [5, 15])
      //    - Leaves two distinct open square windows on either side of the center post (x=2..6 and x=10..14)
      const group = new THREE.Group();
      const d = 2 / 16;
      const postW = 2 / 16;
      const postH = 12 / 16;

      // 1. Left Post: [0, 4, 7] to [2, 16, 9] (2px wide, extends 1px lower as stub)
      const leftPostGeom = new THREE.BoxGeometry(postW, postH, d);
      adjustBoxUVs(leftPostGeom, {
        south: [0, 4 / 16, postW, 1],
        north: [0, 4 / 16, postW, 1],
        east: [7 / 16, 4 / 16, 9 / 16, 1],
        west: [7 / 16, 4 / 16, 9 / 16, 1],
        up: [0, 7 / 16, postW, 9 / 16],
        down: [0, 7 / 16, postW, 9 / 16],
      });
      const leftPost = new THREE.Mesh(leftPostGeom, boxMats);
      leftPost.position.set(-7 / 16, 10 / 16, 0);
      group.add(leftPost);

      // 2. Right Post: [14, 4, 7] to [16, 16, 9] (2px wide, extends 1px lower as stub)
      const rightPostGeom = new THREE.BoxGeometry(postW, postH, d);
      adjustBoxUVs(rightPostGeom, {
        south: [14 / 16, 4 / 16, 1, 1],
        north: [14 / 16, 4 / 16, 1, 1],
        east: [7 / 16, 4 / 16, 9 / 16, 1],
        west: [7 / 16, 4 / 16, 9 / 16, 1],
        up: [14 / 16, 7 / 16, 1, 9 / 16],
        down: [14 / 16, 7 / 16, 1, 9 / 16],
      });
      const rightPost = new THREE.Mesh(rightPostGeom, boxMats);
      rightPost.position.set(7 / 16, 10 / 16, 0);
      group.add(rightPost);

      // 3. Top Rail: [2, 12, 7] to [14, 15, 9] (12px wide, 3px high, connecting the posts)
      const railW = 12 / 16;
      const railH = 3 / 16;

      const topRailGeom = new THREE.BoxGeometry(railW, railH, d);
      adjustBoxUVs(topRailGeom, {
        south: [2 / 16, 12 / 16, 14 / 16, 15 / 16],
        north: [2 / 16, 12 / 16, 14 / 16, 15 / 16],
        up: [2 / 16, 7 / 16, 14 / 16, 9 / 16],
        down: [2 / 16, 7 / 16, 14 / 16, 9 / 16],
        east: [7 / 16, 12 / 16, 9 / 16, 15 / 16],
        west: [7 / 16, 12 / 16, 9 / 16, 15 / 16],
      });
      const topRail = new THREE.Mesh(topRailGeom, boxMats);
      topRail.position.set(0, 13.5 / 16, 0);
      group.add(topRail);

      // 4. Bottom Rail: [2, 6, 7] to [14, 9, 9] (12px wide, 3px high, connecting the posts, bottom edge at y=6)
      const bottomRailGeom = new THREE.BoxGeometry(railW, railH, d);
      adjustBoxUVs(bottomRailGeom, {
        south: [2 / 16, 6 / 16, 14 / 16, 9 / 16],
        north: [2 / 16, 6 / 16, 14 / 16, 9 / 16],
        up: [2 / 16, 7 / 16, 14 / 16, 9 / 16],
        down: [2 / 16, 7 / 16, 14 / 16, 9 / 16],
        east: [7 / 16, 6 / 16, 9 / 16, 9 / 16],
        west: [7 / 16, 6 / 16, 9 / 16, 9 / 16],
      });
      const bottomRail = new THREE.Mesh(bottomRailGeom, boxMats);
      bottomRail.position.set(0, 7.5 / 16, 0);
      group.add(bottomRail);

      // 5. Center Post: 4px span from [6, 6, 7] to [10, 15, 9] (4px wide, 9px high, bottom edge flush with bottom rail at y=6, NO stub)
      const centerW = 4 / 16;
      const centerH = 9 / 16;
      const centerPostGeom = new THREE.BoxGeometry(centerW, centerH, d);
      adjustBoxUVs(centerPostGeom, {
        south: [6 / 16, 6 / 16, 10 / 16, 15 / 16],
        north: [6 / 16, 6 / 16, 10 / 16, 15 / 16],
        east: [7 / 16, 6 / 16, 9 / 16, 15 / 16],
        west: [7 / 16, 6 / 16, 9 / 16, 15 / 16],
        up: [6 / 16, 7 / 16, 10 / 16, 9 / 16],
        down: [6 / 16, 7 / 16, 10 / 16, 9 / 16],
      });
      const centerPost = new THREE.Mesh(centerPostGeom, boxMats);
      centerPost.position.set(0, 10.5 / 16, 0);
      group.add(centerPost);

      return group;
    }

    case 'fence': {
      // Minecraft regular fence item/block preview (matches reference image):
      // Center post: 4x16x4 (x in [6/16, 10/16], z in [6/16, 10/16], y in [0, 1])
      // Side rails (extending to x=0 on the left and x=16 on the right):
      //   - Depth: 2px (z in [7/16, 9/16])
      //   - Top rail: height 3px (y in [12/16, 15/16]), width 16px
      //   - Bottom rail: height 3px (y in [6/16, 9/16]), width 16px
      const group = new THREE.Group();
      const postW = 4 / 16;
      const postGeom = new THREE.BoxGeometry(postW, 1, postW);
      adjustBoxUVs(postGeom, {
        south: [6 / 16, 0, 10 / 16, 1],
        north: [6 / 16, 0, 10 / 16, 1],
        east: [6 / 16, 0, 10 / 16, 1],
        west: [6 / 16, 0, 10 / 16, 1],
        up: [6 / 16, 6 / 16, 10 / 16, 10 / 16],
        down: [6 / 16, 6 / 16, 10 / 16, 10 / 16],
      });
      const postMesh = new THREE.Mesh(postGeom, boxMats);
      postMesh.position.set(0, 0, 0);
      group.add(postMesh);

      const railDepth = 2 / 16;
      const railH = 3 / 16;
      const railW = 16 / 16;

      // 1. Top Rail: spans across full 16px width at y in [12/16, 15/16] (center y = 13.5/16 - 0.5 = 5.5/16)
      const topRailGeom = new THREE.BoxGeometry(railW, railH, railDepth);
      adjustBoxUVs(topRailGeom, {
        south: [0, 12 / 16, 1, 15 / 16],
        north: [0, 12 / 16, 1, 15 / 16],
        up: [0, 7 / 16, 1, 9 / 16],
        down: [0, 7 / 16, 1, 9 / 16],
        east: [7 / 16, 12 / 16, 9 / 16, 15 / 16],
        west: [7 / 16, 12 / 16, 9 / 16, 15 / 16],
      });
      const topRail = new THREE.Mesh(topRailGeom, boxMats);
      topRail.position.set(0, (13.5 / 16) - 0.5, 0);
      group.add(topRail);

      // 2. Bottom Rail: spans across full 16px width at y in [6/16, 9/16] (center y = 7.5/16 - 0.5 = -0.5/16)
      const bottomRailGeom = new THREE.BoxGeometry(railW, railH, railDepth);
      adjustBoxUVs(bottomRailGeom, {
        south: [0, 6 / 16, 1, 9 / 16],
        north: [0, 6 / 16, 1, 9 / 16],
        up: [0, 7 / 16, 1, 9 / 16],
        down: [0, 7 / 16, 1, 9 / 16],
        east: [7 / 16, 6 / 16, 9 / 16, 9 / 16],
        west: [7 / 16, 6 / 16, 9 / 16, 9 / 16],
      });
      const bottomRail = new THREE.Mesh(bottomRailGeom, boxMats);
      bottomRail.position.set(0, (7.5 / 16) - 0.5, 0);
      group.add(bottomRail);

      return group;
    }

    case 'post_frame': {
      // Fence / Wall / Torch: post 4/16 x 1 x 4/16 centered
      const w = 4 / 16;
      const geom = new THREE.BoxGeometry(w, 1, w);
      adjustBoxUVs(geom, {
        east: [0.375, 0, 0.625, 1],
        west: [0.375, 0, 0.625, 1],
        south: [0.375, 0, 0.625, 1],
        north: [0.375, 0, 0.625, 1],
        up: [0.375, 0.375, 0.625, 0.625],
        down: [0.375, 0.375, 0.625, 0.625],
      });
      const mesh = new THREE.Mesh(geom, boxMats);
      mesh.position.set(0, 0, 0);
      return mesh;
    }

    case 'stair_step': {
      // Compound stairs: bottom half (1 x 0.5 x 1) + top half-step (1 x 0.5 x 0.5)
      const group = new THREE.Group();

      // 1. Bottom full base: 16 wide, 8 high, 16 deep
      const baseGeom = new THREE.BoxGeometry(1, 0.5, 1);
      adjustBoxUVs(baseGeom, {
        // Sides crop lower half (y from 0 to 0.5)
        east: [0, 0, 1, 0.5],
        west: [0, 0, 1, 0.5],
        south: [0, 0, 1, 0.5],
        north: [0, 0, 1, 0.5],
        // Top and bottom keep full 1:1
        up: [0, 0, 1, 1],
        down: [0, 0, 1, 1],
      });
      const baseMesh = new THREE.Mesh(baseGeom, boxMats);
      baseMesh.position.set(0, -0.25, 0);

      // 2. Top rear step: 16 wide, 8 high, 8 deep (occupying back half z: [-0.5, 0])
      const stepGeom = new THREE.BoxGeometry(1, 0.5, 0.5);
      adjustBoxUVs(stepGeom, {
        // Step side faces (East & West) sample the upper-back quadrant: x in [0, 0.5], y in [0.5, 1]
        east: [0, 0.5, 0.5, 1],
        west: [0.5, 0.5, 1, 1],
        // Step front riser (South facing toward front) samples the middle/upper strip: full width, y in [0.5, 1]
        south: [0, 0.5, 1, 1],
        // Step back (North) samples the upper half: full width, y in [0.5, 1]
        north: [0, 0.5, 1, 1],
        // Step tread (Top face, Up) samples the back half of the top: full width, z in [0.5, 1]
        up: [0, 0.5, 1, 1],
        down: [0, 0.5, 1, 1],
      });
      const stepMesh = new THREE.Mesh(stepGeom, boxMats);
      stepMesh.position.set(0, 0.25, -0.25);

      group.add(baseMesh);
      group.add(stepMesh);
      return group;
    }

    case 'fire': {
      // Official Minecraft fire: 4 perimeter wrap planes + 4 central slanted diamond planes
      const group = new THREE.Group();
      const fireHeight = 1.4; // 22.4 / 16
      const halfH = fireHeight / 2;
      const baseY = -0.5 + halfH; // bottom of plane rests on block floor (y = -0.5)

      // 1. Four Perimeter Wrap Planes (lining the 4 perimeter edges of the block)
      const perimeterInset = 0.5 - 0.01;

      // North side (facing South/North)
      const pNorth = new THREE.Mesh(new THREE.PlaneGeometry(1, fireHeight), primaryMaterial);
      pNorth.position.set(0, baseY, -perimeterInset);
      group.add(pNorth);

      // South side
      const pSouth = new THREE.Mesh(new THREE.PlaneGeometry(1, fireHeight), primaryMaterial);
      pSouth.position.set(0, baseY, perimeterInset);
      group.add(pSouth);

      // East side (rotated 90 deg)
      const pEast = new THREE.Mesh(new THREE.PlaneGeometry(1, fireHeight), primaryMaterial);
      pEast.position.set(perimeterInset, baseY, 0);
      pEast.rotation.y = Math.PI / 2;
      group.add(pEast);

      // West side (rotated 90 deg)
      const pWest = new THREE.Mesh(new THREE.PlaneGeometry(1, fireHeight), primaryMaterial);
      pWest.position.set(-perimeterInset, baseY, 0);
      pWest.rotation.y = Math.PI / 2;
      group.add(pWest);

      // 2. Four Central Slanted Planes (pitched inward/outward by 22.5 deg)
      const tiltAngle = (22.5 * Math.PI) / 180;
      const centerDist = 0.8 / 16; // 0.05 inset from center (matches 7.2 & 8.8 coords)

      // Pair along X axis tilted around X
      const c1 = new THREE.Mesh(new THREE.PlaneGeometry(1, fireHeight), primaryMaterial);
      c1.position.set(0, baseY, centerDist);
      c1.rotation.x = -tiltAngle;
      group.add(c1);

      const c2 = new THREE.Mesh(new THREE.PlaneGeometry(1, fireHeight), primaryMaterial);
      c2.position.set(0, baseY, -centerDist);
      c2.rotation.x = tiltAngle;
      group.add(c2);

      // Pair along Z axis tilted around Z
      const c3 = new THREE.Mesh(new THREE.PlaneGeometry(1, fireHeight), primaryMaterial);
      c3.position.set(centerDist, baseY, 0);
      c3.rotation.y = Math.PI / 2;
      c3.rotation.z = -tiltAngle;
      group.add(c3);

      const c4 = new THREE.Mesh(new THREE.PlaneGeometry(1, fireHeight), primaryMaterial);
      c4.position.set(-centerDist, baseY, 0);
      c4.rotation.y = Math.PI / 2;
      c4.rotation.z = tiltAngle;
      group.add(c4);

      return group;
    }

    case 'full_cube':
    default: {
      const geom = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(geom, boxMats);
      mesh.position.set(0, 0, 0);
      return mesh;
    }
  }
}
