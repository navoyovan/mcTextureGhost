
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
- [ ] optimistic or loading state or background working on each texture interactable (like tiles/thumbnail/catalog)
> the problem is adding stuff is so delayed
- [ ] auto scaffold **variation** entry 
> not yet weight editor
> preset or add count
> bug since pre release btw: adding variation in grid view adds to all variation under the same alias texture; its adding for a split second this behavior also affect when adding on that split second window and registered as replacing until the splitsecond is done it seems the replace modal trying to replace a missing/blank (bcs.. well... its already blank (splitsecond is done)) or **blockstates**? i forgor
- [ ] deleting entries kicks user out of the workspace view/index they working on 
- [X] animate in welcome layout 
- [X] optional peformance optimizations: added option to disable 3d preview so my laptop fan doesnt fucking kicks off everytime i open workspace

**Bug Fixes**
- [x] vanilla fallback alias: for multiple block that defines same textures defaulted to the first index in the block workspace and terrain_texture.json entry are somehow "added" even after deletion and checked the terrain texture none. expected behavior: orphaned png should show all the vanilla fallback entries it shared even after its added 1 entry that uses this png bcs it currently doesnt and fix the "added badge" both in workspace and catalog
- [x] clciking on stuff under the hidden catalog selector didn went thru to where it actually is
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
