# Entity Workspace & 3D Geometry Invariants

## Overview
The Entity Workspace provides a relational index and 3D visualizer for Minecraft Bedrock client entities (`entity/*.json`) and attachables (`attachables/*.json`), mapping them to their Bedrock `.geo.json` bone/cube definitions and texture slots.

---

## 1. Bedrock Geometry Parsing Rules

### Schema Formats
Bedrock geometry JSON models exist primarily in two formats:
1. **Legacy / Standard Format (`1.8.0`)**:
   - The top-level JSON contains keys matching the geometry identifier (e.g. `"geometry.zombie.v1.8": { ... }`, `"geometry.creeper": { ... }`).
   - Global texture dimensions: `texturewidth`, `textureheight`.
   - Bones list: `bones: [ { name, pivot, cubes, parent } ]`.
2. **Modern Array Format (`1.12.0+`)**:
   - Top-level key `"minecraft:geometry"` is an array of geometry objects.
   - Each object has `description: { identifier, texture_width, texture_height }` and `bones: [ ... ]`.

### Parser Invariant
All geometry parsing routines (e.g. `entityGeometryBuilder.ts`) must support both `1.8.0` and `1.12.0+` structures, falling back gracefully to the first available geometry block if an exact identifier match is omitted.

---

## 2. Three.js Bone Hierarchy & Box UVs

### Coordinate Mapping & Facing
- Bedrock coordinates use standard Y-up with origin `[0, 0, 0]` at base.
- **Model Orientation:** Bedrock entities face **`-Z` (North)** by default (`-X` is Right, `+X` is Left). In Three.js, the camera sits in `+Z` looking at the origin, so the root group is rotated 180° around Y (`rootGroup.rotation.y = Math.PI`) to face the camera.
- **Resting Poses:** Bones may declare `bind_pose_rotation` (e.g. `[90, 0, 0]` on quadruped bodies). This must be applied as the initial resting orientation before applying dynamic/runtime `rotation`.
- **Mirroring:** Bone-level `"mirror": true` (e.g. on `leg1`, `leftArm`) must propagate to all child cubes.
- Cube definitions: `origin: [ox, oy, oz]`, `size: [sx, sy, sz]`, `pivot: [px, py, pz]`.
- Child bones specify position relative to their parent bone pivot:
  ```ts
  group.position.set(pivot[0] - parentPivot[0], pivot[1] - parentPivot[1], pivot[2] - parentPivot[2]);
  ```

### Box UV Unwrapping Standard
Bedrock standard box-UV 6-face net (at `[u0, v0]`):
- **Top (+Y):** `[u0 + sz, v0]` to `[u0 + sz + sx, v0 + sz]`
- **Bottom (-Y):** `[u0 + sz + sx, v0]` to `[u0 + sz + 2*sx, v0 + sz]`
- **Right (-X):** `[u0, v0 + sz]` to `[u0 + sz, v0 + sz + sy]`
- **Front (-Z):** `[u0 + sz, v0 + sz]` to `[u0 + sz + sx, v0 + sz + sy]`
- **Left (+X):** `[u0 + sz + sx, v0 + sz]` to `[u0 + 2*sz + sx, v0 + sz + sy]`
- **Back (+Z):** `[u0 + 2*sz + sx, v0 + sz]` to `[u0 + 2*sz + 2*sx, v0 + sz + sy]`

*Important Three.js Invariant:* Three.js `BoxGeometry` vertex ordering along Z is opposite between Face 0 (+X / Left) and Face 1 (-X / Right). UV coordinates must be assigned per-vertex (`setFaceUVs`) rather than assuming uniform rectangular winding across all faces.

---

## 3. WebGL Resource Lifecycle & Disposal
- Whenever an entity model or texture is switched or unmounted:
  1. Recursively traverse the Three.js scene tree (`modelGroup.traverse(...)`).
  2. Call `dispose()` on all `BufferGeometry` instances.
  3. Call `dispose()` on all `Material` and `Texture` instances.
  4. Dispose of the `WebGLRenderer` on unmount to prevent GPU context leaks.
