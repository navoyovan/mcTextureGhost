# Architecture Essentials (Cheat Sheet)

Fast reference for day-to-day tasks. Consult this file first to conserve context.

## 1. Quick Tech Stack
- **Host:** .NET 8 WPF (`net8.0-windows`), WPF-UI 4.3.0, WebView2 1.0.3179
- **Frontend:** React 19, TypeScript 5.7, Vite 6, Three.js 0.171
- **Styling:** CSS Modules (`*.module.css`) + CSS Custom Properties. **Strictly NO Tailwind CSS**.
- **Fonts:** `Syne` (Titles/Headers), `Press Start 2P` (Badges/Status), `Consolas` (Code/Paths).

## 2. Key Directories & Entrypoints
- `App.xaml` / `MainWindow.xaml`: WPF root and shell container.
- `ViewModels/MainViewModel.cs`: Core C# viewmodel and IPC handler.
- `Models/TextureAlias.cs`: Core texture models (`Block`, `Item`, `Entity`), variant descriptors, and face bindings.
- `Services/`: Business logic for scanning (`PackScanner` for terrain, items, and client entities/attachables), vanilla sync (`VanillaDataService`), custom reference packs (`CatalogReferenceService`), and JSON scaffolding (`JsonWriterService`).
- `frontend/src/App.tsx`: Main React entry point. Renders one of three views: `grid`, `workspace`, or `entity` based on `activeView` store state.
- `frontend/src/components/catalog/CatalogDrawer.tsx`: Reference catalog flyout (supports Vanilla and Custom pack profiles). Entity items are grouped by primary identifier (`minecraft:<id>`) with slot groups partitioned by geometry ID / attachment type matching `EntityWorkspace.tsx`.
- `frontend/src/components/workspace/BlockWorkspace.tsx`: 4-tier block hierarchy view with `Block3DViewer` (Three.js) sub-component.
- `frontend/src/components/workspace/EntityWorkspace.tsx`: Dedicated Entity & Attachable index and slot inspector with `Entity3DViewer` (Three.js) rendering Bedrock `.geo.json` bone/cube hierarchies.
- `frontend/src/components/workspace/entityGeometryBuilder.ts`: High-performance parser and Three.js hierarchy builder for format 1.8.0 and 1.12.0+ Bedrock geometry models.
- `frontend/src/components/json/JsonReader.tsx`: Unified JSON reader and inspector for all pack `.json` files. When loading `manifest.json`, renders an unboxed 50/50 dual-pane inspector (`ManifestForm.tsx` + live code).
- `frontend/src/components/grid/PackGrid.tsx`: Virtualized/memoized grid tile renderer (`PackGridTile` wrapped in `React.memo`) with stable callbacks to eliminate re-rendering 5,000+ items on hover or context menu toggle.
- `frontend/src/components/grid/TileHoverMorphPortal.tsx`: Universal singleton morphing portal for `PackGrid`, `BlockWorkspace`, and `EntityWorkspace`. Clicking any tile/leaf opens the morph card with animated checkerboard backdrop, auto-scaling up to 128×128, outside status badges (`OK`, `ANIM`, `MERS`), inner resolution chip, Hold-to-Peek MERS preview, quick action toolbar, and 100ms mouse-leave minimize grace period with seamless idle-tile snapback.
- `frontend/src/components/common/FlipbookThumbnail.tsx`: Dual-path texture renderer with zero-canvas static `<img>` fast-path and `IntersectionObserver` viewport culling for animated Bedrock flipbooks (pausing offscreen 20Hz canvas tick loops).

## 3. IPC Communication & Virtual Hosts
- **Host $\rightarrow$ Web:** `MainViewModel` posts JSON string via `CoreWebView2.PostWebMessageAsString`.
- **Web $\rightarrow$ Host:** React components post message via `window.chrome?.webview?.postMessage({ type, payload })`.
- **Open With & Context Menu (`OPEN_WITH:*`):**
  - `OPEN_WITH:GET_APPS` $\rightarrow$ `OPEN_WITH:APPS`: Discovers installed image editors from Windows Registry (`OpenWithService.cs`) with authentic base64 app icons.
  - `OPEN_WITH:OPEN`: Launches specified texture in selected application executable.
  - `OPEN_WITH:CHOOSE_APP`: Triggers Windows native "Open With..." app picker.
  - Rendered via a global singleton portal (`TextureContextMenu.tsx`) outside `.map()` loops with 800ms hover grace period for instant (<2ms) render.
- **Search System & Shortcuts:**
  - Unified under `SearchInput.tsx` primitive across pack grid, block workspace, entity workspace, and JSON readers.
  - Global `/` keyboard shortcut focuses active search bar.
- **Geometry & 3D Assets (`GEOMETRY:*`, `VANILLA:*`):**
  - `GEOMETRY:GET` $\rightarrow$ `GEOMETRY:DATA`: Requests/returns raw Bedrock geometry JSON for an entity or geometry ID.
  - `VANILLA:DOWNLOAD_3D_ASSETS`: Streams Mojang `bedrock-samples` zip into `%APPDATA%\McTextureGhost\reference_packs\vanilla\` to avoid GitHub API rate limits.
  - `VANILLA:GET_3D_STATUS` $\rightarrow$ `VANILLA:3D_STATUS`: Returns whether 3D models are installed on disk.
  - `DOWNLOAD:PROGRESS`: Pushes live download/extraction progress percentage and status text to WebView2.
  - `VANILLA:ADD`: Scaffolds block/item/entity into pack. For `entity`, generates `entity/<id>.entity.json` and creates `textures/entity/<id>/` folder.
- **Catalog Reference Switching (`CATALOG:*`):**
  - `CATALOG:PICK_REFERENCE`: Open file/folder dialog to import a custom resource pack reference profile (UI entry currently deferred as "Coming Soon").
  - `CATALOG:SET_REFERENCE`: Switch active catalog profile (Vanilla vs Custom) with optimistic UI updates.
  - `CATALOG:REMOVE_REFERENCE`: Remove custom pack reference profile and revert to Vanilla.
- **WebView2 Virtual Hosts:**
  - `https://pack.local/*`: Active workspace resource pack.
  - `https://vanilla.local/*`: Official vanilla bedrock reference files, master JSONs, textures, and cached `.geo.json` models.
  - `https://reference.local/*`: Dynamically mapped to the selected custom reference pack directory when active.
  - All virtual host mappings buffer files into in-memory streams (`MemoryStream`) using `FileShare.ReadWrite | FileShare.Delete` to prevent file handle locks on user textures.
  - Always ensure new actions are typed on both ends.

## 4. View Navigation & File Reader Pattern
- **Routed Views (`activeView`):** Three main routed views: `'grid'` | `'workspace'` | `'entity'`. Navigate via `setActiveView(view)`.
- **JSON & Manifest Files:** Opened seamlessly via `setSelectedFolderPath(filePath)` (e.g. `setSelectedFolderPath('manifest.json')`). `JsonReader` mounts as a focused overlay editor without creating artificial routing states.
- **Window & Shell Invariants:**
  - `MainWindow.xaml.cs` handles `WM_GETMINMAXINFO` with `SHAppBarMessage` auto-hide taskbar offset (2px margin) to ensure taskbars remain reachable when maximized.

## 5. Build & Verify Invariants
- **Frontend-Only Scope (NO dotnet build, NEVER kill McTextureGhost processes):**
  - Fast frontend typecheck & build (in `frontend/` dir):
    ```powershell
    node node_modules/typescript/bin/tsc --noEmit
    node node_modules/vite/bin/vite.js build
    ```
- **C# Backend Scope (dotnet build only when *.cs, *.xaml, *.csproj modified):**
  ```powershell
  Get-Process McTextureGhost -ErrorAction SilentlyContinue | Stop-Process -Force
  dotnet build McTextureGhost.csproj -v q
  ```
