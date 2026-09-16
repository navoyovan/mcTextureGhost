// frontend/src/components/workspace/entityGeometryBuilder.ts
import * as THREE from 'three';

export interface BedrockCube {
  origin: [number, number, number];
  size: [number, number, number];
  pivot?: [number, number, number];
  rotation?: [number, number, number];
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
  /** Applied as the resting world-space rotation of the bone (separate from pose rotation). */
  bind_pose_rotation?: [number, number, number];
  /** Bone-level mirror flag — mirrors all cubes in this bone along X. */
  mirror?: boolean;
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
        const targetLower = targetGeometryId.toLowerCase();
        const found =
          list.find((g) => g.description?.identifier?.toLowerCase() === targetLower) ||
          list.find((g) => {
            const id = (g.description?.identifier || '').toLowerCase();
            return id.endsWith(targetLower) || targetLower.endsWith(id);
          });
        if (found) {
          return {
            texturewidth: found.description?.texture_width ?? 64,
            textureheight: found.description?.texture_height ?? 64,
            bones: found.bones ?? [],
          };
        }
      }

      // Do NOT fall back to list[0] if targetGeometryId specifically requested a baby model and list[0] is not a baby
      const wantsBaby = targetGeometryId && targetGeometryId.toLowerCase().includes('baby');
      const firstIsBaby = list[0]?.description?.identifier?.toLowerCase().includes('baby');
      if (!wantsBaby || firstIsBaby) {
        if (list.length > 0 && list[0]) {
          return {
            texturewidth: list[0].description?.texture_width ?? 64,
            textureheight: list[0].description?.texture_height ?? 64,
            bones: list[0].bones ?? [],
          };
        }
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
 *
 * Bedrock box-UV cross layout (u0, v0):
 *
 *         u0       u0+sz      u0+sz+sx     u0+2sz+sx   u0+2sz+2sx
 *         ┌─────────┬──────────┬────────────┬───────────┐
 * v0      │         │ Top (+Y) │Bottom (-Y) │           │  ← sz tall
 *         ├─────────┼──────────┼────────────┼───────────┤
 * v0+sz   │Right(-X)│Front(-Z) │ Left (+X)  │ Back (+Z) │  ← sy tall
 *         └─────────┴──────────┴────────────┴───────────┘
 *
 * Three.js BoxGeometry face index & local vertex ordering:
 * Face 0 (+X / Left):  v0: [+X, +Y, +Z], v1: [+X, +Y, -Z], v2: [+X, -Y, +Z], v3: [+X, -Y, -Z]
 * Face 1 (-X / Right): v0: [-X, +Y, -Z], v1: [-X, +Y, +Z], v2: [-X, -Y, -Z], v3: [-X, -Y, +Z]
 * Face 2 (+Y / Top):   v0: [-X, +Y, -Z], v1: [+X, +Y, -Z], v2: [-X, +Y, +Z], v3: [+X, +Y, +Z]
 * Face 3 (-Y / Down):  v0: [-X, -Y, +Z], v1: [+X, -Y, +Z], v2: [-X, -Y, -Z], v3: [+X, -Y, -Z]
 * Face 4 (+Z / Back):  v0: [-X, +Y, +Z], v1: [+X, +Y, +Z], v2: [-X, -Y, +Z], v3: [+X, -Y, +Z]
 * Face 5 (-Z / Front): v0: [+X, +Y, -Z], v1: [-X, +Y, -Z], v2: [+X, -Y, -Z], v3: [-X, -Y, -Z]
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

    // Texture boundaries (normalized 0..1)
    const u_r_min = (u0) / texWidth;
    const u_r_max = (u0 + sz) / texWidth;

    const u_f_min = (u0 + sz) / texWidth;
    const u_f_max = (u0 + sz + sx) / texWidth;

    const u_l_min = (u0 + sz + sx) / texWidth;
    const u_l_max = (u0 + 2 * sz + sx) / texWidth;

    const u_b_min = (u0 + 2 * sz + sx) / texWidth;
    const u_b_max = (u0 + 2 * sz + 2 * sx) / texWidth;

    const u_t_min = (u0 + sz) / texWidth;
    const u_t_max = (u0 + sz + sx) / texWidth;

    const u_d_min = (u0 + sz + sx) / texWidth;
    const u_d_max = (u0 + sz + 2 * sx) / texWidth;

    // V coordinates (Three.js V=1 is image top, V=0 is image bottom)
    const v_top_high = 1.0 - (v0) / texHeight;
    const v_top_low  = 1.0 - (v0 + sz) / texHeight;

    const v_side_high = 1.0 - (v0 + sz) / texHeight;
    const v_side_low  = 1.0 - (v0 + sz + sy) / texHeight;

    // Helper to write UV coordinates for 4 vertices of a face
    const setFaceUVs = (
      faceIndex: number,
      uv0: [number, number],
      uv1: [number, number],
      uv2: [number, number],
      uv3: [number, number]
    ) => {
      const o = faceIndex * 8;
      array[o + 0] = uv0[0]; array[o + 1] = uv0[1];
      array[o + 2] = uv1[0]; array[o + 3] = uv1[1];
      array[o + 4] = uv2[0]; array[o + 5] = uv2[1];
      array[o + 6] = uv3[0]; array[o + 7] = uv3[1];
    };

    if (!isMirrored) {
      // Face 0: +X (Character's Left face)
      // v0: [+X, +Y, +Z] (BACK), v1: [+X, +Y, -Z] (FRONT), v2: [+X, -Y, +Z] (BACK), v3: [+X, -Y, -Z] (FRONT)
      setFaceUVs(0,
        [u_l_max, v_side_high],
        [u_l_min, v_side_high],
        [u_l_max, v_side_low],
        [u_l_min, v_side_low]
      );

      // Face 1: -X (Character's Right face)
      // v0: [-X, +Y, -Z] (FRONT), v1: [-X, +Y, +Z] (BACK), v2: [-X, -Y, -Z] (FRONT), v3: [-X, -Y, +Z] (BACK)
      setFaceUVs(1,
        [u_r_max, v_side_high],
        [u_r_min, v_side_high],
        [u_r_max, v_side_low],
        [u_r_min, v_side_low]
      );

      // Face 2: +Y (Top face)
      // v0: [-X, +Y, -Z] (RIGHT, FRONT), v1: [+X, +Y, -Z] (LEFT, FRONT)
      // v2: [-X, +Y, +Z] (RIGHT, BACK),  v3: [+X, +Y, +Z] (LEFT, BACK)
      setFaceUVs(2,
        [u_t_min, v_top_low],
        [u_t_max, v_top_low],
        [u_t_min, v_top_high],
        [u_t_max, v_top_high]
      );

      // Face 3: -Y (Bottom face)
      // v0: [-X, -Y, +Z] (RIGHT, BACK),  v1: [+X, -Y, +Z] (LEFT, BACK)
      // v2: [-X, -Y, -Z] (RIGHT, FRONT), v3: [+X, -Y, -Z] (LEFT, FRONT)
      setFaceUVs(3,
        [u_d_min, v_top_high],
        [u_d_max, v_top_high],
        [u_d_min, v_top_low],
        [u_d_max, v_top_low]
      );

      // Face 4: +Z (Back face)
      // v0: [-X, +Y, +Z] (RIGHT, UP),   v1: [+X, +Y, +Z] (LEFT, UP)
      // v2: [-X, -Y, +Z] (RIGHT, DOWN), v3: [+X, -Y, +Z] (LEFT, DOWN)
      setFaceUVs(4,
        [u_b_max, v_side_high],
        [u_b_min, v_side_high],
        [u_b_max, v_side_low],
        [u_b_min, v_side_low]
      );

      // Face 5: -Z (Front face / Face of character)
      // v0: [+X, +Y, -Z] (LEFT, UP),   v1: [-X, +Y, -Z] (RIGHT, UP)
      // v2: [+X, -Y, -Z] (LEFT, DOWN), v3: [-X, -Y, -Z] (RIGHT, DOWN)
      setFaceUVs(5,
        [u_f_max, v_side_high],
        [u_f_min, v_side_high],
        [u_f_max, v_side_low],
        [u_f_min, v_side_low]
      );
    } else {
      // Mirrored limbs: swap Left & Right side crops and flip U horizontally
      // Face 0: +X uses Right crop
      setFaceUVs(0,
        [u_r_min, v_side_high],
        [u_r_max, v_side_high],
        [u_r_min, v_side_low],
        [u_r_max, v_side_low]
      );

      // Face 1: -X uses Left crop
      setFaceUVs(1,
        [u_l_min, v_side_high],
        [u_l_max, v_side_high],
        [u_l_min, v_side_low],
        [u_l_max, v_side_low]
      );

      // Face 2: +Y (Top) flipped horizontally along X
      setFaceUVs(2,
        [u_t_max, v_top_low],
        [u_t_min, v_top_low],
        [u_t_max, v_top_high],
        [u_t_min, v_top_high]
      );

      // Face 3: -Y (Bottom) flipped horizontally along X
      setFaceUVs(3,
        [u_d_max, v_top_high],
        [u_d_min, v_top_high],
        [u_d_max, v_top_low],
        [u_d_min, v_top_low]
      );

      // Face 4: +Z (Back) flipped horizontally along X
      setFaceUVs(4,
        [u_b_min, v_side_high],
        [u_b_max, v_side_high],
        [u_b_min, v_side_low],
        [u_b_max, v_side_low]
      );

      // Face 5: -Z (Front) flipped horizontally along X
      setFaceUVs(5,
        [u_f_min, v_side_high],
        [u_f_max, v_side_high],
        [u_f_min, v_side_low],
        [u_f_max, v_side_low]
      );
    }

    uvAttr.needsUpdate = true;
  } else if (cube.uv && typeof cube.uv === 'object') {
    // Per-face UV mapping (e.g. ghast, guardian, custom models)
    const perFace = cube.uv as Record<string, { uv: [number, number]; uv_size?: [number, number] }>;

    const setFaceUVs = (
      faceIndex: number,
      uv0: [number, number],
      uv1: [number, number],
      uv2: [number, number],
      uv3: [number, number]
    ) => {
      const o = faceIndex * 8;
      array[o + 0] = uv0[0]; array[o + 1] = uv0[1];
      array[o + 2] = uv1[0]; array[o + 3] = uv1[1];
      array[o + 4] = uv2[0]; array[o + 5] = uv2[1];
      array[o + 6] = uv3[0]; array[o + 7] = uv3[1];
    };

    const computeFace = (faceKey: string, defaultSu: number, defaultSv: number) => {
      const data = perFace[faceKey];
      if (!data || !data.uv) return null;
      const [u, v] = data.uv;
      const su = data.uv_size ? data.uv_size[0] : defaultSu;
      const sv = data.uv_size ? data.uv_size[1] : defaultSv;

      const u_min = u / texWidth;
      const u_max = (u + su) / texWidth;
      const v_min = 1.0 - v / texHeight;
      const v_max = 1.0 - (v + sv) / texHeight;

      return { u_min, u_max, v_min, v_max };
    };

    // Face 0: +X (Character's Left / west in Bedrock)
    const west = computeFace('west', sz, sy);
    if (west) {
      setFaceUVs(0,
        [west.u_max, west.v_min],
        [west.u_min, west.v_min],
        [west.u_max, west.v_max],
        [west.u_min, west.v_max]
      );
    }

    // Face 1: -X (Character's Right / east in Bedrock)
    const east = computeFace('east', sz, sy);
    if (east) {
      setFaceUVs(1,
        [east.u_max, east.v_min],
        [east.u_min, east.v_min],
        [east.u_max, east.v_max],
        [east.u_min, east.v_max]
      );
    }

    // Face 2: +Y (Top / up in Bedrock)
    const up = computeFace('up', sx, sz);
    if (up) {
      setFaceUVs(2,
        [up.u_min, up.v_max],
        [up.u_max, up.v_max],
        [up.u_min, up.v_min],
        [up.u_max, up.v_min]
      );
    }

    // Face 3: -Y (Bottom / down in Bedrock)
    const down = computeFace('down', sx, sz);
    if (down) {
      setFaceUVs(3,
        [down.u_min, down.v_min],
        [down.u_max, down.v_min],
        [down.u_min, down.v_max],
        [down.u_max, down.v_max]
      );
    }

    // Face 4: +Z (Back / south in Bedrock)
    const south = computeFace('south', sx, sy);
    if (south) {
      setFaceUVs(4,
        [south.u_max, south.v_min],
        [south.u_min, south.v_min],
        [south.u_max, south.v_max],
        [south.u_min, south.v_max]
      );
    }

    // Face 5: -Z (Front / north in Bedrock)
    const north = computeFace('north', sx, sy);
    if (north) {
      setFaceUVs(5,
        [north.u_max, north.v_min],
        [north.u_min, north.v_min],
        [north.u_max, north.v_max],
        [north.u_min, north.v_max]
      );
    }

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

    // Bone cubes container (handles bone-level bind_pose_rotation and runtime rotation without tilting child bones)
    const boneCubesGroup = new THREE.Group();
    boneCubesGroup.name = `${bone.name}_cubes`;

    const effectiveBindPose = bone.bind_pose_rotation;

    if (effectiveBindPose) {
      boneCubesGroup.rotation.set(
        -THREE.MathUtils.degToRad(effectiveBindPose[0] || 0),
        -THREE.MathUtils.degToRad(effectiveBindPose[1] || 0),
        THREE.MathUtils.degToRad(effectiveBindPose[2] || 0),
        'ZYX'
      );
    }
    if (bone.rotation) {
      boneCubesGroup.rotation.x -= THREE.MathUtils.degToRad(bone.rotation[0] || 0);
      boneCubesGroup.rotation.y -= THREE.MathUtils.degToRad(bone.rotation[1] || 0);
      boneCubesGroup.rotation.z += THREE.MathUtils.degToRad(bone.rotation[2] || 0);
    }

    group.add(boneCubesGroup);

    if (bone.cubes) {
      for (const cube of bone.cubes) {
        if (cube.neverRender) continue;

        const [sx, sy, sz] = cube.size;
        if (sx === 0 && sy === 0 && sz === 0) continue;

        // Bone-level mirror propagates to the cube (OR with cube-level mirror)
        const effectiveCube: BedrockCube = bone.mirror
          ? { ...cube, mirror: true }
          : cube;

        const inflate = cube.inflate || 0;
        const geom = new THREE.BoxGeometry(
          Math.max(0.01, sx + inflate * 2),
          Math.max(0.01, sy + inflate * 2),
          Math.max(0.01, sz + inflate * 2)
        );

        applyBedrockBoxUVs(geom, effectiveCube, texWidth, texHeight);

        const mesh = new THREE.Mesh(geom, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const [ox, oy, oz] = cube.origin;

        if (cube.rotation && (cube.rotation[0] || cube.rotation[1] || cube.rotation[2])) {
          const cubePivot = cube.pivot || pivot;
          const cubeGroup = new THREE.Group();
          cubeGroup.position.set(
            cubePivot[0] - pivot[0],
            cubePivot[1] - pivot[1],
            cubePivot[2] - pivot[2]
          );
          cubeGroup.rotation.set(
            -THREE.MathUtils.degToRad(cube.rotation[0] || 0),
            -THREE.MathUtils.degToRad(cube.rotation[1] || 0),
            THREE.MathUtils.degToRad(cube.rotation[2] || 0),
            'ZYX'
          );

          mesh.position.set(
            ox + sx / 2 - cubePivot[0],
            oy + sy / 2 - cubePivot[1],
            oz + sz / 2 - cubePivot[2]
          );

          cubeGroup.add(mesh);
          boneCubesGroup.add(cubeGroup);
        } else {
          mesh.position.set(
            ox + sx / 2 - pivot[0],
            oy + sy / 2 - pivot[1],
            oz + sz / 2 - pivot[2]
          );
          boneCubesGroup.add(mesh);
        }
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

  // Bedrock entities are authored facing -Z (North). The Three.js camera sits at +Z looking
  // toward the origin, so without a correction the camera always sees the entity's back.
  // Rotate 180° around Y so the entity's face points toward the camera by default.
  rootGroup.rotation.y = Math.PI;

  // Auto-center the entire root model around the origin [0, 0, 0]
  // (compute bounding box AFTER the Y rotation so the centering is correct)
  rootGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rootGroup);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    rootGroup.position.set(-center.x, -center.y, -center.z);
  }

  return rootGroup;
}