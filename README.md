# McTextureGhost
### Ghost Resource Manager for Minecraft Bedrock Edition (`mc-ghost-resource-manager`)

## About
Project to help manage missing textures in Minecraft resource packs. or to 
create texture pack/resource pack. It reads `.json` files, displaying all
declared texture aliases as tiles. If a texture is missing, it shows a ghost tile.
Clicking on a ghost tile generates a stub PNG at the correct path and opens the native "Open With" dialog for editing.

## Roadmap
v0.0 - ghost for block textures

texture ghost basic fucntionality read json and show ghost tiles for missing pngs
support variants
support flipbook textures
support texture "necromancy" with presets (like 3 above)

variants editor
flipbook editor and keyframe presets
boilerplate ghost for write missing json blocks along side with missing pngs

v0.1 - ghost for item textures
v0.2 - ghost for entity textures
v0.3 - ghost for particle? and ui?

feature in mind 
-version switcher for resource packs

## the rest is claude boilerplate ↓ (i havent read it so ill keep it for now)

A WPF starting point for: point it at a resource pack root, it reads
`textures/terrain_texture.json` (+ `blocks.json` if present), and shows every
declared texture alias as a tile — real thumbnail if the PNG exists, a
magenta/black ghost tile if it doesn't. Click a ghost to generate a stub PNG
at the correct path and immediately pop the native "Open With" dialog on it.

## Opening it

1. Install **Visual Studio 2022 Community** (free) with the
   **.NET desktop development** workload checked during install — that's
   what gives you WPF project support + the XAML designer.
2. Open `McTextureGhost.csproj` directly (File → Open → Project/Solution).
3. Press F5 (Debug) to run with Hot Reload active.

Requires the .NET 8 SDK — VS installer offers to grab it if it's missing.

## Two ghost scenarios

- **Declared but missing** - alias already exists in `terrain_texture.json`
  (and usually `blocks.json`), the PNG just isn't on disk yet. Click it,
  same as before: stub PNG generated, Open With pops instantly.
- **Nothing declared yet** - type a name in the search box that matches no
  existing alias, and a panel appears offering three presets:
  - **Plain block** - one texture, all faces. Writes one `texture_data`
    entry + one `blocks.json` entry.
  - **Per-face block** - creates `{name}_top`, `{name}_bottom`, `{name}_side`
    aliases and wires `blocks.json`'s per-face texture object to them. Only
    `_top` opens immediately; the other two now show up as ordinary
    "declared but missing" ghosts, ready to click individually.
  - **Flipbook (animated)** - writes the plain-block wiring plus an entry in
    `textures/flipbook_textures.json`, for Prismarine-style animated
    sprite-sheet textures.

  All three default the block ID to `custom:{name}` - go edit that
  namespace in `blocks.json` to match your actual pack once generated.

## What's wired up

- `Services/PackScanner.cs` — parses `terrain_texture.json`'s `texture_data`
  table, resolves each alias to a `.png` path, and cross-references
  `blocks.json` so each tile's tooltip shows which block(s) use it.
- `Services/PlaceholderImageFactory.cs` — writes a real 16x16 checker PNG
  the moment you click a ghost, since "Open With" needs a file to exist.
- `Services/JsonWriterService.cs` — the blank-project case: read-modify-write
  of `terrain_texture.json` / `blocks.json` / `flipbook_textures.json` for
  each of the three presets, preserving whatever's already in those files.
- `Services/OpenWithLauncher.cs` — fires the OS "Open With" picker via
  `rundll32 shell32.dll,OpenAs_RunDLL`, the standard trick for this
  (avoids P/Invoking the undocumented `SHOpenWithDialog` export directly).
- `ViewModels/MainViewModel.cs` — holds the tile list, search/ghost-only
  filtering, and a `FileSystemWatcher` on `textures/` so a ghost flips to
  "real" live the instant you save a file into place from your editor.
- `Views/MainWindow.xaml` — the tile grid itself (WrapPanel of buttons).

## Known rough edges (by design, this is a scaffold not a finished app)

- Texture **variations** (arrays of paths for one alias, e.g. randomized
  grass) only show/check the *first* path — worth extending if your pack
  leans on variation textures.
- No handling yet for `item_texture.json` (items) — same shape as
  `terrain_texture.json`, so `PackScanner` should be straightforward to
  extend or parameterize for a second tab.
- Stub PNGs are always 16x16 — if you use higher base resolutions,
  `PlaceholderImageFactory.CreateStub` takes a `size` param to wire up.

---

## Disclaimer
> **NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.**

