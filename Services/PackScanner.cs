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
            : new Dictionary<string, List<string>>();

        var results = new List<TextureAlias>();

        foreach (var (alias, relativePaths) in aliasToRelativePaths)
        {
            // A variation array can list several paths for one alias; we surface
            // the first as the "primary" tile and note the rest in FullPath tooltip
            // territory is out of scope for this scaffold - primary only for now.
            var primaryRelative = relativePaths.FirstOrDefault();
            if (primaryRelative is null) continue;

            var fullPath = Path.Combine(packRoot, NormalizeToPng(primaryRelative));

            aliasUsage.TryGetValue(alias, out var usedBy);

            results.Add(new TextureAlias
            {
                Alias = alias,
                RelativePath = primaryRelative,
                FullPath = fullPath,
                Exists = File.Exists(fullPath),
                UsedByBlocks = usedBy ?? new List<string>()
            });
        }

        return results.OrderBy(r => r.Alias, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static string NormalizeToPng(string relativePath)
    {
        // terrain_texture.json paths are given without extension and use forward
        // slashes regardless of OS; convert both.
        var withSlashes = relativePath.Replace('/', Path.DirectorySeparatorChar);
        return withSlashes.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
            ? withSlashes
            : withSlashes + ".png";
    }

    /// <summary>
    /// Returns alias -> list of raw relative paths (usually just one, more for variations).
    /// </summary>
    private static Dictionary<string, List<string>> ParseTerrainTexture(string path)
    {
        using var stream = File.OpenRead(path);
        using var doc = JsonDocument.Parse(stream, new JsonDocumentOptions { AllowTrailingCommas = true });

        var result = new Dictionary<string, List<string>>();

        if (!doc.RootElement.TryGetProperty("texture_data", out var textureData))
            return result;

        foreach (var entry in textureData.EnumerateObject())
        {
            var alias = entry.Name;
            var paths = new List<string>();

            if (entry.Value.TryGetProperty("textures", out var texturesProp))
            {
                CollectPaths(texturesProp, paths);
            }

            if (paths.Count > 0)
                result[alias] = paths;
        }

        return result;
    }

    private static void CollectPaths(JsonElement texturesProp, List<string> paths)
    {
        switch (texturesProp.ValueKind)
        {
            case JsonValueKind.String:
                paths.Add(texturesProp.GetString()!);
                break;

            case JsonValueKind.Array:
                foreach (var item in texturesProp.EnumerateArray())
                {
                    if (item.ValueKind == JsonValueKind.String)
                    {
                        paths.Add(item.GetString()!);
                    }
                    else if (item.ValueKind == JsonValueKind.Object &&
                             item.TryGetProperty("path", out var p))
                    {
                        paths.Add(p.GetString()!);
                    }
                }
                break;

            case JsonValueKind.Object:
                // Variation-style: { "path": "...", "variations": [...] } or similar.
                if (texturesProp.TryGetProperty("path", out var pathProp))
                    paths.Add(pathProp.GetString()!);
                break;
        }
    }

    /// <summary>
    /// Returns alias -> list of block IDs ("namespace:name") that reference it,
    /// whether directly (string textures) or per-face (object textures).
    /// </summary>
    private static Dictionary<string, List<string>> ParseBlocksJson(string path)
    {
        using var stream = File.OpenRead(path);
        using var doc = JsonDocument.Parse(stream, new JsonDocumentOptions { AllowTrailingCommas = true });

        var usage = new Dictionary<string, List<string>>();

        foreach (var entry in doc.RootElement.EnumerateObject())
        {
            if (entry.Name == "format_version") continue;
            var blockId = entry.Name;

            if (!entry.Value.TryGetProperty("textures", out var texturesProp))
                continue;

            foreach (var alias in ExtractAliases(texturesProp))
            {
                if (!usage.TryGetValue(alias, out var list))
                    usage[alias] = list = new List<string>();
                list.Add(blockId);
            }
        }

        return usage;
    }

    private static IEnumerable<string> ExtractAliases(JsonElement texturesProp)
    {
        switch (texturesProp.ValueKind)
        {
            case JsonValueKind.String:
                yield return texturesProp.GetString()!;
                break;
            case JsonValueKind.Object:
                foreach (var face in texturesProp.EnumerateObject())
                {
                    if (face.Value.ValueKind == JsonValueKind.String)
                        yield return face.Value.GetString()!;
                }
                break;
        }
    }
}
