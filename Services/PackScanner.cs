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

        // ─── Discover Orphan files (on disk under textures/, but not declared in JSON) ──
        foreach (var file in existingFiles)
        {
            if (matchedFiles.Contains(file)) continue;

            var ext = Path.GetExtension(file).ToLowerInvariant();
            if (ext != ".png" && ext != ".tga") continue;

            var relFromPack = file.StartsWith(packRoot, StringComparison.OrdinalIgnoreCase)
                ? file.Substring(packRoot.Length).TrimStart('/', '\\').Replace('\\', '/')
                : file.Replace('\\', '/');

            // Strip extension for RelativePath
            var relNoExt = relFromPack.Length > ext.Length
                ? relFromPack.Substring(0, relFromPack.Length - ext.Length)
                : relFromPack;

            var fileNameWithoutExt = Path.GetFileNameWithoutExtension(file);

            bool isItem = relFromPack.StartsWith("textures/items/", StringComparison.OrdinalIgnoreCase) ||
                          relFromPack.StartsWith("items/", StringComparison.OrdinalIgnoreCase);

            if (isItem)
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
                    results.Add(new TextureAlias
                    {
                        Category = TextureCategory.Item,
                        Alias = vanillaItemAlias,
                        DisplayName = vanilla!.GetItemDisplayName(vanillaItemAlias),
                        RelativePath = relNoExt,
                        FullPath = file,
                        Status = TextureStatus.Ok,
                        VariantKind = VariantKind.None,
                        Flipbook = flipbookCatalog.Find(vanillaItemAlias, relNoExt, null, null) ?? vanilla.Flipbooks.Find(vanillaItemAlias, relNoExt, null, null),
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
                if (vanilla != null && vanilla.DeclaredBlockPaths.Contains(relNoExt))
                {
                    foreach (var (vAlias, vData) in vanilla.TerrainTextures)
                    {
                        if (vData.Entries.Any(e => VanillaDataService.NormalizeTexturePath(e.RawPath).Equals(relNoExt, StringComparison.OrdinalIgnoreCase)))
                        {
                            vanillaBlockAlias = vAlias;
                            if (vanilla.BlockUsage.TryGetValue(vAlias, out var u))
                                vanillaBlockFaces = u;
                            break;
                        }
                    }
                }

                if (vanillaBlockAlias != null)
                {
                    results.Add(new TextureAlias
                    {
                        Category = TextureCategory.Block,
                        Alias = vanillaBlockAlias,
                        DisplayName = vanilla!.GetBlockDisplayName(vanillaBlockAlias),
                        RelativePath = relNoExt,
                        FullPath = file,
                        Status = TextureStatus.Ok,
                        VariantKind = VariantKind.None,
                        Flipbook = flipbookCatalog.Find(vanillaBlockAlias, relNoExt, null, null) ?? vanilla.Flipbooks.Find(vanillaBlockAlias, relNoExt, null, null),
                        BlockFaces = vanillaBlockFaces ?? new List<BlockFaceUsage>()
                    });
                }
                else
                {
                    results.Add(new TextureAlias
                    {
                        Category = TextureCategory.Block,
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

            if (string.IsNullOrWhiteSpace(texturePath) && string.IsNullOrWhiteSpace(atlasTile))
                continue;

            var def = new FlipbookDefinition(
                FlipbookTexture: texturePath ?? "",
                AtlasTile: atlasTile ?? "",
                TicksPerFrame: ticksPerFrame,
                Frames: frames,
                BlendFrames: blendFrames,
                AtlasIndex: atlasIndex,
                AtlasTileVariant: atlasTileVariant
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

                if (userBlockAliases.TryGetValue(alias, out var userTiles))
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
                            SubtitleCaption = tile.SubtitleCaption,
                            PrimaryFaceBadgeText = tile.PrimaryFaceBadgeText,
                            Flipbook = tile.Flipbook
                        };
                        aliasNode.Leaves.Add(leaf);
                    }
                }
                else
                {
                    if (vanilla.TerrainTextures.TryGetValue(alias, out var vData))
                    {
                        for (int i = 0; i < vData.Entries.Count; i++)
                        {
                            var entry = vData.Entries[i];
                            var caption = entry.TotalBlockVariants.HasValue
                                ? $"block {entry.BlockVariantIndex}/{entry.TotalBlockVariants}"
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
                                SubtitleCaption = caption,
                                PrimaryFaceBadgeText = aliasNode.FaceSummary,
                                Flipbook = vanilla.Flipbooks.Find(alias, entry.RawPath, entry.BlockVariantIndex, entry.TextureVariantIndex)
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

            if (userItemAliases.TryGetValue(itemAlias, out var userTiles))
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
            else
            {
                if (vanilla.ItemTextures.TryGetValue(itemAlias, out var vData))
                {
                    for (int i = 0; i < vData.Entries.Count; i++)
                    {
                        var entry = vData.Entries[i];
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
                            SubtitleCaption = caption,
                            Flipbook = vanilla.Flipbooks.Find(itemAlias, entry.RawPath, null, entry.TextureVariantIndex)
                        };
                        aliasNode.Leaves.Add(leaf);
                    }
                }
            }

            aliasNode.NotifyCountsChanged();
            itemBlockNode.AliasGroups.Add(aliasNode);
            itemBlockNode.NotifyCountsChanged();
            itemsTree.Add(itemBlockNode);
        }

        // ── 3. UNCATEGORIZED ───────────────────────────────────────────────────
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
        if (uncategorizedNode != null)
            result.Add(uncategorizedNode);

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
}
