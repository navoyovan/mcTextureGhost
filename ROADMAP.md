
## Roadmap

### Backlog

- [ ] curating each 3D preview for **blocks** and **entities** to accurately reflect their original in-game shapes
- [ ] curating each texture **flipbook** rendering to accurately reflect their original render
- [ ] **UI** texture support 
- [ ] **particle texture** support
- [ ] target `resource-pack` engine (version selector)
- [ ] add custom catalog (with other resource pack)
- [ ] add ability to support add-ons and distinguish their entries from vanilla
- [ ] render controllers? 👀
- [ ] adding shortcuts (and shortcuts badge show. maybe hold alt to show the shortcut combinations)
- [ ] ~~catalog button got blurred on catalog open (not too important)~~
- [ ] this bs already scaled up maybe refactoring so stuff doesnt get in the way and break other stuff (x.x.1 on minor update)

### v1.2.0 (Staging)
- [ ] auto scaffold and detach face entries (like shared textures **ex:** `acacia_fence` using `acacia_planks` into `acacia_fence`) maybe default to its own alias but they might clash bcs acacia_planks alias is acacia_planks, get it?

### v1.1.0 (In Progress)
**Improvements**
- [x] Optimistic UI updates across all texture interactables — instant feedback for additions, deletions, and variations without waiting for disk I/O
- [x] Skeleton loading states and granular store flags for smoother, non-blocking background rescans
- [x] Background catalog synchronization — offloaded vanilla catalog parsing and status checks from UI thread to background workers
- [x] Scoped category rescans — block/entity/item additions and variations only rebuild affected workspace trees, omitting unchanged trees from IPC payloads
- [x] Automatic variation scaffolding with alias stems (`_var{N}`) and shape-lifting across Bedrock JSON formats
- [x] Configurable batch count presets when scaffolding texture variations
- [x] In-place workspace state preservation — modifying or deleting entries no longer resets view selection or scroll position
- [x] JSON hierarchy multi-tier rework with declared alias face mapping and texture status validation
- [x] Smooth accordion collapse animations for JSON Hierarchy, 3D Preview, and Catalog Index trees
- [x] Animated entrance transitions for the Welcome layout
- [x] Toggleable 3D viewport preview option for reduced hardware usage during long editing sessions
- [ ] Variation weight editor and custom label editing

**Bug Fixes**
- [x] Shared vanilla fallback aliases: fixed multiple blocks sharing the same texture defaulting only to the first block; now surfaces fallback entries across all sharing blocks
- [x] Fixed phantom "Added" badge on `terrain_texture.json` entries persisting after deletion
- [x] Corrected optimistic alias deletion logic to preserve blocks.json bindings when deleting individual texture aliases
- [x] Unified and simplified fallback indicators across workspaces and hierarchy trees to standardized `FALLBACK` badges
- [x] Fixed race condition where adding a variation in grid view affected sibling variations under the alias and briefly triggered a false replace modal
- [x] Fixed click-through hit testing under the hidden catalog selector overlay
---
 
### v1.0.1 (Released — 2026-09-22)
**Improvements**
- [x] Narrow viewport optimization, sidebar, JSON viewer (manifest editor), and block list become overlay drawers
- [x] Moved Docs/Guide entry to Help in the top bar
- [x] Expanded recent packs limit (up to 20) for faster workspace switching
- [x] Reworked JSON viewer top bar
- [x] Unified fragmented badges into shared `<Badge />` system (consistent variants, sizes, and colors)
- [x] Restored exact scroll and selection when returning to a view
- [x] Refactored catalog button into always-visible FAB (sidebar-independent)
- [x] Fixed title typography - matched `mcTextureGhost` header to logo
- [x] Removed Herobrine

**Bug Fixes**
- [x] Entity Workspace: sanity-checked slot labels, correctly resolve texture vs geometry mapping
- [x] Catalog required multiple clicks to open (focus issue) - fixed via FAB refactor
- [x] Tedious catalog access on narrow viewports without opening the sidebar - fixed via FAB refactor
- [x] Adding an alias to `terrain_texture.json` also added a `blocks.json` entry - fixed alias vs block distinction
- [x] Terrain alias declared in `terrain_texture.json` but treated as vanilla fallback/missing - fixed declaration check to use pack aliases independent of `block.isUserDefined`
- [x] Manifest editor was squished by the JSON viewer - refactored JSON Viewer to a dedicated sidebar
- [x] Texture context menu overshot outside viewport on the rightmost tile
- [x] Normalized “Open With” handling in context menus
- [x] Removed inconsistent entity delete button
- [x] Renamed app `McTextureGhost` → `mcTextureGhost`

---

### v1.0.0 (Released — 2026-09-19)
- [X] Block and item texture scanning with ghost detection
- [X] Live reload on external editor save
- [X] Flipbook animation (20 tick and blending)
- [X] Vanilla Bedrock reference catalog with offline cache
- [X] JSON scaffolding (blocks, aliases, items, flipbooks)
- [X] Pack creation wizard and manifest editor
- [X] Export resource pack to `.mcpack` archive
- [X] Block Workspace
- [X] Entity Workspace
- [X] Context menu: block state formatting and deletion
- [X] Drag-and-drop texture import with overwrite confirmation
- [X] `.tga` format decoding and preview
- [X] Per-texture vanilla reference preview alongside stubs
- [X] Compile  (`_mers`)
- [X] Compile (`_atlas`) against (`_item`)
