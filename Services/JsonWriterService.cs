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

    /// <summary>Registers an existing orphan item texture file into item_texture.json.</summary>
    public static void RegisterItemOrphan(string packRoot, string alias, string relativePath)
    {
        var itemTexture = LoadOrCreateItemTexture(packRoot);
        var textureData = GetTextureData(itemTexture);
        textureData[alias] = new JsonObject
        {
            ["textures"] = relativePath
        };
        SaveItemTexture(packRoot, itemTexture);
    }

    /// <summary>
    /// Adds a vanilla block and all its referenced aliases to the pack's JSON files.
    /// </summary>
    public static void AddVanillaBlock(string packRoot, string blockId, VanillaData vanilla)
    {
        if (vanilla.RawBlocksJson.TryGetValue(blockId, out var rawBlockJson))
        {
            var blocks = LoadOrCreateBlocksJson(packRoot);
            blocks[blockId] = JsonNode.Parse(rawBlockJson);
            SaveBlocksJson(packRoot, blocks);
        }

        if (vanilla.BlockToAliases.TryGetValue(blockId, out var aliases))
        {
            var terrain = LoadOrCreateTerrainTexture(packRoot);
            var textureData = GetTextureData(terrain);
            bool terrainChanged = false;

            foreach (var alias in aliases)
            {
                if (!textureData.ContainsKey(alias) && vanilla.RawTerrainTextureJson.TryGetValue(alias, out var rawTerrainJson))
                {
                    textureData[alias] = JsonNode.Parse(rawTerrainJson);
                    terrainChanged = true;
                }

                if (vanilla.RawFlipbookJson.TryGetValue(alias, out var rawFbJson))
                {
                    AppendFlipbookIfNotExists(packRoot, alias, rawFbJson);
                }
            }

            if (terrainChanged)
            {
                SaveTerrainTexture(packRoot, terrain);
            }
        }
    }

    /// <summary>
    /// Adds a single vanilla alias into terrain_texture.json (and flipbook_textures.json if applicable).
    /// </summary>
    public static void AddVanillaBlockAlias(string packRoot, string alias, VanillaData vanilla)
    {
        var terrain = LoadOrCreateTerrainTexture(packRoot);
        var textureData = GetTextureData(terrain);

        if (vanilla.RawTerrainTextureJson.TryGetValue(alias, out var rawTerrainJson))
        {
            textureData[alias] = JsonNode.Parse(rawTerrainJson);
            SaveTerrainTexture(packRoot, terrain);
        }

        if (vanilla.RawFlipbookJson.TryGetValue(alias, out var rawFbJson))
        {
            AppendFlipbookIfNotExists(packRoot, alias, rawFbJson);
        }
    }

    /// <summary>
    /// Adds a vanilla item alias into item_texture.json (and flipbook_textures.json if applicable).
    /// </summary>
    public static void AddVanillaItem(string packRoot, string itemAlias, VanillaData vanilla)
    {
        var itemTexture = LoadOrCreateItemTexture(packRoot);
        var textureData = GetTextureData(itemTexture);

        if (vanilla.RawItemTextureJson.TryGetValue(itemAlias, out var rawItemJson))
        {
            textureData[itemAlias] = JsonNode.Parse(rawItemJson);
            SaveItemTexture(packRoot, itemTexture);
        }

        if (vanilla.RawFlipbookJson.TryGetValue(itemAlias, out var rawFbJson))
        {
            AppendFlipbookIfNotExists(packRoot, itemAlias, rawFbJson);
        }
    }

    /// <summary>
    /// Adds a vanilla client entity (or attachable) definition to the pack's entity/ or attachables/ folder.
    /// </summary>
    public static void AddVanillaEntity(string packRoot, string entityId, VanillaData vanilla)
    {
        var cleanId = entityId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase)
            ? entityId.Substring(10)
            : entityId;

        // 1. Write the client entity JSON if available
        if (vanilla.RawClientEntityJson.TryGetValue(entityId, out var rawJson) ||
            vanilla.RawClientEntityJson.TryGetValue(cleanId, out rawJson))
        {
            var isAttachable = vanilla.RawClientEntityRelPath.TryGetValue(entityId, out var relPath) && relPath.StartsWith("attachables", StringComparison.OrdinalIgnoreCase);
            var targetFolder = isAttachable ? Path.Combine(packRoot, "attachables") : Path.Combine(packRoot, "entity");
            Directory.CreateDirectory(targetFolder);

            var fileName = isAttachable ? $"{cleanId}.json" : $"{cleanId}.entity.json";
            var targetFile = Path.Combine(targetFolder, fileName);

            if (!File.Exists(targetFile))
            {
                File.WriteAllText(targetFile, rawJson);
            }

            // Also create the textures/entity/<cleanId> folder to prepare for texture files
            var texturesFolder = Path.Combine(packRoot, "textures", "entity", cleanId);
            Directory.CreateDirectory(texturesFolder);
        }
    }

    private static void AppendFlipbookIfNotExists(string packRoot, string aliasOrPath, string rawFlipbookJson)
    {
        var flipbookPath = Path.Combine(packRoot, "textures", "flipbook_textures.json");
        var flipbook = LoadOrCreateJsonArray(flipbookPath);

        bool exists = false;
        foreach (var node in flipbook)
        {
            if (node is JsonObject obj)
            {
                if (obj.TryGetPropertyValue("atlas_tile", out var at) && at?.ToString() == aliasOrPath)
                {
                    exists = true;
                    break;
                }
                if (obj.TryGetPropertyValue("flipbook_texture", out var ft) && ft?.ToString() == aliasOrPath)
                {
                    exists = true;
                    break;
                }
            }
        }

        if (!exists)
        {
            flipbook.Add(JsonNode.Parse(rawFlipbookJson));
            Directory.CreateDirectory(Path.GetDirectoryName(flipbookPath)!);
            File.WriteAllText(flipbookPath, flipbook.ToJsonString(WriteOptions));
        }
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

    private static JsonObject LoadOrCreateItemTexture(string packRoot)
    {
        var path = Path.Combine(packRoot, "textures", "item_texture.json");
        if (File.Exists(path))
            return JsonNode.Parse(File.ReadAllText(path), null, DocOptions)!.AsObject();

        return new JsonObject
        {
            ["resource_pack_name"] = "pack",
            ["texture_name"] = "atlas.items",
            ["texture_data"] = new JsonObject()
        };
    }

    private static void SaveItemTexture(string packRoot, JsonObject itemTexture)
    {
        var path = Path.Combine(packRoot, "textures", "item_texture.json");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, itemTexture.ToJsonString(WriteOptions));
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

    public static void DeleteTextureEntries(string packRoot, string alias, string category, string? relativePath = null)
    {
        if (string.Equals(category, "item", StringComparison.OrdinalIgnoreCase))
        {
            var itemTexturePath = Path.Combine(packRoot, "textures", "item_texture.json");
            if (File.Exists(itemTexturePath))
            {
                var itemObj = LoadOrCreateItemTexture(packRoot);
                var texData = GetTextureData(itemObj);
                if (texData.ContainsKey(alias))
                {
                    texData.Remove(alias);
                    SaveItemTexture(packRoot, itemObj);
                }
            }
        }
        else if (string.Equals(category, "entity", StringComparison.OrdinalIgnoreCase))
        {
            // Extract cleanId and slotKey if alias is formatted as "cleanId:slotKey" or "minecraft:cleanId:slotKey"
            var targetId = alias;
            string cleanId;
            string? targetSlotKey = null;
            var colonIdx = targetId.IndexOf(':');
            if (colonIdx >= 0)
            {
                if (targetId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase))
                {
                    var secondColon = targetId.IndexOf(':', 10);
                    if (secondColon >= 0)
                    {
                        cleanId = targetId.Substring(10, secondColon - 10);
                        targetSlotKey = targetId.Substring(secondColon + 1);
                    }
                    else
                    {
                        cleanId = targetId.Substring(10);
                    }
                }
                else
                {
                    cleanId = targetId.Substring(0, colonIdx);
                    targetSlotKey = targetId.Substring(colonIdx + 1);
                }
            }
            else
            {
                cleanId = targetId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase)
                    ? targetId.Substring(10)
                    : targetId;
            }

            // 1. If an explicit relativePath is provided and points to a JSON definition file, delete it
            if (!string.IsNullOrWhiteSpace(relativePath))
            {
                var explicitPath = Path.Combine(packRoot, relativePath.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar));
                if (File.Exists(explicitPath) && explicitPath.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                {
                    try { File.Delete(explicitPath); } catch { }
                }
            }

            // Direct standard file paths
            var directPaths = new[]
            {
                Path.Combine(packRoot, "entity", $"{cleanId}.entity.json"),
                Path.Combine(packRoot, "entity", $"{cleanId}.json"),
                Path.Combine(packRoot, "attachables", $"{cleanId}.entity.json"),
                Path.Combine(packRoot, "attachables", $"{cleanId}.json")
            };

            foreach (var p in directPaths)
            {
                if (File.Exists(p))
                {
                    try { File.Delete(p); } catch { }
                }
            }

            // Search in entity/ and attachables/ directories for any JSON files declaring this entity or containing texture slots
            string[] searchDirs = { Path.Combine(packRoot, "entity"), Path.Combine(packRoot, "attachables") };
            foreach (var dir in searchDirs)
            {
                if (Directory.Exists(dir))
                {
                    try
                    {
                        var files = Directory.GetFiles(dir, "*.json", SearchOption.AllDirectories);
                        foreach (var file in files)
                        {
                            var fname = Path.GetFileNameWithoutExtension(file);
                            if (fname.EndsWith(".entity", StringComparison.OrdinalIgnoreCase))
                            {
                                fname = fname.Substring(0, fname.Length - 7);
                            }

                            // Match by filename
                            if (string.Equals(fname, cleanId, StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(fname, alias, StringComparison.OrdinalIgnoreCase))
                            {
                                if (File.Exists(file))
                                {
                                    try { File.Delete(file); continue; } catch { }
                                }
                            }

                            // Inspect JSON content for identifier match or texture slot match
                            try
                            {
                                var jsonContent = File.ReadAllText(file);
                                if (jsonContent.Contains(cleanId, StringComparison.OrdinalIgnoreCase) ||
                                    (!string.IsNullOrEmpty(relativePath) && jsonContent.Contains(relativePath, StringComparison.OrdinalIgnoreCase)) ||
                                    (!string.IsNullOrEmpty(targetSlotKey) && jsonContent.Contains(targetSlotKey, StringComparison.OrdinalIgnoreCase)))
                                {
                                    var details = PackScanner.ParseClientEntityDetails(file);
                                    if (details.Any(d =>
                                        string.Equals(d.Identifier, cleanId, StringComparison.OrdinalIgnoreCase) ||
                                        string.Equals(d.Identifier, $"minecraft:{cleanId}", StringComparison.OrdinalIgnoreCase) ||
                                        string.Equals(d.Identifier, alias, StringComparison.OrdinalIgnoreCase) ||
                                        (!string.IsNullOrEmpty(targetSlotKey) && d.Textures.ContainsKey(targetSlotKey))))
                                    {
                                        File.Delete(file);
                                    }
                                }
                            }
                            catch
                            {
                                // Ignore json parsing errors
                            }
                        }
                    }
                    catch
                    {
                        // Ignore file search permission errors
                    }
                }
            }
        }
        else
        {
            var terrainPath = Path.Combine(packRoot, "textures", "terrain_texture.json");
            if (File.Exists(terrainPath))
            {
                var terrainObj = LoadOrCreateTerrainTexture(packRoot);
                var texData = GetTextureData(terrainObj);
                if (texData.ContainsKey(alias))
                {
                    texData.Remove(alias);
                    SaveTerrainTexture(packRoot, terrainObj);
                }
            }

            var blocksPath = Path.Combine(packRoot, "blocks.json");
            if (File.Exists(blocksPath))
            {
                var blocks = LoadOrCreateBlocksJson(packRoot);
                var keysToRemove = new List<string>();
                foreach (var kvp in blocks)
                {
                    if (kvp.Value is JsonObject bObj)
                    {
                        if (bObj.TryGetPropertyValue("textures", out var tVal))
                        {
                            if (tVal is JsonValue jVal && string.Equals(jVal.ToString(), alias, StringComparison.OrdinalIgnoreCase))
                            {
                                keysToRemove.Add(kvp.Key);
                            }
                            else if (tVal is JsonObject fObj)
                            {
                                bool matches = false;
                                foreach (var face in fObj)
                                {
                                    if (string.Equals(face.Value?.ToString(), alias, StringComparison.OrdinalIgnoreCase))
                                    {
                                        matches = true;
                                        break;
                                    }
                                }
                                if (matches) keysToRemove.Add(kvp.Key);
                            }
                        }
                    }
                }
                if (keysToRemove.Count > 0)
                {
                    foreach (var k in keysToRemove) blocks.Remove(k);
                    SaveBlocksJson(packRoot, blocks);
                }
            }
        }

        // Clean flipbook if present
        var flipbookPath = Path.Combine(packRoot, "textures", "flipbook_textures.json");
        if (File.Exists(flipbookPath))
        {
            var flipbook = LoadOrCreateJsonArray(flipbookPath);
            int countBefore = flipbook.Count;
            for (int i = flipbook.Count - 1; i >= 0; i--)
            {
                if (flipbook[i] is JsonObject fbObj)
                {
                    bool match = false;
                    if (fbObj.TryGetPropertyValue("atlas_tile", out var at) && string.Equals(at?.ToString(), alias, StringComparison.OrdinalIgnoreCase))
                        match = true;
                    if (fbObj.TryGetPropertyValue("flipbook_texture", out var ft) && (string.Equals(ft?.ToString(), alias, StringComparison.OrdinalIgnoreCase) || (relativePath != null && string.Equals(ft?.ToString(), relativePath, StringComparison.OrdinalIgnoreCase))))
                        match = true;
                    if (match) flipbook.RemoveAt(i);
                }
            }
            if (flipbook.Count != countBefore)
            {
                File.WriteAllText(flipbookPath, flipbook.ToJsonString(WriteOptions));
            }
        }
    }

    private static string Sanitize(string alias) =>
        alias.Trim().Replace(" ", "_").ToLowerInvariant();
}
