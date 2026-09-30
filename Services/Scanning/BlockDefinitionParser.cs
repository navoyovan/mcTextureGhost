using System.IO;
using System.Text.Json;
using McTextureGhost.Models;

namespace McTextureGhost.Services.Scanning;

/// <summary>
/// Parser for Minecraft Bedrock blocks.json and *.texture_set.json files.
/// Extracts block IDs, face usages, and PBR texture set references.
/// </summary>
public static class BlockDefinitionParser
{
    /// <summary>
    /// Returns alias -> list of BlockFaceUsage (block ID + face name) from blocks.json,
    /// covering both uniform blocks ("textures": "alias") and per-face blocks ("up", "down", etc.).
    /// </summary>
    public static Dictionary<string, List<BlockFaceUsage>> ParseBlocksJson(string path)
    {
        using var stream = ScanningJsonUtils.OpenSharedRead(path);
        using var doc = JsonDocument.Parse(stream, ScanningJsonUtils.ScanDocOptions);
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
            using var stream = ScanningJsonUtils.OpenSharedRead(textureSetFilePath);
            using var doc = JsonDocument.Parse(stream, ScanningJsonUtils.ScanDocOptions);

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
                    var (fullPath, _, exists) = PackScanner.ResolveTexture(packRoot, normName, existingFiles, texturesDirNormalized, "blocks");
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
    /// Summarizes face usages (e.g., "all", "top/btm", "north/south", "multi").
    /// </summary>
    public static string SummarizeFaces(List<BlockFaceUsage> faces)
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
