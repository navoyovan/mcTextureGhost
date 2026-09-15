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

### Coordinate Mapping
- Bedrock coordinates use standard Y-up with origin `[0, 0, 0]` at base.
- Cube definitions: `origin: [ox, oy, oz]`, `size: [sx, sy, sz]`, `pivot: [px, py, pz]`.
- Child bones specify position relative to their parent bone pivot:
  ```ts
  group.position.set(pivot[0] - parentPivot[0], pivot[1] - parentPivot[1], pivot[2] - parentPivot[2]);
  ```

### Box UV Unwrapping Standard
Bedrock box mapping standard uses a 6-face net:
- Right face (+X): `[u0, v0 + sz]` to `[u0 + sz, v0 + sz + sy]`
- Left face (-X): `[u0 + sz + sx, v0 + sz]` to `[u0 + 2*sz + sx, v0 + sz + sy]`
- Top face (+Y): `[u0 + sz, v0]` to `[u0 + sz + sx, v0 + sz]`
- Bottom face (-Y): `[u0 + sz + sx, v0]` to `[u0 + sz + 2*sx, v0 + sz]`
- Front face (+Z): `[u0 + sz, v0 + sz]` to `[u0 + sz + sx, v0 + sz + sy]`
- Back face (-Z): `[u0 + 2*sz + sx, v0 + sz]` to `[u0 + 2*sz + 2*sx, v0 + sz + sy]`
*Note:* V coordinates are inverted (`1.0 - v / textureHeight`) for Three.js UV space.

---

## 3. WebGL Resource Lifecycle & Disposal
- Whenever an entity model or texture is switched or unmounted:
  1. Recursively traverse the Three.js scene tree (`modelGroup.traverse(...)`).
  2. Call `dispose()` on all `BufferGeometry` instances.
  3. Call `dispose()` on all `Material` and `Texture` instances.
  4. Dispose of the `WebGLRenderer` on unmount to prevent GPU context leaks.
