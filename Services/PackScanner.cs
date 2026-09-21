using System.IO;
using System.Text.Json;
using McTextureGhost.Models;

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
                PackScanner.TextureSlotEntry? matchedVanillaEntry = null;

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
    private static (string fullPath, string relativePath, bool exists) ResolveTexture(
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

    public static readonly JsonDocumentOptions ScanDocOptions = new()
    {
        AllowTrailingCommas = true,
        CommentHandling = JsonCommentHandling.Skip
    };

    public record TextureSlotEntry(
        string RawPath,
        int? BlockVariantIndex = null,
        int? TotalBlockVariants = null,
        int? TextureVariantIndex = null,
        int? TotalTextureVariants = null,
        int? Weight = null);

    public record ParsedAliasData(List<TextureSlotEntry> Entries);

    /// <summary>
    /// Returns alias -> ParsedAliasData from terrain_texture.json or item_texture.json (handling single strings,
    /// block variants "textures": [], random texture variations "variations": [], and nested variants).
    /// </summary>
    public static Dictionary<string, ParsedAliasData> ParseTextureAtlasJson(string path)
    {
        using var stream = File.OpenRead(path);
        using var doc = JsonDocument.Parse(stream, ScanDocOptions);
        return ParseTextureAtlasJson(doc);
    }

    public static Dictionary<string, ParsedAliasData> ParseTextureAtlasJson(JsonDocument doc)
    {
        var result = new Dictionary<string, ParsedAliasData>(StringComparer.OrdinalIgnoreCase);

        if (!doc.RootElement.TryGetProperty("texture_data", out var textureData))
            return result;

        foreach (var entry in textureData.EnumerateObject())
        {
            var alias = entry.Name;
            var rawEntries = new List<TextureSlotEntry>();

            List<JsonElement>? blockSlots = null;

            if (entry.Value.ValueKind == JsonValueKind.Object &&
                entry.Value.TryGetProperty("textures", out var texturesProp) &&
                texturesProp.ValueKind == JsonValueKind.Array)
            {
                blockSlots = texturesProp.EnumerateArray().ToList();
            }
            else if (entry.Value.ValueKind == JsonValueKind.Array)
            {
                blockSlots = entry.Value.EnumerateArray().ToList();
            }

            if (blockSlots != null)
            {
                int totalBlocks = blockSlots.Count;
                for (int b = 0; b < totalBlocks; b++)
                {
                    int? blockIdx = totalBlocks > 1 ? b + 1 : null;
                    int? totalB = totalBlocks > 1 ? totalBlocks : null;
                    var slotElement = blockSlots[b];

                    if (slotElement.ValueKind == JsonValueKind.String)
                    {
                        var str = slotElement.GetString()?.Trim();
                        if (!string.IsNullOrEmpty(str))
                            rawEntries.Add(new TextureSlotEntry(str, blockIdx, totalB, null, null, null));
                    }
                    else if (slotElement.ValueKind == JsonValueKind.Object)
                    {
                        if (slotElement.TryGetProperty("variations", out var varProp) &&
                            varProp.ValueKind == JsonValueKind.Array)
                        {
                            var varItems = varProp.EnumerateArray().ToList();
                            int totalVars = varItems.Count;
                            for (int v = 0; v < totalVars; v++)
                            {
                                int? texIdx = totalVars > 1 ? v + 1 : null;
                                int? totalV = totalVars > 1 ? totalVars : null;
                                var (vPath, weight) = ExtractVariationItem(varItems[v]);
                                if (!string.IsNullOrEmpty(vPath))
                                    rawEntries.Add(new TextureSlotEntry(vPath, blockIdx, totalB, texIdx, totalV, weight));
                            }
                        }
                        else if (slotElement.TryGetProperty("path", out var p) &&
                                 p.ValueKind == JsonValueKind.String)
                        {
                            var str = p.GetString()?.Trim();
                            if (!string.IsNullOrEmpty(str))
                                rawEntries.Add(new TextureSlotEntry(str, blockIdx, totalB, null, null, null));
                        }
                    }
                }
            }
            else if (entry.Value.ValueKind == JsonValueKind.Object)
            {
                if (entry.Value.TryGetProperty("textures", out var singleTexturesProp))
                {
                    if (singleTexturesProp.ValueKind == JsonValueKind.String)
                    {
                        var str = singleTexturesProp.GetString()?.Trim();
                        if (!string.IsNullOrEmpty(str))
                            rawEntries.Add(new TextureSlotEntry(str, null, null, null, null, null));
                    }
                    else if (singleTexturesProp.ValueKind == JsonValueKind.Object)
                    {
                        if (singleTexturesProp.TryGetProperty("variations", out var varProp) &&
                            varProp.ValueKind == JsonValueKind.Array)
                        {
                            var varItems = varProp.EnumerateArray().ToList();
                            int totalVars = varItems.Count;
                            for (int v = 0; v < totalVars; v++)
                            {
                                int? texIdx = totalVars > 1 ? v + 1 : null;
                                int? totalV = totalVars > 1 ? totalVars : null;
                                var (vPath, weight) = ExtractVariationItem(varItems[v]);
                                if (!string.IsNullOrEmpty(vPath))
                                    rawEntries.Add(new TextureSlotEntry(vPath, null, null, texIdx, totalV, weight));
                            }
                        }
                        else if (singleTexturesProp.TryGetProperty("path", out var p) &&
                                 p.ValueKind == JsonValueKind.String)
                        {
                            var str = p.GetString()?.Trim();
                            if (!string.IsNullOrEmpty(str))
                                rawEntries.Add(new TextureSlotEntry(str, null, null, null, null, null));
                        }
                    }
                }
                else if (entry.Value.TryGetProperty("variations", out var directVarProp) &&
                         directVarProp.ValueKind == JsonValueKind.Array)
                {
                    var varItems = directVarProp.EnumerateArray().ToList();
                    int totalVars = varItems.Count;
                    for (int v = 0; v < totalVars; v++)
                    {
                        int? texIdx = totalVars > 1 ? v + 1 : null;
                        int? totalV = totalVars > 1 ? totalVars : null;
                        var (vPath, weight) = ExtractVariationItem(varItems[v]);
                        if (!string.IsNullOrEmpty(vPath))
                            rawEntries.Add(new TextureSlotEntry(vPath, null, null, texIdx, totalV, weight));
                    }
                }
                else if (entry.Value.TryGetProperty("path", out var directPathProp) &&
                         directPathProp.ValueKind == JsonValueKind.String)
                {
                    var str = directPathProp.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(str))
                        rawEntries.Add(new TextureSlotEntry(str, null, null, null, null, null));
                }
            }
            else if (entry.Value.ValueKind == JsonValueKind.String)
            {
                var str = entry.Value.GetString()?.Trim();
                if (!string.IsNullOrEmpty(str))
                    rawEntries.Add(new TextureSlotEntry(str, null, null, null, null, null));
            }

            // Deduplicate distinct paths, preserving first entry
            var distinctEntries = new List<TextureSlotEntry>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var e in rawEntries)
            {
                if (seen.Add(e.RawPath))
                    distinctEntries.Add(e);
            }

            if (distinctEntries.Count > 0)
            {
                if (distinctEntries.Count <= 1)
                {
                    var single = distinctEntries[0];
                    distinctEntries[0] = new TextureSlotEntry(single.RawPath, null, null, null, null, single.Weight);
                }

                result[alias] = new ParsedAliasData(distinctEntries);
            }
        }

        return result;
    }

    private static (string? path, int? weight) ExtractVariationItem(JsonElement item)
    {
        if (item.ValueKind == JsonValueKind.String)
            return (item.GetString()?.Trim(), null);

        if (item.ValueKind == JsonValueKind.Object)
        {
            string? pStr = null;
            if (item.TryGetProperty("path", out var p) && p.ValueKind == JsonValueKind.String)
                pStr = p.GetString()?.Trim();

            int? weight = null;
            if (item.TryGetProperty("weight", out var wProp) && wProp.TryGetInt32(out var w))
                weight = w;

            return (pStr, weight);
        }

        return (null, null);
    }

    /// <summary>
    /// Returns alias -> list of BlockFaceUsage (block ID + face name) from blocks.json,
    /// covering both uniform blocks ("textures": "alias") and per-face blocks ("up", "down", etc.).
    /// </summary>
    public static Dictionary<string, List<BlockFaceUsage>> ParseBlocksJson(string path)
    {
        using var stream = File.OpenRead(path);
        using var doc = JsonDocument.Parse(stream, ScanDocOptions);
        return ParseBlocksJson(doc);
    }

    public static Dictionary<string, List<BlockFaceUsage>> ParseBlocksJson(JsonDocument doc)
    {
        var usage = new Dictionary<string, List<BlockFaceUsage>>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in doc.RootElement.EnumerateObject())
        {
            if (entry.Name == "format_version") continue;
            if (entry.Value.ValueKind != JsonValueKind.Object) continue;
            var blockId = entry.Name;

            if (entry.Value.TryGetProperty("textures", out var texturesProp))
            {
                foreach (var (alias, face) in ExtractAliasFaces(texturesProp))
                {
                    if (!usage.TryGetValue(alias, out var list))
                        usage[alias] = list = new List<BlockFaceUsage>();
                    list.Add(new BlockFaceUsage(blockId, face));
                }
            }

            if (entry.Value.TryGetProperty("carried_textures", out var carriedProp))
            {
                foreach (var (alias, face) in ExtractAliasFaces(carriedProp, isCarried: true))
                {
                    if (!usage.TryGetValue(alias, out var list))
                        usage[alias] = list = new List<BlockFaceUsage>();
                    list.Add(new BlockFaceUsage(blockId, face));
                }
            }
        }

        return usage;
    }

    public static IEnumerable<(string alias, string face)> ExtractAliasFaces(JsonElement texturesProp, bool isCarried = false)
    {
        switch (texturesProp.ValueKind)
        {
            case JsonValueKind.String:
                var s = texturesProp.GetString();
                if (!string.IsNullOrEmpty(s))
                    yield return (s, isCarried ? "carried" : "all");
                break;

            case JsonValueKind.Array:
                foreach (var item in texturesProp.EnumerateArray())
                {
                    if (item.ValueKind == JsonValueKind.String)
                    {
                        var arrAlias = item.GetString();
                        if (!string.IsNullOrEmpty(arrAlias))
                            yield return (arrAlias, isCarried ? "carried" : "all");
                    }
                    else if (item.ValueKind == JsonValueKind.Object || item.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var innerFace in ExtractAliasFaces(item, isCarried))
                        {
                            yield return innerFace;
                        }
                    }
                }
                break;

            case JsonValueKind.Object:
                foreach (var face in texturesProp.EnumerateObject())
                {
                    if (face.Value.ValueKind == JsonValueKind.String)
                    {
                        var alias = face.Value.GetString();
                        if (!string.IsNullOrEmpty(alias))
                        {
                            var faceName = isCarried ? $"carried_{face.Name}" : face.Name;
                            yield return (alias, faceName);
                        }
                    }
                    else if (face.Value.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var item in face.Value.EnumerateArray())
                        {
                            if (item.ValueKind == JsonValueKind.String)
                            {
                                var arrAlias = item.GetString();
                                if (!string.IsNullOrEmpty(arrAlias))
                                {
                                    var faceName = isCarried ? $"carried_{face.Name}" : face.Name;
                                    yield return (arrAlias, faceName);
                                }
                            }
                            else if (item.ValueKind == JsonValueKind.Object || item.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var inner in ExtractAliasFaces(item, isCarried))
                                {
                                    yield return (inner.alias, isCarried ? $"carried_{face.Name}" : face.Name);
                                }
                            }
                        }
                    }
                    else if (face.Value.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var innerFace in ExtractAliasFaces(face.Value, isCarried))
                        {
                            var faceName = isCarried ? $"carried_{face.Name}" : face.Name;
                            yield return (innerFace.alias, faceName);
                        }
                    }
                }
                break;
        }
    }

    /// <summary>
    /// Multi-index catalog for flipbook definitions ensuring exact variant resolution.
    /// </summary>
    public sealed class FlipbookCatalog
    {
        public Dictionary<string, FlipbookDefinition> ByPath { get; } = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, FlipbookDefinition> ByFileName { get; } = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, FlipbookDefinition> ByAtlasVariant { get; } = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, FlipbookDefinition> ByAtlas { get; } = new(StringComparer.OrdinalIgnoreCase);

        public bool IsEmpty => ByPath.Count == 0 && ByAtlas.Count == 0;

        public FlipbookDefinition? Find(string aliasName, string relPath, int? blockVariantIdx, int? texVariantIdx)
        {
            if (IsEmpty) return null;

            // 1. Highest priority: exact normalized path without extension (e.g. "textures/blocks/soul_sand/soul_sand2")
            var norm = relPath.Replace('\\', '/').TrimStart('/');
            if (norm.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
                norm = norm.Substring(0, norm.Length - 4);

            if (ByPath.TryGetValue(norm, out var fb)) return fb;

            // 2. Second priority: filename without extension (e.g. "soul_sand2")
            var fileName = Path.GetFileNameWithoutExtension(relPath);
            if (!string.IsNullOrEmpty(fileName) && ByFileName.TryGetValue(fileName, out fb)) return fb;

            // 3. Third priority: atlas_tile with variant slot index (0-based and 1-based)
            if (blockVariantIdx.HasValue)
            {
                if (ByAtlasVariant.TryGetValue($"{aliasName}#{blockVariantIdx.Value - 1}", out fb)) return fb;
                if (ByAtlasVariant.TryGetValue($"{aliasName}#{blockVariantIdx.Value}", out fb)) return fb;
            }
            if (texVariantIdx.HasValue)
            {
                if (ByAtlasVariant.TryGetValue($"{aliasName}#{texVariantIdx.Value - 1}", out fb)) return fb;
                if (ByAtlasVariant.TryGetValue($"{aliasName}#{texVariantIdx.Value}", out fb)) return fb;
            }

            // 4. Lowest priority: generic atlas_tile
            if (ByAtlas.TryGetValue(aliasName, out fb)) return fb;

            return null;
        }
    }

    /// <summary>
    /// Parses textures/flipbook_textures.json and returns a multi-index FlipbookCatalog.
    /// </summary>
    public static FlipbookCatalog ParseFlipbookTextures(string path)
    {
        if (!File.Exists(path)) return new FlipbookCatalog();

        try
        {
            using var stream = File.OpenRead(path);
            using var doc = JsonDocument.Parse(stream, ScanDocOptions);
            return ParseFlipbookTextures(doc);
        }
        catch { return new FlipbookCatalog(); }
    }

    public static FlipbookCatalog ParseFlipbookTextures(JsonDocument doc)
    {
        var catalog = new FlipbookCatalog();
        if (doc.RootElement.ValueKind != JsonValueKind.Array)
            return catalog;

        foreach (var item in doc.RootElement.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;

            string? texturePath = null;
            if (item.TryGetProperty("flipbook_texture", out var ftProp) && ftProp.ValueKind == JsonValueKind.String)
                texturePath = ftProp.GetString();

            string? atlasTile = null;
            if (item.TryGetProperty("atlas_tile", out var atProp) && atProp.ValueKind == JsonValueKind.String)
                atlasTile = atProp.GetString();

            int? atlasIndex = null;
            if (item.TryGetProperty("atlas_index", out var aiProp) && aiProp.ValueKind == JsonValueKind.Number && aiProp.TryGetInt32(out var ai))
                atlasIndex = ai;

            int? atlasTileVariant = null;
            if (item.TryGetProperty("atlas_tile_variant", out var atvProp) && atvProp.ValueKind == JsonValueKind.Number && atvProp.TryGetInt32(out var atv))
                atlasTileVariant = atv;

            int ticksPerFrame = 1;
            if (item.TryGetProperty("ticks_per_frame", out var tpfProp))
            {
                if (tpfProp.ValueKind == JsonValueKind.Number && tpfProp.TryGetInt32(out var tpf) && tpf > 0)
                    ticksPerFrame = tpf;
            }

            int[]? frames = null;
            if (item.TryGetProperty("frames", out var framesProp) && framesProp.ValueKind == JsonValueKind.Array)
            {
                var frameList = new List<int>();
                foreach (var f in framesProp.EnumerateArray())
                {
                    if (f.ValueKind == JsonValueKind.Number && f.TryGetInt32(out var fIdx))
                        frameList.Add(fIdx);
                }
                if (frameList.Count > 0)
                    frames = frameList.ToArray();
            }

            bool blendFrames = true;
            if (item.TryGetProperty("blend_frames", out var blendProp) &&
                (blendProp.ValueKind == JsonValueKind.True || blendProp.ValueKind == JsonValueKind.False))
            {
                blendFrames = blendProp.GetBoolean();
            }

            int replicate = 1;
            if (item.TryGetProperty("replicate", out var repProp) && repProp.ValueKind == JsonValueKind.Number && repProp.TryGetInt32(out var rep) && rep > 0)
            {
                replicate = rep;
            }

            if (string.IsNullOrWhiteSpace(texturePath) && string.IsNullOrWhiteSpace(atlasTile))
                continue;

            var def = new FlipbookDefinition(
                FlipbookTexture: texturePath ?? "",
                AtlasTile: atlasTile ?? "",
                TicksPerFrame: ticksPerFrame,
                Frames: frames,
                BlendFrames: blendFrames,
                AtlasIndex: atlasIndex,
                AtlasTileVariant: atlasTileVariant,
                Replicate: replicate
            );

            if (!string.IsNullOrWhiteSpace(texturePath))
            {
                var norm = texturePath.Replace('\\', '/').TrimStart('/');
                if (norm.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
                    norm = norm.Substring(0, norm.Length - 4);

                catalog.ByPath[norm] = def;
                var fn = Path.GetFileName(norm);
                if (!string.IsNullOrEmpty(fn))
                    catalog.ByFileName[fn] = def;
            }

            if (!string.IsNullOrWhiteSpace(atlasTile))
            {
                if (atlasTileVariant.HasValue)
                    catalog.ByAtlasVariant[$"{atlasTile}#{atlasTileVariant.Value}"] = def;
                else
                    catalog.ByAtlas.TryAdd(atlasTile, def);
            }
        }

        return catalog;
    }

    /// <summary>
    /// Parses a Bedrock *.texture_set.json file and extracts absolute filepaths
    /// referenced by color, metalness_emissive_roughness, and heightmap.
    /// </summary>
    public static List<string> ParseTextureSetJson(
        string textureSetFilePath,
        string packRoot,
        HashSet<string> existingFiles,
        string? texturesDirNormalized)
    {
        var resolvedPaths = new List<string>();
        if (!File.Exists(textureSetFilePath)) return resolvedPaths;

        try
        {
            using var stream = File.OpenRead(textureSetFilePath);
            using var doc = JsonDocument.Parse(stream, ScanDocOptions);

            if (!doc.RootElement.TryGetProperty("minecraft:texture_set", out var textureSet) ||
                textureSet.ValueKind != JsonValueKind.Object)
            {
                return resolvedPaths;
            }

            var dir = Path.GetDirectoryName(textureSetFilePath) ?? packRoot;

            // Enumerate all properties in minecraft:texture_set dynamically (covers color,
            // metalness_emissive_roughness, metalness_emissive_roughness_subsurface, heightmap, normal, etc.)
            foreach (var prop in textureSet.EnumerateObject())
            {
                if (prop.Value.ValueKind == JsonValueKind.String)
                {
                    var relOrName = prop.Value.GetString();
                    if (string.IsNullOrWhiteSpace(relOrName)) continue;

                    var normName = relOrName.Trim().Replace('\\', '/').TrimStart('/');

                    // Check relative to current directory of the texture_set.json file
                    var candidatesInDir = new List<string>();
                    if (Path.HasExtension(normName))
                    {
                        candidatesInDir.Add(Path.GetFullPath(Path.Combine(dir, normName)));
                    }
                    else
                    {
                        candidatesInDir.Add(Path.GetFullPath(Path.Combine(dir, normName + ".tga")));
                        candidatesInDir.Add(Path.GetFullPath(Path.Combine(dir, normName + ".png")));
                    }

                    bool matchedInDir = false;
                    foreach (var cand in candidatesInDir)
                    {
                        if (existingFiles.Contains(cand))
                        {
                            resolvedPaths.Add(cand);
                            matchedInDir = true;
                            break;
                        }
                    }

                    if (matchedInDir) continue;

                    // Try resolving via general ResolveTexture relative to packRoot (.png or .tga)
                    var (fullPath, _, exists) = ResolveTexture(packRoot, normName, existingFiles, texturesDirNormalized, "blocks");
                    if (exists)
                    {
                        resolvedPaths.Add(fullPath);
                    }
                }
            }
        }
        catch { }

        return resolvedPaths;
    }



    /// <summary>
    /// Constructs a 3-level hierarchical catalog tree (Block -> AliasGroup -> Leaves)
    /// merging user pack aliases with the vanilla reference catalog.
    /// </summary>
    public static List<BlockGroupNode> BuildCatalogTree(
        IList<TextureAlias> userAliases,
        VanillaData vanilla,
        string? packRoot)
    {
        var blocksTree = new List<BlockGroupNode>();
        var itemsTree = new List<BlockGroupNode>();

        // Index user aliases by Category + Alias
        var userBlockAliases = userAliases
            .Where(a => a.Category == TextureCategory.Block && a.Status != TextureStatus.NoEntry)
            .GroupBy(a => a.Alias, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var userItemAliases = userAliases
            .Where(a => a.Category == TextureCategory.Item && a.Status != TextureStatus.NoEntry)
            .GroupBy(a => a.Alias, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var userBlocksJsonPath = packRoot != null ? Path.Combine(packRoot, "blocks.json") : null;
        var userBlocksMap = (userBlocksJsonPath != null && File.Exists(userBlocksJsonPath))
            ? ParseBlocksJson(userBlocksJsonPath)
            : new Dictionary<string, List<BlockFaceUsage>>(StringComparer.OrdinalIgnoreCase);

        // Also parse user blockId -> aliases from user's blocks.json
        var userBlockToAliases = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        if (userBlocksJsonPath != null && File.Exists(userBlocksJsonPath))
        {
            try
            {
                using var stream = File.OpenRead(userBlocksJsonPath);
                using var doc = JsonDocument.Parse(stream, ScanDocOptions);
                foreach (var entry in doc.RootElement.EnumerateObject())
                {
                    if (entry.Name == "format_version" || entry.Value.ValueKind != JsonValueKind.Object) continue;
                    var aliasSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    if (entry.Value.TryGetProperty("textures", out var tp))
                    {
                        foreach (var (a, _) in ExtractAliasFaces(tp)) aliasSet.Add(a);
                    }
                    if (entry.Value.TryGetProperty("carried_textures", out var cp))
                    {
                        foreach (var (a, _) in ExtractAliasFaces(cp, isCarried: true)) aliasSet.Add(a);
                    }
                    userBlockToAliases[entry.Name] = aliasSet.ToList();
                }
            }
            catch { }
        }

        var trackedUserAliases = new HashSet<TextureAlias>();

        // ── 1. BLOCKS ──────────────────────────────────────────────────────────
        var allBlockIds = new HashSet<string>(vanilla.RawBlocksJson.Keys, StringComparer.OrdinalIgnoreCase);
        foreach (var uBlockId in userBlockToAliases.Keys)
            allBlockIds.Add(uBlockId);

        foreach (var blockId in allBlockIds)
        {
            List<string>? aliasesForBlock = null;
            if (userBlockToAliases.TryGetValue(blockId, out var uAliases) && uAliases.Count > 0)
                aliasesForBlock = uAliases;
            else if (vanilla.BlockToAliases.TryGetValue(blockId, out var vAliases) && vAliases.Count > 0)
                aliasesForBlock = vAliases;

            if (aliasesForBlock == null || aliasesForBlock.Count == 0)
                continue;

            var blockNode = new BlockGroupNode
            {
                BlockId = blockId,
                DisplayName = vanilla.GetBlockDisplayName(blockId),
                Category = TextureCategory.Block
            };

            foreach (var alias in aliasesForBlock)
            {
                var aliasNode = new AliasGroupNode
                {
                    Alias = alias,
                    Category = TextureCategory.Block,
                    ParentBlock = blockNode
                };

                var faces = userBlocksMap.TryGetValue(alias, out var uf) ? uf :
                            (vanilla.BlockUsage.TryGetValue(alias, out var vf) ? vf : new List<BlockFaceUsage>());
                aliasNode.FaceSummary = SummarizeFaces(faces);

                if (vanilla.TerrainTextures.TryGetValue(alias, out var vData))
                {
                    var userTileList = userBlockAliases.TryGetValue(alias, out var ut) ? ut : new List<TextureAlias>();
                    foreach (var tile in userTileList) trackedUserAliases.Add(tile);

                    for (int i = 0; i < vData.Entries.Count; i++)
                    {
                        var entry = vData.Entries[i];
                        var normRaw = VanillaDataService.NormalizeTexturePath(entry.RawPath);

                        // Find matching user tile by relative path or variant index
                        var matchedUserTile = userTileList.FirstOrDefault(t =>
                            VanillaDataService.NormalizeTexturePath(t.RelativePath).Equals(normRaw, StringComparison.OrdinalIgnoreCase) ||
                            (t.BlockVariantIndex.HasValue && entry.BlockVariantIndex.HasValue && t.BlockVariantIndex == entry.BlockVariantIndex &&
                             t.TextureVariantIndex == entry.TextureVariantIndex));

                        if (matchedUserTile != null)
                        {
                            var leafStatus = matchedUserTile.Status switch
                            {
                                TextureStatus.Ok      => CatalogEntryStatus.Ok,
                                TextureStatus.Ghost   => CatalogEntryStatus.Ghost,
                                TextureStatus.Orphan  => CatalogEntryStatus.Orphan,
                                _                     => CatalogEntryStatus.Ok
                            };

                            var leaf = new CatalogLeaf
                            {
                                Alias = alias,
                                DisplayName = matchedUserTile.DisplayName,
                                RelativePath = matchedUserTile.RelativePath,
                                FullPath = matchedUserTile.FullPath,
                                Category = TextureCategory.Block,
                                Status = leafStatus,
                                TextureAlias = matchedUserTile,
                                VariantKind = matchedUserTile.VariantKind,
                                BlockVariantIndex = matchedUserTile.BlockVariantIndex ?? entry.BlockVariantIndex,
                                TotalBlockVariants = matchedUserTile.TotalBlockVariants ?? entry.TotalBlockVariants,
                                TextureVariantIndex = matchedUserTile.TextureVariantIndex ?? entry.TextureVariantIndex,
                                TotalTextureVariants = matchedUserTile.TotalTextureVariants ?? entry.TotalTextureVariants,
                                Weight = matchedUserTile.Weight ?? entry.Weight,
                                SubtitleCaption = matchedUserTile.SubtitleCaption,
                                PrimaryFaceBadgeText = matchedUserTile.PrimaryFaceBadgeText,
                                Flipbook = matchedUserTile.Flipbook ?? vanilla.Flipbooks.Find(alias, entry.RawPath, entry.BlockVariantIndex, entry.TextureVariantIndex)
                            };
                            aliasNode.Leaves.Add(leaf);
                        }
                        else
                        {
                            var caption = entry.TotalBlockVariants.HasValue
                                ? $"block state {entry.BlockVariantIndex}/{entry.TotalBlockVariants}"
                                : (entry.TotalTextureVariants.HasValue
                                    ? $"tex {entry.TextureVariantIndex}/{entry.TotalTextureVariants}"
                                    : "vanilla default");

                            var leaf = new CatalogLeaf
                            {
                                Alias = alias,
                                DisplayName = alias,
                                RelativePath = entry.RawPath,
                                FullPath = packRoot != null ? Path.Combine(packRoot, (entry.RawPath + ".png").Replace('/', Path.DirectorySeparatorChar)) : entry.RawPath,
                                Category = TextureCategory.Block,
                                Status = CatalogEntryStatus.NotAdded,
                                TextureAlias = null,
                                VariantKind = entry.TotalBlockVariants.HasValue ? VariantKind.BlockVariant : (entry.TotalTextureVariants.HasValue ? VariantKind.TextureVariant : VariantKind.None),
                                BlockVariantIndex = entry.BlockVariantIndex,
                                TotalBlockVariants = entry.TotalBlockVariants,
                                TextureVariantIndex = entry.TextureVariantIndex,
                                TotalTextureVariants = entry.TotalTextureVariants,
                                Weight = entry.Weight,
                                SubtitleCaption = caption,
                                PrimaryFaceBadgeText = aliasNode.FaceSummary,
                                Flipbook = vanilla.Flipbooks.Find(alias, entry.RawPath, entry.BlockVariantIndex, entry.TextureVariantIndex)
                            };
                            aliasNode.Leaves.Add(leaf);
                        }
                    }
                }
                else if (userBlockAliases.TryGetValue(alias, out var userTiles))
                {
                    foreach (var tile in userTiles)
                    {
                        trackedUserAliases.Add(tile);
                        var leafStatus = tile.Status switch
                        {
                            TextureStatus.Ok      => CatalogEntryStatus.Ok,
                            TextureStatus.Ghost   => CatalogEntryStatus.Ghost,
                            TextureStatus.Orphan  => CatalogEntryStatus.Orphan,
                            _                     => CatalogEntryStatus.Ok
                        };

                        var leaf = new CatalogLeaf
                        {
                            Alias = alias,
                            DisplayName = tile.DisplayName,
                            RelativePath = tile.RelativePath,
                            FullPath = tile.FullPath,
                            Category = TextureCategory.Block,
                            Status = leafStatus,
                            TextureAlias = tile,
                            VariantKind = tile.VariantKind,
                            BlockVariantIndex = tile.BlockVariantIndex,
                            TotalBlockVariants = tile.TotalBlockVariants,
                            TextureVariantIndex = tile.TextureVariantIndex,
                            TotalTextureVariants = tile.TotalTextureVariants,
                            Weight = tile.Weight,
                            SubtitleCaption = tile.SubtitleCaption,
                            PrimaryFaceBadgeText = tile.PrimaryFaceBadgeText,
                            Flipbook = tile.Flipbook
                        };
                        aliasNode.Leaves.Add(leaf);
                    }
                }
                else
                {
                    var leaf = new CatalogLeaf
                    {
                        Alias = alias,
                        DisplayName = alias,
                        RelativePath = $"textures/blocks/{alias}",
                        FullPath = packRoot != null ? Path.Combine(packRoot, "textures", "blocks", $"{alias}.png") : alias,
                        Category = TextureCategory.Block,
                        Status = CatalogEntryStatus.Ghost,
                        TextureAlias = null,
                        SubtitleCaption = "missing declaration",
                        PrimaryFaceBadgeText = aliasNode.FaceSummary
                    };
                    aliasNode.Leaves.Add(leaf);
                }

                aliasNode.NotifyCountsChanged();
                blockNode.AliasGroups.Add(aliasNode);
            }

            blockNode.NotifyCountsChanged();
            blocksTree.Add(blockNode);
        }

        // ── 2. ITEMS ───────────────────────────────────────────────────────────
        var allItemAliases = new HashSet<string>(vanilla.ItemTextures.Keys, StringComparer.OrdinalIgnoreCase);
        foreach (var uItem in userItemAliases.Keys)
            allItemAliases.Add(uItem);

        foreach (var itemAlias in allItemAliases)
        {
            var itemBlockNode = new BlockGroupNode
            {
                BlockId = itemAlias,
                DisplayName = vanilla.GetItemDisplayName(itemAlias),
                Category = TextureCategory.Item
            };

            var aliasNode = new AliasGroupNode
            {
                Alias = itemAlias,
                Category = TextureCategory.Item,
                ParentBlock = itemBlockNode
            };

            if (vanilla.ItemTextures.TryGetValue(itemAlias, out var vData))
            {
                var userTileList = userItemAliases.TryGetValue(itemAlias, out var ut) ? ut : new List<TextureAlias>();
                foreach (var tile in userTileList) trackedUserAliases.Add(tile);

                for (int i = 0; i < vData.Entries.Count; i++)
                {
                    var entry = vData.Entries[i];
                    var normRaw = VanillaDataService.NormalizeTexturePath(entry.RawPath);

                    var matchedUserTile = userTileList.FirstOrDefault(t =>
                        VanillaDataService.NormalizeTexturePath(t.RelativePath).Equals(normRaw, StringComparison.OrdinalIgnoreCase) ||
                        (t.TextureVariantIndex.HasValue && entry.TextureVariantIndex.HasValue && t.TextureVariantIndex == entry.TextureVariantIndex));

                    if (matchedUserTile != null)
                    {
                        var leafStatus = matchedUserTile.Status switch
                        {
                            TextureStatus.Ok      => CatalogEntryStatus.Ok,
                            TextureStatus.Ghost   => CatalogEntryStatus.Ghost,
                            TextureStatus.Orphan  => CatalogEntryStatus.Orphan,
                            _                     => CatalogEntryStatus.Ok
                        };

                        var leaf = new CatalogLeaf
                        {
                            Alias = itemAlias,
                            DisplayName = matchedUserTile.DisplayName,
                            RelativePath = matchedUserTile.RelativePath,
                            FullPath = matchedUserTile.FullPath,
                            Category = TextureCategory.Item,
                            Status = leafStatus,
                            TextureAlias = matchedUserTile,
                            VariantKind = matchedUserTile.VariantKind,
                            TextureVariantIndex = matchedUserTile.TextureVariantIndex ?? entry.TextureVariantIndex,
                            TotalTextureVariants = matchedUserTile.TotalTextureVariants ?? entry.TotalTextureVariants,
                            Weight = matchedUserTile.Weight ?? entry.Weight,
                            SubtitleCaption = matchedUserTile.SubtitleCaption,
                            Flipbook = matchedUserTile.Flipbook ?? vanilla.Flipbooks.Find(itemAlias, entry.RawPath, null, entry.TextureVariantIndex)
                        };
                        aliasNode.Leaves.Add(leaf);
                    }
                    else
                    {
                        var caption = entry.TotalTextureVariants.HasValue
                            ? $"var {entry.TextureVariantIndex}/{entry.TotalTextureVariants}"
                            : "vanilla default";

                        var leaf = new CatalogLeaf
                        {
                            Alias = itemAlias,
                            DisplayName = itemAlias,
                            RelativePath = entry.RawPath,
                            FullPath = packRoot != null ? Path.Combine(packRoot, (entry.RawPath + ".png").Replace('/', Path.DirectorySeparatorChar)) : entry.RawPath,
                            Category = TextureCategory.Item,
                            Status = CatalogEntryStatus.NotAdded,
                            TextureAlias = null,
                            VariantKind = entry.TotalTextureVariants.HasValue ? VariantKind.TextureVariant : VariantKind.None,
                            TextureVariantIndex = entry.TextureVariantIndex,
                            TotalTextureVariants = entry.TotalTextureVariants,
                            Weight = entry.Weight,
                            SubtitleCaption = caption,
                            Flipbook = vanilla.Flipbooks.Find(itemAlias, entry.RawPath, null, entry.TextureVariantIndex)
                        };
                        aliasNode.Leaves.Add(leaf);
                    }
                }
            }
            else if (userItemAliases.TryGetValue(itemAlias, out var userTiles))
            {
                foreach (var tile in userTiles)
                {
                    trackedUserAliases.Add(tile);
                    var leafStatus = tile.Status switch
                    {
                        TextureStatus.Ok      => CatalogEntryStatus.Ok,
                        TextureStatus.Ghost   => CatalogEntryStatus.Ghost,
                        TextureStatus.Orphan  => CatalogEntryStatus.Orphan,
                        _                     => CatalogEntryStatus.Ok
                    };

                    var leaf = new CatalogLeaf
                    {
                        Alias = itemAlias,
                        DisplayName = tile.DisplayName,
                        RelativePath = tile.RelativePath,
                        FullPath = tile.FullPath,
                        Category = TextureCategory.Item,
                        Status = leafStatus,
                        TextureAlias = tile,
                        SubtitleCaption = tile.SubtitleCaption,
                        Flipbook = tile.Flipbook
                    };
                    aliasNode.Leaves.Add(leaf);
                }
            }

            aliasNode.NotifyCountsChanged();
            itemBlockNode.AliasGroups.Add(aliasNode);
            itemBlockNode.NotifyCountsChanged();
            itemsTree.Add(itemBlockNode);
        }

        // ── 3. ENTITIES ────────────────────────────────────────────────────────
        var entitiesTree = new List<BlockGroupNode>();
        var userEntityAliases = userAliases
            .Where(a => a.Category == TextureCategory.Entity && a.Status != TextureStatus.NoEntry)
            .GroupBy(a => !string.IsNullOrEmpty(a.EntityId) ? a.EntityId : (a.Alias.Contains(':') ? a.Alias.Substring(0, a.Alias.IndexOf(':')) : a.Alias), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var allEntityIds = new HashSet<string>(vanilla.EntityDefinitions.Keys, StringComparer.OrdinalIgnoreCase);
        foreach (var uKey in userEntityAliases.Keys)
        {
            if (!string.IsNullOrEmpty(uKey))
            {
                if (!uKey.Contains(':') || uKey.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase))
                {
                    allEntityIds.Add(uKey);
                }
            }
        }

        foreach (var entityId in allEntityIds.OrderBy(id => vanilla.GetEntityDisplayName(id), StringComparer.OrdinalIgnoreCase))
        {
            var cleanId = entityId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase)
                ? entityId.Substring(10)
                : entityId;

            // Skip obsolete legacy duplicates if clean modern exists
            if (entityId.Contains(".v1.0", StringComparison.OrdinalIgnoreCase) || entityId.Contains(".v1.8", StringComparison.OrdinalIgnoreCase))
                continue;

            var entityNode = new BlockGroupNode
            {
                BlockId = entityId,
                DisplayName = vanilla.GetEntityDisplayName(entityId),
                Category = TextureCategory.Entity
            };

            var declaredSlots = vanilla.EntityDefinitions.TryGetValue(entityId, out var vSlots)
                ? vSlots
                : (vanilla.EntityDefinitions.TryGetValue(cleanId, out var vCleanSlots) ? vCleanSlots : new Dictionary<string, string>());

            // Get any user tiles for this entity
            userEntityAliases.TryGetValue(entityId, out var entityUserTiles);
            if (entityUserTiles == null)
            {
                userEntityAliases.TryGetValue(cleanId, out entityUserTiles);
            }
            if (entityUserTiles == null)
            {
                userEntityAliases.TryGetValue($"minecraft:{cleanId}", out entityUserTiles);
            }

            // Group slots by geometry/baby
            var slotItems = new List<(string SlotKey, string RawTexPath, string? GeoId, string? GeoKey, bool IsBaby, bool IsAttachable)>();
            foreach (var (slotKey, rawTexPath) in declaredSlots)
            {
                var geoId = vanilla.GetGeometryForEntity(entityId, slotKey, rawTexPath);
                var geoKey = vanilla.GetGeometryKeyForEntity(entityId, geoId);
                var isAttachable = vanilla.RawClientEntityRelPath.TryGetValue(entityId, out var rp) && rp.StartsWith("attachables", StringComparison.OrdinalIgnoreCase);
                var isBaby = (geoId != null && geoId.Contains("baby", StringComparison.OrdinalIgnoreCase)) || slotKey.Contains("baby", StringComparison.OrdinalIgnoreCase);
                slotItems.Add((slotKey, rawTexPath, geoId, geoKey, isBaby, isAttachable));
            }

            // If declaredSlots is empty but user has tiles for this entity
            if (slotItems.Count == 0 && entityUserTiles != null)
            {
                foreach (var tile in entityUserTiles)
                {
                    var isBaby = (tile.GeometryId != null && tile.GeometryId.Contains("baby", StringComparison.OrdinalIgnoreCase)) || (tile.TextureKey != null && tile.TextureKey.Contains("baby", StringComparison.OrdinalIgnoreCase));
                    var geoKey = vanilla.GetGeometryKeyForEntity(entityId, tile.GeometryId);
                    slotItems.Add((tile.TextureKey ?? "default", tile.RelativePath, tile.GeometryId, geoKey, isBaby, tile.IsAttachable));
                }
            }

            var groupedSlots = slotItems
                .GroupBy(s => s.GeoKey ?? (s.IsBaby ? "baby" : "default"), StringComparer.OrdinalIgnoreCase)
                .OrderBy(g => g.Key.Equals("baby", StringComparison.OrdinalIgnoreCase) ? 1 : 0);

            foreach (var group in groupedSlots)
            {
                var first = group.FirstOrDefault();
                var geoId = first.GeoId;
                var isBaby = group.Any(s => s.IsBaby);
                var isAttachable = group.Any(s => s.IsAttachable);

                string slotAlias;
                // Normalize geo key: if it equals the entity name itself, call it "default"
                var geoKeyLabel = group.Key.Equals(cleanId, StringComparison.OrdinalIgnoreCase) ? "default" : group.Key;
                if (groupedSlots.Count() > 1)
                {
                    slotAlias = $"{cleanId} ({geoKeyLabel})";
                }
                else
                {
                    slotAlias = cleanId;
                }


                var aliasNode = new AliasGroupNode
                {
                    Alias = slotAlias,
                    FaceSummary = isAttachable ? "attachable" : (isBaby ? "baby" : "entity"),
                    GeometryId = geoId,
                    IsAttachable = isAttachable,
                    Category = TextureCategory.Entity,
                    ParentBlock = entityNode
                };

                foreach (var (slotKey, rawTexPath, _, _, _, _) in group)
                {
                    var normTexPath = VanillaDataService.NormalizeTexturePath(rawTexPath);
                    var fullTexPath = normTexPath + ".png";

                    var matchingUserTile = entityUserTiles?.FirstOrDefault(a =>
                        string.Equals(a.RelativePath, fullTexPath, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(a.RelativePath, normTexPath, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(a.TextureKey, slotKey, StringComparison.OrdinalIgnoreCase));

                    if (matchingUserTile != null)
                    {
                        trackedUserAliases.Add(matchingUserTile);
                        var leaf = new CatalogLeaf
                        {
                            Alias = slotAlias,
                            DisplayName = matchingUserTile.DisplayName,
                            RelativePath = matchingUserTile.RelativePath,
                            FullPath = matchingUserTile.FullPath,
                            Category = TextureCategory.Entity,
                            Status = matchingUserTile.Status switch
                            {
                                TextureStatus.Ok => CatalogEntryStatus.Ok,
                                TextureStatus.Ghost => CatalogEntryStatus.Ghost,
                                _ => CatalogEntryStatus.Orphan
                            },
                            TextureAlias = matchingUserTile,
                            EntityId = entityId,
                            TextureKey = slotKey,
                            GeometryId = geoId,
                            IsAttachable = isAttachable,
                            SubtitleCaption = geoKeyLabel
                        };
                        aliasNode.Leaves.Add(leaf);
                    }
                    else
                    {
                        var userDiskPath = packRoot != null ? Path.Combine(packRoot, fullTexPath.Replace('/', Path.DirectorySeparatorChar)) : fullTexPath;
                        bool fileExistsOnDisk = packRoot != null && File.Exists(userDiskPath);

                        var leaf = new CatalogLeaf
                        {
                            Alias = slotAlias,
                            DisplayName = Path.GetFileName(normTexPath),
                            RelativePath = fullTexPath,
                            FullPath = userDiskPath,
                            Category = TextureCategory.Entity,
                            Status = fileExistsOnDisk ? CatalogEntryStatus.Ok : CatalogEntryStatus.NotAdded,
                            TextureAlias = null,
                            EntityId = entityId,
                            TextureKey = slotKey,
                            GeometryId = geoId,
                            IsAttachable = isAttachable,
                            SubtitleCaption = geoKeyLabel
                        };
                        aliasNode.Leaves.Add(leaf);
                    }
                }

                aliasNode.NotifyCountsChanged();
                entityNode.AliasGroups.Add(aliasNode);
            }

            entityNode.NotifyCountsChanged();
            entitiesTree.Add(entityNode);
        }

        // ── 4. UNCATEGORIZED ───────────────────────────────────────────────────
        var untracked = userAliases
            .Where(a => a.Status != TextureStatus.NoEntry && !trackedUserAliases.Contains(a))
            .ToList();

        BlockGroupNode? uncategorizedNode = null;
        if (untracked.Count > 0)
        {
            uncategorizedNode = new BlockGroupNode
            {
                BlockId = "uncategorized",
                DisplayName = "(Uncategorized)",
                Category = TextureCategory.Block
            };

            foreach (var grp in untracked.GroupBy(u => u.Alias, StringComparer.OrdinalIgnoreCase))
            {
                var aliasNode = new AliasGroupNode
                {
                    Alias = grp.Key,
                    Category = grp.First().Category,
                    ParentBlock = uncategorizedNode
                };

                foreach (var tile in grp)
                {
                    var leaf = new CatalogLeaf
                    {
                        Alias = tile.Alias,
                        DisplayName = tile.DisplayName,
                        RelativePath = tile.RelativePath,
                        FullPath = tile.FullPath,
                        Category = tile.Category,
                        Status = tile.Status switch
                        {
                            TextureStatus.Ok     => CatalogEntryStatus.Ok,
                            TextureStatus.Ghost  => CatalogEntryStatus.Ghost,
                            _                    => CatalogEntryStatus.Orphan
                        },
                        TextureAlias = tile,
                        SubtitleCaption = tile.SubtitleCaption,
                        PrimaryFaceBadgeText = tile.PrimaryFaceBadgeText,
                        Flipbook = tile.Flipbook
                    };
                    aliasNode.Leaves.Add(leaf);
                }

                aliasNode.NotifyCountsChanged();
                uncategorizedNode.AliasGroups.Add(aliasNode);
            }

            uncategorizedNode.NotifyCountsChanged();
        }

        var result = new List<BlockGroupNode>();
        result.AddRange(blocksTree.OrderBy(b => b.DisplayName, StringComparer.OrdinalIgnoreCase));
        result.AddRange(itemsTree.OrderBy(b => b.DisplayName, StringComparer.OrdinalIgnoreCase));
        result.AddRange(entitiesTree.OrderBy(b => b.DisplayName, StringComparer.OrdinalIgnoreCase));
        if (uncategorizedNode != null)
            result.Add(uncategorizedNode);

        return result;
    }

    /// <summary>
    /// Constructs the Block Workspace tree: a 4-tier hierarchy
    /// (Block → AliasGroup → FaceNode → CatalogLeaf) sourced exclusively from the
    /// user's pack. Vanilla-only blocks are excluded — the Catalog dialog covers those.
    /// Uncategorized aliases (in terrain_texture.json but not claimed by any block) are
    /// surfaced at the bottom with Orphan status so the user can see what needs wiring.
    /// </summary>
    public static List<BlockGroupNode> BuildBlockWorkspaceTree(
        IList<TextureAlias> userAliases,
        VanillaData vanilla,
        string? packRoot)
    {
        // ── Index user aliases ─────────────────────────────────────────────────
        var userBlockAliases = userAliases
            .Where(a => a.Category == TextureCategory.Block && a.Status != TextureStatus.NoEntry && a.Status != TextureStatus.Orphan)
            .GroupBy(a => a.Alias, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        // ── Parse user blocks.json for block→alias and block→face mappings ────
        var userBlocksJsonPath = packRoot != null ? Path.Combine(packRoot, "blocks.json") : null;
        var userBlocksMap = (userBlocksJsonPath != null && File.Exists(userBlocksJsonPath))
            ? ParseBlocksJson(userBlocksJsonPath)
            : new Dictionary<string, List<BlockFaceUsage>>(StringComparer.OrdinalIgnoreCase);

        var userBlockToAliases = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        if (userBlocksJsonPath != null && File.Exists(userBlocksJsonPath))
        {
            try
            {
                using var stream = File.OpenRead(userBlocksJsonPath);
                using var doc = JsonDocument.Parse(stream, ScanDocOptions);
                foreach (var entry in doc.RootElement.EnumerateObject())
                {
                    if (entry.Name == "format_version" || entry.Value.ValueKind != JsonValueKind.Object) continue;
                    var aliasSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    if (entry.Value.TryGetProperty("textures", out var tp))
                        foreach (var (a, _) in ExtractAliasFaces(tp)) aliasSet.Add(a);
                    if (entry.Value.TryGetProperty("carried_textures", out var cp))
                        foreach (var (a, _) in ExtractAliasFaces(cp, isCarried: true)) aliasSet.Add(a);
                    userBlockToAliases[entry.Name] = aliasSet.ToList();
                }
            }
            catch { }
        }

        var trackedAliases = new HashSet<TextureAlias>();
        var result = new List<BlockGroupNode>();

        // ── Build one BlockGroupNode per block ID in user's blocks.json ────────
        foreach (var blockId in userBlockToAliases.Keys.OrderBy(k => k, StringComparer.OrdinalIgnoreCase))
        {
            if (!userBlockToAliases.TryGetValue(blockId, out var aliasesForBlock) || aliasesForBlock.Count == 0)
                continue;

            var blockNode = new BlockGroupNode
            {
                BlockId = blockId,
                DisplayName = vanilla.GetBlockDisplayName(blockId),
                Category = TextureCategory.Block,
                IsUserDefined = true
            };

            foreach (var alias in aliasesForBlock)
            {
                var aliasNode = new AliasGroupNode
                {
                    Alias = alias,
                    Category = TextureCategory.Block,
                    ParentBlock = blockNode
                };

                // Collect the face usages for this alias from user's blocks.json,
                // falling back to vanilla if the user hasn't overridden.
                var facesForAlias = userBlocksMap.TryGetValue(alias, out var uf) ? uf :
                                    (vanilla.BlockUsage.TryGetValue(alias, out var vf) ? vf : new List<BlockFaceUsage>());
                aliasNode.FaceSummary = SummarizeFaces(facesForAlias);

                // Determine the distinct face labels for this alias under this block.
                // Face labels are normalised to lowercase; "all" is the fallback when
                // no directional faces exist.
                var faceLabels = facesForAlias
                    .Where(f => f.BlockId.Equals(blockId, StringComparison.OrdinalIgnoreCase))
                    .Select(f => f.Face.ToLowerInvariant())
                    .Distinct()
                    .ToList();

                if (faceLabels.Count == 0)
                    faceLabels.Add("all");

                // Build a FaceNode per distinct face label.
                var faceNodeMap = new Dictionary<string, FaceNode>(StringComparer.OrdinalIgnoreCase);
                foreach (var faceLabel in faceLabels)
                {
                    var faceNode = new FaceNode { FaceLabel = faceLabel, IsExpanded = true };
                    faceNodeMap[faceLabel] = faceNode;
                    aliasNode.FaceNodes.Add(faceNode);
                }

                // Populate leaves into their FaceNodes.
                if (userBlockAliases.TryGetValue(alias, out var userTiles))
                {
                    foreach (var tile in userTiles)
                    {
                        trackedAliases.Add(tile);

                        var leafStatus = tile.Status switch
                        {
                            TextureStatus.Ok     => CatalogEntryStatus.Ok,
                            TextureStatus.Ghost  => CatalogEntryStatus.Ghost,
                            TextureStatus.Orphan => CatalogEntryStatus.Orphan,
                            _                    => CatalogEntryStatus.Ok
                        };

                        // Assign leaf to all face nodes for this alias under this block.
                        foreach (var faceNode in aliasNode.FaceNodes)
                        {
                            var faceLeaf = new CatalogLeaf
                            {
                                Alias        = alias,
                                DisplayName  = tile.DisplayName,
                                RelativePath = tile.RelativePath,
                                FullPath     = tile.FullPath,
                                Category     = TextureCategory.Block,
                                Status       = leafStatus,
                                TextureAlias = tile,
                                VariantKind  = tile.VariantKind,
                                BlockVariantIndex = tile.BlockVariantIndex,
                                TotalBlockVariants = tile.TotalBlockVariants,
                                TextureVariantIndex = tile.TextureVariantIndex,
                                TotalTextureVariants = tile.TotalTextureVariants,
                                Weight       = tile.Weight,
                                SubtitleCaption   = tile.SubtitleCaption,
                                PrimaryFaceBadgeText = faceNode.FaceLabel,
                                Flipbook     = tile.Flipbook
                            };

                            faceNode.Leaves.Add(faceLeaf);
                        }

                        // Also keep Leaves in sync so the alias node counts work.
                        var aliasLeaf = new CatalogLeaf
                        {
                            Alias        = alias,
                            DisplayName  = tile.DisplayName,
                            RelativePath = tile.RelativePath,
                            FullPath     = tile.FullPath,
                            Category     = TextureCategory.Block,
                            Status       = leafStatus,
                            TextureAlias = tile,
                            VariantKind  = tile.VariantKind,
                            BlockVariantIndex = tile.BlockVariantIndex,
                            TotalBlockVariants = tile.TotalBlockVariants,
                            TextureVariantIndex = tile.TextureVariantIndex,
                            TotalTextureVariants = tile.TotalTextureVariants,
                            Weight       = tile.Weight,
                            SubtitleCaption   = tile.SubtitleCaption,
                            PrimaryFaceBadgeText = tile.PrimaryFaceBadgeText,
                            Flipbook     = tile.Flipbook
                        };
                        aliasNode.Leaves.Add(aliasLeaf);
                    }
                }
                else
                {
                    // No user entry for this alias → show as Ghost leaf under each face.
                    foreach (var faceNode in aliasNode.FaceNodes)
                    {
                        var leaf = new CatalogLeaf
                        {
                            Alias        = alias,
                            DisplayName  = alias,
                            RelativePath = $"textures/blocks/{alias}",
                            FullPath     = packRoot != null
                                ? Path.Combine(packRoot, "textures", "blocks", $"{alias}.png")
                                : alias,
                            Category     = TextureCategory.Block,
                            Status       = CatalogEntryStatus.Ghost,
                            TextureAlias = null,
                            SubtitleCaption      = "missing texture",
                            PrimaryFaceBadgeText = faceNode.FaceLabel
                        };
                        faceNode.Leaves.Add(leaf);
                        aliasNode.Leaves.Add(leaf);
                    }
                }

                aliasNode.NotifyCountsChanged();
                blockNode.AliasGroups.Add(aliasNode);
            }

            blockNode.NotifyCountsChanged();
            result.Add(blockNode);
        }

        // ── 2. Fallback to vanilla blocks.json for aliases present in terrain_texture.json ──
        var untracked = userAliases
            .Where(a => a.Category == TextureCategory.Block
                     && a.Status != TextureStatus.NoEntry
                     && !trackedAliases.Contains(a))
            .ToList();

        if (untracked.Count > 0)
        {
            var vanillaBlockGroups = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
            var remainingUntracked = new List<TextureAlias>();

            foreach (var aliasItem in untracked)
            {
                // Orphan files on disk are not declared in terrain_texture.json;
                // do not match them against vanilla blocks simply by filename.
                if (aliasItem.Status == TextureStatus.Orphan)
                {
                    remainingUntracked.Add(aliasItem);
                    continue;
                }

                var aliasName = aliasItem.Alias;
                if (vanilla.BlockUsage.TryGetValue(aliasName, out var vFaces) && vFaces.Count > 0)
                {
                    var blockIds = vFaces.Select(f => f.BlockId).Distinct(StringComparer.OrdinalIgnoreCase);
                    foreach (var bId in blockIds)
                    {
                        if (!vanillaBlockGroups.TryGetValue(bId, out var aliasList))
                            vanillaBlockGroups[bId] = aliasList = new List<string>();
                        if (!aliasList.Contains(aliasName, StringComparer.OrdinalIgnoreCase))
                            aliasList.Add(aliasName);
                    }
                }
                else
                {
                    var matchingBlocks = vanilla.BlockToAliases
                        .Where(kvp => kvp.Value.Contains(aliasName, StringComparer.OrdinalIgnoreCase))
                        .Select(kvp => kvp.Key)
                        .ToList();

                    if (matchingBlocks.Count > 0)
                    {
                        foreach (var bId in matchingBlocks)
                        {
                            if (!vanillaBlockGroups.TryGetValue(bId, out var aliasList))
                                vanillaBlockGroups[bId] = aliasList = new List<string>();
                            if (!aliasList.Contains(aliasName, StringComparer.OrdinalIgnoreCase))
                                aliasList.Add(aliasName);
                        }
                    }
                    else
                    {
                        remainingUntracked.Add(aliasItem);
                    }
                }
            }

            foreach (var (blockId, aliasesForBlock) in vanillaBlockGroups.OrderBy(k => k.Key, StringComparer.OrdinalIgnoreCase))
            {
                var blockNode = new BlockGroupNode
                {
                    BlockId = blockId,
                    DisplayName = vanilla.GetBlockDisplayName(blockId),
                    Category = TextureCategory.Block,
                    IsUserDefined = false
                };

                foreach (var alias in aliasesForBlock)
                {
                    var aliasNode = new AliasGroupNode
                    {
                        Alias = alias,
                        Category = TextureCategory.Block,
                        ParentBlock = blockNode
                    };

                    var facesForAlias = vanilla.BlockUsage.TryGetValue(alias, out var vf) ? vf : new List<BlockFaceUsage>();
                    aliasNode.FaceSummary = SummarizeFaces(facesForAlias);

                    var faceLabels = facesForAlias
                        .Where(f => f.BlockId.Equals(blockId, StringComparison.OrdinalIgnoreCase))
                        .Select(f => f.Face.ToLowerInvariant())
                        .Distinct()
                        .ToList();

                    if (faceLabels.Count == 0)
                        faceLabels.Add("all");

                    var faceNodeMap = new Dictionary<string, FaceNode>(StringComparer.OrdinalIgnoreCase);
                    foreach (var faceLabel in faceLabels)
                    {
                        var faceNode = new FaceNode { FaceLabel = faceLabel, IsExpanded = true };
                        faceNodeMap[faceLabel] = faceNode;
                        aliasNode.FaceNodes.Add(faceNode);
                    }

                    if (userBlockAliases.TryGetValue(alias, out var userTiles))
                    {
                        foreach (var tile in userTiles)
                        {
                            trackedAliases.Add(tile);
                            var leafStatus = tile.Status switch
                            {
                                TextureStatus.Ok     => CatalogEntryStatus.Ok,
                                TextureStatus.Ghost  => CatalogEntryStatus.Ghost,
                                TextureStatus.Orphan => CatalogEntryStatus.Orphan,
                                _                    => CatalogEntryStatus.Ok
                            };

                            var targetFaceLabels = tile.BlockFaces
                                .Where(f => f.BlockId.Equals(blockId, StringComparison.OrdinalIgnoreCase))
                                .Select(f => f.Face.ToLowerInvariant())
                                .Distinct()
                                .ToList();

                            var targetNodes = aliasNode.FaceNodes
                                .Where(fn => targetFaceLabels.Count == 0 || targetFaceLabels.Contains(fn.FaceLabel.ToLowerInvariant()) || fn.FaceLabel == "all")
                                .ToList();

                            if (targetNodes.Count == 0)
                                targetNodes = aliasNode.FaceNodes.ToList();

                            foreach (var faceNode in targetNodes)
                            {
                                var faceLeaf = new CatalogLeaf
                                {
                                    Alias = alias,
                                    DisplayName = tile.DisplayName,
                                    RelativePath = tile.RelativePath,
                                    FullPath = tile.FullPath,
                                    Category = TextureCategory.Block,
                                    Status = leafStatus,
                                    TextureAlias = tile,
                                    VariantKind = tile.VariantKind,
                                    BlockVariantIndex = tile.BlockVariantIndex,
                                    TotalBlockVariants = tile.TotalBlockVariants,
                                    TextureVariantIndex = tile.TextureVariantIndex,
                                    TotalTextureVariants = tile.TotalTextureVariants,
                                    Weight = tile.Weight,
                                    SubtitleCaption = tile.SubtitleCaption,
                                    PrimaryFaceBadgeText = faceNode.FaceLabel,
                                    Flipbook = tile.Flipbook
                                };
                                faceNode.Leaves.Add(faceLeaf);
                            }

                            var aliasLeaf = new CatalogLeaf
                            {
                                Alias = alias,
                                DisplayName = tile.DisplayName,
                                RelativePath = tile.RelativePath,
                                FullPath = tile.FullPath,
                                Category = TextureCategory.Block,
                                Status = leafStatus,
                                TextureAlias = tile,
                                VariantKind = tile.VariantKind,
                                BlockVariantIndex = tile.BlockVariantIndex,
                                TotalBlockVariants = tile.TotalBlockVariants,
                                TextureVariantIndex = tile.TextureVariantIndex,
                                TotalTextureVariants = tile.TotalTextureVariants,
                                Weight = tile.Weight,
                                SubtitleCaption = tile.SubtitleCaption,
                                PrimaryFaceBadgeText = tile.PrimaryFaceBadgeText,
                                Flipbook = tile.Flipbook
                            };
                            aliasNode.Leaves.Add(aliasLeaf);
                        }
                    }

                    aliasNode.NotifyCountsChanged();
                    blockNode.AliasGroups.Add(aliasNode);
                }

                blockNode.NotifyCountsChanged();
                result.Add(blockNode);
            }

            // ── 3. Remaining uncategorized aliases (not in user blocks.json OR vanilla blocks) ──
            var finalUntracked = remainingUntracked
                .Where(a => !trackedAliases.Contains(a))
                .ToList();

            if (finalUntracked.Count > 0)
            {
                var uncategorizedNode = new BlockGroupNode
                {
                    BlockId = "uncategorized",
                    DisplayName = "(Uncategorized)",
                    Category = TextureCategory.Block,
                    IsUserDefined = false
                };

                foreach (var grp in finalUntracked.GroupBy(u => u.Alias, StringComparer.OrdinalIgnoreCase))
                {
                    var aliasNode = new AliasGroupNode
                    {
                        Alias = grp.Key,
                        Category = TextureCategory.Block,
                        ParentBlock = uncategorizedNode,
                        FaceSummary = string.Empty
                    };

                    var faceNode = new FaceNode { FaceLabel = "all", IsExpanded = true };
                    aliasNode.FaceNodes.Add(faceNode);

                    foreach (var tile in grp)
                    {
                        var leaf = new CatalogLeaf
                        {
                            Alias = tile.Alias,
                            DisplayName = tile.DisplayName,
                            RelativePath = tile.RelativePath,
                            FullPath = tile.FullPath,
                            Category = TextureCategory.Block,
                            Status = tile.Status switch
                            {
                                TextureStatus.Ok => CatalogEntryStatus.Ok,
                                TextureStatus.Ghost => CatalogEntryStatus.Ghost,
                                _ => CatalogEntryStatus.Orphan
                            },
                            TextureAlias = tile,
                            SubtitleCaption = tile.SubtitleCaption,
                            PrimaryFaceBadgeText = tile.PrimaryFaceBadgeText,
                            Flipbook = tile.Flipbook
                        };
                        faceNode.Leaves.Add(leaf);
                        aliasNode.Leaves.Add(leaf);
                    }

                    aliasNode.NotifyCountsChanged();
                    uncategorizedNode.AliasGroups.Add(aliasNode);
                }

                uncategorizedNode.NotifyCountsChanged();
                result.Add(uncategorizedNode);
            }
        }

        return result;
    }

    /// <summary>
    /// Builds the hierarchical 4-tier tree for the Entity Workspace view from all entity
    /// and attachable TextureAlias entries discovered in the active resource pack.
    /// </summary>
    public static List<BlockGroupNode> BuildEntityWorkspaceTree(
        IList<TextureAlias> userAliases,
        VanillaData? vanilla,
        string? packRoot)
    {
        var result = new List<BlockGroupNode>();

        var entityAliases = userAliases
            .Where(a => a.Category == TextureCategory.Entity && a.Status != TextureStatus.NoEntry && a.Status != TextureStatus.Orphan)
            .ToList();

        if (entityAliases.Count == 0)
            return result;

        // Group by EntityId (e.g. "minecraft:zombie", "minecraft:elytra")
        var groups = entityAliases
            .GroupBy(a => !string.IsNullOrEmpty(a.EntityId) ? a.EntityId : a.Alias, StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase);

        foreach (var group in groups)
        {
            var entityId = group.Key;
            var cleanId = entityId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase)
                ? entityId.Substring("minecraft:".Length)
                : entityId;

            var isAttachable = group.Any(t => t.IsAttachable);
            var displayName = vanilla?.GetEntityDisplayName(entityId) ?? cleanId;

            var isCustomEntity = group.Any(t => t.IsUserDefined);
            var hasPackJson = packRoot != null && (
                File.Exists(Path.Combine(packRoot, "entity", $"{cleanId}.entity.json")) ||
                File.Exists(Path.Combine(packRoot, "entity", $"{cleanId}.json")) ||
                File.Exists(Path.Combine(packRoot, "attachables", $"{cleanId}.json")) ||
                group.Any(t => t.IsAttachable && File.Exists(Path.Combine(packRoot, "attachables", $"{t.Alias}.json")))
            );
            var isUserDefined = isCustomEntity || hasPackJson;

            var entityNode = new BlockGroupNode
            {
                BlockId = entityId,
                DisplayName = displayName,
                Category = TextureCategory.Entity,
                IsUserDefined = isUserDefined
            };

            // Group tiles by their distinct geometry so adult, baby, and variant geometries are separated cleanly
            var slotGroups = group
                .GroupBy(t => t.GeometryId ?? "default", StringComparer.OrdinalIgnoreCase)
                .OrderBy(g => g.Key.Contains("baby", StringComparison.OrdinalIgnoreCase) ? 1 : 0);

            foreach (var slotGroup in slotGroups)
            {
                var firstTile = slotGroup.FirstOrDefault();
                var geoId = firstTile?.GeometryId;
                var isBabySlot = geoId != null && geoId.Contains("baby", StringComparison.OrdinalIgnoreCase);

                string slotAlias;
                if (slotGroups.Count() > 1)
                {
                    if (isBabySlot)
                    {
                        slotAlias = $"{cleanId} (baby)";
                    }
                    else
                    {
                        // Derive label from geometry ID, not texture slot key
                        // "geometry.axolotl.baby" → "axolotl.baby" → strip "axolotl." → "baby"
                        // "geometry.axolotl"      → "axolotl"      → equals cleanId → "default"
                        // "geometry.armadillo"    → "armadillo"    → equals cleanId → "default"
                        var suffix = geoId?.Replace("geometry.", "", StringComparison.OrdinalIgnoreCase) ?? "variant";
                        if (suffix.StartsWith(cleanId + ".", StringComparison.OrdinalIgnoreCase))
                            suffix = suffix.Substring(cleanId.Length + 1);
                        if (suffix.Equals(cleanId, StringComparison.OrdinalIgnoreCase) || string.IsNullOrEmpty(suffix))
                            suffix = "default";
                        slotAlias = $"{cleanId} ({suffix})";
                    }
                }
                else
                {
                    slotAlias = cleanId;
                }

                var aliasNode = new AliasGroupNode
                {
                    Alias = slotAlias,
                    Category = TextureCategory.Entity,
                    FaceSummary = isAttachable ? "attachable" : (isBabySlot ? "baby" : "entity"),
                    GeometryId = geoId,
                    IsAttachable = isAttachable
                };

                var faceNode = new FaceNode
                {
                    FaceLabel = isAttachable ? "attachable" : (isBabySlot ? "baby" : "model")
                };

                foreach (var tile in slotGroup)
                {
                    var leafStatus = tile.Status switch
                    {
                        TextureStatus.Ok => CatalogEntryStatus.Ok,
                        TextureStatus.Ghost => CatalogEntryStatus.Ghost,
                        _ => CatalogEntryStatus.Orphan
                    };

                    var slotCaption = !string.IsNullOrEmpty(tile.TextureKey)
                        ? tile.TextureKey
                        : "default";

                    var leaf = new CatalogLeaf
                    {
                        Alias = tile.Alias,
                        DisplayName = tile.DisplayName,
                        RelativePath = tile.RelativePath,
                        FullPath = tile.FullPath,
                        Category = TextureCategory.Entity,
                        Status = leafStatus,
                        TextureAlias = tile,
                        EntityId = tile.EntityId,
                        TextureKey = tile.TextureKey,
                        GeometryId = tile.GeometryId,
                        IsAttachable = tile.IsAttachable,
                        VariantKind = tile.VariantKind,
                        SubtitleCaption = !string.IsNullOrEmpty(tile.SubtitleCaption) ? tile.SubtitleCaption : slotCaption,
                        PrimaryFaceBadgeText = slotCaption
                    };

                    faceNode.Leaves.Add(leaf);
                    aliasNode.Leaves.Add(leaf);
                }

                aliasNode.FaceNodes.Add(faceNode);
                aliasNode.NotifyCountsChanged();
                entityNode.AliasGroups.Add(aliasNode);
            }

            entityNode.NotifyCountsChanged();
            result.Add(entityNode);
        }

        return result;
    }

    private static string SummarizeFaces(List<BlockFaceUsage> faces)
    {
        if (faces.Count == 0) return string.Empty;
        var distinct = faces.Select(f => f.Face.ToLowerInvariant()).Where(f => f != "all").Distinct().ToList();
        if (distinct.Count == 0) return "all";
        if (distinct.Count == 1) return distinct[0];
        if (distinct.Count == 2 && distinct.Contains("up") && distinct.Contains("down")) return "top/btm";
        if (distinct.Count <= 3) return string.Join("/", distinct);
        return "multi";
    }

    /// <summary>
    /// Parsed detail for a Minecraft Bedrock client entity or attachable definition.
    /// </summary>
    public record ClientEntityDetails(
        string Identifier,
        Dictionary<string, string> Textures,
        Dictionary<string, string> Geometries,
        bool IsAttachable
    );

    /// <summary>
    /// Parses a Minecraft Bedrock client entity or attachable JSON file and extracts
    /// all declared entity IDs, texture slots, geometry mappings, and attachable state.
    /// </summary>
    public static List<ClientEntityDetails> ParseClientEntityDetails(string filePath)
    {
        var result = new List<ClientEntityDetails>();
        if (!File.Exists(filePath)) return result;

        try
        {
            using var stream = File.OpenRead(filePath);
            using var doc = JsonDocument.Parse(stream, ScanDocOptions);
            return ParseClientEntityDetails(doc);
        }
        catch
        {
            return result;
        }
    }

    /// <summary>
    /// Parses a Minecraft Bedrock client entity or attachable JsonDocument and extracts
    /// all declared entity IDs, texture slots, geometry mappings, and attachable state.
    /// </summary>
    public static List<ClientEntityDetails> ParseClientEntityDetails(JsonDocument doc)
    {
        var result = new List<ClientEntityDetails>();
        if (doc.RootElement.ValueKind != JsonValueKind.Object) return result;

        foreach (var rootProp in doc.RootElement.EnumerateObject())
        {
            bool isClientEntity = rootProp.Name.Equals("minecraft:client_entity", StringComparison.OrdinalIgnoreCase);
            bool isAttachable = rootProp.Name.Equals("minecraft:attachable", StringComparison.OrdinalIgnoreCase);

            if (!isClientEntity && !isAttachable) continue;
            if (rootProp.Value.ValueKind != JsonValueKind.Object) continue;

            if (rootProp.Value.TryGetProperty("description", out var desc) && desc.ValueKind == JsonValueKind.Object)
            {
                string? identifier = null;
                if (desc.TryGetProperty("identifier", out var idProp) && idProp.ValueKind == JsonValueKind.String)
                {
                    identifier = idProp.GetString();
                }

                if (string.IsNullOrWhiteSpace(identifier)) continue;

                var texturesDict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                if (desc.TryGetProperty("textures", out var texProp))
                {
                    if (texProp.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var slot in texProp.EnumerateObject())
                        {
                            if (slot.Value.ValueKind == JsonValueKind.String)
                            {
                                var val = slot.Value.GetString();
                                if (!string.IsNullOrWhiteSpace(val))
                                {
                                    texturesDict[slot.Name] = val;
                                }
                            }
                        }
                    }
                    else if (texProp.ValueKind == JsonValueKind.String)
                    {
                        var val = texProp.GetString();
                        if (!string.IsNullOrWhiteSpace(val))
                        {
                            texturesDict["default"] = val;
                        }
                    }
                }

                var geometriesDict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                if (desc.TryGetProperty("geometry", out var geoProp))
                {
                    if (geoProp.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var slot in geoProp.EnumerateObject())
                        {
                            if (slot.Value.ValueKind == JsonValueKind.String)
                            {
                                var val = slot.Value.GetString();
                                if (!string.IsNullOrWhiteSpace(val))
                                {
                                    geometriesDict[slot.Name] = val;
                                }
                            }
                        }
                    }
                    else if (geoProp.ValueKind == JsonValueKind.String)
                    {
                        var val = geoProp.GetString();
                        if (!string.IsNullOrWhiteSpace(val))
                        {
                            geometriesDict["default"] = val;
                        }
                    }
                }

                if (texturesDict.Count > 0 || geometriesDict.Count > 0)
                {
                    result.Add(new ClientEntityDetails(identifier, texturesDict, geometriesDict, isAttachable));
                }
            }
        }

        return result;
    }

    /// <summary>
    /// Legacy compatibility helper: Parses a Minecraft Bedrock client entity or attachable JSON file and extracts
    /// all declared entity IDs and their texture slot dictionary (slotName -> texturePath).
    /// </summary>
    public static Dictionary<string, Dictionary<string, string>> ParseClientEntityFile(string filePath)
    {
        var result = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        var details = ParseClientEntityDetails(filePath);
        foreach (var d in details)
        {
            result[d.Identifier] = d.Textures;
        }
        return result;
    }

    /// <summary>
    /// Legacy compatibility helper: Parses a Minecraft Bedrock client entity or attachable JsonDocument and extracts
    /// all declared entity IDs and their texture slot dictionary (slotName -> texturePath).
    /// </summary>
    public static Dictionary<string, Dictionary<string, string>> ParseClientEntity(JsonDocument doc)
    {
        var result = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        var details = ParseClientEntityDetails(doc);
        foreach (var d in details)
        {
            result[d.Identifier] = d.Textures;
        }
        return result;
    }
}
