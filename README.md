# McTextureGhost
Ghost Resource Manager for Minecraft (`mc-ghost-resource-manager`)

## About
McTextureGhost is a high-performance Windows 11 Fluent desktop tool designed for Minecraft Bedrock Edition resource pack creators, texture artists, and technical pack developers. It eliminates manual JSON boilerplate, identifies missing textures ("ghosts"), and provides real-time live reloading with instant external image editor integration.

## Roadmap

- [x] **v0.0 - Block Textures & Ghost Workflow**
  - [x] read `terrain_texture.json` and display texture aliases
  - [x] ghost tile identification for declared-but-missing textures
  - [x] 16×16 checkerboard stub generation with native "Open With" launcher
  - [x] live reload on external editor save (<kbd>Ctrl</kbd> + <kbd>S</kbd>)
- [x] **Variant & Animation Engine**
  - [x] differentiate block state variants and texture face variations
  - [x] support for `flipbook_textures.json` (20Hz global tick, custom frame sequences, blending)
- [x] **v0.1 - Item Atlas Support**
  - [x] read `textures/item_texture.json`
  - [x] 3-way atlas filtering (All / Blocks / Items)
  - [x] separate item orphan registration
- [x] **Vanilla Bedrock Reference Catalog**
  - [x] fetches reference catalog from `Mojang/bedrock-samples` (`main` branch)
  - [x] offline local cache in `%AppData%\McTextureGhost\vanilla_cache\`
  - [x] in-game display name from `texts/en_US.lang`
  - [x] JSON scaffolding for blocks, aliases, and items
  - [x] Bug: Resolved false-positive orphans
- [x] **Pack & Manifest Tooling**
  - [x] pack creation wizard with auto boilerplate
  - [x] `manifest.json` editor along with UUID generator

- [ ] **Upcoming Features**
  - [ ] replace current prototype ui with an actual ui
  - [ ] v0.2 - Entity textures atlas and model texture mapping
  - [ ] v0.3 - UI and Particle textures support
  - [ ] Support for `.tga` texture format decoding and preview
  - [ ] Pack version switcher / target Bedrock engine version selector
  - [ ] Option to preview or fetch individual vanilla reference textures alongside stubs


## Key Features

### 1. Vanilla Reference Catalog (`Mojang/bedrock-samples`)
- **Remote Vanilla Integration**: queries the official [`Mojang/bedrock-samples`](https://github.com/Mojang/bedrock-samples) repository for the latest Bedrock resource pack schemas (`blocks.json`, `terrain_texture.json`, `item_texture.json`, `flipbook_textures.json`, and `en_US.lang`).
- **Offline Caching**: caches reference data under `%AppData%\McTextureGhost\vanilla_cache\` so the app launches and operates offline instantly.
- **Hierarchical Tree View**: browse textures organized in an intuitive 3-level tree:
  1. **Block / Item** (readable in-game names from `en_US.lang` + namespace ID)
  2. **Texture Alias** (atlas key with face summary badge, e.g. `top/btm`, `side`)
  3. **Texture Variants** (data-value slots, randomized variations with weights, and flipbook animations)
- **JSON Scaffolding**: add any vanilla block, alias, or item texture directly into your pack with one click. Scaffolds `blocks.json`, `terrain_texture.json`, `item_texture.json`, and flipbook definitions simultaneously.
- **Override Detection**: textures placed on disk matching vanilla paths are recognized as valid overrides (`OK`), avoiding false-positive orphan warnings even in packs without JSON files.

### 2. Live Texture Reloading & External Editor Integration
- **Zero-Lock Image Decoding**: decodes texture files through in-memory streams with `BitmapCacheOption.OnLoad`, instantly releasing disk file handles so external editors (Aseprite, Photoshop, Paint.NET, Blockbench) never encounter `file in use` errors.
- **Bypasses WPF URI Cache**: implements custom cache invalidation bypassing WPF's unmanaged WIC URI imaging cache. When you press <kbd>Ctrl</kbd> + <kbd>S</kbd> in your image editor, the app immediately re-reads raw pixels and re-renders the tile live.
- **Debounced FileSystemWatcher**: 150ms debouncer prevents race conditions during editor file flush and multi-pass save cycles.
- **Ghost-to-Real Workflow**: clicking any missing texture ("Ghost") generates a 16×16 placeholder stub PNG and immediately opens the native Windows "Open With" dialog. once painted and saved, the tile flips to `OK` in real time.

### 3. 1:1 Bedrock Flipbook Animation Engine
- **Synchronized Global Tick Clock**: 20Hz (50ms) world tick clock simulating Minecraft game engine.
- **Seamless GPU Crossfade**: `blend_frames` with 60 FPS GPU crossfading between animation frames, accurately reproducing in-game fluid and portal rendering.
- **Frame Sequences & Slicing**: parses vertically stacked sprite sheets into zero-copy frame views, honoring custom `frames` index sequences and `ticks_per_frame` animation speeds.
- **Automatic Pausing**: stop animation when no animated tiles are currently visible on screen to conserve CPU and GPU resources.

### 4. Atlas & Variant Support
- **Multi-Atlas Filtering**: Seamless 3-way toggle between **All Textures**, **Blocks** (`atlas.terrain`), and **Items** (`atlas.items`).
- **Block Variants vs. Texture Variations**:
  - distinguishes block state / data-value variant arrays (`textures: [ ... ]`, e.g., `cobblestone_wall`).
  - distinguishes random cosmetic variation arrays with spawn weights (`variations: [ ... ]`, e.g., `cobblestone`).
  - full support for nested combinations (e.g., block state slots containing weighted variations like `dirt`).
- **Face Badge Summaries**: auto cross-references `blocks.json` geometry to display directional face tags (`top`, `btm`, `side`, `sides`, `e/w`, `n/s`, `hand`).

### 5. Pack Creation & Manifest Management
- **New Pack Wizard**: Create brand-new Bedrock resource packs from scratch with directory structure (`textures/blocks`, `textures/items`) and automatically generated UUIDs.
- **Manifest Editor View**: dedicated tab to view and edit `manifest.json` metadata (pack name, description, format version, min engine version).
- **UUID Tools**: regenerate Header or Module UUIDs with a single click and copy them straight to your clipboard.
- **Folder Explorer Sidebar**: sidebar tree showing folder hierarchy with live item and ghost count badges for quick scoped filtering.

---

## Getting Started

### Prerequisites
- **Windows 10 or Windows 11**
- **.NET 8.0 SDK** (Desktop Runtime / WPF)
- (Optional) **Visual Studio 2022** (with *.NET desktop development* workload) or VS Code / JetBrains Rider

### Building & Running

1. **Clone the repository:**
   ```bash
   git clone https://github.com/navoyovan/McTextureGhost.git
   cd McTextureGhost
   ```

2. **Build the project:**
   ```powershell
   dotnet build McTextureGhost.csproj
   ```

3. **Run the application:**
   ```powershell
   dotnet run --project McTextureGhost.csproj
   ```

---

## Project Architecture

```
McTextureGhost/
├── Models/
│   ├── BlockGroupNode.cs        # 3-level hierarchical catalog data models (Block, Alias, Leaf)
│   ├── FlipbookDefinition.cs    # Flipbook animation metadata schema
│   ├── ManifestModel.cs         # manifest.json model with UUID regeneration and parsing
│   ├── PackFolderItem.cs        # Folder tree nodes with live item/ghost counts
│   └── TextureAlias.cs          # Consolidated texture tile model (Status, variants, faces, brushes)
├── Services/
│   ├── FlipbookAnimationManager.cs # Synchronized 20Hz animation clock and GPU frame crossfader
│   ├── JsonWriterService.cs     # Scaffolding logic for blocks, aliases, items, and flipbooks
│   ├── OpenWithLauncher.cs      # Native Windows "Open With" dialog launcher
│   ├── PackScanner.cs           # Pack inspection, orphan detection, and catalog tree builder
│   ├── PlaceholderImageFactory.cs # 16x16 checkerboard stub PNG generator
│   └── VanillaDataService.cs    # Remote Mojang/bedrock-samples downloader, cache, & lang parser
├── ViewModels/
│   ├── MainViewModel.cs         # Master ViewModel (state, commands, filtering, debounced watcher)
│   └── RelayCommand.cs          # Standard ICommand implementation
└── Views/
    ├── BoolToVisibilityConverters.cs # Converters & ImagePathConverter (memory-stream cache bypass)
    ├── CreatePackManifestDialog.xaml # Pack creation modal dialog
    ├── FlipbookThumbnail.cs     # Custom WPF control for NearestNeighbor pixel art & animation
    └── MainWindow.xaml          # Windows 11 Fluent dark interface (grid, catalog tree, manifest tab)
```

---

## Disclaimer
> **NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.**

