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
- `Services/`: Business logic for scanning (`PackScanner`), vanilla sync (`VanillaDataService`), custom reference packs (`CatalogReferenceService`), and JSON scaffolding (`JsonWriterService`).
- `frontend/src/App.tsx`: Main React entry point. Renders one of three views: `grid`, `workspace`, or `manifest` based on `activeView` store state.
- `frontend/src/components/catalog/CatalogDrawer.tsx`: Reference catalog flyout (supports Vanilla and Custom pack profiles).
- `frontend/src/components/workspace/BlockWorkspace.tsx`: 4-tier block hierarchy view with `Block3DViewer` (Three.js) sub-component.
- `frontend/src/components/manifest/ManifestEditor.tsx`: Manifest editor view, reached via `setActiveView('manifest')`.
- `frontend/src/components/`: Sidebar (with hover reference pack switcher and custom pack management), Grid, Toolbar, and Modals.

## 3. IPC Communication & Virtual Hosts
- **Host $\rightarrow$ Web:** `MainViewModel` posts JSON string via `CoreWebView2.PostWebMessageAsString`.
- **Web $\rightarrow$ Host:** React components post message via `window.chrome?.webview?.postMessage({ type, payload })`.
- **Catalog Reference Switching (`CATALOG:*`):**
  - `CATALOG:PICK_REFERENCE`: Open file/folder dialog to import a custom resource pack reference profile (UI entry currently deferred as "Coming Soon").
  - `CATALOG:SET_REFERENCE`: Switch active catalog profile (Vanilla vs Custom) with optimistic UI updates.
  - `CATALOG:REMOVE_REFERENCE`: Remove custom pack reference profile and revert to Vanilla.
- **WebView2 Virtual Hosts:**
  - `https://pack.local/*`: Active workspace resource pack.
  - `https://vanilla.local/*`: Official vanilla bedrock reference files and assets.
  - `https://reference.local/*`: Dynamically mapped to the selected custom reference pack directory when active.
  - All virtual host mappings buffer files into in-memory streams (`MemoryStream`) using `FileShare.ReadWrite | FileShare.Delete` to prevent file handle locks on user textures.
- Always ensure new actions are typed on both ends.

## 5. View Navigation Pattern (`activeView`)
- The app has three routed views: `'grid'` | `'workspace'` | `'manifest'`.
- Navigate between them via `setActiveView(view)` from the packStore.
- The **Manifest** view is intentionally **not** a toolbar tab — it is accessed from the sidebar directory-tree hover edit button, the missing-manifest warning card, and **File → Edit Manifest…** in the MenuBar.
- When adding a new view, update **all three** of: the `PackState` type field, the `PackStore` interface method signature, and the method implementation in `packStore.ts`. Keeping them out of sync causes a TypeScript contravariance error.

## 4. Build & Verify Commands
```powershell
# Safe .NET build (kills zombie lock first):
Get-Process McTextureGhost -ErrorAction SilentlyContinue | Stop-Process -Force
dotnet build McTextureGhost.csproj -v q

# Fast frontend typecheck & build (in frontend/ dir):
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```
