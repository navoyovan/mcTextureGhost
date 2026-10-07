using System.IO;
using System.Runtime.CompilerServices;
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

    // Pack JSON files are hot: background rescan readers hold them open while
    // IPC writers read-modify-write them (and rapid successive writes race each
    // other). Single-attempt IO throws "used by another process" under overlap,
    // so all pack JSON access below retries briefly on lock violations.
    // All public mutation entry points below are marked [MethodImpl(Synchronized)]:
    // since IPC handlers now run pack JSON mutations on background threads, concurrent
    // read-modify-write cycles on the same file would otherwise interleave (e.g. two
    // rapid variation scaffolds both computing `_var1`, last-write-wins data loss).
    // The attribute serializes them on the type lock; same-thread re-entry (e.g.
    // AddVanillaBlock -> AppendFlipbookIfNotExists) is safe because Monitor is reentrant.
    private const int IoMaxAttempts = 8;
    private const int IoRetryDelayMs = 50;

    private static void RetryOnLock(Action action) =>
        RetryOnLock(() => { action(); return true; });

    private static T RetryOnLock<T>(Func<T> action)
    {
        IOException? last = null;
        for (int attempt = 0; attempt < IoMaxAttempts; attempt++)
        {
            try
            {
                return action();
            }
            catch (IOException ex) when (attempt < IoMaxAttempts - 1)
            {
                last = ex;
                Thread.Sleep(IoRetryDelayMs * (attempt + 1));
            }
        }
        throw last!;
    }

    private static string ReadAllTextRetry(string path) =>
        RetryOnLock(() => File.ReadAllText(path));

    private static void WriteAllTextRetry(string path, string contents)
    {
        WriteJournal.RecordWrite(path);
        RetryOnLock(() => File.WriteAllText(path, contents));
    }

    public static string DefaultBlockId(string alias) => $"custom:{Sanitize(alias)}";

    /// <summary>Single texture applied to every face. Simplest, most common case.</summary>
    [MethodImpl(MethodImplOptions.Synchronized)]
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
    [MethodImpl(MethodImplOptions.Synchronized)]
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
    [MethodImpl(MethodImplOptions.Synchronized)]
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
        WriteAllTextRetry(flipbookPath, flipbook.ToJsonString(WriteOptions));

        var blocks = LoadOrCreateBlocksJson(packRoot);
        blocks[blockId] = new JsonObject
        {
            ["sound"] = "stone",
            ["textures"] = alias
        };
        SaveBlocksJson(packRoot, blocks);
    }

    private static string NormPath(string? p)
    {
        var n = (p ?? "").Replace('\\', '/').TrimStart('/').ToLowerInvariant();
        if (n.EndsWith(".png")) return n.Substring(0, n.Length - 4);
        if (n.EndsWith(".tga")) return n.Substring(0, n.Length - 4);
        return n;
    }

    private static string? SlotFirstPath(JsonNode? slot)
    {
        if (slot is JsonValue v) return v.TryGetValue<string>(out var s) ? s : null;
        if (slot is JsonObject o)
        {
            if (o.TryGetPropertyValue("path", out var p) && p is JsonValue pv && pv.TryGetValue<string>(out var ps)) return ps;
            if (o.TryGetPropertyValue("variations", out var vs) && vs is JsonArray va && va.Count > 0) return SlotFirstPath(va[0]);
        }
        return null;
    }

    private static List<string> CollectPaths(JsonNode? node)
    {
        var paths = new List<string>();
        void Walk(JsonNode? n)
        {
            if (n is JsonValue jv)
            {
                if (jv.TryGetValue<string>(out var s) && !string.IsNullOrWhiteSpace(s)) paths.Add(s);
            }
            else if (n is JsonObject jo)
            {
                if (jo.TryGetPropertyValue("path", out var p)) Walk(p);
                if (jo.TryGetPropertyValue("textures", out var t)) Walk(t);
                if (jo.TryGetPropertyValue("variations", out var v)) Walk(v);
            }
            else if (n is JsonArray ja)
            {
                foreach (var item in ja) Walk(item);
            }
        }
        Walk(node);
        return paths;
    }

    /// <summary>
    /// Appends a new texture variation (`{path, weight: 1}`) to a block alias in
    /// terrain_texture.json. The target `textures[]` slot is located by leaf relative
    /// path first, then 1-based blockVariantIndex, then slot 0. String-like slots are
    /// lifted to `{variations: [...]}` without data loss. The new path reuses the
    /// source texture's file stem with a `_var{N}` postfix. Returns the new variation
    /// path, or null when the existing entry has an unrecognized shape.
    /// </summary>
    [MethodImpl(MethodImplOptions.Synchronized)]
    public static string? AddTextureVariation(string packRoot, string alias, int? blockVariantIndex, string? relativePath)
    {
        var terrain = LoadOrCreateTerrainTexture(packRoot);
        var textureData = GetTextureData(terrain);

        JsonObject NewVariation(string path) => new() { ["path"] = path, ["weight"] = 1 };

        var existing = textureData.TryGetPropertyValue(alias, out var aliasNode) ? aliasNode : null;
        var existingNorms = new HashSet<string>(CollectPaths(existing).Select(NormPath), StringComparer.OrdinalIgnoreCase);

        // Target the right textures[] slot when the alias already declares blockstates
        JsonArray? slotArray = null;
        if (existing is JsonArray directArr)
        {
            slotArray = directArr;
        }
        else if (existing is JsonObject eo && eo.TryGetPropertyValue("textures", out var tProp) && tProp is JsonArray tArr)
        {
            slotArray = tArr;
        }

        int slotIdx = 0;
        var targetNorm = NormPath(relativePath);
        if (slotArray != null)
        {
            if (!string.IsNullOrEmpty(targetNorm))
            {
                for (int i = 0; i < slotArray.Count; i++)
                {
                    var itemPaths = CollectPaths(slotArray[i]).Select(NormPath);
                    if (itemPaths.Any(p => string.Equals(p, targetNorm, StringComparison.OrdinalIgnoreCase)))
                    {
                        slotIdx = i;
                        break;
                    }
                }
            }
            else if (blockVariantIndex.HasValue && blockVariantIndex.Value >= 1 && blockVariantIndex.Value <= slotArray.Count)
            {
                slotIdx = blockVariantIndex.Value - 1;
            }
        }

        // Target the source texture path to derive the variation stem name from
        string targetSourcePath = "";
        if (!string.IsNullOrWhiteSpace(relativePath))
        {
            targetSourcePath = NormPath(relativePath);
        }
        else if (slotArray != null && slotIdx >= 0 && slotIdx < slotArray.Count)
        {
            targetSourcePath = SlotFirstPath(slotArray[slotIdx]) ?? "";
        }
        if (string.IsNullOrWhiteSpace(targetSourcePath))
        {
            targetSourcePath = NormPath(alias);
        }

        var slash = targetSourcePath.LastIndexOf('/');
        var baseDir = "textures/blocks";
        string stem = "";
        if (slash >= 0)
        {
            baseDir = targetSourcePath.Substring(0, slash);
            stem = targetSourcePath.Substring(slash + 1);
        }
        else if (!string.IsNullOrWhiteSpace(targetSourcePath))
        {
            stem = targetSourcePath;
        }

        if (stem.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
            stem = stem.Substring(0, stem.Length - 4);
        if (stem.EndsWith(".tga", StringComparison.OrdinalIgnoreCase))
            stem = stem.Substring(0, stem.Length - 4);

        // If stem already has a _var{N} suffix, strip it so subsequent variations follow the root stem:
        // e.g. door_wood_lower_var1 -> door_wood_lower -> candidates: door_wood_lower_var2, door_wood_lower_var3
        var varMatch = System.Text.RegularExpressions.Regex.Match(stem, @"^(.*)_var\d+$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (varMatch.Success)
        {
            stem = varMatch.Groups[1].Value;
        }

        if (string.IsNullOrWhiteSpace(stem)) stem = alias.ToLowerInvariant();

        string newPath = "";
        for (int n = 1; ; n++)
        {
            var candidate = $"{baseDir}/{stem}_var{n}";
            if (!existingNorms.Contains(NormPath(candidate)))
            {
                newPath = candidate;
                break;
            }
        }

        if (slotArray != null)
        {
            var slot = slotArray[slotIdx];
            if (slot is JsonValue)
            {
                slotArray[slotIdx] = new JsonObject { ["variations"] = new JsonArray { new JsonObject { ["path"] = SlotFirstPath(slot), ["weight"] = 1 }, NewVariation(newPath) } };
            }
            else if (slot is JsonObject so && so.TryGetPropertyValue("variations", out var vs) && vs is JsonArray va)
            {
                va.Add(NewVariation(newPath));
            }
            else if (slot is JsonObject po && po.TryGetPropertyValue("path", out _))
            {
                var oldPath = SlotFirstPath(slot);
                slotArray[slotIdx] = new JsonObject { ["variations"] = new JsonArray { new JsonObject { ["path"] = oldPath, ["weight"] = 1 }, NewVariation(newPath) } };
            }
            else
            {
                return null;
            }

            SaveTerrainTexture(packRoot, terrain);
            return newPath;
        }

        if (existing is JsonValue)
        {
            var oldPath = SlotFirstPath(existing);
            textureData[alias] = new JsonObject { ["textures"] = new JsonObject { ["variations"] = new JsonArray { new JsonObject { ["path"] = oldPath, ["weight"] = 1 }, NewVariation(newPath) } } };
        }
        else if (existing is JsonObject exo)
        {
            if (exo.TryGetPropertyValue("variations", out var dvs) && dvs is JsonArray dva)
            {
                dva.Add(NewVariation(newPath));
            }
            else if (exo.TryGetPropertyValue("path", out _))
            {
                var oldPath = SlotFirstPath(existing);
                textureData[alias] = new JsonObject { ["textures"] = new JsonObject { ["variations"] = new JsonArray { new JsonObject { ["path"] = oldPath, ["weight"] = 1 }, NewVariation(newPath) } } };
            }
            else if (exo.TryGetPropertyValue("textures", out var single))
            {
                if (single is JsonValue)
                {
                    var oldPath = SlotFirstPath(single);
                    exo["textures"] = new JsonObject { ["variations"] = new JsonArray { new JsonObject { ["path"] = oldPath, ["weight"] = 1 }, NewVariation(newPath) } };
                }
                else if (single is JsonObject sjo && sjo.TryGetPropertyValue("variations", out var svs) && svs is JsonArray sva)
                {
                    sva.Add(NewVariation(newPath));
                }
                else if (single is JsonObject pjo && pjo.TryGetPropertyValue("path", out _))
                {
                    var oldPath = SlotFirstPath(single);
                    exo["textures"] = new JsonObject { ["variations"] = new JsonArray { new JsonObject { ["path"] = oldPath, ["weight"] = 1 }, NewVariation(newPath) } };
                }
                else
                {
                    return null;
                }
            }
            else
            {
                return null;
            }
        }
        else
        {
            // Alias not declared yet — scaffold a single-slot variations entry
            textureData[alias] = new JsonObject { ["textures"] = new JsonObject { ["variations"] = new JsonArray { NewVariation(newPath) } } };
        }

        SaveTerrainTexture(packRoot, terrain);
        return newPath;
    }

    /// <summary>
    /// Removes one texture variation entry from a block alias in terrain_texture.json.
    /// The PNG file on disk is kept (it surfaces as an orphan). Single-remaining
    /// variations collapse back to plain entries; emptied slots and aliases are pruned.
    /// Returns true when the file was changed.
    /// </summary>
    [MethodImpl(MethodImplOptions.Synchronized)]
    public static bool DeleteTextureVariation(string packRoot, string alias, string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return false;
        var target = NormPath(relativePath);

        var terrain = LoadOrCreateTerrainTexture(packRoot);
        var textureData = GetTextureData(terrain);
        if (!textureData.TryGetPropertyValue(alias, out var aliasNode) || aliasNode is null) return false;

        static string? VariationPath(JsonNode? item)
        {
            if (item is JsonValue jv && jv.TryGetValue<string>(out var s)) return s;
            if (item is JsonObject jo && jo.TryGetPropertyValue("path", out var p) && p is JsonValue pjv && pjv.TryGetValue<string>(out var ps)) return ps;
            return null;
        }

        // Prune matching items from a variations array. Collapses a lone survivor
        // back to a plain entry. Returns "consumed" when the array is now empty.
        static bool PruneVariations(JsonArray va, string target, out JsonNode? survivor)
        {
            survivor = null;
            for (int i = va.Count - 1; i >= 0; i--)
            {
                var p = VariationPath(va[i]);
                if (p != null && string.Equals(NormPath(p), target, StringComparison.OrdinalIgnoreCase))
                    va.RemoveAt(i);
            }
            if (va.Count == 1)
            {
                survivor = va[0];
            }
            return va.Count == 0;
        }

        // Remove one slot from a textures[] array by index, collapsing survivors
        bool RemoveSlot(JsonArray slots, int idx)
        {
            var slot = slots[idx];
            if (slot is JsonObject so && so.TryGetPropertyValue("variations", out var vs) && vs is JsonArray va)
            {
                if (!CollectPaths(va).Select(NormPath).Any(p => string.Equals(p, target, StringComparison.OrdinalIgnoreCase)))
                    return false;
                if (PruneVariations(va, target, out var survivor))
                {
                    slots.RemoveAt(idx);
                }
                else if (survivor != null)
                {
                    slots[idx] = survivor;
                }
                return true;
            }

            if (CollectPaths(slot).Select(NormPath).Any(p => string.Equals(p, target, StringComparison.OrdinalIgnoreCase)))
            {
                slots.RemoveAt(idx);
                return true;
            }
            return false;
        }

        bool changed = false;

        if (aliasNode is JsonArray directArr)
        {
            for (int i = 0; i < directArr.Count; i++)
            {
                if (RemoveSlot(directArr, i)) { changed = true; break; }
            }
            if (changed && directArr.Count == 0) textureData.Remove(alias);
        }
        else if (aliasNode is JsonObject ao)
        {
            if (ao.TryGetPropertyValue("textures", out var tProp) && tProp is JsonArray tArr)
            {
                for (int i = 0; i < tArr.Count; i++)
                {
                    if (RemoveSlot(tArr, i)) { changed = true; break; }
                }
                if (changed && tArr.Count == 0) textureData.Remove(alias);
            }
            else if (ao.TryGetPropertyValue("textures", out var single))
            {
                if (single is JsonObject sjo && sjo.TryGetPropertyValue("variations", out var svs) && svs is JsonArray sva)
                {
                    if (CollectPaths(sva).Select(NormPath).Any(p => string.Equals(p, target, StringComparison.OrdinalIgnoreCase)))
                    {
                        if (PruneVariations(sva, target, out var survivor))
                            textureData.Remove(alias);
                        else if (survivor != null)
                            ao["textures"] = survivor;
                        changed = true;
                    }
                }
                else if (CollectPaths(single).Select(NormPath).Any(p => string.Equals(p, target, StringComparison.OrdinalIgnoreCase)))
                {
                    textureData.Remove(alias);
                    changed = true;
                }
            }
            else if (ao.TryGetPropertyValue("variations", out var dvs) && dvs is JsonArray dva)
            {
                if (CollectPaths(dva).Select(NormPath).Any(p => string.Equals(p, target, StringComparison.OrdinalIgnoreCase)))
                {
                    if (PruneVariations(dva, target, out var survivor))
                        textureData.Remove(alias);
                    else if (survivor != null)
                        textureData[alias] = survivor;
                    changed = true;
                }
            }
            else if (CollectPaths(aliasNode).Select(NormPath).Any(p => string.Equals(p, target, StringComparison.OrdinalIgnoreCase)))
            {
                textureData.Remove(alias);
                changed = true;
            }
        }
        else if (aliasNode is JsonValue)
        {
            if (CollectPaths(aliasNode).Select(NormPath).Any(p => string.Equals(p, target, StringComparison.OrdinalIgnoreCase)))
            {
                textureData.Remove(alias);
                changed = true;
            }
        }

        if (changed) SaveTerrainTexture(packRoot, terrain);
        return changed;
    }

    /// <summary>
    /// Updates the weight of a texture variation in terrain_texture.json.
    /// Finds the variation matching relativePath under the given alias and sets its "weight" property.
    /// Clamps weight between 1 and 999.
    /// </summary>
    [MethodImpl(MethodImplOptions.Synchronized)]
    public static bool SetTextureVariationWeight(string packRoot, string alias, string? relativePath, int weight)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return false;
        var target = NormPath(relativePath);
        weight = Math.Clamp(weight, 1, 999);

        var terrain = LoadOrCreateTerrainTexture(packRoot);
        var textureData = GetTextureData(terrain);
        if (!textureData.TryGetPropertyValue(alias, out var aliasNode) || aliasNode is null) return false;

        static bool UpdateWeightInArray(JsonArray va, string target, int weight)
        {
            for (int i = 0; i < va.Count; i++)
            {
                var item = va[i];
                if (item is JsonObject jo)
                {
                    if (jo.TryGetPropertyValue("path", out var p) && p is JsonValue pjv && pjv.TryGetValue<string>(out var ps))
                    {
                        if (string.Equals(NormPath(ps), target, StringComparison.OrdinalIgnoreCase))
                        {
                            jo["weight"] = weight;
                            return true;
                        }
                    }
                }
                else if (item is JsonValue jv && jv.TryGetValue<string>(out var s))
                {
                    if (string.Equals(NormPath(s), target, StringComparison.OrdinalIgnoreCase))
                    {
                        va[i] = new JsonObject { ["path"] = s, ["weight"] = weight };
                        return true;
                    }
                }
            }
            return false;
        }

        bool updated = false;

        void SearchAndSet(JsonNode? node)
        {
            if (updated || node is null) return;
            if (node is JsonObject jo)
            {
                if (jo.TryGetPropertyValue("variations", out var vs) && vs is JsonArray va)
                {
                    if (UpdateWeightInArray(va, target, weight))
                    {
                        updated = true;
                        return;
                    }
                }
                if (jo.TryGetPropertyValue("textures", out var t))
                {
                    SearchAndSet(t);
                }
            }
            else if (node is JsonArray ja)
            {
                foreach (var el in ja)
                {
                    SearchAndSet(el);
                    if (updated) return;
                }
            }
        }

        SearchAndSet(aliasNode);

        if (updated)
        {
            SaveTerrainTexture(packRoot, terrain);
        }
        return updated;
    }

    /// <summary>
    /// Renames a texture variation's path in terrain_texture.json and renames the physical
    /// PNG file on disk if it exists.
    /// </summary>
    [MethodImpl(MethodImplOptions.Synchronized)]
    public static (bool success, string newRelativePath, string? message) RenameTextureVariation(
        string packRoot, string alias, string? oldRelativePath, string newLabelOrPath)
    {
        if (string.IsNullOrWhiteSpace(oldRelativePath) || string.IsNullOrWhiteSpace(newLabelOrPath))
            return (false, "", "Path or label cannot be empty.");

        var oldTargetNorm = NormPath(oldRelativePath);

        // Sanitize newLabelOrPath into a relative path stem
        var cleanInput = newLabelOrPath.Trim().Replace('\\', '/');
        if (cleanInput.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
            cleanInput = cleanInput.Substring(0, cleanInput.Length - 4);
        if (cleanInput.EndsWith(".tga", StringComparison.OrdinalIgnoreCase))
            cleanInput = cleanInput.Substring(0, cleanInput.Length - 4);

        string newTargetNorm;
        if (cleanInput.Contains('/'))
        {
            newTargetNorm = NormPath(cleanInput);
        }
        else
        {
            var oldSlash = oldTargetNorm.LastIndexOf('/');
            var baseDir = oldSlash > 0 ? oldTargetNorm.Substring(0, oldSlash) : "textures/blocks";
            newTargetNorm = $"{baseDir}/{cleanInput}";
        }

        var terrain = LoadOrCreateTerrainTexture(packRoot);
        var textureData = GetTextureData(terrain);
        if (!textureData.TryGetPropertyValue(alias, out var aliasNode) || aliasNode is null)
            return (false, "", $"Alias '{alias}' not found in terrain_texture.json.");

        static bool UpdatePathInArray(JsonArray va, string oldTarget, string newTarget)
        {
            for (int i = 0; i < va.Count; i++)
            {
                var item = va[i];
                if (item is JsonObject jo)
                {
                    if (jo.TryGetPropertyValue("path", out var p) && p is JsonValue pjv && pjv.TryGetValue<string>(out var ps))
                    {
                        if (string.Equals(NormPath(ps), oldTarget, StringComparison.OrdinalIgnoreCase))
                        {
                            jo["path"] = newTarget;
                            return true;
                        }
                    }
                }
                else if (item is JsonValue jv && jv.TryGetValue<string>(out var s))
                {
                    if (string.Equals(NormPath(s), oldTarget, StringComparison.OrdinalIgnoreCase))
                    {
                        va[i] = newTarget;
                        return true;
                    }
                }
            }
            return false;
        }

        bool updated = false;

        void SearchAndRename(JsonNode? node)
        {
            if (updated || node is null) return;
            if (node is JsonObject jo)
            {
                if (jo.TryGetPropertyValue("variations", out var vs) && vs is JsonArray va)
                {
                    if (UpdatePathInArray(va, oldTargetNorm, newTargetNorm))
                    {
                        updated = true;
                        return;
                    }
                }
                if (jo.TryGetPropertyValue("textures", out var t))
                {
                    SearchAndRename(t);
                }
            }
            else if (node is JsonArray ja)
            {
                foreach (var el in ja)
                {
                    SearchAndRename(el);
                    if (updated) return;
                }
            }
        }

        SearchAndRename(aliasNode);

        if (!updated)
            return (false, "", $"Variation matching '{oldRelativePath}' not found.");

        SaveTerrainTexture(packRoot, terrain);

        // Rename physical file on disk if it exists
        try
        {
            var oldFullPng = Path.Combine(packRoot, oldTargetNorm.Replace('/', Path.DirectorySeparatorChar) + ".png");
            var newFullPng = Path.Combine(packRoot, newTargetNorm.Replace('/', Path.DirectorySeparatorChar) + ".png");

            if (File.Exists(oldFullPng) && !File.Exists(newFullPng))
            {
                var newDir = Path.GetDirectoryName(newFullPng);
                if (!string.IsNullOrEmpty(newDir) && !Directory.Exists(newDir))
                {
                    Directory.CreateDirectory(newDir);
                }
                WriteJournal.RecordWrite(oldFullPng);
                WriteJournal.RecordWrite(newFullPng);
                File.Move(oldFullPng, newFullPng);
            }
        }
        catch
        {
            // If disk file rename fails, JSON was already updated
        }

        return (true, newTargetNorm, null);
    }

    /// <summary>Registers an existing orphan texture file into terrain_texture.json.</summary>
    [MethodImpl(MethodImplOptions.Synchronized)]
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
    [MethodImpl(MethodImplOptions.Synchronized)]
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
    [MethodImpl(MethodImplOptions.Synchronized)]
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
    [MethodImpl(MethodImplOptions.Synchronized)]
    public static void AddVanillaBlockAlias(string packRoot, string alias, VanillaData vanilla)
    {
        var terrain = LoadOrCreateTerrainTexture(packRoot);
        var textureData = GetTextureData(terrain);

        var targetAlias = alias;
        if (targetAlias.StartsWith("flattened_", StringComparison.OrdinalIgnoreCase))
        {
            var canonical = targetAlias.Substring("flattened_".Length);
            if (vanilla.RawTerrainTextureJson.ContainsKey(canonical))
            {
                targetAlias = canonical;
            }
        }

        if (vanilla.RawTerrainTextureJson.TryGetValue(targetAlias, out var rawTerrainJson))
        {
            textureData[targetAlias] = JsonNode.Parse(rawTerrainJson);
            SaveTerrainTexture(packRoot, terrain);
        }

        if (vanilla.RawFlipbookJson.TryGetValue(targetAlias, out var rawFbJson))
        {
            AppendFlipbookIfNotExists(packRoot, targetAlias, rawFbJson);
        }
    }

    /// <summary>
    /// Adds a vanilla item alias into item_texture.json (and flipbook_textures.json if applicable).
    /// </summary>
    [MethodImpl(MethodImplOptions.Synchronized)]
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
    [MethodImpl(MethodImplOptions.Synchronized)]
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
                WriteAllTextRetry(targetFile, rawJson);
            }

            // Also create the textures/entity/<cleanId> folder to prepare for texture files
            var texturesFolder = Path.Combine(packRoot, "textures", "entity", cleanId);
            Directory.CreateDirectory(texturesFolder);
        }
    }

    [MethodImpl(MethodImplOptions.Synchronized)]
    public static void AppendFlipbookIfNotExists(string packRoot, string aliasOrPath, string rawFlipbookJson)
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
            WriteAllTextRetry(flipbookPath, flipbook.ToJsonString(WriteOptions));
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
            return JsonNode.Parse(ReadAllTextRetry(path), null, DocOptions)!.AsObject();

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
        WriteAllTextRetry(path, itemTexture.ToJsonString(WriteOptions));
    }

    private static JsonObject LoadOrCreateTerrainTexture(string packRoot)
    {
        var path = Path.Combine(packRoot, "textures", "terrain_texture.json");
        if (File.Exists(path))
            return JsonNode.Parse(ReadAllTextRetry(path), null, DocOptions)!.AsObject();

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
        WriteAllTextRetry(path, terrain.ToJsonString(WriteOptions));
    }

    private static JsonObject LoadOrCreateBlocksJson(string packRoot)
    {
        var path = Path.Combine(packRoot, "blocks.json");
        if (File.Exists(path))
            return JsonNode.Parse(ReadAllTextRetry(path), null, DocOptions)!.AsObject();

        return new JsonObject { ["format_version"] = "1.19.30" };
    }

    private static void SaveBlocksJson(string packRoot, JsonObject blocks)
    {
        var path = Path.Combine(packRoot, "blocks.json");
        WriteAllTextRetry(path, blocks.ToJsonString(WriteOptions));
    }

    /// <summary>
    /// Removes a block definition from blocks.json.
    /// Does not touch textures, terrain_texture.json, or physical files.
    /// </summary>
    [MethodImpl(MethodImplOptions.Synchronized)]
    public static bool DeleteBlockEntry(string packRoot, string blockId)
    {
        var path = Path.Combine(packRoot, "blocks.json");
        if (!File.Exists(path)) return false;

        var blocks = LoadOrCreateBlocksJson(packRoot);
        var cleanId = blockId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase)
            ? blockId.Substring(10)
            : blockId;

        bool removed = false;
        if (blocks.ContainsKey(blockId))
        {
            blocks.Remove(blockId);
            removed = true;
        }
        if (blocks.ContainsKey(cleanId))
        {
            blocks.Remove(cleanId);
            removed = true;
        }
        var mcPrefixed = "minecraft:" + cleanId;
        if (blocks.ContainsKey(mcPrefixed))
        {
            blocks.Remove(mcPrefixed);
            removed = true;
        }

        if (removed)
        {
            SaveBlocksJson(packRoot, blocks);
            return true;
        }
        return false;
    }

    private static JsonArray LoadOrCreateJsonArray(string path)
    {
        if (File.Exists(path))
            return JsonNode.Parse(ReadAllTextRetry(path), null, DocOptions)!.AsArray();

        return new JsonArray();
    }

    [MethodImpl(MethodImplOptions.Synchronized)]
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
                    WriteJournal.RecordWrite(explicitPath);
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
                    WriteJournal.RecordWrite(p);
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
                                    WriteJournal.RecordWrite(file);
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
                                        WriteJournal.RecordWrite(file);
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
                WriteAllTextRetry(flipbookPath, flipbook.ToJsonString(WriteOptions));
            }
        }
    }

    [MethodImpl(MethodImplOptions.Synchronized)]
    public static void DeleteTextureEntriesBatch(string packRoot, IEnumerable<string> aliases, string category)
    {
        var aliasList = aliases.Where(a => !string.IsNullOrWhiteSpace(a)).Distinct().ToList();
        if (aliasList.Count == 0) return;

        if (string.Equals(category, "item", StringComparison.OrdinalIgnoreCase))
        {
            var itemTexturePath = Path.Combine(packRoot, "textures", "item_texture.json");
            if (File.Exists(itemTexturePath))
            {
                var itemObj = LoadOrCreateItemTexture(packRoot);
                var texData = GetTextureData(itemObj);
                bool changed = false;
                foreach (var alias in aliasList)
                {
                    if (texData.ContainsKey(alias))
                    {
                        texData.Remove(alias);
                        changed = true;
                    }
                }
                if (changed)
                {
                    SaveItemTexture(packRoot, itemObj);
                }
            }
        }
        else if (string.Equals(category, "entity", StringComparison.OrdinalIgnoreCase))
        {
            foreach (var alias in aliasList)
            {
                DeleteTextureEntries(packRoot, alias, category);
            }
            return;
        }
        else
        {
            var terrainPath = Path.Combine(packRoot, "textures", "terrain_texture.json");
            if (File.Exists(terrainPath))
            {
                var terrainObj = LoadOrCreateTerrainTexture(packRoot);
                var texData = GetTextureData(terrainObj);
                bool changed = false;
                foreach (var alias in aliasList)
                {
                    if (texData.ContainsKey(alias))
                    {
                        texData.Remove(alias);
                        changed = true;
                    }
                }
                if (changed)
                {
                    SaveTerrainTexture(packRoot, terrainObj);
                }
            }
        }

        // Clean flipbook in a single pass
        var flipbookPath = Path.Combine(packRoot, "textures", "flipbook_textures.json");
        if (File.Exists(flipbookPath))
        {
            var aliasSet = new HashSet<string>(aliasList, StringComparer.OrdinalIgnoreCase);
            var flipbook = LoadOrCreateJsonArray(flipbookPath);
            int countBefore = flipbook.Count;
            for (int i = flipbook.Count - 1; i >= 0; i--)
            {
                if (flipbook[i] is JsonObject fbObj)
                {
                    bool match = false;
                    if (fbObj.TryGetPropertyValue("atlas_tile", out var at) && at != null && aliasSet.Contains(at.ToString()))
                        match = true;
                    if (fbObj.TryGetPropertyValue("flipbook_texture", out var ft) && ft != null && aliasSet.Contains(ft.ToString()))
                        match = true;
                    if (match) flipbook.RemoveAt(i);
                }
            }
            if (flipbook.Count != countBefore)
            {
                WriteAllTextRetry(flipbookPath, flipbook.ToJsonString(WriteOptions));
            }
        }
    }

    private static string Sanitize(string alias) =>
        alias.Trim().Replace(" ", "_").ToLowerInvariant();
}
