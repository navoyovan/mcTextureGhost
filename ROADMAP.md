
## Roadmap

### Backlog

- [ ] curating each 3D preview for **blocks** and **entities** to accurately reflect their original in-game shapes
- [ ] curating each texture **flipbook** rendering to accurately reflect their original render
- [ ] **UI** and texture support 
- [ ] **particle texture** support
- [ ] auto scaffold custom face texture entries (like detaching shared textures **ex:** `acacia_fence` using `acacia_planks` into `acacia_fence`)
- [ ] auto scaffold **variation** entry
- [ ] optimistinc or loading state on each texture interactable (like tiles/thumbnail/catalog)
- [ ] target `resource-pack` engine (version selector)
 
### v1.1.0
- [X] narrow viewport optimization:
- [X] docs and guide move to help
- [X] allows more recent packs to be added
- [X] reworked json viewer top bar
- [X] optimizes json hirerarchy tabstop 

**Bug Fixes**
- [X] manifest editor got squished by the json viewer
- [x] texture context menu overshoots to right on rightmost tile
- [x] normalizes how context menu "open with" opens 
- [x] removed entity button (ui inconcistency)
- [x] app name is McTextureGhost > mcTextureGhost

### v1.0.0
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
