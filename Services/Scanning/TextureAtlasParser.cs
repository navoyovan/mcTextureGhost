using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using McTextureGhost.Models;

namespace McTextureGhost.Services.Scanning;

public record TextureSlotEntry(
    string RawPath,
    int? BlockVariantIndex = null,
    int? TotalBlockVariants = null,
    int? TextureVariantIndex = null,
    int? TotalTextureVariants = null,
    int? Weight = null);

public record ParsedAliasData(List<TextureSlotEntry> Entries);

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
/// Parses terrain_texture.json, item_texture.json, and flipbook_textures.json.
/// </summary>
public static class TextureAtlasParser
{
    /// <summary>
    /// Returns alias -> ParsedAliasData from terrain_texture.json or item_texture.json (handling single strings,
    /// block variants "textures": [], random texture variations "variations": [], and nested variants).
    /// </summary>
    public static Dictionary<string, ParsedAliasData> ParseTextureAtlasJson(string path)
    {
        using var stream = ScanningJsonUtils.OpenSharedRead(path);
        using var doc = JsonDocument.Parse(stream, ScanningJsonUtils.ScanDocOptions);
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
    /// Parses textures/flipbook_textures.json and returns a multi-index FlipbookCatalog.
    /// </summary>
    public static FlipbookCatalog ParseFlipbookTextures(string path)
    {
        if (!File.Exists(path)) return new FlipbookCatalog();

        try
        {
            using var stream = ScanningJsonUtils.OpenSharedRead(path);
            using var doc = JsonDocument.Parse(stream, ScanningJsonUtils.ScanDocOptions);
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
}
