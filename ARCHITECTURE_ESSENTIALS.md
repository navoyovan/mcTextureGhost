# Architecture Essentials (Cheat Sheet)

Fast reference for day-to-day tasks. Start with the relevant code below; load specialized docs only when needed. Execution and build safety policy lives in `AGENTS.md`.

## 1. Quick Tech Stack
- **Host:** .NET 8 WPF (`net8.0-windows`), WPF-UI 4.3.0, WebView2.
- **Frontend:** React 19, TypeScript 5.7, Vite 6, Three.js 0.171.
- **Dependency versions:** `McTextureGhost.csproj` and `frontend/package.json`.
- **Styling:** CSS Modules (`*.module.css`) + CSS Custom Properties. **No Tailwind CSS**.
- **Fonts:** Preserve design tokens in `frontend/src/styles/` (`Syne`, `Press Start 2P`, and system code/UI fonts).
- **Category Icons:** Standardized Lucide icons across UI: Blocks (`<Box />`), Items (`<Sword />`), Entities (`<PawPrint />`, attachable: `<Shield />`), All (`<LayoutGrid />`). `<Ghost />` is strictly reserved for ghost texture status.
- **Status & Badge Colors:** Standardized status tokens across UI: `OK`, `ADDED`, `DONE`, and `FALLBACK` are strictly **Soft Blue** (`#38bdf8`, `background: rgba(56, 189, 248, 0.15)`). `GHOST` is strictly reserved for missing files using **Green** (`#8CEB1F`) on purple (`rgba(68, 38, 56, 0.75)`). Never use green for `OK` or `ADDED`.

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
| Vanilla assets, catalog manager & titlebar download notification | `Services/VanillaDataService.cs`, `Services/CatalogReferenceService.cs`, `frontend/src/components/titlebar/AssetDownloadNotification.tsx`, `frontend/src/components/catalog/ReferencePackManagerModal.tsx`, `frontend/src/components/catalog/CatalogDrawer.tsx` |
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
- **JSON and manifest files:** Open through `setSelectedFolderPath(filePath)` (for example, `'manifest.json'`). `JsonReader` mounts as a focused overlay without an extra routed view.
- **Manifest UI:** `ManifestForm.tsx` supplies the form alongside the JSON reader.

## 5. Build & Verification
Follow `AGENTS.md` §1–2 for scope-specific verification, direct frontend binary commands, and process-preservation rules.
- Frontend-only edits: typecheck and Vite build; no `dotnet build` or app termination.
- Backend edits: `dotnet build McTextureGhost.csproj -v q`. Do not terminate the app preemptively; follow the executable-lock recovery policy in `AGENTS.md` only after the specified build failure.
- Documentation-only edits: verify paths, consistency, and the diff; no application build is needed.