# Original User Request

## Initial Request — 2026-09-10T09:07:50Z

Restore the authentic Minecraft/Fluent fonts (Syne, Press Start 2P, Consolas), full sidebar functionality parity, vanilla reference catalog drawer/flyout, zoom slider controls, and clean File/Dev menus for McTextureGhost WebView2/React desktop frontend.

Working directory: c:\Users\yovan\Source\McTextureGhost
Integrity mode: development

## Requirements

### R1. Authentic Typography Restoration
- Integrate Resources/Fonts/Syne.ttf, Resources/Fonts/PressStart2P.ttf, and system Consolas/Segoe UI Variable via @font-face CSS tokens in frontend/src/styles/.
- Apply 'Press Start 2P' strictly to pack title, pixel badges, and retro indicators.
- Apply 'Syne' (700/Bold) to app titlebar branding, section headers, and stat cards.
- Apply 'Consolas' monospace to relative paths, hex color codes, and UUIDs.
- Strictly NO Tailwind CSS: all styling in *.module.css and CSS variables.

### R2. Complete Sidebar Functionality Parity
- Full pack identity card: 96x96 pixelated pack icon (click to open/generate artwork), status badge pill tags (textures count, done, ghosts, unlinked/orphans), and pack root path with character ellipsis.
- Manifest quick-warning card when manifest.json is missing with one-click  Generate button.
- Interactive Directory Explorer tree showing folder hierarchy (textures/blocks, textures/items, etc.), item counts, ghost badges, and click-to-filter scoping.
- Action dock at the bottom with Explore Catalog card and Quick Action buttons.

### R3. Vanilla Reference Catalog Flyout / Drawer
- Restore the remote/cached Mojang Bedrock samples reference catalog drawer.
- Searchable 3-tier catalog tree (Block / Item -> Texture Alias -> Variant Slots) with 1-click Add to Pack scaffolding.
- Visual status indicators distinguishing added vs not-added vanilla textures.

### R4. Zoom Controls, File Menu & Dev Menu
- Zoom slider and zoom preset buttons in the toolbar to adjust grid tile size (Small 80px, Medium 120px, Large 160px, Extra Large 200px) with nearest-neighbor crisp pixel rendering.
- Clean File menu: Open Folder, Reload Pack, New Pack Wizard, Edit Manifest, Open in File Explorer, Close Pack.
- Clean Dev menu: Toggle Category Tabs, Refresh Vanilla Cache, Launch DevTools, Inspect IPC State.
- Focused purely on file operations, content, and functionality without bloat.
- Preserve repository hygiene: do not leave briefing/test temporary files in the repository root or .agents directory.

## Acceptance Criteria

### Typography & Layout Integrity
- [ ] No inline Tailwind CSS: all styles authored in standard *.module.css and CSS variables.
- [ ] Fonts load immediately with zero layout shift or missing glyph fallbacks.
- [ ] Window chrome caption controls (minimize, maximize, close, drag) remain fully functional.

### Sidebar & Catalog Features
- [ ] Pack icon button opens artwork in native external editor or generates placeholder if missing.
- [ ] Folder tree click filters the grid to textures within that directory.
- [ ] Explore Catalog opens the vanilla reference drawer with searchable Bedrock textures.
- [ ] One-click Add to Pack creates the necessary folder and JSON entry.

### Zoom & Menus
- [ ] Adjusting zoom dynamically resizes pack grid thumbnails smoothly with pixelated sharpness preserved.
- [ ] File and Dev menus trigger their respective native IPC actions.
- [ ] All 510 existing automated tests continue to pass (node tests/runner.js).
- [ ] Project compiles with 0 errors (dotnet build and vite build).
