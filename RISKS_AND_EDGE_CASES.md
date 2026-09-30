# Risks & Edge Cases — McTextureGhost

Review this document before implementing state changes, IPC bridges, or file system logic.

## 1. Windows File Locks & Process Hazards
- **`McTextureGhost.exe` Lock (`MSB3021` / `MSB3027`):**
  - **Risk:** When testing the app, Windows keeps the executable loaded in memory. Running `dotnet build` fails after 10 retry timeouts.
  - **Remedy:** Follow the build-scope and executable-lock recovery policy in `AGENTS.md` §1. Never terminate the app preemptively; recovery applies only after a required backend build fails with `MSB3021` / `MSB3027`.
- **External Image Editor & Deletion File Contention:**
  - **Risk:** External graphic editors (Aseprite, Photoshop) fail to save, or right-click file deletion fails with `ERROR_SHARING_VIOLATION`, if McTextureGhost or WebView2 holds open handles to PNG files.
  - **Remedy:** All texture reading must use in-memory decoding with `BitmapCacheOption.OnLoad` or `FileShare.ReadWrite | FileShare.Delete`. Never pass unbuffered `FileStream` objects into WebView2's `CreateWebResourceResponse`; copy to `MemoryStream` and close the handle immediately. Clear `ImagePathConverter` cache prior to deleting texture files from disk.

## 2. WPF-UI 4.x & DWM Invariants
- **Non-Client TitleBar Hit Testing:**
  - Standard WPF `IsMouseOver` fails on non-client caption areas because DWM manages hit testing.
  - Setting `ButtonsBackground="Transparent"` breaks hover highlights by suppressing WPF-UI's `HwndSourceHook` WM_NCMOUSEMOVE handler.
  - Always keep `ButtonsBackground="#2EFFFFFF"` and set `CommandParameter` on all `TitleBarButton` triggers to avoid fatal `ElementNotEnabledException`.
- **Button Appearance:**
  - `Appearance="Subtle"` throws a runtime `FormatException` in WPF-UI 4.x. Use `Appearance="Transparent"`.

## 3. WebView2 & IPC Synchronization
- **Early Message Dispatch:**
  - **Risk:** C# sending messages before WebView2 DOM and React listeners are mounted drops messages silently.
  - **Remedy:** Queue initial state payloads until React sends an explicit `FRONTEND_READY` message to the host.
- **Payload Deserialization Errors:**
  - Keep payload schema versioned or strictly typed with fallback error handling to avoid white-screen crashes in WebView2.

## 4. Minecraft Bedrock JSON Schema Quirks
- **Polymorphic Texture Declarations in `terrain_texture.json` & `item_texture.json`:**
  - Textures can be declared as:
    1. A single string path: `"textures/blocks/stone"`
    2. An array of paths: `["textures/blocks/dirt_1", "textures/blocks/dirt_2"]`
    3. An object with variations: `{"variations": [{"path": "textures/blocks/grass", "weight": 1}]}`
  - Handled by `Services/Scanning/TextureAtlasParser.cs` (`ParseTextureAtlasJson`), converting polymorphic payloads to normalized `ParsedAliasData` with indexed variants without throwing `JsonException`.
- **Block Face Bindings & Carried Faces in `blocks.json`:**
  - Block textures can be declared as a simple string, a directional object (`up`, `down`, `north`, `south`, `east`, `west`), or a carried object (`carried_textures`).
  - Handled by `Services/Scanning/BlockDefinitionParser.cs` (`ParseBlocksJson` & `ExtractAliasFaces`).
- **Relative Path Conventions:**
  - Bedrock schemas omit the `.png` extension in `terrain_texture.json` and `item_texture.json` (e.g. `textures/blocks/stone` points to `textures/blocks/stone.png`). Resolved by `Services/PackScanner.cs` (`ResolveTexture`).

## 5. `activeView` Union Type Contract
- **Risk:** Adding a new view string (e.g. `'manifest'`) to the `PackState` type or the `PackStore` interface without also updating the `setActiveView` method *implementation* signature in `packStore.ts` causes a **TypeScript contravariance error** at the assignment site.
- **Rule:** When a new view is added, update all three locations atomically:
  1. `PackState.activeView` field type
  2. `PackStore.setActiveView` interface method parameter type
  3. `setActiveView(view: ...)` implementation signature in `packStore.ts`

