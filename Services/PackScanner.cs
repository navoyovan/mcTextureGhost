using System.IO;
using System.Text.Json;
using McTextureGhost.Models;
using McTextureGhost.Services.Scanning;

namespace McTextureGhost.Services;

/// <summary>
/// Reads terrain_texture.json (the alias -> path table) and blocks.json
/// (which aliases each block actually uses), then checks disk for each
/// resolved PNG. Anything missing on disk is a "ghost".
/// </summary>
public static class PackScanner
{
    public static List<TextureAlias> Scan(string packRoot, VanillaData? vanilla = null)
    {
        var terrainTexturePath = Path.Combine(packRoot, "textures", "terrain_texture.json");
        var itemTexturePath = Path.Combine(packRoot, "textures", "item_texture.json");
        var blocksJsonPath = Path.Combine(packRoot, "blocks.json");
        var flipbookJsonPath = Path.Combine(packRoot, "textures", "flipbook_textures.json");

        bool hasTerrain = File.Exists(terrainTexturePath);
        bool hasItems = File.Exists(itemTexturePath);
        var manifestPath = Path.Combine(packRoot, "manifest.json");
        var texturesDir = Path.Combine(packRoot, "textures");

        if (!Directory.Exists(packRoot))
            throw new DirectoryNotFoundException($"Resource pack directory does not exist: {packRoot}");

        var aliasUsage = File.Exists(blocksJsonPath)
            ? ParseBlocksJson(blocksJsonPath)
            : new Dictionary<string, List<BlockFaceUsage>>(StringComparer.OrdinalIgnoreCase);

        var flipbookCatalog = File.Exists(flipbookJsonPath)
            ? ParseFlipbookTextures(flipbookJsonPath)
            : new FlipbookCatalog();

        var existingFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        string? texturesDirNormalized = null;
        if (Directory.Exists(texturesDir))
        {
            try
            {
                texturesDirNormalized = Path.GetFullPath(texturesDir);
                foreach (var file in Directory.EnumerateFiles(texturesDir, "*", SearchOption.AllDirectories))
                {
                    existingFiles.Add(Path.GetFullPath(file));
                }
            }
            catch { }
        }

        var matchedFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var results = new List<TextureAlias>();

        // 1. Blocks from terrain_texture.json
        if (hasTerrain)
        {
            var aliasToData = ParseTextureAtlasJson(terrainTexturePath);
            foreach (var (alias, data) in aliasToData)
            {
                aliasUsage.TryGetValue(alias, out var blockFaces);
                var facesList = blockFaces ?? new List<BlockFaceUsage>();

                if (data.Entries.Count <= 1)
                {
                    var primary = data.Entries.FirstOrDefault();
                    if (primary is null) continue;

                    var (fullPath, finalRel, exists) = ResolveTexture(packRoot, primary.RawPath, existingFiles, texturesDirNormalized, "blocks");
                    if (exists) matchedFiles.Add(fullPath);

                    results.Add(new TextureAlias
                    {
                        Category = TextureCategory.Block,
                        Alias = alias,
                        DisplayName = alias,
                        RelativePath = finalRel,
                        FullPath = fullPath,
                        Status = exists ? TextureStatus.Ok : TextureStatus.Ghost,
                        BlockVariantIndex = null,
                        TotalBlockVariants = null,
                        TextureVariantIndex = null,
                        TotalTextureVariants = null,
                        Weight = primary.Weight,
                        Flipbook = flipbookCatalog.Find(alias, finalRel, null, null),
                        BlockFaces = facesList
                    });
                }
                else
                {
                    for (int i = 0; i < data.Entries.Count; i++)
                    {
                        var entry = data.Entries[i];
                        var (fullPath, finalRel, exists) = ResolveTexture(packRoot, entry.RawPath, existingFiles, texturesDirNormalized, "blocks");
                        if (exists) matchedFiles.Add(fullPath);

                        results.Add(new TextureAlias
                        {
                            Category = TextureCategory.Block,
                            Alias = alias,
                            DisplayName = alias,
                            RelativePath = finalRel,
                            FullPath = fullPath,
                            Status = exists ? TextureStatus.Ok : TextureStatus.Ghost,
                            BlockVariantIndex = entry.BlockVariantIndex,
                            TotalBlockVariants = entry.TotalBlockVariants,
                            TextureVariantIndex = entry.TextureVariantIndex,
                            TotalTextureVariants = entry.TotalTextureVariants,
                            Weight = entry.Weight,
                            Flipbook = flipbookCatalog.Find(alias, finalRel, entry.BlockVariantIndex, entry.TextureVariantIndex),
                            BlockFaces = facesList
                        });
                    }
                }
            }
        }

        // 2. Items from item_texture.json
        if (hasItems)
        {
            var itemToData = ParseTextureAtlasJson(itemTexturePath);
            foreach (var (alias, data) in itemToData)
            {
                if (data.Entries.Count <= 1)
                {
                    var primary = data.Entries.FirstOrDefault();
                    if (primary is null) continue;

                    var (fullPath, finalRel, exists) = ResolveTexture(packRoot, primary.RawPath, existingFiles, texturesDirNormalized, "items");
                    if (exists) matchedFiles.Add(fullPath);

                    results.Add(new TextureAlias
                    {
                        Category = TextureCategory.Item,
                        Alias = alias,
                        DisplayName = alias,
                        RelativePath = finalRel,
                        FullPath = fullPath,
                        Status = exists ? TextureStatus.Ok : TextureStatus.Ghost,
                        BlockVariantIndex = null,
                        TotalBlockVariants = null,
                        TextureVariantIndex = null,
                        TotalTextureVariants = null,
                        Weight = primary.Weight,
                        Flipbook = flipbookCatalog.Find(alias, finalRel, null, null),
                        BlockFaces = new List<BlockFaceUsage>()
                    });
                }
                else
                {
                    for (int i = 0; i < data.Entries.Count; i++)
                    {
                        var entry = data.Entries[i];
                        var (fullPath, finalRel, exists) = ResolveTexture(packRoot, entry.RawPath, existingFiles, texturesDirNormalized, "items");
                        if (exists) matchedFiles.Add(fullPath);

                        results.Add(new TextureAlias
                        {
                            Category = TextureCategory.Item,
                            Alias = alias,
                            DisplayName = alias,
                            RelativePath = finalRel,
                            FullPath = fullPath,
                            Status = exists ? TextureStatus.Ok : TextureStatus.Ghost,
                            BlockVariantIndex = null,
                            TotalBlockVariants = null,
                            TextureVariantIndex = entry.TextureVariantIndex,
                            TotalTextureVariants = entry.TotalTextureVariants,
                            Weight = entry.Weight,
                            Flipbook = flipbookCatalog.Find(alias, finalRel, null, entry.TextureVariantIndex),
                            BlockFaces = new List<BlockFaceUsage>()
                        });
                    }
                }
            }
        }

        // ─── 3. Discover and parse Entity & Attachable client definitions ─────────────
        var entityDir = Path.Combine(packRoot, "entity");
        var attachablesDir = Path.Combine(packRoot, "attachables");
        var packEntityFiles = new List<string>();

        if (Directory.Exists(entityDir))
        {
            try
            {
                packEntityFiles.AddRange(Directory.EnumerateFiles(entityDir, "*.json", SearchOption.AllDirectories));
            }
            catch { }
        }

        if (Directory.Exists(attachablesDir))
        {
            try
            {
                packEntityFiles.AddRange(Directory.EnumerateFiles(attachablesDir, "*.json", SearchOption.AllDirectories));
            }
            catch { }
        }

        foreach (var entFile in packEntityFiles)
        {
            var isAttachableFile = entFile.Contains("attachables", StringComparison.OrdinalIgnoreCase);
            var parsedEntities = ParseClientEntityDetails(entFile);
            foreach (var entityDetail in parsedEntities)
            {
                var entId = entityDetail.Identifier;
                var cleanEntityId = entId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase)
                    ? entId.Substring("minecraft:".Length)
                    : entId;

                var entityDisplayName = vanilla?.GetEntityDisplayName(entId) ?? cleanEntityId;

                foreach (var (slotKey, rawTexPath) in entityDetail.Textures)
                {
                    string? geoId = null;

                    // 1. Exact match on slotKey
                    if (entityDetail.Geometries.TryGetValue(slotKey, out var exactGeo))
                    {
                        geoId = exactGeo;
                    }
                    // 2. Baby variant matching: if slot key or texture path has "baby", map to "baby" geometry
                    else if ((slotKey.Contains("baby", StringComparison.OrdinalIgnoreCase) ||
                              rawTexPath.Contains("baby", StringComparison.OrdinalIgnoreCase)) &&
                             entityDetail.Geometries.TryGetValue("baby", out var babyGeo))
                    {
                        geoId = babyGeo;
                    }
                    // 3. State/variant matching: check if any geometry key is in slotKey (e.g. "cold", "warm", "charged", "sheared")
                    else
                    {
                        foreach (var (geoKey, gId) in entityDetail.Geometries)
                        {
                            if (geoKey.Equals("default", StringComparison.OrdinalIgnoreCase)) continue;
                            if (slotKey.Contains(geoKey, StringComparison.OrdinalIgnoreCase) ||
                                rawTexPath.Contains(geoKey, StringComparison.OrdinalIgnoreCase))
                            {
                                geoId = gId;
                                break;
                            }
                        }
                    }

                    // 4. Default geometry
                    if (string.IsNullOrEmpty(geoId))
                        entityDetail.Geometries.TryGetValue("default", out geoId);

                    // 5. Vanilla reference fallback (with slotKey and rawTexPath awareness)
                    if (string.IsNullOrEmpty(geoId) && vanilla != null)
                        geoId = vanilla.GetGeometryForEntity(entId, slotKey, rawTexPath);

                    var (fullPath, finalRel, exists) = ResolveTexture(packRoot, rawTexPath, existingFiles, texturesDirNormalized, "entity");
                    if (exists) matchedFiles.Add(fullPath);

                    results.Add(new TextureAlias
                    {
                        Category = TextureCategory.Entity,
                        EntityId = entId,
                        TextureKey = slotKey,
                        GeometryId = geoId,
                        IsAttachable = entityDetail.IsAttachable || isAttachableFile,
                        Alias = $"{cleanEntityId}:{slotKey}",
                        DisplayName = entityDisplayName,
                        RelativePath = finalRel,
                        FullPath = fullPath,
                        Status = exists ? TextureStatus.Ok : TextureStatus.Ghost,
                        VariantKind = VariantKind.None,
                        BlockFaces = new List<BlockFaceUsage>()
                    });
                }
            }
        }

        // ─── 4. Discover and parse *.texture_set.json companion files ─────────────────
        // PBR companion maps (metalness_emissive_roughness, heightmap/normal) referenced
        // inside *.texture_set.json files are valid texture components, not orphan files.
        foreach (var file in existingFiles)
        {
            if (file.EndsWith(".texture_set.json", StringComparison.OrdinalIgnoreCase))
            {
                matchedFiles.Add(file);
                var referencedPbrFiles = ParseTextureSetJson(file, packRoot, existingFiles, texturesDirNormalized);
                foreach (var pbrFile in referencedPbrFiles)
                {
                    matchedFiles.Add(pbrFile);
                }
            }
        }

        // ─── Discover Orphan files (on disk under textures/, but not declared in JSON) ──
        foreach (var file in existingFiles)
        {
            if (matchedFiles.Contains(file)) continue;

            var ext = Path.GetExtension(file).ToLowerInvariant();
            if (ext != ".png" && ext != ".tga") continue;

            var fileNameWithoutExt = Path.GetFileNameWithoutExtension(file);

            // Filter out conventional PBR map files (_mer, _mers, _normal, _heightmap)
            // if their companion texture set or base diffuse file is matched or present
            bool isPbrSuffix = fileNameWithoutExt.EndsWith("_mer", StringComparison.OrdinalIgnoreCase) ||
                               fileNameWithoutExt.EndsWith("_mers", StringComparison.OrdinalIgnoreCase) ||
                               fileNameWithoutExt.EndsWith("_normal", StringComparison.OrdinalIgnoreCase) ||
                               fileNameWithoutExt.EndsWith("_heightmap", StringComparison.OrdinalIgnoreCase);

            if (isPbrSuffix)
            {
                var dir = Path.GetDirectoryName(file) ?? "";
                string baseName = fileNameWithoutExt;
                if (baseName.EndsWith("_mers", StringComparison.OrdinalIgnoreCase))
                    baseName = baseName.Substring(0, baseName.Length - 5);
                else if (baseName.EndsWith("_mer", StringComparison.OrdinalIgnoreCase))
                    baseName = baseName.Substring(0, baseName.Length - 4);
                else if (baseName.EndsWith("_normal", StringComparison.OrdinalIgnoreCase))
                    baseName = baseName.Substring(0, baseName.Length - 7);
                else if (baseName.EndsWith("_heightmap", StringComparison.OrdinalIgnoreCase))
                    baseName = baseName.Substring(0, baseName.Length - 10);

                var companionTextureSet = Path.GetFullPath(Path.Combine(dir, $"{baseName}.texture_set.json"));
                var companionPng = Path.GetFullPath(Path.Combine(dir, $"{baseName}.png"));
                var companionTga = Path.GetFullPath(Path.Combine(dir, $"{baseName}.tga"));

                if (existingFiles.Contains(companionTextureSet) ||
                    existingFiles.Contains(companionPng) ||
                    existingFiles.Contains(companionTga) ||
                    matchedFiles.Contains(companionPng) ||
                    matchedFiles.Contains(companionTga))
                {
                    // This is a PBR companion layer for an existing texture, ignore as orphan
                    continue;
                }
            }

            // Filter out companion Atlas files (_atlas) if their companion item / base diffuse is matched or present
            bool isAtlasSuffix = fileNameWithoutExt.EndsWith("_atlas", StringComparison.OrdinalIgnoreCase);
            if (isAtlasSuffix)
            {
                var dir = Path.GetDirectoryName(file) ?? "";
                string baseName = fileNameWithoutExt.Substring(0, fileNameWithoutExt.Length - 6);

                var companionPng = Path.GetFullPath(Path.Combine(dir, $"{baseName}.png"));
                var companionTga = Path.GetFullPath(Path.Combine(dir, $"{baseName}.tga"));
                var companionItemPng = Path.GetFullPath(Path.Combine(dir, $"{baseName}_item.png"));
                var companionItemTga = Path.GetFullPath(Path.Combine(dir, $"{baseName}_item.tga"));

                // Compass / clock / watch / lodestone special pairings
                bool isSpecialAtlas = baseName.Equals("watch", StringComparison.OrdinalIgnoreCase) ||
                                     baseName.Equals("clock", StringComparison.OrdinalIgnoreCase) ||
                                     baseName.Equals("compass", StringComparison.OrdinalIgnoreCase) ||
                                     baseName.Equals("recovery_compass", StringComparison.OrdinalIgnoreCase) ||
                                     baseName.Equals("lodestonecompass", StringComparison.OrdinalIgnoreCase) ||
                                     baseName.Equals("lodestone_compass", StringComparison.OrdinalIgnoreCase);

                if (existingFiles.Contains(companionPng) ||
                    existingFiles.Contains(companionTga) ||
                    existingFiles.Contains(companionItemPng) ||
                    existingFiles.Contains(companionItemTga) ||
                    matchedFiles.Contains(companionPng) ||
                    matchedFiles.Contains(companionTga) ||
                    matchedFiles.Contains(companionItemPng) ||
                    matchedFiles.Contains(companionItemTga) ||
                    isSpecialAtlas)
                {
                    // This is an item atlas companion layer, ignore as unlinked orphan
                    continue;
                }
            }

            var relFromPack = file.StartsWith(packRoot, StringComparison.OrdinalIgnoreCase)
                ? file.Substring(packRoot.Length).TrimStart('/', '\\').Replace('\\', '/')
                : file.Replace('\\', '/');

            // Strip extension for RelativePath
            var relNoExt = relFromPack.Length > ext.Length
                ? relFromPack.Substring(0, relFromPack.Length - ext.Length)
                : relFromPack;

            bool isEntity = relFromPack.StartsWith("textures/entity/", StringComparison.OrdinalIgnoreCase) ||
                            relFromPack.StartsWith("entity/", StringComparison.OrdinalIgnoreCase);
            bool isItem = !isEntity && (relFromPack.StartsWith("textures/items/", StringComparison.OrdinalIgnoreCase) ||
                          relFromPack.StartsWith("items/", StringComparison.OrdinalIgnoreCase));
            bool isBlock = !isEntity && !isItem && (relFromPack.StartsWith("textures/blocks/", StringComparison.OrdinalIgnoreCase) ||
                          relFromPack.StartsWith("blocks/", StringComparison.OrdinalIgnoreCase));

            if (isEntity)
            {
                string? vanillaEntityId = null;
                string? vanillaEntitySlot = null;

                if (vanilla != null && vanilla.DeclaredEntityPaths.Contains(relNoExt))
                {
                    foreach (var (entId, texDict) in vanilla.EntityDefinitions)
                    {
                        foreach (var (slotKey, rawPath) in texDict)
                        {
                            if (VanillaDataService.NormalizeTexturePath(rawPath).Equals(relNoExt, StringComparison.OrdinalIgnoreCase))
                            {
                                vanillaEntityId = entId;
                                vanillaEntitySlot = slotKey;
                                break;
                            }
                        }
                        if (vanillaEntityId != null) break;
                    }
                }

                if (vanillaEntityId != null && vanillaEntitySlot != null)
                {
                    var cleanId = vanillaEntityId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase)
                        ? vanillaEntityId.Substring("minecraft:".Length)
                        : vanillaEntityId;

                    results.Add(new TextureAlias
                    {
                        Category = TextureCategory.Entity,
                        EntityId = vanillaEntityId,
                        TextureKey = vanillaEntitySlot,
                        GeometryId = vanilla?.GetGeometryForEntity(vanillaEntityId, vanillaEntitySlot, relNoExt),
                        Alias = $"{cleanId}:{vanillaEntitySlot}",
                        DisplayName = vanilla!.GetEntityDisplayName(vanillaEntityId),
                        RelativePath = relNoExt,
                        FullPath = file,
                        Status = TextureStatus.Ok,
                        VariantKind = VariantKind.None,
                        BlockFaces = new List<BlockFaceUsage>(),
                        IsUserDefined = false
                    });
                }
                else
                {
                    results.Add(new TextureAlias
                    {
                        Category = TextureCategory.Entity,
                        Alias = fileNameWithoutExt,
                        DisplayName = fileNameWithoutExt,
                        RelativePath = relNoExt,
                        FullPath = file,
                        Status = TextureStatus.Orphan,
                        VariantKind = VariantKind.None,
                        BlockFaces = new List<BlockFaceUsage>()
                    });
                }
            }
            else if (isItem)
            {
                if (!hasItems && vanilla == null) continue;

                string? vanillaItemAlias = null;
                if (vanilla != null && vanilla.DeclaredItemPaths.Contains(relNoExt))
                {
                    foreach (var (vAlias, vData) in vanilla.ItemTextures)
                    {
                        if (vData.Entries.Any(e => VanillaDataService.NormalizeTexturePath(e.RawPath).Equals(relNoExt, StringComparison.OrdinalIgnoreCase)))
                        {
                            vanillaItemAlias = vAlias;
                            break;
                        }
                    }
                }

                if (vanillaItemAlias != null)
                {
                    var vEntry = vanilla?.ItemTextures.TryGetValue(vanillaItemAlias, out var vData) == true
                        ? vData.Entries.FirstOrDefault(e => VanillaDataService.NormalizeTexturePath(e.RawPath).Equals(relNoExt, StringComparison.OrdinalIgnoreCase))
                        : null;

                    var vKind = VariantKind.None;
                    if (vEntry != null)
                    {
                        if (vEntry.BlockVariantIndex.HasValue && vEntry.TextureVariantIndex.HasValue) vKind = VariantKind.NestedVariant;
                        else if (vEntry.BlockVariantIndex.HasValue) vKind = VariantKind.BlockVariant;
                        else if (vEntry.TextureVariantIndex.HasValue) vKind = VariantKind.TextureVariant;
                    }

                    results.Add(new TextureAlias
                    {
                        Category = TextureCategory.Item,
                        Alias = vanillaItemAlias,
                        DisplayName = vanilla!.GetItemDisplayName(vanillaItemAlias),
                        RelativePath = relNoExt,
                        FullPath = file,
                        Status = TextureStatus.Ok,
                        VariantKind = vKind,
                        BlockVariantIndex = vEntry?.BlockVariantIndex,
                        TotalBlockVariants = vEntry?.TotalBlockVariants,
                        TextureVariantIndex = vEntry?.TextureVariantIndex,
                        TotalTextureVariants = vEntry?.TotalTextureVariants,
                        Weight = vEntry?.Weight,
                        Flipbook = flipbookCatalog.Find(vanillaItemAlias, relNoExt, vEntry?.BlockVariantIndex, vEntry?.TextureVariantIndex) ?? vanilla?.Flipbooks.Find(vanillaItemAlias, relNoExt, vEntry?.BlockVariantIndex, vEntry?.TextureVariantIndex),
                        BlockFaces = new List<BlockFaceUsage>()
                    });
                }
                else
                {
                    results.Add(new TextureAlias
                    {
                        Category = TextureCategory.Item,
                        Alias = fileNameWithoutExt,
                        DisplayName = fileNameWithoutExt,
                        RelativePath = relNoExt,
                        FullPath = file,
                        Status = TextureStatus.Orphan,
                        VariantKind = VariantKind.None,
                        Flipbook = flipbookCatalog.Find(fileNameWithoutExt, relNoExt, null, null),
                        BlockFaces = new List<BlockFaceUsage>()
                    });
                }
            }
            else
            {
                if (!hasTerrain && vanilla == null) continue;

                string? vanillaBlockAlias = null;
                List<BlockFaceUsage>? vanillaBlockFaces = null;
                TextureSlotEntry? matchedVanillaEntry = null;

                // Only match against vanilla declared block paths if the file is actually located in blocks directory or declared in vanilla
                if (isBlock && vanilla != null && vanilla.DeclaredBlockPaths.Contains(relNoExt))
                {
                    foreach (var (vAlias, vData) in vanilla.TerrainTextures)
                    {
                        var foundEntry = vData.Entries.FirstOrDefault(e => VanillaDataService.NormalizeTexturePath(e.RawPath).Equals(relNoExt, StringComparison.OrdinalIgnoreCase));
                        if (foundEntry != null)
                        {
                            vanillaBlockAlias = vAlias;
                            matchedVanillaEntry = foundEntry;
                            if (vanilla.BlockUsage.TryGetValue(vAlias, out var u))
                                vanillaBlockFaces = u;
                            break;
                        }
                    }
                }

                if (vanillaBlockAlias != null)
                {
                    var vKind = VariantKind.None;
                    if (matchedVanillaEntry != null)
                    {
                        if (matchedVanillaEntry.BlockVariantIndex.HasValue && matchedVanillaEntry.TextureVariantIndex.HasValue) vKind = VariantKind.NestedVariant;
                        else if (matchedVanillaEntry.BlockVariantIndex.HasValue) vKind = VariantKind.BlockVariant;
                        else if (matchedVanillaEntry.TextureVariantIndex.HasValue) vKind = VariantKind.TextureVariant;
                    }

                    results.Add(new TextureAlias
                    {
                        Category = TextureCategory.Block,
                        Alias = vanillaBlockAlias,
                        DisplayName = vanilla!.GetBlockDisplayName(vanillaBlockAlias),
                        RelativePath = relNoExt,
                        FullPath = file,
                        Status = TextureStatus.Ok,
                        IsUserDefined = false,
                        VariantKind = vKind,
                        BlockVariantIndex = matchedVanillaEntry?.BlockVariantIndex,
                        TotalBlockVariants = matchedVanillaEntry?.TotalBlockVariants,
                        TextureVariantIndex = matchedVanillaEntry?.TextureVariantIndex,
                        TotalTextureVariants = matchedVanillaEntry?.TotalTextureVariants,
                        Weight = matchedVanillaEntry?.Weight,
                        Flipbook = flipbookCatalog.Find(vanillaBlockAlias, relNoExt, matchedVanillaEntry?.BlockVariantIndex, matchedVanillaEntry?.TextureVariantIndex) ?? vanilla?.Flipbooks.Find(vanillaBlockAlias, relNoExt, matchedVanillaEntry?.BlockVariantIndex, matchedVanillaEntry?.TextureVariantIndex),
                        BlockFaces = vanillaBlockFaces ?? new List<BlockFaceUsage>()
                    });
                }
                else
                {
                    results.Add(new TextureAlias
                    {
                        Category = isBlock ? TextureCategory.Block : TextureCategory.Item,
                        Alias = fileNameWithoutExt,
                        DisplayName = fileNameWithoutExt,
                        RelativePath = relNoExt,
                        FullPath = file,
                        Status = TextureStatus.Orphan,
                        VariantKind = VariantKind.None,
                        Flipbook = flipbookCatalog.Find(fileNameWithoutExt, relNoExt, null, null),
                        BlockFaces = new List<BlockFaceUsage>()
                    });
                }
            }
        }

        var sorted = results.OrderBy(r => r.Category)
                            .ThenBy(r => r.Alias, StringComparer.OrdinalIgnoreCase)
                            .ThenBy(r => r.BlockVariantIndex ?? 0)
                            .ThenBy(r => r.TextureVariantIndex ?? 0)
                            .ToList();

        // Detect companion MERS/MER PBR texture for each tile
        foreach (var item in sorted)
        {
            if (string.IsNullOrEmpty(item.FullPath)) continue;

            var dir = Path.GetDirectoryName(item.FullPath) ?? "";
            var fnWithoutExt = Path.GetFileNameWithoutExtension(item.FullPath);

            // 1. Check companion texture_set.json
            var tsPath = Path.Combine(dir, $"{fnWithoutExt}.texture_set.json");
            if (existingFiles.Contains(tsPath))
            {
                var pbrFiles = ParseTextureSetJson(tsPath, packRoot, existingFiles, texturesDirNormalized);
                var mersFile = pbrFiles.FirstOrDefault(p =>
                {
                    var name = Path.GetFileNameWithoutExtension(p);
                    return name.EndsWith("_mers", StringComparison.OrdinalIgnoreCase) ||
                           name.EndsWith("_mer", StringComparison.OrdinalIgnoreCase);
                });
                if (mersFile != null)
                {
                    item.MersFullPath = mersFile;
                }
            }

            // 2. Direct naming convention check fallback (_mers.tga, _mers.png, _mer.tga, _mer.png)
            if (string.IsNullOrEmpty(item.MersFullPath))
            {
                var candidates = new[]
                {
                    Path.Combine(dir, $"{fnWithoutExt}_mers.tga"),
                    Path.Combine(dir, $"{fnWithoutExt}_mers.png"),
                    Path.Combine(dir, $"{fnWithoutExt}_mer.tga"),
                    Path.Combine(dir, $"{fnWithoutExt}_mer.png")
                };

                foreach (var cand in candidates)
                {
                    var fullCand = Path.GetFullPath(cand);
                    if (existingFiles.Contains(fullCand))
                    {
                        item.MersFullPath = fullCand;
                        break;
                    }
                }
            }

            // 3. Detect companion item atlas texture (_atlas.png, _atlas.tga, watch_atlas, compass_atlas, etc.)
            if (item.Category == TextureCategory.Item)
            {
                // A. Check from flipbook if mapped
                if (item.Flipbook != null && !string.IsNullOrEmpty(item.Flipbook.FlipbookTexture))
                {
                    var fbNorm = item.Flipbook.FlipbookTexture.Replace('\\', '/').TrimStart('/');
                    var fbCandPng = Path.Combine(packRoot, fbNorm + ".png");
                    var fbCandTga = Path.Combine(packRoot, fbNorm + ".tga");
                    var fbCandExact = Path.Combine(packRoot, fbNorm);
                    if (existingFiles.Contains(Path.GetFullPath(fbCandPng))) item.AtlasFullPath = Path.GetFullPath(fbCandPng);
                    else if (existingFiles.Contains(Path.GetFullPath(fbCandTga))) item.AtlasFullPath = Path.GetFullPath(fbCandTga);
                    else if (existingFiles.Contains(Path.GetFullPath(fbCandExact))) item.AtlasFullPath = Path.GetFullPath(fbCandExact);
                }

                // B. Check naming convention in same directory
                if (string.IsNullOrEmpty(item.AtlasFullPath))
                {
                    string baseName = fnWithoutExt;
                    if (baseName.EndsWith("_item", StringComparison.OrdinalIgnoreCase))
                        baseName = baseName.Substring(0, baseName.Length - 5);

                    var atlasCandidates = new List<string>
                    {
                        Path.Combine(dir, $"{baseName}_atlas.png"),
                        Path.Combine(dir, $"{baseName}_atlas.tga"),
                        Path.Combine(dir, $"{fnWithoutExt}_atlas.png"),
                        Path.Combine(dir, $"{fnWithoutExt}_atlas.tga")
                    };

                    if (baseName.Equals("clock", StringComparison.OrdinalIgnoreCase) || baseName.Equals("watch", StringComparison.OrdinalIgnoreCase))
                    {
                        atlasCandidates.Add(Path.Combine(dir, "watch_atlas.png"));
                        atlasCandidates.Add(Path.Combine(dir, "watch_atlas.tga"));
                        atlasCandidates.Add(Path.Combine(dir, "clock_atlas.png"));
                        atlasCandidates.Add(Path.Combine(dir, "clock_atlas.tga"));
                    }
                    else if (baseName.Equals("compass", StringComparison.OrdinalIgnoreCase))
                    {
                        atlasCandidates.Add(Path.Combine(dir, "compass_atlas.png"));
                        atlasCandidates.Add(Path.Combine(dir, "compass_atlas.tga"));
                    }
                    else if (baseName.Equals("recovery_compass", StringComparison.OrdinalIgnoreCase))
                    {
                        atlasCandidates.Add(Path.Combine(dir, "recovery_compass_atlas.png"));
                        atlasCandidates.Add(Path.Combine(dir, "recovery_compass_atlas.tga"));
                    }
                    else if (baseName.Equals("lodestonecompass", StringComparison.OrdinalIgnoreCase) || baseName.Equals("lodestone_compass", StringComparison.OrdinalIgnoreCase))
                    {
                        atlasCandidates.Add(Path.Combine(dir, "lodestonecompass_atlas.png"));
                        atlasCandidates.Add(Path.Combine(dir, "lodestonecompass_atlas.tga"));
                        atlasCandidates.Add(Path.Combine(dir, "lodestone_compass_atlas.png"));
                        atlasCandidates.Add(Path.Combine(dir, "lodestone_compass_atlas.tga"));
                    }

                    foreach (var cand in atlasCandidates)
                    {
                        var fullCand = Path.GetFullPath(cand);
                        if (existingFiles.Contains(fullCand))
                        {
                            item.AtlasFullPath = fullCand;
                            break;
                        }
                    }
                }
            }
        }

        // Warm up search index on background thread so UI thread never pauses during indexing
        foreach (var item in sorted)
            _ = item.SearchFilterKey;

        return sorted;
    }

    /// <summary>
    /// Resolves the absolute path and existence on disk for a texture, checking .png
    /// and fallback extensions (such as .tga), and handling paths with or without "textures/" prefix.
    /// </summary>
    internal static (string fullPath, string relativePath, bool exists) ResolveTexture(
        string packRoot,
        string rawRelativePath,
        HashSet<string> existingFiles,
        string? texturesDirNormalized,
        string defaultSubfolder = "blocks")
    {
        var cleanRel = rawRelativePath.Replace('\\', '/').TrimStart('/');
        bool hasExtension = Path.HasExtension(cleanRel);
        bool startsWithTextures = cleanRel.StartsWith("textures/", StringComparison.OrdinalIgnoreCase);

        var candidates = new List<string>();
        if (hasExtension)
        {
            candidates.Add(cleanRel);
            if (!startsWithTextures)
            {
                candidates.Add("textures/" + cleanRel);
                candidates.Add($"textures/{defaultSubfolder}/" + cleanRel);
            }
        }
        else
        {
            candidates.Add(cleanRel + ".png");
            candidates.Add(cleanRel + ".tga");
            if (!startsWithTextures)
            {
                candidates.Add("textures/" + cleanRel + ".png");
                candidates.Add("textures/" + cleanRel + ".tga");
                candidates.Add($"textures/{defaultSubfolder}/" + cleanRel + ".png");
                candidates.Add($"textures/{defaultSubfolder}/" + cleanRel + ".tga");
            }
        }

        foreach (var candidate in candidates)
        {
            var testFull = Path.GetFullPath(Path.Combine(packRoot, candidate.Replace('/', Path.DirectorySeparatorChar)));
            bool exists;
            if (texturesDirNormalized != null && testFull.StartsWith(texturesDirNormalized, StringComparison.OrdinalIgnoreCase))
            {
                exists = existingFiles.Contains(testFull);
            }
            else
            {
                exists = File.Exists(testFull);
            }

            if (exists)
            {
                var relWithoutExt = candidate.Substring(0, candidate.Length - Path.GetExtension(candidate).Length);
                return (testFull, relWithoutExt, true);
            }
        }

        string defaultRel;
        if (startsWithTextures)
            defaultRel = cleanRel;
        else if (cleanRel.StartsWith(defaultSubfolder + "/", StringComparison.OrdinalIgnoreCase))
            defaultRel = "textures/" + cleanRel;
        else
            defaultRel = $"textures/{defaultSubfolder}/" + cleanRel;

        string defaultFull = Path.GetFullPath(Path.Combine(packRoot, (defaultRel + ".png").Replace('/', Path.DirectorySeparatorChar)));
        return (defaultFull, defaultRel, false);
    }

    public static JsonDocumentOptions ScanDocOptions => ScanningJsonUtils.ScanDocOptions;

    internal static FileStream OpenSharedRead(string path) => ScanningJsonUtils.OpenSharedRead(path);

    public static Dictionary<string, ParsedAliasData> ParseTextureAtlasJson(string path) =>
        TextureAtlasParser.ParseTextureAtlasJson(path);

    public static Dictionary<string, ParsedAliasData> ParseTextureAtlasJson(JsonDocument doc) =>
        TextureAtlasParser.ParseTextureAtlasJson(doc);

    public static Dictionary<string, List<BlockFaceUsage>> ParseBlocksJson(string path) =>
        BlockDefinitionParser.ParseBlocksJson(path);

    public static Dictionary<string, List<BlockFaceUsage>> ParseBlocksJson(JsonDocument doc) =>
        BlockDefinitionParser.ParseBlocksJson(doc);

    public static IEnumerable<(string alias, string face)> ExtractAliasFaces(JsonElement texturesProp, bool isCarried = false) =>
        BlockDefinitionParser.ExtractAliasFaces(texturesProp, isCarried);

    public static FlipbookCatalog ParseFlipbookTextures(string path) =>
        TextureAtlasParser.ParseFlipbookTextures(path);

    public static FlipbookCatalog ParseFlipbookTextures(JsonDocument doc) =>
        TextureAtlasParser.ParseFlipbookTextures(doc);

    public static List<string> ParseTextureSetJson(
        string textureSetFilePath,
        string packRoot,
        HashSet<string> existingFiles,
        string? texturesDirNormalized) =>
        BlockDefinitionParser.ParseTextureSetJson(textureSetFilePath, packRoot, existingFiles, texturesDirNormalized);



    /// <summary>
    /// Constructs a 3-level hierarchical catalog tree (Block -> AliasGroup -> Leaves)
    /// merging user pack aliases with the vanilla reference catalog.
    /// </summary>
    public static List<BlockGroupNode> BuildCatalogTree(
        IList<TextureAlias> userAliases,
        VanillaData vanilla,
        string? packRoot) =>
        WorkspaceTreeBuilder.BuildCatalogTree(userAliases, vanilla, packRoot);

    /// <summary>
    /// Constructs the Block Workspace tree: a 4-tier hierarchy
    /// (Block → AliasGroup → FaceNode → CatalogLeaf) sourced exclusively from the user's pack.
    /// </summary>
    public static List<BlockGroupNode> BuildBlockWorkspaceTree(
        IList<TextureAlias> userAliases,
        VanillaData vanilla,
        string? packRoot) =>
        WorkspaceTreeBuilder.BuildBlockWorkspaceTree(userAliases, vanilla, packRoot);

    /// <summary>
    /// Builds the hierarchical 4-tier tree for the Entity Workspace view from all entity
    /// and attachable TextureAlias entries discovered in the active resource pack.
    /// </summary>
    public static List<BlockGroupNode> BuildEntityWorkspaceTree(
        IList<TextureAlias> userAliases,
        VanillaData? vanilla,
        string? packRoot) =>
        WorkspaceTreeBuilder.BuildEntityWorkspaceTree(userAliases, vanilla, packRoot);

    public static string SummarizeFaces(List<BlockFaceUsage> faces) =>
        BlockDefinitionParser.SummarizeFaces(faces);

    public static List<ClientEntityDetails> ParseClientEntityDetails(string filePath) =>
        EntityDefinitionParser.ParseClientEntityDetails(filePath);

    public static List<ClientEntityDetails> ParseClientEntityDetails(JsonDocument doc) =>
        EntityDefinitionParser.ParseClientEntityDetails(doc);

    public static Dictionary<string, Dictionary<string, string>> ParseClientEntityFile(string filePath) =>
        EntityDefinitionParser.ParseClientEntityFile(filePath);

    public static Dictionary<string, Dictionary<string, string>> ParseClientEntity(JsonDocument doc) =>
        EntityDefinitionParser.ParseClientEntity(doc);
}
