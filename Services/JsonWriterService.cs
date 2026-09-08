using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace McTextureGhost.Services;

/// <summary>
/// Handles the "blank project" case: no JSON entry exists yet for a texture
/// the user wants. Each Add* method read-modifies-writes the relevant JSON
/// file(s) rather than overwriting them, so existing entries are preserved.
/// </summary>
public static class JsonWriterService
{
    private static readonly JsonSerializerOptions WriteOptions = new() { WriteIndented = true };
    private static readonly JsonDocumentOptions DocOptions = new()
    {
        AllowTrailingCommas = true,
        CommentHandling = JsonCommentHandling.Skip
    };

    public static string DefaultBlockId(string alias) => $"custom:{Sanitize(alias)}";

    /// <summary>Single texture applied to every face. Simplest, most common case.</summary>
    public static void AddPlainBlock(string packRoot, string alias, string? blockId = null)
    {
        blockId ??= DefaultBlockId(alias);

        var terrain = LoadOrCreateTerrainTexture(packRoot);
        GetTextureData(terrain)[alias] = new JsonObject
        {
            ["textures"] = $"textures/blocks/{alias}"
        };
        SaveTerrainTexture(packRoot, terrain);

        var blocks = LoadOrCreateBlocksJson(packRoot);
        blocks[blockId] = new JsonObject
        {
            ["sound"] = "stone",
            ["textures"] = alias
        };
        SaveBlocksJson(packRoot, blocks);
    }

    /// <summary>
    /// Creates three aliases (alias_top / alias_bottom / alias_side) and wires
    /// blocks.json's per-face texture object to them. Only the base alias is
    /// opened immediately - the other two faces show up as ordinary
    /// "declared but missing" ghosts, ready to click and paint individually.
    /// </summary>
    public static string AddPerFaceBlock(string packRoot, string alias, string? blockId = null)
    {
        blockId ??= DefaultBlockId(alias);
        var top = $"{alias}_top";
        var bottom = $"{alias}_bottom";
        var side = $"{alias}_side";

        var terrain = LoadOrCreateTerrainTexture(packRoot);
        var textureData = GetTextureData(terrain);
        foreach (var a in new[] { top, bottom, side })
            textureData[a] = new JsonObject { ["textures"] = $"textures/blocks/{a}" };
        SaveTerrainTexture(packRoot, terrain);

        var blocks = LoadOrCreateBlocksJson(packRoot);
        blocks[blockId] = new JsonObject
        {
            ["sound"] = "stone",
            ["textures"] = new JsonObject
            {
                ["up"] = top,
                ["down"] = bottom,
                ["north"] = side,
                ["south"] = side,
                ["east"] = side,
                ["west"] = side
            }
        };
        SaveBlocksJson(packRoot, blocks);

        return top; // caller opens this one first
    }

    /// <summary>
    /// Plain single-texture block wiring, plus a flipbook_textures.json entry
    /// so the texture animates (Prismarine-style) once frames are painted
    /// into a vertically-stacked sprite sheet at the same path.
    /// </summary>
    public static void AddFlipbookBlock(string packRoot, string alias, string? blockId = null, int ticksPerFrame = 10)
    {
        blockId ??= DefaultBlockId(alias);

        var terrain = LoadOrCreateTerrainTexture(packRoot);
        GetTextureData(terrain)[alias] = new JsonObject
        {
            ["textures"] = $"textures/blocks/{alias}"
        };
        SaveTerrainTexture(packRoot, terrain);

        var flipbookPath = Path.Combine(packRoot, "textures", "flipbook_textures.json");
        var flipbook = LoadOrCreateJsonArray(flipbookPath);
        flipbook.Add(new JsonObject
        {
            ["flipbook_texture"] = $"textures/blocks/{alias}",
            ["atlas_tile"] = alias,
            ["ticks_per_frame"] = ticksPerFrame
        });
        File.WriteAllText(flipbookPath, flipbook.ToJsonString(WriteOptions));

        var blocks = LoadOrCreateBlocksJson(packRoot);
        blocks[blockId] = new JsonObject
        {
            ["sound"] = "stone",
            ["textures"] = alias
        };
        SaveBlocksJson(packRoot, blocks);
    }

    /// <summary>Registers an existing orphan texture file into terrain_texture.json.</summary>
    public static void RegisterOrphan(string packRoot, string alias, string relativePath)
    {
        var terrain = LoadOrCreateTerrainTexture(packRoot);
        var textureData = GetTextureData(terrain);
        textureData[alias] = new JsonObject
        {
            ["textures"] = relativePath
        };
        SaveTerrainTexture(packRoot, terrain);
    }

    // ---- shared JSON plumbing ----

    private static JsonObject GetTextureData(JsonObject terrain)
    {
        if (terrain["texture_data"] is not JsonObject textureData)
        {
            textureData = new JsonObject();
            terrain["texture_data"] = textureData;
        }
        return textureData;
    }

    private static JsonObject LoadOrCreateTerrainTexture(string packRoot)
    {
        var path = Path.Combine(packRoot, "textures", "terrain_texture.json");
        if (File.Exists(path))
            return JsonNode.Parse(File.ReadAllText(path), null, DocOptions)!.AsObject();

        return new JsonObject
        {
            ["format_version"] = "1.19.30",
            ["resource_pack_name"] = "pack",
            ["texture_name"] = "atlas.terrain",
            ["padding"] = 8,
            ["num_mip_levels"] = 4,
            ["texture_data"] = new JsonObject()
        };
    }

    private static void SaveTerrainTexture(string packRoot, JsonObject terrain)
    {
        var path = Path.Combine(packRoot, "textures", "terrain_texture.json");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, terrain.ToJsonString(WriteOptions));
    }

    private static JsonObject LoadOrCreateBlocksJson(string packRoot)
    {
        var path = Path.Combine(packRoot, "blocks.json");
        if (File.Exists(path))
            return JsonNode.Parse(File.ReadAllText(path), null, DocOptions)!.AsObject();

        return new JsonObject { ["format_version"] = "1.19.30" };
    }

    private static void SaveBlocksJson(string packRoot, JsonObject blocks)
    {
        var path = Path.Combine(packRoot, "blocks.json");
        File.WriteAllText(path, blocks.ToJsonString(WriteOptions));
    }

    private static JsonArray LoadOrCreateJsonArray(string path)
    {
        if (File.Exists(path))
            return JsonNode.Parse(File.ReadAllText(path), null, DocOptions)!.AsArray();

        return new JsonArray();
    }

    private static string Sanitize(string alias) =>
        alias.Trim().Replace(" ", "_").ToLowerInvariant();
}
