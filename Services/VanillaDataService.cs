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
    DateTime CachedAt,
    string VersionInfo
)
{
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
            onProgress?.Invoke("Loading vanilla data from cache...");
            try
            {
                return await Task.Run(() => LoadFromDisk(cacheDir));
            }
            catch
            {
                // Fall back to re-download if cache was corrupt
            }
        }

        onProgress?.Invoke("Downloading vanilla reference data...");
        bool downloadSuccess = await DownloadAndCacheAsync(cacheDir, onProgress);

        if (downloadSuccess)
        {
            onProgress?.Invoke("Parsing vanilla catalog...");
            return await Task.Run(() => LoadFromDisk(cacheDir));
        }

        if (cacheComplete)
        {
            onProgress?.Invoke("Network unavailable; using cached vanilla data.");
            return await Task.Run(() => LoadFromDisk(cacheDir));
        }

        return null;
    }

    private static bool IsCacheComplete(string cacheDir)
    {
        if (!Directory.Exists(cacheDir)) return false;
        return File.Exists(Path.Combine(cacheDir, "blocks.json")) &&
               File.Exists(Path.Combine(cacheDir, "terrain_texture.json")) &&
               File.Exists(Path.Combine(cacheDir, "item_texture.json")) &&
               File.Exists(Path.Combine(cacheDir, "flipbook_textures.json")) &&
               File.Exists(Path.Combine(cacheDir, "en_US.lang"));
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
