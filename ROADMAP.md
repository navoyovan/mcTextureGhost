
## Roadmap

### Backlog

- [ ] curating each 3D preview for **blocks** and **entities** to accurately reflect their original in-game shapes
- [ ] curating each texture **flipbook** rendering to accurately reflect their original render
- [ ] **UI** texture support 
- [ ] **particle texture** support
- [ ] target `resource-pack` engine (version selector)
- [ ] add custom catalog (with other resource pack)
- [ ] add ability to support addons and distinguish thier entries from the vanilla
- [ ] render controllers? 👀
- [ ] matching catalog button to the rest of the design language
- [ ] matching welcome screen to the rest of the design language
- [ ] adding shortcuts (and shortcuts badge show. maybe hold alt to show the shortcut combinations)

### v1.1.0
- [ ] optimistic or loading state on each texture interactable (like tiles/thumbnail/catalog)
- [ ] auto scaffold **variation** entry
- [ ] auto scaffold custom face entries (like detaching shared textures **ex:** `acacia_fence` using `acacia_planks` into `acacia_fence`)

---
 
### v1.0.1
- [X] narrow viewport optimization
- [X] docs and guide button has been moved to help in the top bar
- [X] allows more recent packs to be added
- [X] reworked json viewer top bar   
- [X] refactored fragmented badges to a unified badges
- [X] added bugs to fix later
- [X] sanity checking entity workspace "slot: [xxxxxx (xxxx)]" and show the its real entries (sometimes entity entries switches the texture and geo index so it confuses the parser to returns the wrong label)
- [ ] restoring exact scroll + selection when returning to view (opening json/going to gridview)
- [X] refactored catalog button for ease of access and clean workflow
- [X] Removed Herobrine  

**Bug Fixes**
- [ ] ~~requires clicking catalog multiple times to open (catalog is out of focus?)~~
- [ ] ~~bring catalog front on narrow viewport for ease of access without opening pack sidebar~~ solved along the button refactoring
- [ ] adding entries specifically for `terrain_texture.json` sometimes adds its `blocks.json` as well
- [X] manifest editor got squished by the json viewer
- [x] texture context menu overshoots to right on rightmost tile
- [x] normalizes how context menu "open with" opens 
- [x] removed entity delete button (ui inconcistency)
- [x] changes app name McTextureGhost > mcTextureGhost

---

### v1.0.0 (Released)
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
