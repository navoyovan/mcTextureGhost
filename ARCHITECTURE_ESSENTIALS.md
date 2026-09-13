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
- `Services/`: Business logic for scanning (`PackScanner`), vanilla sync (`VanillaDataService`), and JSON scaffolding (`JsonWriterService`).
- `frontend/src/App.tsx`: Main React entry point.
- `frontend/src/components/catalog/CatalogDrawer.tsx`: Vanilla Bedrock reference catalog flyout.
- `frontend/src/components/`: Sidebar, Grid, Viewport, and Modals.

## 3. IPC Communication Pattern
- **Host $\rightarrow$ Web:** `MainViewModel` posts JSON string via `CoreWebView2.PostWebMessageAsString`.
- **Web $\rightarrow$ Host:** React components post message via `window.chrome?.webview?.postMessage({ type, payload })`.
- Always ensure new actions are typed on both ends.

## 4. Build & Verify Commands
```powershell
# Safe .NET build (kills zombie lock first):
Get-Process McTextureGhost -ErrorAction SilentlyContinue | Stop-Process -Force
dotnet build McTextureGhost.csproj -v q

# Fast frontend typecheck & build (in frontend/ dir):
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```
