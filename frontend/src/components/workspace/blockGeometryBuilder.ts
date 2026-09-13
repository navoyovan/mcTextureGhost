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

      // Lower box: [0, 0, -0.5 + d/2] relative to base, height 1. Center Y = -0.5 + 0.5 = 0
      const lowerGeom = new THREE.BoxGeometry(1, 1, d);
      adjustBoxUVs(lowerGeom, {
        east: [0, 0, d, 1],
        west: [0, 0, d, 1],
        down: [0, 0, 1, d],
        up: [0, 0, 1, d],
      });
      const lowerMats: THREE.Material[] = [
        mats.down, // +X East
        mats.down, // -X West
        mats.down, // +Y Up (seam)
        mats.down, // -Y Down (bottom edge)
        mats.down, // +Z South (front)
        mats.down, // -Z North (back)
      ];
      const lowerMesh = new THREE.Mesh(lowerGeom, lowerMats);
      lowerMesh.position.set(0, 0, -0.5 + d / 2);

      // Upper box: height 1, stacked directly above lower box. Center Y = 1
      const upperGeom = new THREE.BoxGeometry(1, 1, d);
      adjustBoxUVs(upperGeom, {
        east: [0, 0, d, 1],
        west: [0, 0, d, 1],
        up: [0, 1 - d, 1, 1],
        down: [0, 0, 1, d],
      });
      // Upper materials use north/south/up (side texture)
      const upperMat = mats.north || mats.up || mats.south;
      const upperMats: THREE.Material[] = [
        upperMat, // +X East
        upperMat, // -X West
        mats.up || upperMat, // +Y Up (top edge)
        upperMat, // -Y Down (seam)
        upperMat, // +Z South (front)
        upperMat, // -Z North (back)
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
