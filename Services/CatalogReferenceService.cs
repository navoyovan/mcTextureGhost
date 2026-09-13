using System.Diagnostics;
using System.IO;
using System.Text.Json;
using McTextureGhost.Models;

namespace McTextureGhost.Services;

/// <summary>
/// Metadata profile for an available reference pack.
/// </summary>
public record ReferencePackProfile(
    string Id,
    string Name,
    string Version,
    string? Description,
    string? PackPath,
    string IconUrl,
    bool IsVanilla
);

/// <summary>
/// Service managing available reference packs (vanilla bedrock-samples and custom packs),
/// reading their manifests, caching, and serving catalog data.
/// </summary>
public static class CatalogReferenceService
{
    private static readonly string SettingsFilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "McTextureGhost",
        "reference_packs.json"
    );

    private static readonly List<ReferencePackProfile> _customProfiles = new();
    private static string _activeReferenceId = "vanilla";
    private static readonly Dictionary<string, VanillaData> _dataCache = new(StringComparer.OrdinalIgnoreCase);

    public static string ActiveReferenceId => _activeReferenceId;

    static CatalogReferenceService()
    {
        LoadSavedProfiles();
    }

    private static void LoadSavedProfiles()
    {
        try
        {
            if (File.Exists(SettingsFilePath))
            {
                var json = File.ReadAllText(SettingsFilePath);
                var list = JsonSerializer.Deserialize<List<SavedPackConfig>>(json);
                if (list != null)
                {
                    foreach (var item in list)
                    {
                        if (!string.IsNullOrWhiteSpace(item.Path) && Directory.Exists(item.Path))
                        {
                            var profile = CreateProfileFromPath(item.Path, item.Id);
                            if (profile != null)
                            {
                                _customProfiles.Add(profile);
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[CatalogReferenceService] Failed to load saved reference packs: {ex.Message}");
        }
    }

    private static void SaveProfiles()
    {
        try
        {
            var dir = Path.GetDirectoryName(SettingsFilePath);
            if (!string.IsNullOrWhiteSpace(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            var list = _customProfiles.Select(p => new SavedPackConfig
            {
                Id = p.Id,
                Path = p.PackPath ?? ""
            }).ToList();

            var json = JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(SettingsFilePath, json);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[CatalogReferenceService] Failed to save reference packs: {ex.Message}");
        }
    }

    public static List<ReferencePackProfile> GetAllProfiles()
    {
        var list = new List<ReferencePackProfile>
        {
            new(
                Id: "vanilla",
                Name: "Vanilla Bedrock",
                Version: "1.21.x",
                Description: "Mojang bedrock-samples official reference database",
                PackPath: VanillaDataService.CacheDirectory,
                IconUrl: "https://vanilla.local/pack_icon.png",
                IsVanilla: true
            )
        };

        list.AddRange(_customProfiles);
        return list;
    }

    public static ReferencePackProfile? GetActiveProfile()
    {
        var all = GetAllProfiles();
        return all.FirstOrDefault(p => string.Equals(p.Id, _activeReferenceId, StringComparison.OrdinalIgnoreCase))
               ?? all.FirstOrDefault();
    }

    public static bool SetActiveReference(string id)
    {
        var all = GetAllProfiles();
        var match = all.FirstOrDefault(p => string.Equals(p.Id, id, StringComparison.OrdinalIgnoreCase));
        if (match != null)
        {
            _activeReferenceId = match.Id;
            return true;
        }
        return false;
    }

    public static ReferencePackProfile? AddCustomPack(string packPath)
    {
        if (string.IsNullOrWhiteSpace(packPath) || !Directory.Exists(packPath))
            return null;

        var cleanPath = Path.GetFullPath(packPath);
        var existing = _customProfiles.FirstOrDefault(p => string.Equals(p.PackPath, cleanPath, StringComparison.OrdinalIgnoreCase));
        if (existing != null)
        {
            _activeReferenceId = existing.Id;
            return existing;
        }

        var id = "ref_" + Math.Abs(cleanPath.ToLowerInvariant().GetHashCode()).ToString("X8");
        var profile = CreateProfileFromPath(cleanPath, id);
        if (profile != null)
        {
            _customProfiles.Add(profile);
            _activeReferenceId = profile.Id;
            SaveProfiles();
            return profile;
        }

        return null;
    }

    public static bool RemoveCustomPack(string id)
    {
        int count = _customProfiles.RemoveAll(p => string.Equals(p.Id, id, StringComparison.OrdinalIgnoreCase));
        if (count > 0)
        {
            if (string.Equals(_activeReferenceId, id, StringComparison.OrdinalIgnoreCase))
            {
                _activeReferenceId = "vanilla";
            }
            SaveProfiles();
            return true;
        }
        return false;
    }

    public static VanillaData? GetActiveData(VanillaData? defaultVanillaData)
    {
        if (string.Equals(_activeReferenceId, "vanilla", StringComparison.OrdinalIgnoreCase))
        {
            return defaultVanillaData;
        }

        var active = GetActiveProfile();
        if (active == null || string.IsNullOrWhiteSpace(active.PackPath) || !Directory.Exists(active.PackPath))
        {
            return defaultVanillaData;
        }

        if (_dataCache.TryGetValue(active.Id, out var cachedData))
        {
            return cachedData;
        }

        try
        {
            var parsed = LoadReferencePackData(active.PackPath, active.Name, defaultVanillaData);
            if (parsed != null)
            {
                _dataCache[active.Id] = parsed;
                return parsed;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[CatalogReferenceService] Failed to load data from '{active.PackPath}': {ex.Message}");
        }

        return defaultVanillaData;
    }

    private static ReferencePackProfile? CreateProfileFromPath(string path, string id)
    {
        try
        {
            var manifestPath = Path.Combine(path, "manifest.json");
            string name = Path.GetFileName(path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
            string version = "1.0.0";
            string? desc = null;

            if (File.Exists(manifestPath))
            {
                try
                {
                    var model = ManifestModel.LoadFromFile(manifestPath, name);
                    if (!string.IsNullOrWhiteSpace(model.HeaderName)) name = model.HeaderName;
                    if (!string.IsNullOrWhiteSpace(model.HeaderDescription)) desc = model.HeaderDescription;
                    version = model.VersionString;
                }
                catch { }
            }

            string iconUrl = "https://vanilla.local/pack_icon.png";
            var iconPath = Path.Combine(path, "pack_icon.png");
            if (File.Exists(iconPath))
            {
                try
                {
                    var bytes = File.ReadAllBytes(iconPath);
                    iconUrl = $"data:image/png;base64,{Convert.ToBase64String(bytes)}";
                }
                catch
                {
                    iconUrl = "https://reference.local/pack_icon.png";
                }
            }

            return new ReferencePackProfile(
                Id: id,
                Name: name,
                Version: version,
                Description: desc,
                PackPath: path,
                IconUrl: iconUrl,
                IsVanilla: false
            );
        }
        catch
        {
            return null;
        }
    }

    private static VanillaData LoadReferencePackData(string packPath, string packName, VanillaData? defaultVanilla)
    {
        var blocksPath   = Path.Combine(packPath, "blocks.json");
        var terrainPath  = Path.Combine(packPath, "textures", "terrain_texture.json");
        var itemPath     = Path.Combine(packPath, "textures", "item_texture.json");
        var flipbookPath = Path.Combine(packPath, "textures", "flipbook_textures.json");
        var langPath     = Path.Combine(packPath, "texts", "en_US.lang");

        var rawBlocks = defaultVanilla != null
            ? new Dictionary<string, string>(defaultVanilla.RawBlocksJson, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        var blockUsage = defaultVanilla != null
            ? new Dictionary<string, List<BlockFaceUsage>>(defaultVanilla.BlockUsage, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, List<BlockFaceUsage>>(StringComparer.OrdinalIgnoreCase);

        var blockToAliases = defaultVanilla != null
            ? new Dictionary<string, List<string>>(defaultVanilla.BlockToAliases, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        if (File.Exists(blocksPath))
        {
            using var stream = File.OpenRead(blocksPath);
            using var doc = JsonDocument.Parse(stream, PackScanner.ScanDocOptions);
            foreach (var entry in doc.RootElement.EnumerateObject())
            {
                if (entry.Name == "format_version" || entry.Value.ValueKind != JsonValueKind.Object) continue;
                var blockId = entry.Name;
                rawBlocks[blockId] = entry.Value.GetRawText();
                var aliasSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                if (entry.Value.TryGetProperty("textures", out var tp))
                {
                    foreach (var (alias, face) in PackScanner.ExtractAliasFaces(tp))
                    {
                        if (!blockUsage.TryGetValue(alias, out var list))
                            blockUsage[alias] = list = new List<BlockFaceUsage>();
                        list.Add(new BlockFaceUsage(blockId, face));
                        aliasSet.Add(alias);
                    }
                }

                if (entry.Value.TryGetProperty("carried_textures", out var cp))
                {
                    foreach (var (alias, face) in PackScanner.ExtractAliasFaces(cp, isCarried: true))
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

        var customTerrainTextures = File.Exists(terrainPath)
            ? PackScanner.ParseTextureAtlasJson(terrainPath)
            : null;

        var terrainTextures = defaultVanilla != null
            ? new Dictionary<string, PackScanner.ParsedAliasData>(defaultVanilla.TerrainTextures, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, PackScanner.ParsedAliasData>(StringComparer.OrdinalIgnoreCase);

        if (customTerrainTextures != null)
        {
            foreach (var (k, v) in customTerrainTextures)
                terrainTextures[k] = v;
        }

        var rawTerrain = defaultVanilla != null
            ? new Dictionary<string, string>(defaultVanilla.RawTerrainTextureJson, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        var declaredBlockPaths = defaultVanilla != null
            ? new HashSet<string>(defaultVanilla.DeclaredBlockPaths, StringComparer.OrdinalIgnoreCase)
            : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (File.Exists(terrainPath))
        {
            using var stream = File.OpenRead(terrainPath);
            using var doc = JsonDocument.Parse(stream, PackScanner.ScanDocOptions);
            if (doc.RootElement.TryGetProperty("texture_data", out var td))
            {
                foreach (var prop in td.EnumerateObject())
                {
                    rawTerrain[prop.Name] = prop.Value.GetRawText();
                }
            }
        }
        if (customTerrainTextures != null)
        {
            foreach (var (_, d) in customTerrainTextures)
            {
                foreach (var e in d.Entries)
                {
                    declaredBlockPaths.Add(VanillaDataService.NormalizeTexturePath(e.RawPath));
                }
            }
        }

        var customItemTextures = File.Exists(itemPath)
            ? PackScanner.ParseTextureAtlasJson(itemPath)
            : null;

        var itemTextures = defaultVanilla != null
            ? new Dictionary<string, PackScanner.ParsedAliasData>(defaultVanilla.ItemTextures, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, PackScanner.ParsedAliasData>(StringComparer.OrdinalIgnoreCase);

        if (customItemTextures != null)
        {
            foreach (var (k, v) in customItemTextures)
                itemTextures[k] = v;
        }

        var rawItem = defaultVanilla != null
            ? new Dictionary<string, string>(defaultVanilla.RawItemTextureJson, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        var declaredItemPaths = defaultVanilla != null
            ? new HashSet<string>(defaultVanilla.DeclaredItemPaths, StringComparer.OrdinalIgnoreCase)
            : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (File.Exists(itemPath))
        {
            using var stream = File.OpenRead(itemPath);
            using var doc = JsonDocument.Parse(stream, PackScanner.ScanDocOptions);
            if (doc.RootElement.TryGetProperty("texture_data", out var td))
            {
                foreach (var prop in td.EnumerateObject())
                {
                    rawItem[prop.Name] = prop.Value.GetRawText();
                }
            }
        }
        if (customItemTextures != null)
        {
            foreach (var (_, d) in customItemTextures)
            {
                foreach (var e in d.Entries)
                {
                    declaredItemPaths.Add(VanillaDataService.NormalizeTexturePath(e.RawPath));
                }
            }
        }

        var flipbooks = File.Exists(flipbookPath)
            ? PackScanner.ParseFlipbookTextures(flipbookPath)
            : (defaultVanilla?.Flipbooks ?? new PackScanner.FlipbookCatalog());

        var rawFlipbooks = defaultVanilla != null
            ? new Dictionary<string, string>(defaultVanilla.RawFlipbookJson, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        var langKeys = defaultVanilla != null
            ? new Dictionary<string, string>(defaultVanilla.LangKeys, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

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
            flipbooks,
            rawFlipbooks,
            langKeys,
            declaredBlockPaths,
            declaredItemPaths,
            DateTime.Now,
            $"Custom Pack: {packName}"
        );
    }

    private class SavedPackConfig
    {
        public string Id { get; set; } = "";
        public string Path { get; set; } = "";
    }
}