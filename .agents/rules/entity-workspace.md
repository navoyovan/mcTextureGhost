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
All geometry parsing routines (e.g. `entityGeometryBuilder.ts`) must support both `1.8.0` and `1.12.0+` structures:
- If an exact identifier match is omitted, default to the first available geometry block.
- **Baby Variant Invariant:** When a baby geometry is requested (identifier contains `"baby"`), the parser must NOT fall back to adult `list[0]`. It must return `null` so secondary baby candidates (`baby_${baseGeo}.geo.json`, `baby_${cleanEntity}.geo.json`) can be evaluated without silently substituting the adult model.

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

### Per-Face UV Mapping (`cube.uv` Dictionary)
In addition to standard `[u0, v0]` offsets, Bedrock models (e.g. Ghast, Guardian, custom models) support dictionary mappings:
```json
"uv": {
  "north": { "uv": [u, v], "uv_size": [su, sv] },
  "south": { "uv": [u, v], "uv_size": [su, sv] },
  "east":  { "uv": [u, v], "uv_size": [su, sv] },
  "west":  { "uv": [u, v], "uv_size": [su, sv] },
  "up":    { "uv": [u, v], "uv_size": [su, sv] },
  "down":  { "uv": [u, v], "uv_size": [su, sv] }
}
```
If `uv_size` is omitted, defaults to standard face box dimensions (`sx`, `sy`, `sz`).

### Cube-Level Transforms & Declarative Rotation Invariant
- **Bone Cubes Isolation:** Bone cubes must be housed in a distinct `boneCubesGroup` under the bone group so that `bind_pose_rotation` and runtime `rotation` do not cascade unwanted rotations into child bones.
- **Cube-Level Rotations:** Bedrock 1.12.0+ models support cube-level `pivot` and `rotation`. When present, cubes must be grouped at `cubePivot - bonePivot`, rotated by `[-degToRad(rx), -degToRad(ry), degToRad(rz), 'ZYX']`, and placed at `cubeOrigin + size/2 - cubePivot`.
- **Zero-Heuristic Rule:** NEVER introduce speculative rotation heuristics (such as guessing quadruped bodies by leg counts or dimensions). Declarative Bedrock models already specify all rotations via `bind_pose_rotation`, `bone.rotation`, or `cube.rotation`.

---

## 3. Vanilla Data & Client Entity Precedence
- **Modern Overrides Legacy:** In `VanillaDataService.cs`, Mojang's repository includes ancient fallback files (`*.v1.0.entity.json`, `*_v1.0.geo.json`). File scanning loops MUST prioritize modern definitions (`cow.entity.json`, `cow.v2.geo.json`) over `v1.0` fallbacks so obsolete legacy models without bind pose tags do not overwrite canonical models.

---

## 4. WebGL Resource Lifecycle & Disposal
- Whenever an entity model or texture is switched or unmounted:
  1. Recursively traverse the Three.js scene tree (`modelGroup.traverse(...)`).
  2. Call `dispose()` on all `BufferGeometry` instances.
  3. Call `dispose()` on all `Material` and `Texture` instances.
  4. Dispose of the `WebGLRenderer` on unmount to prevent GPU context leaks.

---

## 5. Entity Workspace DOM Lifecycle & Key Isolation
- **Detail Pane Keying:** `<section className={styles.detailPane}>` must be keyed by `selectedEntity.blockId`. This forces React to unmount the previous entity's detail DOM when switching entities, guaranteeing that vertical scroll resets (`scrollTop = 0`) and previous cards cannot linger or accumulate above the selected entity.
- **Slot Group & Card Keys:**
  - Alias group cards must key on `${selectedEntity.blockId}-${ag.alias}-${agIndex}` to prevent React reconciliation key collisions when an entity contains multiple distinct geometry slot groups with the same base name.
  - `WorkspaceTileCard` instances must key on `${selectedEntity.blockId}-${ag.alias}-${grp.key}-${grpIndex}` so `React.memo` instances are strictly scoped per entity.

---

## 6. 3D Viewport & Odometer Switcher Standards
- **Unified Viewport Framing:**
  - Both Block and Entity 3D Viewports share identical dimensions (`height: 340px`), radial background gradient (`radial-gradient(circle at center, #1e2029 0%, #101116 100%)`), `8px` corner radius, and standard `24×24px` translucent control buttons with `backdrop-filter: blur(8px)`.
- **Typography Standard:**
  - All odometer buttons, number badges, active composite badges, and expand labels strictly use `--font-brand` (`Syne 700`).
- **Kinetic Odometer Switcher Invariants:**
  - **Vertical Stack:** Cycles through primary variants (Blockstates for blocks, Geometry Slots for entities). Hovering smoothly expands to the right (`max-width: 0 -> 320px`) to reveal the identifier (e.g. `1 | Blockstate 1`, `1 | geometry.cow.cold`).
  - **State-Locked Grace Period:** Buttons use a dedicated sub-component with an `800ms` `setTimeout` on `mouseleave` so rapid cursor passes guarantee full expansion without clipping.
  - **Active Corner Indicator:** The active corner button remains compact (`1a`, `1`) and static on hover.
  - **Tooltip Hygiene:** Never place native HTML `title` attributes on expanding odometer buttons or track containers; use `aria-label` for screen reader accessibility to avoid browser tooltip overlap.
