# McTextureGhost

**A texture workspace for Minecraft Bedrock resource pack creators.**

Stop hunting for missing textures by hand. McTextureGhost scans your pack, shows you every declared texture that doesn't exist on disk yet ("ghosts"), and gets you into your image editor in one click — no JSON wrangling required.

---

## What it does

### Ghost Detection
Every texture alias declared in your `terrain_texture.json` or `item_texture.json` that has no artwork on disk is flagged as a **ghost** 👻. The pack grid surfaces all of them at a glance. Click any ghost to generate a placeholder stub and jump straight into your editor.

### Live Reload
Save in Aseprite, Photoshop, or Paint.NET and the tile updates instantly — no app restart, no manual refresh. The watcher debounces properly so it doesn't fire mid-save.

### Block Workspace
A relational 4-tier view of your pack's block texture hierarchy: Block → Alias → Variant → Face. Useful when a single block alias has state variants, random cosmetic variations, or multiple directional faces that need to be managed together.

### Vanilla Reference Catalog
Browse the full official Bedrock texture catalog (`Mojang/bedrock-samples`) without leaving the app. Find any block or item, see its in-game name, face assignments, and variants — then add it to your pack's JSON with one click. The catalog caches locally so it works offline.

### Flipbook Animation Previews
Animated textures (`flipbook_textures.json`) play back at the real Minecraft 20 tick/s rate with GPU frame blending, so what you see in the app is what you'll see in-game.

### Manifest Editor
Create new packs or edit `manifest.json` without touching raw JSON. Name, description, format version, min engine version, and one-click UUID regeneration.

### Folder Explorer
Sidebar tree of your pack's directory structure with live texture and ghost counts per folder. Click a folder to scope the main view to just that directory.

---

## Views

| View | What it's for |
|---|---|
| **Pack Grid** | Full texture atlas — all blocks and items, filterable by status |
| **Block Workspace** | Deep per-block editing: variants, faces, animations |
| **Manifest Editor** | Pack metadata — accessible from the sidebar or File menu |

---

## Roadmap

- [x] Block and item texture scanning with ghost detection
- [x] Live reload on external editor save
- [x] Flipbook animation playback (20Hz, GPU blending)
- [x] Vanilla Bedrock reference catalog with offline cache
- [x] JSON scaffolding (blocks, aliases, items, flipbooks)
- [x] Pack creation wizard and manifest editor
- [x] Block Workspace — 4-tier relational hierarchy view
- [x] Context menu: block state formatting and deletion
- [ ] Entity texture atlas and model texture mapping
- [ ] UI and particle texture support
- [ ] `.tga` format decoding and preview
- [ ] Per-texture vanilla reference preview alongside stubs
- [ ] Target Bedrock engine version selector

---

## Getting Started

**Requirements:** Windows 10 / 11, [.NET 8.0 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0)

```powershell
git clone https://github.com/navoyovan/mcTextureGhost.git
cd McTextureGhost
dotnet run --project McTextureGhost.csproj
```

---

## License

McTextureGhost is source-available under the [Business Source License 1.1](./LICENSE).

- Free for personal, educational, and non-commercial use.
- Cannot be resold or repackaged as a commercial product without a separate agreement.
- Automatically converts to **Apache 2.0** four years after each release date.

Contributions welcome — first-time contributors will be prompted to sign the [CLA](./CLA.md) when opening a pull request. Questions about commercial licensing? Open an issue.

---

> **NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.**
