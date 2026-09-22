# Architecture Essentials (Cheat Sheet)

Fast reference for day-to-day tasks. Start with the relevant code below; load specialized docs only when needed. Execution and build safety policy lives in `AGENTS.md`.

## 1. Quick Tech Stack
- **Host:** .NET 8 WPF (`net8.0-windows`), WPF-UI 4.3.0, WebView2.
- **Frontend:** React 19, TypeScript 5.7, Vite 6, Three.js 0.171.
- **Dependency versions:** `McTextureGhost.csproj` and `frontend/package.json`.
- **Styling:** CSS Modules (`*.module.css`) + CSS Custom Properties. **No Tailwind CSS**.
- **Fonts:** Preserve design tokens in `frontend/src/styles/` (`Syne`, `Press Start 2P`, and system code/UI fonts).
- **Category Icons:** Standardized Lucide icons across UI: Blocks (`<Box />`), Items (`<Sword />`), Entities (`<PawPrint />`, attachable: `<Shield />`), All (`<LayoutGrid />`). `<Ghost />` is strictly reserved for ghost texture status.
- **Status & Badge Colors:** Standardized status tokens across UI: `OK`, `ADDED`, `DONE`, and `FALLBACK` are strictly **Soft Blue** (`#38bdf8`, `background: rgba(56, 189, 248, 0.15)`). `GHOST` is strictly reserved for missing files using **Green** (`#8CEB1F`) on purple (`rgba(68, 38, 56, 0.75)`). Never use green for `OK` or `ADDED`. **ALWAYS use the shared `<Badge />` component (`frontend/src/components/common/Badge.tsx`) with the appropriate `variant` rather than creating custom span classes.** Ensure Badges retain their standard rounded corners (`4px` for text, `10px` pill for `.size_counter`) for visual distinction; do not override them with sharp corners.
- **Drawer Stacking & Overlay Invariants:** Overlay drawers (`.blockListPane`, `.sidebar`, `.jsonSidebarDrawer`) use `z-index: 500` (backdrops `490`–`1000`). 3D camera controls and viewport drag handles are scoped to `z-index: 10` so interactive 3D overlays never poke through opened drawers. The always-visible `CatalogFab` uses `z-index: 1002` (fixed, bottom-left wide / full-width narrow); do not place elements between `1000`–`1004` without accounting for it.
- **Scroll Clearance Pattern:** Never use `padding-bottom` alone on `display: flex` + `overflow-y: auto` containers to create scroll space below content — it is unreliable in WebView2/Chromium. Use a `::after { content: ''; display: block; min-height: Npx; flex-shrink: 0; }` pseudo-element instead. All primary scroll containers already include an 80px `::after` spacer to clear the CatalogFab.
- **Alias vs Block Add Invariant:** `VANILLA:ADD` (`Services/IpcContracts.cs` `VanillaAddPayload` + `Views/MainWindow.xaml.cs` + `frontend/src/components/catalog/CatalogDrawer.tsx`) must distinguish alias-only vs block adds via optional `alias` field — alias names can equal blockIds (`obsidian`) or differ (`glowing_obsidian` alias vs `glowingobsidian` block `vanilla_cache/blocks.json:2602` / `terrain_texture.json:1746`). Alias-only uses `JsonWriterService.AddVanillaBlockAlias` (terrain only). Declaration checks (`isAliasDeclaredInPack` in `CatalogDrawer.tsx:529`, `isDeclaredInTerrainTexture` in `BlockWorkspace.tsx:582`/`BlockEntryTree.tsx:184`) must use pack `aliases` (`status !== 'ORPHAN' && isUserDefined !== false`) independent of `block.isUserDefined`; otherwise vanilla fallback blocks with terrain alias (glowing case) incorrectly show as not-added/`vanilla fallback`. For shared aliases (one texture used by multiple blocks, e.g. `stone`), an orphan PNG must surface as fallback under *all* sharing blocks, and adding the alias once must mark it Added for all sharing blocks (alias is global in `terrain_texture.json`).

## 2. Task-to-Code Lookup

Paths are repository-relative. Read the entry point relevant to the task, not every file in a row.

| Task | Start here / related code |
| --- | --- |
| Native shell, WebView hosting, window behavior | `Views/MainWindow.xaml` / `Views/MainWindow.xaml.cs`; application root: `App.xaml` / `App.xaml.cs` |
| Backend state, commands, file-watcher coordination | `ViewModels/MainViewModel.cs` |
| IPC message names and payloads | `Services/IpcContracts.cs` and `frontend/src/types/ipc.ts` |
| IPC transport, dispatch, subscriptions, correlated requests | `Services/IpcBridgeService.cs` and `frontend/src/hooks/useIpc.ts` |
| Frontend state and view navigation | `frontend/src/store/packStore.ts` and `frontend/src/App.tsx` |
| Texture models, variants, face bindings, user-defined flags | `Models/TextureAlias.cs` (`IsUserDefined`) |
| Pack scanning, tree building, and fallback inference | `Services/PackScanner.cs` (`BuildEntityWorkspaceTree`, `BuildBlockWorkspaceTree`) and `Services/JsonWriterService.cs` |
| Vanilla assets, catalog manager, titlebar download notification | `Services/VanillaDataService.cs`, `Services/CatalogReferenceService.cs`, `frontend/src/components/titlebar/AssetDownloadNotification.tsx`, `frontend/src/components/catalog/ReferencePackManagerModal.tsx`, `frontend/src/components/catalog/CatalogDrawer.tsx`; always-visible catalog toggle FAB (sidebar-independent): `frontend/src/components/catalog/CatalogFab.tsx` |
| Drag-and-drop texture import & tile-to-tile copy | `TEXTURE:DROP_IMPORT`, `TEXTURE:COPY_FILE` IPC (`Services/IpcContracts.cs`); frontend: `frontend/src/components/grid/PackGrid.tsx`, `frontend/src/components/workspace/WorkspaceTileCard.tsx`, `frontend/src/components/grid/TextureDropConfirm.tsx`, `frontend/src/components/catalog/CatalogDrawer.tsx`, `useIpc.dropImportTexture`, `useIpc.copyTextureFile` |
| Block workspace, hierarchy tree, and 3D preview | `frontend/src/components/workspace/BlockWorkspace.tsx`, `BlockEntryTree.tsx`, `Block3DViewer.tsx` in the same directory |
| Block shape and geometry investigation | `frontend/src/config/blockShapes.ts` and `frontend/src/components/workspace/blockGeometryBuilder.ts` |
| Entity/attachable workspace, hierarchy tree, and 3D preview | `frontend/src/components/workspace/EntityWorkspace.tsx`, `EntityEntryTree.tsx`, `Entity3DViewer.tsx`, `entityGeometryBuilder.ts` in the same directory; consult `.agents/rules/entity-workspace.md` |
| JSON reader and manifest editor | `frontend/src/components/json/JsonReader.tsx` and `ManifestForm.tsx` in the same directory |
| Texture grid and shared morph preview | `frontend/src/components/grid/PackGrid.tsx` and `TileHoverMorphPortal.tsx` |
| Texture animation thumbnails | `frontend/src/components/common/FlipbookThumbnail.tsx` |
| Texture context menu and external editors | `frontend/src/components/common/TextureContextMenu.tsx`, `Services/OpenWithService.cs`, `Services/OpenWithLauncher.cs` |
| Shared search | `frontend/src/components/common/SearchInput.tsx` |
| Pack export (`.mcpack` archive) | `Services/PackExportService.cs`, `frontend/src/components/menus/MenuBar.tsx` (`handleExportPack`), `PACK:EXPORT` IPC |
| Companion atlas textures (`_atlas`) & interactive animations | `Services/PackScanner.cs` (atlas linking & orphan suppression), `Views/MainWindow.xaml.cs` (`ExtractCompanionAtlasIfExists`), `frontend/src/components/common/FlipbookThumbnail.tsx` (real-time clock & mouse compass) |
| About dialog & open-source attributions | `frontend/src/components/common/AboutModal.tsx`, `frontend/src/components/menus/MenuBar.tsx` |
| Theme and component styling | `frontend/src/styles/tokens.css`, `themeEngine.ts` in the same directory, and the target component's `*.module.css` |
| WPF control/caption API constraints | `.agents/rules/wpf-ui.md` |

## 3. IPC & Virtual Hosts
- **Host → Web:** JSON string through `CoreWebView2.PostWebMessageAsString`.
- **Web → Host:** Object envelope through WebView2 `postMessage`; shared helpers (`postCommand`, `subscribeToEvent`, `sendRequest`) live in `frontend/src/hooks/useIpc.ts`.
- **Envelope:** Message `type` and `payload`, with correlation and timestamp metadata. Consult the contract files above rather than maintaining a separate message catalog here.
- **Contract edits:** Check both C# and TypeScript contracts, the handler, and the caller together.
- **Virtual hosts:**
  - `https://pack.local/*`: Active workspace resource pack.
  - `https://vanilla.local/*`: Official vanilla reference files.
  - `https://reference.local/*`: Selected custom reference pack.
- For file-sharing and buffered resource-response constraints, consult `RISKS_AND_EDGE_CASES.md` §1.

## 4. View Navigation
- **Routed views (`activeView`):** `'grid'` | `'workspace'` | `'entity'`; navigate through `setActiveView(view)`.
- **Responsive Workspace Drawers & Sidebars:** On compact viewports (`<= 1100px`), the main `.sidebar` becomes an absolute-positioned overlay to prevent squishing the center grid (crucial for users with half-screen snapped windows). Similarly, `.blockListPane` converts to an off-canvas slide drawer toggled via the toolbar's `[ 📦 Blocks (N) ]` / `[ 🐾 Entities (N) ]` button. Its width matches the explorer sidebar (`360px` desktop, `320px` responsive).
- **Workspace State Preservation (keep-alive):** `BlockWorkspace`/`EntityWorkspace` selection (`blockWorkspaceSelectedId`/`entityWorkspaceSelectedId`) and viewer indices (`ActiveStateIndex`, `ActiveVariationIndex`, `ActiveSlotIndex`, `ActiveLeafKey`) are persisted in `frontend/src/store/packStore.ts`. `frontend/src/App.tsx` keeps `PackGrid`/`BlockWorkspace`/`EntityWorkspace` mounted and hides inactive views with `display:none` wrappers (flex:1, overflow:hidden) so DOM scroll positions survive navigation to Grid or `JsonReader`. Do not reintroduce conditional unmount — reset indices only on actual block/entity switch via `prevIdRef` guard in the workspace components.
- **JSON and manifest files:** Open through `setSelectedFolderPath(filePath)` (for example, `'manifest.json'`). `JsonReader` mounts as a focused overlay without an extra routed view — workspaces stay mounted hidden beneath it.
- **Manifest UI:** `ManifestForm.tsx` supplies the form with a slide-in raw JSON sidebar drawer.

## 5. Build & Verification
Follow `AGENTS.md` §1–2 for scope-specific verification, direct frontend binary commands, and process-preservation rules.
- Frontend-only edits: typecheck and Vite build; no `dotnet build` or app termination.
- Backend edits: `dotnet build McTextureGhost.csproj -v q`. Do not terminate the app preemptively; follow the executable-lock recovery policy in `AGENTS.md` only after the specified build failure.
- Documentation-only edits: verify paths, consistency, and the diff; no application build is needed.