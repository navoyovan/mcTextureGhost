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
        if (!Directory.Exists(packRoot))
            throw new DirectoryNotFoundException($"Resource pack directory does not exist: {packRoot}");

        var terrainTexturePath = Path.Combine(packRoot, "textures", "terrain_texture.json");
        var itemTexturePath = Path.Combine(packRoot, "textures", "item_texture.json");
        var blocksJsonPath = Path.Combine(packRoot, "blocks.json");
        var flipbookJsonPath = Path.Combine(packRoot, "textures", "flipbook_textures.json");

        bool hasTerrain = File.Exists(terrainTexturePath);
        bool hasItems = File.Exists(itemTexturePath);
        var texturesDir = Path.Combine(packRoot, "textures");

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
            ScanBlockTextures(packRoot, terrainTexturePath, aliasUsage, flipbookCatalog, existingFiles, texturesDirNormalized, matchedFiles, results);
        }

        // 2. Items from item_texture.json
        if (hasItems)
        {
            ScanItemTextures(packRoot, itemTexturePath, flipbookCatalog, existingFiles, texturesDirNormalized, matchedFiles, results);
        }

        // ─── 3. Discover and parse Entity & Attachable client definitions ─────────────
        ScanEntityTextures(packRoot, vanilla, existingFiles, texturesDirNormalized, matchedFiles, results);

        // ─── 4. Discover and parse *.texture_set.json companion files ─────────────────
        // PBR companion maps (metalness_emissive_roughness, heightmap/normal) referenced
        // inside *.texture_set.json files are valid texture components, not orphan files.
        ScanTextureSets(packRoot, existingFiles, texturesDirNormalized, matchedFiles);

        // ─── Discover Orphan files (on disk under textures/, but not declared in JSON) ──
        var orphans = OrphanResolver.ResolveOrphans(
            packRoot,
            existingFiles,
            matchedFiles,
            vanilla,
            flipbookCatalog,
            aliasUsage,
            hasTerrain,
            hasItems);
        results.AddRange(orphans);

        var sorted = results.OrderBy(r => r.Category)
                            .ThenBy(r => r.Alias, StringComparer.OrdinalIgnoreCase)
                            .ThenBy(r => r.BlockVariantIndex ?? 0)
                            .ThenBy(r => r.TextureVariantIndex ?? 0)
                            .ToList();

        // Detect companion MERS/MER PBR texture and item atlas for each tile
        OrphanResolver.AttachCompanionTextures(sorted, packRoot, existingFiles, texturesDirNormalized);

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

    private static void ScanBlockTextures(
        string packRoot,
        string terrainTexturePath,
        Dictionary<string, List<BlockFaceUsage>> aliasUsage,
        FlipbookCatalog flipbookCatalog,
        HashSet<string> existingFiles,
        string? texturesDirNormalized,
        HashSet<string> matchedFiles,
        List<TextureAlias> results)
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

    private static void ScanItemTextures(
        string packRoot,
        string itemTexturePath,
        FlipbookCatalog flipbookCatalog,
        HashSet<string> existingFiles,
        string? texturesDirNormalized,
        HashSet<string> matchedFiles,
        List<TextureAlias> results)
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

    private static void ScanEntityTextures(
        string packRoot,
        VanillaData? vanilla,
        HashSet<string> existingFiles,
        string? texturesDirNormalized,
        HashSet<string> matchedFiles,
        List<TextureAlias> results)
    {
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

                    if (entityDetail.Geometries.TryGetValue(slotKey, out var exactGeo))
                    {
                        geoId = exactGeo;
                    }
                    else if ((slotKey.Contains("baby", StringComparison.OrdinalIgnoreCase) ||
                              rawTexPath.Contains("baby", StringComparison.OrdinalIgnoreCase)) &&
                             entityDetail.Geometries.TryGetValue("baby", out var babyGeo))
                    {
                        geoId = babyGeo;
                    }
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

                    if (string.IsNullOrEmpty(geoId))
                        entityDetail.Geometries.TryGetValue("default", out geoId);

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
    }

    private static void ScanTextureSets(
        string packRoot,
        HashSet<string> existingFiles,
        string? texturesDirNormalized,
        HashSet<string> matchedFiles)
    {
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
