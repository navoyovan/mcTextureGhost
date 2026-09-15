using System.IO;
using System.Net.Http;
using System.Text.Json;
using McTextureGhost.Models;

namespace McTextureGhost.Services;

/// <summary>
/// Container holding parsed vanilla Bedrock reference data and metadata.
/// </summary>
public record VanillaData(
    Dictionary<string, string> RawBlocksJson,
    Dictionary<string, List<BlockFaceUsage>> BlockUsage,
    Dictionary<string, List<string>> BlockToAliases,
    Dictionary<string, PackScanner.ParsedAliasData> TerrainTextures,
    Dictionary<string, string> RawTerrainTextureJson,
    Dictionary<string, PackScanner.ParsedAliasData> ItemTextures,
    Dictionary<string, string> RawItemTextureJson,
    PackScanner.FlipbookCatalog Flipbooks,
    Dictionary<string, string> RawFlipbookJson,
    Dictionary<string, string> LangKeys,
    HashSet<string> DeclaredBlockPaths,
    HashSet<string> DeclaredItemPaths,
    Dictionary<string, Dictionary<string, string>> EntityDefinitions,
    HashSet<string> DeclaredEntityPaths,
    Dictionary<string, string> RawGeometryJson,
    Dictionary<string, string> EntityGeometryMap,
    DateTime CachedAt,
    string VersionInfo
)
{
    public string? GetGeometryForEntity(string entityId, string? slotKey = null, string? rawTexPath = null)
    {
        var cleanId = entityId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase)
            ? entityId.Substring(10)
            : entityId;

        bool isBaby = (slotKey != null && slotKey.Contains("baby", StringComparison.OrdinalIgnoreCase)) ||
                      (rawTexPath != null && rawTexPath.Contains("baby", StringComparison.OrdinalIgnoreCase));

        if (isBaby)
        {
            if (EntityGeometryMap.TryGetValue($"{entityId}:baby", out var bGeo))
                return bGeo;
            if (EntityGeometryMap.TryGetValue($"{cleanId}:baby", out bGeo))
                return bGeo;

            // Direct fallback to baby identifier if known
            var testId = $"geometry.{cleanId}.baby";
            if (RawGeometryJson.ContainsKey(testId) || RawGeometryJson.ContainsKey($"baby_{cleanId}"))
                return testId;
        }

        if (!string.IsNullOrEmpty(slotKey))
        {
            if (EntityGeometryMap.TryGetValue($"{entityId}:{slotKey}", out var sGeo))
                return sGeo;
            if (EntityGeometryMap.TryGetValue($"{cleanId}:{slotKey}", out sGeo))
                return sGeo;
        }

        if (EntityGeometryMap.TryGetValue(entityId, out var geoId))
            return geoId;
        if (EntityGeometryMap.TryGetValue(cleanId, out geoId))
            return geoId;
        return null;
    }

    public string? GetGeometryJson(string geometryId)
    {
        if (RawGeometryJson.TryGetValue(geometryId, out var json))
            return json;
        var clean = geometryId.Replace("geometry.", "", StringComparison.OrdinalIgnoreCase);
        if (RawGeometryJson.TryGetValue(clean, out json))
            return json;

        // If geometry is baby (e.g. "geometry.axolotl.baby" or "axolotl.baby"), look for "baby_axolotl"
        if (clean.EndsWith(".baby", StringComparison.OrdinalIgnoreCase))
        {
            var baseName = clean.Substring(0, clean.Length - 5);
            if (RawGeometryJson.TryGetValue($"baby_{baseName}", out json))
                return json;
        }

        // Check without version suffix (e.g. "zombie.v1.8" -> "zombie")
        var dotIdx = clean.IndexOf('.');
        if (dotIdx > 0)
        {
            var baseName = clean.Substring(0, dotIdx);
            if (RawGeometryJson.TryGetValue(baseName, out json))
                return json;
        }
        return null;
    }

    public string GetBlockDisplayName(string blockId)
    {
        var cleanId = blockId;
        if (cleanId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase))
            cleanId = cleanId.Substring(10);

        if (LangKeys.TryGetValue($"tile.{cleanId}.name", out var name) && !string.IsNullOrWhiteSpace(name))
            return name;
        if (LangKeys.TryGetValue($"item.{cleanId}.name", out var iName) && !string.IsNullOrWhiteSpace(iName))
            return iName;
        if (LangKeys.TryGetValue($"tile.{cleanId}", out var tName) && !string.IsNullOrWhiteSpace(tName))
            return tName;

        return ToTitleCase(cleanId);
    }

    public string GetItemDisplayName(string itemAlias)
    {
        var cleanId = itemAlias;
        if (cleanId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase))
            cleanId = cleanId.Substring(10);

        if (LangKeys.TryGetValue($"item.{cleanId}.name", out var name) && !string.IsNullOrWhiteSpace(name))
            return name;
        if (LangKeys.TryGetValue($"tile.{cleanId}.name", out var tName) && !string.IsNullOrWhiteSpace(tName))
            return tName;

        return ToTitleCase(cleanId);
    }

    public string GetEntityDisplayName(string entityId)
    {
        var cleanId = entityId;
        if (cleanId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase))
            cleanId = cleanId.Substring(10);

        if (LangKeys.TryGetValue($"entity.{cleanId}.name", out var name) && !string.IsNullOrWhiteSpace(name))
            return name;
        if (LangKeys.TryGetValue($"item.spawn_egg.entity.{cleanId}.name", out var eggName) && !string.IsNullOrWhiteSpace(eggName))
            return eggName.Replace(" Spawn Egg", "", StringComparison.OrdinalIgnoreCase);

        return ToTitleCase(cleanId);
    }

    public static string ToTitleCase(string id)
    {
        var parts = id.Split(new[] { '_', ':', '.' }, StringSplitOptions.RemoveEmptyEntries);
        for (int i = 0; i < parts.Length; i++)
        {
            if (parts[i].Length > 0)
                parts[i] = char.ToUpperInvariant(parts[i][0]) + (parts[i].Length > 1 ? parts[i].Substring(1).ToLowerInvariant() : "");
        }
        return string.Join(" ", parts);
    }
}

/// <summary>
/// Downloads and caches vanilla Bedrock reference files from Mojang/bedrock-samples on GitHub.
/// </summary>
public static class VanillaDataService
{
    private const string BaseRawUrl = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack";

    private const string BlocksUrl   = $"{BaseRawUrl}/blocks.json";
    private const string TerrainUrl  = $"{BaseRawUrl}/textures/terrain_texture.json";
    private const string ItemUrl     = $"{BaseRawUrl}/textures/item_texture.json";
    private const string FlipbookUrl = $"{BaseRawUrl}/textures/flipbook_textures.json";
    private const string LangUrl     = $"{BaseRawUrl}/texts/en_US.lang";

    private const string PackIconUrl = $"{BaseRawUrl}/pack_icon.png";

    private static readonly string[] KnownSeedDirectories =
    [
        @"C:\Users\yovan\Diskette\resource_packs\resource_pack",
        @"C:\Users\yovan\Diskette\resource_packs\vanilla"
    ];

    private static readonly HttpClient HttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(25)
    };

    static VanillaDataService()
    {
        HttpClient.DefaultRequestHeaders.UserAgent.ParseAdd("McTextureGhost/1.0");
    }

    public static string CacheDirectory =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "McTextureGhost", "vanilla_cache");

    /// <summary>
    /// Loads vanilla reference data from local cache or downloads it from GitHub if missing or forced.
    /// Returns null if offline and no cache is available.
    /// </summary>
    public static async Task<VanillaData?> LoadAsync(bool forceRefresh = false, Action<string>? onProgress = null)
    {
        var cacheDir = CacheDirectory;
        bool cacheComplete = IsCacheComplete(cacheDir);

        if (!forceRefresh && cacheComplete)
        {
            if (!Directory.Exists(Path.Combine(cacheDir, "models", "entity")) || !Directory.Exists(Path.Combine(cacheDir, "entity")))
            {
                TrySeedFromLocalDirectory(cacheDir, onProgress);
            }

            onProgress?.Invoke("Loading vanilla data from cache...");
            try
            {
                return await Task.Run(() => LoadFromDisk(cacheDir));
            }
            catch
            {
                // Fall back to re-download or re-seed if cache was corrupt
            }
        }

        // 1. Try seeding from local Bedrock repository clone first (fast, offline, no GitHub rate limits)
        bool seeded = TrySeedFromLocalDirectory(cacheDir, onProgress);
        if (seeded || IsCacheComplete(cacheDir))
        {
            onProgress?.Invoke("Parsing vanilla catalog...");
            return await Task.Run(() => LoadFromDisk(cacheDir));
        }

        onProgress?.Invoke("Downloading vanilla reference data...");
        bool downloadSuccess = await DownloadAndCacheAsync(cacheDir, onProgress);

        if (downloadSuccess || IsCacheComplete(cacheDir))
        {
            onProgress?.Invoke("Parsing vanilla catalog...");
            return await Task.Run(() => LoadFromDisk(cacheDir));
        }

        return null;
    }

    public static bool TrySeedFromLocalDirectory(string cacheDir, Action<string>? onProgress = null)
    {
        foreach (var seedDir in KnownSeedDirectories)
        {
            if (!Directory.Exists(seedDir)) continue;

            try
            {
                Directory.CreateDirectory(cacheDir);
                var seedName = Path.GetFileName(seedDir);
                onProgress?.Invoke($"Seeding reference catalog from {seedName}...");

                // Master JSON files
                CopyFileIfExists(Path.Combine(seedDir, "blocks.json"), Path.Combine(cacheDir, "blocks.json"));
                CopyFileIfExists(Path.Combine(seedDir, "textures", "terrain_texture.json"), Path.Combine(cacheDir, "terrain_texture.json"));
                CopyFileIfExists(Path.Combine(seedDir, "textures", "item_texture.json"), Path.Combine(cacheDir, "item_texture.json"));
                CopyFileIfExists(Path.Combine(seedDir, "textures", "flipbook_textures.json"), Path.Combine(cacheDir, "flipbook_textures.json"));
                CopyFileIfExists(Path.Combine(seedDir, "texts", "en_US.lang"), Path.Combine(cacheDir, "en_US.lang"));
                CopyFileIfExists(Path.Combine(seedDir, "pack_icon.png"), Path.Combine(cacheDir, "pack_icon.png"));

                // Entity definitions
                var seedEntityDir = Path.Combine(seedDir, "entity");
                if (Directory.Exists(seedEntityDir))
                {
                    var targetEntityDir = Path.Combine(cacheDir, "entity");
                    Directory.CreateDirectory(targetEntityDir);
                    CopyDirectoryContents(seedEntityDir, targetEntityDir, "*.json");
                }

                // Attachables definitions
                var seedAttachablesDir = Path.Combine(seedDir, "attachables");
                if (Directory.Exists(seedAttachablesDir))
                {
                    var targetAttachablesDir = Path.Combine(cacheDir, "attachables");
                    Directory.CreateDirectory(targetAttachablesDir);
                    CopyDirectoryContents(seedAttachablesDir, targetAttachablesDir, "*.json");
                }

                // Models & Geometry
                var seedModelsEntityDir = Path.Combine(seedDir, "models", "entity");
                if (Directory.Exists(seedModelsEntityDir))
                {
                    var targetModelsEntityDir = Path.Combine(cacheDir, "models", "entity");
                    Directory.CreateDirectory(targetModelsEntityDir);
                    CopyDirectoryContents(seedModelsEntityDir, targetModelsEntityDir, "*.json");
                }

                var meta = $"Seeded from {seedDir} on {DateTime.UtcNow:O}";
                File.WriteAllText(Path.Combine(cacheDir, "version.txt"), meta);
                return true;
            }
            catch
            {
                // Continue to next seed candidate
            }
        }
        return false;
    }

    private static void CopyFileIfExists(string source, string destination)
    {
        if (File.Exists(source))
        {
            var dir = Path.GetDirectoryName(destination);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            File.Copy(source, destination, true);
        }
    }

    private static void CopyDirectoryContents(string sourceDir, string targetDir, string searchPattern)
    {
        foreach (var file in Directory.EnumerateFiles(sourceDir, searchPattern, SearchOption.AllDirectories))
        {
            var rel = Path.GetRelativePath(sourceDir, file);
            var dest = Path.Combine(targetDir, rel);
            var destDir = Path.GetDirectoryName(dest);
            if (!string.IsNullOrEmpty(destDir)) Directory.CreateDirectory(destDir);
            File.Copy(file, dest, true);
        }
    }

    private static bool IsCacheComplete(string cacheDir)
    {
        if (!Directory.Exists(cacheDir)) return false;
        return File.Exists(Path.Combine(cacheDir, "blocks.json")) &&
               File.Exists(Path.Combine(cacheDir, "terrain_texture.json")) &&
               File.Exists(Path.Combine(cacheDir, "item_texture.json")) &&
               File.Exists(Path.Combine(cacheDir, "flipbook_textures.json")) &&
               File.Exists(Path.Combine(cacheDir, "en_US.lang")) &&
               File.Exists(Path.Combine(cacheDir, "pack_icon.png")) &&
               Directory.Exists(Path.Combine(cacheDir, "models", "entity")) &&
               Directory.Exists(Path.Combine(cacheDir, "entity"));
    }

    private static async Task<bool> DownloadAndCacheAsync(string cacheDir, Action<string>? onProgress)
    {
        try
        {
            Directory.CreateDirectory(cacheDir);

            onProgress?.Invoke("Fetching blocks.json...");
            var blocksContent = await HttpClient.GetStringAsync(BlocksUrl);
            await File.WriteAllTextAsync(Path.Combine(cacheDir, "blocks.json"), blocksContent);

            onProgress?.Invoke("Fetching terrain_texture.json...");
            var terrainContent = await HttpClient.GetStringAsync(TerrainUrl);
            await File.WriteAllTextAsync(Path.Combine(cacheDir, "terrain_texture.json"), terrainContent);

            onProgress?.Invoke("Fetching item_texture.json...");
            var itemContent = await HttpClient.GetStringAsync(ItemUrl);
            await File.WriteAllTextAsync(Path.Combine(cacheDir, "item_texture.json"), itemContent);

            onProgress?.Invoke("Fetching flipbook_textures.json...");
            var flipbookContent = await HttpClient.GetStringAsync(FlipbookUrl);
            await File.WriteAllTextAsync(Path.Combine(cacheDir, "flipbook_textures.json"), flipbookContent);

            onProgress?.Invoke("Fetching en_US.lang...");
            var langContent = await HttpClient.GetStringAsync(LangUrl);
            await File.WriteAllTextAsync(Path.Combine(cacheDir, "en_US.lang"), langContent);

            try
            {
                onProgress?.Invoke("Fetching vanilla pack_icon.png...");
                var iconBytes = await HttpClient.GetByteArrayAsync(PackIconUrl);
                await File.WriteAllBytesAsync(Path.Combine(cacheDir, "pack_icon.png"), iconBytes);
            }
            catch
            {
                // Non-fatal if icon download fails, but try to keep cache consistent
            }

            var meta = $"Downloaded on {DateTime.UtcNow:O} from Mojang/bedrock-samples (main)";
            await File.WriteAllTextAsync(Path.Combine(cacheDir, "version.txt"), meta);

            return true;
        }
        catch
        {
            return false;
        }
    }

    private static VanillaData LoadFromDisk(string cacheDir)
    {
        var blocksPath   = Path.Combine(cacheDir, "blocks.json");
        var terrainPath  = Path.Combine(cacheDir, "terrain_texture.json");
        var itemPath     = Path.Combine(cacheDir, "item_texture.json");
        var flipbookPath = Path.Combine(cacheDir, "flipbook_textures.json");
        var langPath     = Path.Combine(cacheDir, "en_US.lang");
        var versionPath  = Path.Combine(cacheDir, "version.txt");

        var cachedAt = File.Exists(versionPath) ? File.GetLastWriteTime(versionPath) : DateTime.Now;
        var versionInfo = File.Exists(versionPath) ? File.ReadAllText(versionPath).Trim() : "Local Cache";

        // 1. Blocks.json
        var rawBlocks = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var blockUsage = new Dictionary<string, List<BlockFaceUsage>>(StringComparer.OrdinalIgnoreCase);
        var blockToAliases = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        using (var stream = File.OpenRead(blocksPath))
        using (var doc = JsonDocument.Parse(stream, PackScanner.ScanDocOptions))
        {
            foreach (var entry in doc.RootElement.EnumerateObject())
            {
                if (entry.Name == "format_version") continue;
                if (entry.Value.ValueKind != JsonValueKind.Object) continue;

                var blockId = entry.Name;
                rawBlocks[blockId] = entry.Value.GetRawText();
                var aliasSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                if (entry.Value.TryGetProperty("textures", out var texturesProp))
                {
                    foreach (var (alias, face) in PackScanner.ExtractAliasFaces(texturesProp))
                    {
                        if (!blockUsage.TryGetValue(alias, out var list))
                            blockUsage[alias] = list = new List<BlockFaceUsage>();
                        list.Add(new BlockFaceUsage(blockId, face));
                        aliasSet.Add(alias);
                    }
                }

                if (entry.Value.TryGetProperty("carried_textures", out var carriedProp))
                {
                    foreach (var (alias, face) in PackScanner.ExtractAliasFaces(carriedProp, isCarried: true))
                    {
                        if (!blockUsage.TryGetValue(alias, out var list))
                            blockUsage[alias] = list = new List<BlockFaceUsage>();
                        list.Add(new BlockFaceUsage(blockId, face));
                        aliasSet.Add(alias);
                    }
                }

                blockToAliases[blockId] = aliasSet.ToList();
            }
        }

        // 2. Terrain texture
        var rawTerrain = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var declaredBlockPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        Dictionary<string, PackScanner.ParsedAliasData> terrainTextures;

        using (var stream = File.OpenRead(terrainPath))
        using (var doc = JsonDocument.Parse(stream, PackScanner.ScanDocOptions))
        {
            terrainTextures = PackScanner.ParseTextureAtlasJson(doc);
            if (doc.RootElement.TryGetProperty("texture_data", out var td) && td.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in td.EnumerateObject())
                    rawTerrain[prop.Name] = prop.Value.GetRawText();
            }

            foreach (var (_, parsed) in terrainTextures)
            {
                foreach (var entry in parsed.Entries)
                {
                    var norm = NormalizeTexturePath(entry.RawPath);
                    declaredBlockPaths.Add(norm);
                }
            }
        }

        // 3. Item texture
        var rawItem = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var declaredItemPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        Dictionary<string, PackScanner.ParsedAliasData> itemTextures;

        using (var stream = File.OpenRead(itemPath))
        using (var doc = JsonDocument.Parse(stream, PackScanner.ScanDocOptions))
        {
            itemTextures = PackScanner.ParseTextureAtlasJson(doc);
            if (doc.RootElement.TryGetProperty("texture_data", out var td) && td.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in td.EnumerateObject())
                    rawItem[prop.Name] = prop.Value.GetRawText();
            }

            foreach (var (_, parsed) in itemTextures)
            {
                foreach (var entry in parsed.Entries)
                {
                    var norm = NormalizeTexturePath(entry.RawPath);
                    declaredItemPaths.Add(norm);
                }
            }
        }

        // 4. Flipbooks
        var rawFlipbooks = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        PackScanner.FlipbookCatalog flipbookCatalog;

        using (var stream = File.OpenRead(flipbookPath))
        using (var doc = JsonDocument.Parse(stream, PackScanner.ScanDocOptions))
        {
            flipbookCatalog = PackScanner.ParseFlipbookTextures(doc);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in doc.RootElement.EnumerateArray())
                {
                    if (item.ValueKind != JsonValueKind.Object) continue;
                    var rawText = item.GetRawText();
                    if (item.TryGetProperty("atlas_tile", out var atProp) && atProp.ValueKind == JsonValueKind.String)
                    {
                        var at = atProp.GetString();
                        if (!string.IsNullOrEmpty(at)) rawFlipbooks[at] = rawText;
                    }
                    if (item.TryGetProperty("flipbook_texture", out var ftProp) && ftProp.ValueKind == JsonValueKind.String)
                    {
                        var ft = ftProp.GetString();
                        if (!string.IsNullOrEmpty(ft)) rawFlipbooks[ft] = rawText;
                    }
                }
            }
        }

        // 5. Texts (en_US.lang)
        var langKeys = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (File.Exists(langPath))
        {
            foreach (var line in File.ReadLines(langPath))
            {
                var trimmed = line.Trim();
                if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith("#")) continue;
                int eqIdx = trimmed.IndexOf('=');
                if (eqIdx > 0)
                {
                    var key = trimmed.Substring(0, eqIdx).Trim();
                    var val = trimmed.Substring(eqIdx + 1).Trim();
                    int commentIdx = val.IndexOf("##", StringComparison.Ordinal);
                    if (commentIdx >= 0) val = val.Substring(0, commentIdx).Trim();
                    langKeys[key] = val;
                }
            }
        }

        // 6. Entity & Attachable Definitions and Geometry Mappings
        var entityDefinitions = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        var declaredEntityPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var entityGeometryMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        var entityCacheDir = Path.Combine(cacheDir, "entity");
        var attachablesCacheDir = Path.Combine(cacheDir, "attachables");

        var entityDirs = new List<string>();
        if (Directory.Exists(entityCacheDir)) entityDirs.Add(entityCacheDir);
        if (Directory.Exists(attachablesCacheDir)) entityDirs.Add(attachablesCacheDir);

        foreach (var ed in entityDirs)
        {
            try
            {
                foreach (var file in Directory.EnumerateFiles(ed, "*.json", SearchOption.AllDirectories))
                {
                    try
                    {
                        var entityDetails = PackScanner.ParseClientEntityDetails(file);
                        foreach (var detail in entityDetails)
                        {
                            if (!entityDefinitions.TryGetValue(detail.Identifier, out var existing))
                            {
                                entityDefinitions[detail.Identifier] = existing = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                            }
                            foreach (var (slot, rawTex) in detail.Textures)
                            {
                                existing[slot] = rawTex;
                                var norm = NormalizeTexturePath(rawTex);
                                declaredEntityPaths.Add(norm);
                            }

                            foreach (var (geoSlot, geoVal) in detail.Geometries)
                            {
                                entityGeometryMap[$"{detail.Identifier}:{geoSlot}"] = geoVal;
                            }

                            if (detail.Geometries.TryGetValue("default", out var defaultGeo) && !string.IsNullOrWhiteSpace(defaultGeo))
                            {
                                entityGeometryMap[detail.Identifier] = defaultGeo;
                            }
                            else if (detail.Geometries.Count > 0)
                            {
                                entityGeometryMap[detail.Identifier] = detail.Geometries.Values.First();
                            }
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        // 7. Entity & Attachable Geometry Files (*.geo.json, *.json under models/)
        var rawGeometryJson = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var modelsEntityDir = Path.Combine(cacheDir, "models", "entity");
        var modelsDir = Path.Combine(cacheDir, "models");

        var geoDirs = new List<string>();
        if (Directory.Exists(modelsEntityDir)) geoDirs.Add(modelsEntityDir);
        if (Directory.Exists(modelsDir) && !geoDirs.Contains(modelsDir)) geoDirs.Add(modelsDir);

        foreach (var gd in geoDirs)
        {
            try
            {
                foreach (var file in Directory.EnumerateFiles(gd, "*.json", SearchOption.AllDirectories))
                {
                    try
                    {
                        var jsonText = File.ReadAllText(file);
                        var fileName = Path.GetFileNameWithoutExtension(file);
                        rawGeometryJson[fileName] = jsonText;
                        if (fileName.EndsWith(".geo", StringComparison.OrdinalIgnoreCase))
                        {
                            rawGeometryJson[fileName.Substring(0, fileName.Length - 4)] = jsonText;
                        }

                        using var doc = JsonDocument.Parse(jsonText, PackScanner.ScanDocOptions);
                        if (doc.RootElement.ValueKind == JsonValueKind.Object)
                        {
                            // Check format 1.8.0 ("geometry.zombie.v1.8": { ... })
                            foreach (var prop in doc.RootElement.EnumerateObject())
                            {
                                if (prop.Name.StartsWith("geometry.", StringComparison.OrdinalIgnoreCase))
                                {
                                    rawGeometryJson[prop.Name] = jsonText;
                                }
                            }

                            // Check format 1.12.0+ ("minecraft:geometry": [ { "description": { "identifier": "..." } } ])
                            if (doc.RootElement.TryGetProperty("minecraft:geometry", out var mg) && mg.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var gObj in mg.EnumerateArray())
                                {
                                    if (gObj.ValueKind == JsonValueKind.Object &&
                                        gObj.TryGetProperty("description", out var desc) &&
                                        desc.TryGetProperty("identifier", out var idProp) &&
                                        idProp.ValueKind == JsonValueKind.String)
                                    {
                                        var geoId = idProp.GetString();
                                        if (!string.IsNullOrEmpty(geoId))
                                        {
                                            rawGeometryJson[geoId] = jsonText;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        return new VanillaData(
            rawBlocks,
            blockUsage,
            blockToAliases,
            terrainTextures,
            rawTerrain,
            itemTextures,
            rawItem,
            flipbookCatalog,
            rawFlipbooks,
            langKeys,
            declaredBlockPaths,
            declaredItemPaths,
            entityDefinitions,
            declaredEntityPaths,
            rawGeometryJson,
            entityGeometryMap,
            cachedAt,
            versionInfo
        );
    }

    public static string NormalizeTexturePath(string raw)
    {
        var norm = raw.Replace('\\', '/').TrimStart('/');
        if (norm.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
            norm = norm.Substring(0, norm.Length - 4);
        if (norm.EndsWith(".tga", StringComparison.OrdinalIgnoreCase))
            norm = norm.Substring(0, norm.Length - 4);
        return norm;
    }
}
