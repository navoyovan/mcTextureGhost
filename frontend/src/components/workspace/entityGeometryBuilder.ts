// frontend/src/components/workspace/entityGeometryBuilder.ts
import * as THREE from 'three';

export interface BedrockCube {
  origin: [number, number, number];
  size: [number, number, number];
  uv?: [number, number] | Record<string, { uv: [number, number]; uv_size?: [number, number] }>;
  inflate?: number;
  mirror?: boolean;
  neverRender?: boolean;
}

export interface BedrockBone {
  name: string;
  parent?: string;
  pivot?: [number, number, number];
  rotation?: [number, number, number];
  cubes?: BedrockCube[];
  neverRender?: boolean;
}

export interface BedrockGeometryData {
  format_version?: string;
  texturewidth?: number;
  textureheight?: number;
  visible_bounds_width?: number;
  visible_bounds_height?: number;
  visible_bounds_offset?: [number, number, number];
  bones?: BedrockBone[];
}

/**
 * Parses raw Bedrock geometry JSON (format 1.8.0 or 1.12.0+) and extracts the matching geometry definition.
 */
export function parseBedrockGeometryJson(rawJson: string, targetGeometryId?: string | null): BedrockGeometryData | null {
  try {
    const doc = JSON.parse(rawJson);
    if (!doc || typeof doc !== 'object') return null;

    // 1. Format 1.12.0+ (minecraft:geometry array)
    if (Array.isArray(doc['minecraft:geometry'])) {
      const list = doc['minecraft:geometry'] as Array<{ description?: { identifier?: string; texture_width?: number; texture_height?: number }; bones?: BedrockBone[] }>;
      if (targetGeometryId) {
        const found = list.find((g) => g.description?.identifier?.toLowerCase() === targetGeometryId.toLowerCase());
        if (found) {
          return {
            texturewidth: found.description?.texture_width ?? 64,
            textureheight: found.description?.texture_height ?? 64,
            bones: found.bones ?? [],
          };
        }
      }
      if (list.length > 0 && list[0]) {
        return {
          texturewidth: list[0].description?.texture_width ?? 64,
          textureheight: list[0].description?.texture_height ?? 64,
          bones: list[0].bones ?? [],
        };
      }
    }

    // 2. Format 1.8.0 (top-level key like "geometry.zombie.v1.8")
    if (targetGeometryId) {
      const targetLower = targetGeometryId.toLowerCase();
      const keys = Object.keys(doc);
      // Exact or prefix/base match
      const matchedKey =
        keys.find((k) => k.toLowerCase() === targetLower) ||
        keys.find((k) => k.toLowerCase().startsWith(targetLower)) ||
        keys.find((k) => targetLower.startsWith(k.toLowerCase())) ||
        keys.find((k) => {
          const cleanK = k.replace(/^geometry\./i, '').split('.')[0];
          const cleanTarget = targetLower.replace(/^geometry\./i, '').split('.')[0];
          return cleanK === cleanTarget;
        });

      if (matchedKey && doc[matchedKey]?.bones) {
        const g = doc[matchedKey];
        return {
          texturewidth: g.texturewidth ?? 64,
          textureheight: g.textureheight ?? 32,
          bones: g.bones ?? [],
        };
      }
    }

    // Search any key starting with "geometry."
    for (const key of Object.keys(doc)) {
      if (key.startsWith('geometry.') && doc[key]?.bones) {
        const g = doc[key];
        return {
          texturewidth: g.texturewidth ?? 64,
          textureheight: g.textureheight ?? 32,
          bones: g.bones ?? [],
        };
      }
    }

    // Fallback: direct object containing bones
    if (Array.isArray(doc.bones)) {
      return {
        texturewidth: doc.texturewidth ?? 64,
        textureheight: doc.textureheight ?? 32,
        bones: doc.bones,
      };
    }

    return null;
  } catch (err) {
    console.warn('[entityGeometryBuilder] Failed to parse geometry JSON:', err);
    return null;
  }
}

/**
 * Adjusts UV coordinates on a Three.js BoxGeometry to match Bedrock box-mapping standards.
 * Three.js BoxGeometry face order:
 * 0: +X (Right / East)
 * 1: -X (Left / West)
 * 2: +Y (Top / Up)
 * 3: -Y (Bottom / Down)
 * 4: +Z (Front / South)
 * 5: -Z (Back / North)
 */
function applyBedrockBoxUVs(
  geom: THREE.BoxGeometry,
  cube: BedrockCube,
  texWidth: number,
  texHeight: number
) {
  const uvAttr = geom.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uvAttr) return;

  const array = uvAttr.array as Float32Array;
  const [sx, sy, sz] = cube.size;

  if (Array.isArray(cube.uv)) {
    const [u0, v0] = cube.uv;
    const isMirrored = Boolean(cube.mirror);

    type FaceCrop = { uMin: number; uMax: number; vMin: number; vMax: number };

    let rightCrop: FaceCrop = { uMin: u0, uMax: u0 + sz, vMin: v0 + sz, vMax: v0 + sz + sy };
    let leftCrop: FaceCrop = { uMin: u0 + sz + sx, uMax: u0 + 2 * sz + sx, vMin: v0 + sz, vMax: v0 + sz + sy };

    if (isMirrored) {
      const temp = rightCrop;
      rightCrop = leftCrop;
      leftCrop = temp;
    }

    const faceCrops: FaceCrop[] = [
      rightCrop, // 0: +X (Right)
      leftCrop,  // 1: -X (Left)
      { uMin: u0 + sz, uMax: u0 + sz + sx, vMin: v0, vMax: v0 + sz }, // 2: +Y (Top)
      { uMin: u0 + sz + sx, uMax: u0 + sz + 2 * sx, vMin: v0, vMax: v0 + sz }, // 3: -Y (Bottom)
      { uMin: u0 + sz, uMax: u0 + sz + sx, vMin: v0 + sz, vMax: v0 + sz + sy }, // 4: +Z (Front)
      { uMin: u0 + 2 * sz + sx, uMax: u0 + 2 * sz + 2 * sx, vMin: v0 + sz, vMax: v0 + sz + sy }, // 5: -Z (Back)
    ];

    faceCrops.forEach((crop, faceIndex) => {
      const offset = faceIndex * 8;
      const u1 = crop.uMin / texWidth;
      const u2 = crop.uMax / texWidth;
      const v1 = 1.0 - crop.vMax / texHeight;
      const v2 = 1.0 - crop.vMin / texHeight;

      if (isMirrored && (faceIndex === 4 || faceIndex === 5 || faceIndex === 2 || faceIndex === 3)) {
        array[offset + 0] = u2; array[offset + 1] = v2;
        array[offset + 2] = u1; array[offset + 3] = v2;
        array[offset + 4] = u2; array[offset + 5] = v1;
        array[offset + 6] = u1; array[offset + 7] = v1;
      } else {
        array[offset + 0] = u1; array[offset + 1] = v2;
        array[offset + 2] = u2; array[offset + 3] = v2;
        array[offset + 4] = u1; array[offset + 5] = v1;
        array[offset + 6] = u2; array[offset + 7] = v1;
      }
    });

    uvAttr.needsUpdate = true;
  }
}

/**
 * Builds a Three.js Group hierarchy from BedrockGeometryData.
 */
export function buildEntityModel(
  geoData: BedrockGeometryData,
  material: THREE.Material
): THREE.Group {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'BedrockEntityRoot';

  const texWidth = geoData.texturewidth || 64;
  const texHeight = geoData.textureheight || 32;
  const bones = geoData.bones || [];

  const boneGroups = new Map<string, THREE.Group>();

  // Pass 1: Create groups for each bone
  for (const bone of bones) {
    if (bone.neverRender) continue;

    const group = new THREE.Group();
    group.name = bone.name;

    const pivot = bone.pivot || [0, 0, 0];
    group.position.set(pivot[0], pivot[1], pivot[2]);

    if (bone.rotation) {
      group.rotation.set(
        THREE.MathUtils.degToRad(bone.rotation[0] || 0),
        THREE.MathUtils.degToRad(bone.rotation[1] || 0),
        THREE.MathUtils.degToRad(bone.rotation[2] || 0)
      );
    }

    if (bone.cubes) {
      for (const cube of bone.cubes) {
        if (cube.neverRender) continue;

        const [sx, sy, sz] = cube.size;
        if (sx === 0 && sy === 0 && sz === 0) continue;

        const inflate = cube.inflate || 0;
        const geom = new THREE.BoxGeometry(
          Math.max(0.01, sx + inflate * 2),
          Math.max(0.01, sy + inflate * 2),
          Math.max(0.01, sz + inflate * 2)
        );

        applyBedrockBoxUVs(geom, cube, texWidth, texHeight);

        const mesh = new THREE.Mesh(geom, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const [ox, oy, oz] = cube.origin;
        mesh.position.set(
          ox + sx / 2 - pivot[0],
          oy + sy / 2 - pivot[1],
          oz + sz / 2 - pivot[2]
        );

        group.add(mesh);
      }
    }

    boneGroups.set(bone.name, group);
  }

  // Pass 2: Connect parent-child hierarchies
  for (const bone of bones) {
    if (bone.neverRender) continue;
    const group = boneGroups.get(bone.name);
    if (!group) continue;

    if (bone.parent && boneGroups.has(bone.parent)) {
      const parentGroup = boneGroups.get(bone.parent)!;
      const parentBone = bones.find((b) => b.name === bone.parent);
      const parentPivot = parentBone?.pivot || [0, 0, 0];
      const pivot = bone.pivot || [0, 0, 0];

      group.position.set(
        pivot[0] - parentPivot[0],
        pivot[1] - parentPivot[1],
        pivot[2] - parentPivot[2]
      );

      parentGroup.add(group);
    } else {
      rootGroup.add(group);
    }
  }

  // Auto-center the entire root model around the origin [0, 0, 0]
  const box = new THREE.Box3().setFromObject(rootGroup);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    rootGroup.position.set(-center.x, -center.y, -center.z);
  }

  return rootGroup;
}