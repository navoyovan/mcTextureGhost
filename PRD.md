# Product Requirements Document (PRD) — McTextureGhost

## 1. Overview & Vision
McTextureGhost (`mc-ghost-resource-manager`) is a desktop companion tool for Minecraft Bedrock Edition resource pack creators, texture artists, and technical pack engineers. It eliminates manual JSON boilerplate, automatically surfaces missing textures ("ghosts"), and provides real-time live reloading with instant external image editor integration.

## 2. Target Audience
- **Minecraft Bedrock Texture Artists:** Artists creating 16x16, 32x32, or high-res texture packs using tools like Aseprite, Photoshop, Paint.NET, or Blockbench.
- **Add-on & Resource Pack Developers:** Creators managing complex block state variants, data values, animation flipbooks, and atlas declarations.

## 3. Core Features & Functional Requirements

### F1. Ghost Tile Detection & Instant Scaffolding
- Scan resource packs for missing texture declarations in `terrain_texture.json` and `item_texture.json`.
- Identify "Ghost" tiles (textures defined in schemas but missing PNG assets on disk).
- One-click placeholder stub PNG generation (16x16 checkerboard) and instant launch with Windows native "Open With" editor dialog.

### F2. Live Texture Reloading & Hot Sync
- Seamless live reload on external editor file save (<kbd>Ctrl</kbd> + <kbd>S</kbd>) via debounced file watcher.
- In-memory zero-lock image decoding to prevent file lock errors in external graphic software.
- Custom memory-stream caching bypassing WPF unmanaged WIC URI cache.

### F3. Vanilla Reference Catalog (`Mojang/bedrock-samples`)
- Fetch and sync official vanilla Bedrock schemas (`blocks.json`, `terrain_texture.json`, `item_texture.json`, `flipbook_textures.json`, `en_US.lang`) directly from `Mojang/bedrock-samples`.
- Offline local caching under `%AppData%\McTextureGhost\vanilla_cache\`.
- Hierarchical 3-tier catalog browser: **Block / Item** $\rightarrow$ **Texture Alias** $\rightarrow$ **Variants / Face Slots**.
- 1-click "Add to Pack" scaffolding that updates folders and JSON files simultaneously.

### F4. Flipbook Animation & Variant Engine
- Emulation of the 20Hz Minecraft tick clock with 60 FPS GPU crossfading between animation frames.
- Support for frame sequence indexing and `ticks_per_frame`.
- Separation of block state variants (`textures: []`) vs. cosmetic random variations (`variations: []`).

### F5. Pack & Manifest Management
- New Pack creation wizard setting up directory structure and UUID generation.
- Dedicated `manifest.json` editor with header/module UUID regenerator.

## 4. UI/UX Invariants & Standards
- Windows 11 Fluent dark mode theme with Mica/Acrylic material.
- Authentic typography: `Press Start 2P` (badges/retro stats), `Syne` (branding/headers), `Consolas` (paths/UUIDs/code).
- Pure CSS Modules (`*.module.css`) and design variables — strictly no Tailwind CSS.
