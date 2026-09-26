using System.IO;
using McTextureGhost.Models;

namespace McTextureGhost.Services.Scanning;

/// <summary>
/// Handles disk enumeration filtering, unlinked orphan classification,
/// and companion texture detection (PBR maps, MERS, item atlases).
/// </summary>
public static class OrphanResolver
{
    /// <summary>
    /// Enumerates disk files not declared in manifest or JSON tables,
    /// filtering out PBR maps and companion atlases, and matching against
    /// vanilla reference definitions or tagging as TextureStatus.Orphan.
    /// </summary>
    public static List<TextureAlias> ResolveOrphans(
        string packRoot,
        HashSet<string> existingFiles,
        HashSet<string> matchedFiles,
        VanillaData? vanilla,
        FlipbookCatalog flipbookCatalog,
        Dictionary<string, List<BlockFaceUsage>> aliasUsage,
        bool hasTerrain = true,
        bool hasItems = true)
    {
        var results = new List<TextureAlias>();

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

        return results;
    }

    /// <summary>
    /// Attaches companion PBR maps (MERS/MER) and companion item atlas textures to discovered aliases.
    /// </summary>
    public static void AttachCompanionTextures(
        IList<TextureAlias> items,
        string packRoot,
        HashSet<string> existingFiles,
        string? texturesDirNormalized)
    {
        foreach (var item in items)
        {
            if (string.IsNullOrEmpty(item.FullPath)) continue;

            var dir = Path.GetDirectoryName(item.FullPath) ?? "";
            var fnWithoutExt = Path.GetFileNameWithoutExtension(item.FullPath);

            // 1. Check companion texture_set.json
            var tsPath = Path.Combine(dir, $"{fnWithoutExt}.texture_set.json");
            if (existingFiles.Contains(tsPath))
            {
                var pbrFiles = BlockDefinitionParser.ParseTextureSetJson(tsPath, packRoot, existingFiles, texturesDirNormalized);
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

            // 2. Fallback: check naming convention in same directory (_mers.png, _mer.png, etc.)
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
    }
}
