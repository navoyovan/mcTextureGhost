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
    public static List<TextureAlias> Scan(string packRoot)
    {
        var terrainTexturePath = Path.Combine(packRoot, "textures", "terrain_texture.json");
        var blocksJsonPath = Path.Combine(packRoot, "blocks.json");

        if (!File.Exists(terrainTexturePath))
            throw new FileNotFoundException(
                $"Couldn't find textures/terrain_texture.json under {packRoot}. " +
                "Point this at your resource pack's root folder (the one with manifest.json).");

        var aliasToRelativePaths = ParseTerrainTexture(terrainTexturePath);
        var aliasUsage = File.Exists(blocksJsonPath)
            ? ParseBlocksJson(blocksJsonPath)
            : new Dictionary<string, List<BlockFaceUsage>>(StringComparer.OrdinalIgnoreCase);

        var existingFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var texturesDir = Path.Combine(packRoot, "textures");
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

        foreach (var (alias, relativePaths) in aliasToRelativePaths)
        {
            aliasUsage.TryGetValue(alias, out var blockFaces);
            var facesList = blockFaces ?? new List<BlockFaceUsage>();

            if (relativePaths.Count <= 1)
            {
                var primaryRelative = relativePaths.FirstOrDefault();
                if (primaryRelative is null) continue;

                var (fullPath, finalRel, exists) = ResolveTexture(packRoot, primaryRelative, existingFiles, texturesDirNormalized);
                if (exists) matchedFiles.Add(fullPath);

                results.Add(new TextureAlias
                {
                    Alias = alias,
                    DisplayName = alias,
                    RelativePath = finalRel,
                    FullPath = fullPath,
                    Status = exists ? TextureStatus.Ok : TextureStatus.Ghost,
                    IsVariant = false,
                    BlockFaces = facesList
                });
            }
            else
            {
                for (int i = 0; i < relativePaths.Count; i++)
                {
                    var rel = relativePaths[i];
                    var (fullPath, finalRel, exists) = ResolveTexture(packRoot, rel, existingFiles, texturesDirNormalized);
                    if (exists) matchedFiles.Add(fullPath);

                    // Keep DisplayName clean as the alias name (no ugly duplicate/truncated suffixes)
                    results.Add(new TextureAlias
                    {
                        Alias = alias,
                        DisplayName = alias,
                        RelativePath = finalRel,
                        FullPath = fullPath,
                        Status = exists ? TextureStatus.Ok : TextureStatus.Ghost,
                        IsVariant = true,
                        VariantIndex = i + 1,
                        TotalVariants = relativePaths.Count,
                        BlockFaces = facesList
                    });
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

            results.Add(new TextureAlias
            {
                Alias = fileNameWithoutExt,
                DisplayName = fileNameWithoutExt,
                RelativePath = relNoExt,
                FullPath = file,
                Status = TextureStatus.Orphan,
                IsVariant = false,
                BlockFaces = new List<BlockFaceUsage>()
            });
        }

        return results.OrderBy(r => r.Alias, StringComparer.OrdinalIgnoreCase)
                      .ThenBy(r => r.VariantIndex ?? 0)
                      .ToList();
    }

    /// <summary>
    /// Resolves the absolute path and existence on disk for a texture, checking .png
    /// and fallback extensions (such as .tga), and handling paths with or without "textures/" prefix.
    /// </summary>
    private static (string fullPath, string relativePath, bool exists) ResolveTexture(
        string packRoot,
        string rawRelativePath,
        HashSet<string> existingFiles,
        string? texturesDirNormalized)
    {
        var cleanRel = rawRelativePath.Replace('\\', '/').TrimStart('/');
        bool hasExtension = Path.HasExtension(cleanRel);
        bool startsWithTextures = cleanRel.StartsWith("textures/", StringComparison.OrdinalIgnoreCase);

        var candidates = new List<string>();
        if (hasExtension)
        {
            candidates.Add(cleanRel);
            if (!startsWithTextures) candidates.Add("textures/" + cleanRel);
        }
        else
        {
            candidates.Add(cleanRel + ".png");
            candidates.Add(cleanRel + ".tga");
            if (!startsWithTextures)
            {
                candidates.Add("textures/" + cleanRel + ".png");
                candidates.Add("textures/" + cleanRel + ".tga");
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

        string defaultRel = startsWithTextures ? cleanRel : "textures/" + cleanRel;
        string defaultFull = Path.GetFullPath(Path.Combine(packRoot, (defaultRel + ".png").Replace('/', Path.DirectorySeparatorChar)));
        return (defaultFull, defaultRel, false);
    }

    private static readonly JsonDocumentOptions ScanDocOptions = new()
    {
        AllowTrailingCommas = true,
        CommentHandling = JsonCommentHandling.Skip
    };

    /// <summary>
    /// Returns alias -> list of raw relative paths (including variation paths).
    /// </summary>
    private static Dictionary<string, List<string>> ParseTerrainTexture(string path)
    {
        using var stream = File.OpenRead(path);
        using var doc = JsonDocument.Parse(stream, ScanDocOptions);

        var result = new Dictionary<string, List<string>>();

        if (!doc.RootElement.TryGetProperty("texture_data", out var textureData))
            return result;

        foreach (var entry in textureData.EnumerateObject())
        {
            var alias = entry.Name;
            var paths = new List<string>();

            if (entry.Value.ValueKind == JsonValueKind.Object)
            {
                if (entry.Value.TryGetProperty("textures", out var texturesProp))
                {
                    ExtractPaths(texturesProp, paths);
                }
                else if (entry.Value.TryGetProperty("variations", out var varProp))
                {
                    ExtractPaths(varProp, paths);
                }
            }
            else if (entry.Value.ValueKind == JsonValueKind.String || entry.Value.ValueKind == JsonValueKind.Array)
            {
                ExtractPaths(entry.Value, paths);
            }

            if (paths.Count > 0)
                result[alias] = paths.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        return result;
    }

    private static void ExtractPaths(JsonElement element, List<string> paths)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.String:
                var str = element.GetString()?.Trim();
                if (!string.IsNullOrEmpty(str))
                    paths.Add(str);
                break;

            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    ExtractPaths(item, paths);
                }
                break;

            case JsonValueKind.Object:
                if (element.TryGetProperty("path", out var pathProp) && pathProp.ValueKind == JsonValueKind.String)
                {
                    var pathStr = pathProp.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(pathStr))
                        paths.Add(pathStr);
                }

                if (element.TryGetProperty("variations", out var varProp))
                {
                    ExtractPaths(varProp, paths);
                }
                break;
        }
    }

    /// <summary>
    /// Returns alias -> list of BlockFaceUsage (block ID + face name) from blocks.json,
    /// covering both uniform blocks ("textures": "alias") and per-face blocks ("up", "down", etc.).
    /// </summary>
    private static Dictionary<string, List<BlockFaceUsage>> ParseBlocksJson(string path)
    {
        using var stream = File.OpenRead(path);
        using var doc = JsonDocument.Parse(stream, ScanDocOptions);

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

    private static IEnumerable<(string alias, string face)> ExtractAliasFaces(JsonElement texturesProp, bool isCarried = false)
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
}
