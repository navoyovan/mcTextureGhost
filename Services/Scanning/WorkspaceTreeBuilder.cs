using System.IO;
using System.Text.Json;
using McTextureGhost.Models;

namespace McTextureGhost.Services.Scanning;

/// <summary>
/// Builds hierarchical UI tree representations (CatalogTree, BlockWorkspaceTree, EntityWorkspaceTree)
/// merging user pack aliases with reference and vanilla data.
/// </summary>
public static partial class WorkspaceTreeBuilder
{
    private static FileStream OpenSharedRead(string path) => ScanningJsonUtils.OpenSharedRead(path);
    private static JsonDocumentOptions ScanDocOptions => ScanningJsonUtils.ScanDocOptions;
    private static Dictionary<string, List<BlockFaceUsage>> ParseBlocksJson(string path) => BlockDefinitionParser.ParseBlocksJson(path);
    private static IEnumerable<(string alias, string face)> ExtractAliasFaces(JsonElement texturesProp, bool isCarried = false) => BlockDefinitionParser.ExtractAliasFaces(texturesProp, isCarried);
    private static string SummarizeFaces(List<BlockFaceUsage> faces) => BlockDefinitionParser.SummarizeFaces(faces);

    /// <summary>
    /// Constructs a 3-level hierarchical catalog tree (Block -> AliasGroup -> Leaves)
    /// merging user pack aliases with the vanilla reference catalog.
    /// </summary>
    public static List<BlockGroupNode> BuildCatalogTree(
        IList<TextureAlias> userAliases,
        VanillaData vanilla,
        string? packRoot)
    {
        var blocksTree = new List<BlockGroupNode>();
        var itemsTree = new List<BlockGroupNode>();

        // Index user aliases by Category + Alias
        var userBlockAliases = userAliases
            .Where(a => a.Category == TextureCategory.Block && a.Status != TextureStatus.NoEntry && a.IsUserDefined)
            .GroupBy(a => a.Alias, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var userItemAliases = userAliases
            .Where(a => a.Category == TextureCategory.Item && a.Status != TextureStatus.NoEntry && a.IsUserDefined)
            .GroupBy(a => a.Alias, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var userBlocksJsonPath = packRoot != null ? Path.Combine(packRoot, "blocks.json") : null;
        var userBlocksMap = (userBlocksJsonPath != null && File.Exists(userBlocksJsonPath))
            ? ParseBlocksJson(userBlocksJsonPath)
            : new Dictionary<string, List<BlockFaceUsage>>(StringComparer.OrdinalIgnoreCase);

        // Also parse user blockId -> aliases from user's blocks.json
        var userBlockToAliases = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        if (userBlocksJsonPath != null && File.Exists(userBlocksJsonPath))
        {
            try
            {
                using var stream = OpenSharedRead(userBlocksJsonPath);
                using var doc = JsonDocument.Parse(stream, ScanDocOptions);
                foreach (var entry in doc.RootElement.EnumerateObject())
                {
                    if (entry.Name == "format_version" || entry.Value.ValueKind != JsonValueKind.Object) continue;
                    var aliasSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    if (entry.Value.TryGetProperty("textures", out var tp))
                    {
                        foreach (var (a, _) in ExtractAliasFaces(tp)) aliasSet.Add(a);
                    }
                    if (entry.Value.TryGetProperty("carried_textures", out var cp))
                    {
                        foreach (var (a, _) in ExtractAliasFaces(cp, isCarried: true)) aliasSet.Add(a);
                    }
                    userBlockToAliases[entry.Name] = aliasSet.ToList();
                }
            }
            catch { }
        }

        var trackedUserAliases = new HashSet<TextureAlias>();

        // ── 1. BLOCKS ──────────────────────────────────────────────────────────
        var allBlockIds = new HashSet<string>(vanilla.RawBlocksJson.Keys, StringComparer.OrdinalIgnoreCase);
        foreach (var uBlockId in userBlockToAliases.Keys)
            allBlockIds.Add(uBlockId);

        foreach (var blockId in allBlockIds)
        {
            List<string>? aliasesForBlock = null;
            if (userBlockToAliases.TryGetValue(blockId, out var uAliases) && uAliases.Count > 0)
                aliasesForBlock = uAliases;
            else if (vanilla.BlockToAliases.TryGetValue(blockId, out var vAliases) && vAliases.Count > 0)
                aliasesForBlock = vAliases;

            if (aliasesForBlock == null || aliasesForBlock.Count == 0)
                continue;

            var blockNode = new BlockGroupNode
            {
                BlockId = blockId,
                DisplayName = vanilla.GetBlockDisplayName(blockId),
                Category = TextureCategory.Block
            };

            foreach (var alias in aliasesForBlock)
            {
                var aliasNode = new AliasGroupNode
                {
                    Alias = alias,
                    Category = TextureCategory.Block,
                    ParentBlock = blockNode
                };

                var faces = userBlocksMap.TryGetValue(alias, out var uf) ? uf :
                            (vanilla.BlockUsage.TryGetValue(alias, out var vf) ? vf : new List<BlockFaceUsage>());
                aliasNode.FaceSummary = SummarizeFaces(faces);

                if (vanilla.TerrainTextures.TryGetValue(alias, out var vData))
                {
                    var userTileList = userBlockAliases.TryGetValue(alias, out var ut) ? ut : new List<TextureAlias>();
                    foreach (var tile in userTileList) trackedUserAliases.Add(tile);

                    for (int i = 0; i < vData.Entries.Count; i++)
                    {
                        var entry = vData.Entries[i];
                        var normRaw = VanillaDataService.NormalizeTexturePath(entry.RawPath);

                        // Find matching user tile by relative path or variant index
                        var matchedUserTile = userTileList.FirstOrDefault(t =>
                            VanillaDataService.NormalizeTexturePath(t.RelativePath).Equals(normRaw, StringComparison.OrdinalIgnoreCase) ||
                            (t.BlockVariantIndex.HasValue && entry.BlockVariantIndex.HasValue && t.BlockVariantIndex == entry.BlockVariantIndex &&
                             t.TextureVariantIndex == entry.TextureVariantIndex));

                        if (matchedUserTile != null)
                        {
                            var leafStatus = matchedUserTile.Status switch
                            {
                                TextureStatus.Ok      => CatalogEntryStatus.Ok,
                                TextureStatus.Ghost   => CatalogEntryStatus.Ghost,
                                TextureStatus.Orphan  => CatalogEntryStatus.Orphan,
                                _                     => CatalogEntryStatus.Ok
                            };

                            var leaf = new CatalogLeaf
                            {
                                Alias = alias,
                                DisplayName = matchedUserTile.DisplayName,
                                RelativePath = matchedUserTile.RelativePath,
                                FullPath = matchedUserTile.FullPath,
                                Category = TextureCategory.Block,
                                Status = leafStatus,
                                TextureAlias = matchedUserTile,
                                VariantKind = matchedUserTile.VariantKind,
                                BlockVariantIndex = matchedUserTile.BlockVariantIndex ?? entry.BlockVariantIndex,
                                TotalBlockVariants = matchedUserTile.TotalBlockVariants ?? entry.TotalBlockVariants,
                                TextureVariantIndex = matchedUserTile.TextureVariantIndex ?? entry.TextureVariantIndex,
                                TotalTextureVariants = matchedUserTile.TotalTextureVariants ?? entry.TotalTextureVariants,
                                Weight = matchedUserTile.Weight ?? entry.Weight,
                                SubtitleCaption = matchedUserTile.SubtitleCaption,
                                PrimaryFaceBadgeText = matchedUserTile.PrimaryFaceBadgeText,
                                Flipbook = matchedUserTile.Flipbook ?? vanilla.Flipbooks.Find(alias, entry.RawPath, entry.BlockVariantIndex, entry.TextureVariantIndex)
                            };
                            aliasNode.Leaves.Add(leaf);
                        }
                        else
                        {
                            var caption = entry.TotalBlockVariants.HasValue
                                ? $"block state {entry.BlockVariantIndex}/{entry.TotalBlockVariants}"
                                : (entry.TotalTextureVariants.HasValue
                                    ? $"tex {entry.TextureVariantIndex}/{entry.TotalTextureVariants}"
                                    : "vanilla default");

                            var leaf = new CatalogLeaf
                            {
                                Alias = alias,
                                DisplayName = alias,
                                RelativePath = entry.RawPath,
                                FullPath = packRoot != null ? Path.Combine(packRoot, (entry.RawPath + ".png").Replace('/', Path.DirectorySeparatorChar)) : entry.RawPath,
                                Category = TextureCategory.Block,
                                Status = CatalogEntryStatus.NotAdded,
                                TextureAlias = null,
                                VariantKind = entry.TotalBlockVariants.HasValue ? VariantKind.BlockVariant : (entry.TotalTextureVariants.HasValue ? VariantKind.TextureVariant : VariantKind.None),
                                BlockVariantIndex = entry.BlockVariantIndex,
                                TotalBlockVariants = entry.TotalBlockVariants,
                                TextureVariantIndex = entry.TextureVariantIndex,
                                TotalTextureVariants = entry.TotalTextureVariants,
                                Weight = entry.Weight,
                                SubtitleCaption = caption,
                                PrimaryFaceBadgeText = aliasNode.FaceSummary,
                                Flipbook = vanilla.Flipbooks.Find(alias, entry.RawPath, entry.BlockVariantIndex, entry.TextureVariantIndex)
                            };
                            aliasNode.Leaves.Add(leaf);
                        }
                    }
                }
                else if (userBlockAliases.TryGetValue(alias, out var userTiles))
                {
                    foreach (var tile in userTiles)
                    {
                        trackedUserAliases.Add(tile);
                        var leafStatus = tile.Status switch
                        {
                            TextureStatus.Ok      => CatalogEntryStatus.Ok,
                            TextureStatus.Ghost   => CatalogEntryStatus.Ghost,
                            TextureStatus.Orphan  => CatalogEntryStatus.Orphan,
                            _                     => CatalogEntryStatus.Ok
                        };

                        var leaf = new CatalogLeaf
                        {
                            Alias = alias,
                            DisplayName = tile.DisplayName,
                            RelativePath = tile.RelativePath,
                            FullPath = tile.FullPath,
                            Category = TextureCategory.Block,
                            Status = leafStatus,
                            TextureAlias = tile,
                            VariantKind = tile.VariantKind,
                            BlockVariantIndex = tile.BlockVariantIndex,
                            TotalBlockVariants = tile.TotalBlockVariants,
                            TextureVariantIndex = tile.TextureVariantIndex,
                            TotalTextureVariants = tile.TotalTextureVariants,
                            Weight = tile.Weight,
                            SubtitleCaption = tile.SubtitleCaption,
                            PrimaryFaceBadgeText = tile.PrimaryFaceBadgeText,
                            Flipbook = tile.Flipbook
                        };
                        aliasNode.Leaves.Add(leaf);
                    }
                }
                else
                {
                    var leaf = new CatalogLeaf
                    {
                        Alias = alias,
                        DisplayName = alias,
                        RelativePath = $"textures/blocks/{alias}",
                        FullPath = packRoot != null ? Path.Combine(packRoot, "textures", "blocks", $"{alias}.png") : alias,
                        Category = TextureCategory.Block,
                        Status = CatalogEntryStatus.Ghost,
                        TextureAlias = null,
                        SubtitleCaption = "missing declaration",
                        PrimaryFaceBadgeText = aliasNode.FaceSummary
                    };
                    aliasNode.Leaves.Add(leaf);
                }

                aliasNode.NotifyCountsChanged();
                blockNode.AliasGroups.Add(aliasNode);
            }

            blockNode.NotifyCountsChanged();
            blocksTree.Add(blockNode);
        }

        // ── 2. ITEMS ───────────────────────────────────────────────────────────
        var allItemAliases = new HashSet<string>(vanilla.ItemTextures.Keys, StringComparer.OrdinalIgnoreCase);
        foreach (var uItem in userItemAliases.Keys)
            allItemAliases.Add(uItem);

        foreach (var itemAlias in allItemAliases)
        {
            var itemBlockNode = new BlockGroupNode
            {
                BlockId = itemAlias,
                DisplayName = vanilla.GetItemDisplayName(itemAlias),
                Category = TextureCategory.Item
            };

            var aliasNode = new AliasGroupNode
            {
                Alias = itemAlias,
                Category = TextureCategory.Item,
                ParentBlock = itemBlockNode
            };

            if (vanilla.ItemTextures.TryGetValue(itemAlias, out var vData))
            {
                var userTileList = userItemAliases.TryGetValue(itemAlias, out var ut) ? ut : new List<TextureAlias>();
                foreach (var tile in userTileList) trackedUserAliases.Add(tile);

                for (int i = 0; i < vData.Entries.Count; i++)
                {
                    var entry = vData.Entries[i];
                    var normRaw = VanillaDataService.NormalizeTexturePath(entry.RawPath);

                    var matchedUserTile = userTileList.FirstOrDefault(t =>
                        VanillaDataService.NormalizeTexturePath(t.RelativePath).Equals(normRaw, StringComparison.OrdinalIgnoreCase) ||
                        (t.TextureVariantIndex.HasValue && entry.TextureVariantIndex.HasValue && t.TextureVariantIndex == entry.TextureVariantIndex));

                    if (matchedUserTile != null)
                    {
                        var leafStatus = matchedUserTile.Status switch
                        {
                            TextureStatus.Ok      => CatalogEntryStatus.Ok,
                            TextureStatus.Ghost   => CatalogEntryStatus.Ghost,
                            TextureStatus.Orphan  => CatalogEntryStatus.Orphan,
                            _                     => CatalogEntryStatus.Ok
                        };

                        var leaf = new CatalogLeaf
                        {
                            Alias = itemAlias,
                            DisplayName = matchedUserTile.DisplayName,
                            RelativePath = matchedUserTile.RelativePath,
                            FullPath = matchedUserTile.FullPath,
                            Category = TextureCategory.Item,
                            Status = leafStatus,
                            TextureAlias = matchedUserTile,
                            VariantKind = matchedUserTile.VariantKind,
                            TextureVariantIndex = matchedUserTile.TextureVariantIndex ?? entry.TextureVariantIndex,
                            TotalTextureVariants = matchedUserTile.TotalTextureVariants ?? entry.TotalTextureVariants,
                            Weight = matchedUserTile.Weight ?? entry.Weight,
                            SubtitleCaption = matchedUserTile.SubtitleCaption,
                            Flipbook = matchedUserTile.Flipbook ?? vanilla.Flipbooks.Find(itemAlias, entry.RawPath, null, entry.TextureVariantIndex)
                        };
                        aliasNode.Leaves.Add(leaf);
                    }
                    else
                    {
                        var caption = entry.TotalTextureVariants.HasValue
                            ? $"var {entry.TextureVariantIndex}/{entry.TotalTextureVariants}"
                            : "vanilla default";

                        var leaf = new CatalogLeaf
                        {
                            Alias = itemAlias,
                            DisplayName = itemAlias,
                            RelativePath = entry.RawPath,
                            FullPath = packRoot != null ? Path.Combine(packRoot, (entry.RawPath + ".png").Replace('/', Path.DirectorySeparatorChar)) : entry.RawPath,
                            Category = TextureCategory.Item,
                            Status = CatalogEntryStatus.NotAdded,
                            TextureAlias = null,
                            VariantKind = entry.TotalTextureVariants.HasValue ? VariantKind.TextureVariant : VariantKind.None,
                            TextureVariantIndex = entry.TextureVariantIndex,
                            TotalTextureVariants = entry.TotalTextureVariants,
                            Weight = entry.Weight,
                            SubtitleCaption = caption,
                            Flipbook = vanilla.Flipbooks.Find(itemAlias, entry.RawPath, null, entry.TextureVariantIndex)
                        };
                        aliasNode.Leaves.Add(leaf);
                    }
                }
            }
            else if (userItemAliases.TryGetValue(itemAlias, out var userTiles))
            {
                foreach (var tile in userTiles)
                {
                    trackedUserAliases.Add(tile);
                    var leafStatus = tile.Status switch
                    {
                        TextureStatus.Ok      => CatalogEntryStatus.Ok,
                        TextureStatus.Ghost   => CatalogEntryStatus.Ghost,
                        TextureStatus.Orphan  => CatalogEntryStatus.Orphan,
                        _                     => CatalogEntryStatus.Ok
                    };

                    var leaf = new CatalogLeaf
                    {
                        Alias = itemAlias,
                        DisplayName = tile.DisplayName,
                        RelativePath = tile.RelativePath,
                        FullPath = tile.FullPath,
                        Category = TextureCategory.Item,
                        Status = leafStatus,
                        TextureAlias = tile,
                        SubtitleCaption = tile.SubtitleCaption,
                        Flipbook = tile.Flipbook
                    };
                    aliasNode.Leaves.Add(leaf);
                }
            }

            aliasNode.NotifyCountsChanged();
            itemBlockNode.AliasGroups.Add(aliasNode);
            itemBlockNode.NotifyCountsChanged();
            itemsTree.Add(itemBlockNode);
        }

        // ── 3. ENTITIES ────────────────────────────────────────────────────────
        var entitiesTree = new List<BlockGroupNode>();
        var userEntityAliases = userAliases
            .Where(a => a.Category == TextureCategory.Entity && a.Status != TextureStatus.NoEntry)
            .GroupBy(a => !string.IsNullOrEmpty(a.EntityId) ? a.EntityId : (a.Alias.Contains(':') ? a.Alias.Substring(0, a.Alias.IndexOf(':')) : a.Alias), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var allEntityIds = new HashSet<string>(vanilla.EntityDefinitions.Keys, StringComparer.OrdinalIgnoreCase);
        foreach (var uKey in userEntityAliases.Keys)
        {
            if (!string.IsNullOrEmpty(uKey))
            {
                if (!uKey.Contains(':') || uKey.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase))
                {
                    allEntityIds.Add(uKey);
                }
            }
        }

        foreach (var entityId in allEntityIds.OrderBy(id => vanilla.GetEntityDisplayName(id), StringComparer.OrdinalIgnoreCase))
        {
            var cleanId = entityId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase)
                ? entityId.Substring(10)
                : entityId;

            // Skip obsolete legacy duplicates if clean modern exists
            if (entityId.Contains(".v1.0", StringComparison.OrdinalIgnoreCase) || entityId.Contains(".v1.8", StringComparison.OrdinalIgnoreCase))
                continue;

            var entityNode = new BlockGroupNode
            {
                BlockId = entityId,
                DisplayName = vanilla.GetEntityDisplayName(entityId),
                Category = TextureCategory.Entity
            };

            var declaredSlots = vanilla.EntityDefinitions.TryGetValue(entityId, out var vSlots)
                ? vSlots
                : (vanilla.EntityDefinitions.TryGetValue(cleanId, out var vCleanSlots) ? vCleanSlots : new Dictionary<string, string>());

            // Get any user tiles for this entity
            userEntityAliases.TryGetValue(entityId, out var entityUserTiles);
            if (entityUserTiles == null)
            {
                userEntityAliases.TryGetValue(cleanId, out entityUserTiles);
            }
            if (entityUserTiles == null)
            {
                userEntityAliases.TryGetValue($"minecraft:{cleanId}", out entityUserTiles);
            }

            // Group slots by geometry/baby
            var slotItems = new List<(string SlotKey, string RawTexPath, string? GeoId, string? GeoKey, bool IsBaby, bool IsAttachable)>();
            foreach (var (slotKey, rawTexPath) in declaredSlots)
            {
                var geoId = vanilla.GetGeometryForEntity(entityId, slotKey, rawTexPath);
                var geoKey = vanilla.GetGeometryKeyForEntity(entityId, geoId);
                var isAttachable = vanilla.RawClientEntityRelPath.TryGetValue(entityId, out var rp) && rp.StartsWith("attachables", StringComparison.OrdinalIgnoreCase);
                var isBaby = (geoId != null && geoId.Contains("baby", StringComparison.OrdinalIgnoreCase)) || slotKey.Contains("baby", StringComparison.OrdinalIgnoreCase);
                slotItems.Add((slotKey, rawTexPath, geoId, geoKey, isBaby, isAttachable));
            }

            // If declaredSlots is empty but user has tiles for this entity
            if (slotItems.Count == 0 && entityUserTiles != null)
            {
                foreach (var tile in entityUserTiles)
                {
                    var isBaby = (tile.GeometryId != null && tile.GeometryId.Contains("baby", StringComparison.OrdinalIgnoreCase)) || (tile.TextureKey != null && tile.TextureKey.Contains("baby", StringComparison.OrdinalIgnoreCase));
                    var geoKey = vanilla.GetGeometryKeyForEntity(entityId, tile.GeometryId);
                    slotItems.Add((tile.TextureKey ?? "default", tile.RelativePath, tile.GeometryId, geoKey, isBaby, tile.IsAttachable));
                }
            }

            var groupedSlots = slotItems
                .GroupBy(s => s.GeoKey ?? (s.IsBaby ? "baby" : "default"), StringComparer.OrdinalIgnoreCase)
                .OrderBy(g => g.Key.Equals("baby", StringComparison.OrdinalIgnoreCase) ? 1 : 0);

            foreach (var group in groupedSlots)
            {
                var first = group.FirstOrDefault();
                var geoId = first.GeoId;
                var isBaby = group.Any(s => s.IsBaby);
                var isAttachable = group.Any(s => s.IsAttachable);

                string slotAlias;
                // Normalize geo key: if it equals the entity name itself, call it "default"
                var geoKeyLabel = group.Key.Equals(cleanId, StringComparison.OrdinalIgnoreCase) ? "default" : group.Key;
                if (groupedSlots.Count() > 1)
                {
                    slotAlias = $"{cleanId} ({geoKeyLabel})";
                }
                else
                {
                    slotAlias = cleanId;
                }


                var aliasNode = new AliasGroupNode
                {
                    Alias = slotAlias,
                    FaceSummary = isAttachable ? "attachable" : (isBaby ? "baby" : "entity"),
                    GeometryId = geoId,
                    IsAttachable = isAttachable,
                    Category = TextureCategory.Entity,
                    ParentBlock = entityNode
                };

                foreach (var (slotKey, rawTexPath, _, _, _, _) in group)
                {
                    var normTexPath = VanillaDataService.NormalizeTexturePath(rawTexPath);
                    var fullTexPath = normTexPath + ".png";

                    var matchingUserTile = entityUserTiles?.FirstOrDefault(a =>
                        string.Equals(a.RelativePath, fullTexPath, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(a.RelativePath, normTexPath, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(a.TextureKey, slotKey, StringComparison.OrdinalIgnoreCase));

                    if (matchingUserTile != null)
                    {
                        trackedUserAliases.Add(matchingUserTile);
                        var leaf = new CatalogLeaf
                        {
                            Alias = slotAlias,
                            DisplayName = matchingUserTile.DisplayName,
                            RelativePath = matchingUserTile.RelativePath,
                            FullPath = matchingUserTile.FullPath,
                            Category = TextureCategory.Entity,
                            Status = matchingUserTile.Status switch
                            {
                                TextureStatus.Ok => CatalogEntryStatus.Ok,
                                TextureStatus.Ghost => CatalogEntryStatus.Ghost,
                                _ => CatalogEntryStatus.Orphan
                            },
                            TextureAlias = matchingUserTile,
                            EntityId = entityId,
                            TextureKey = slotKey,
                            GeometryId = geoId,
                            IsAttachable = isAttachable,
                            SubtitleCaption = geoKeyLabel
                        };
                        aliasNode.Leaves.Add(leaf);
                    }
                    else
                    {
                        var userDiskPath = packRoot != null ? Path.Combine(packRoot, fullTexPath.Replace('/', Path.DirectorySeparatorChar)) : fullTexPath;
                        bool fileExistsOnDisk = packRoot != null && File.Exists(userDiskPath);

                        var leaf = new CatalogLeaf
                        {
                            Alias = slotAlias,
                            DisplayName = Path.GetFileName(normTexPath),
                            RelativePath = fullTexPath,
                            FullPath = userDiskPath,
                            Category = TextureCategory.Entity,
                            Status = fileExistsOnDisk ? CatalogEntryStatus.Ok : CatalogEntryStatus.NotAdded,
                            TextureAlias = null,
                            EntityId = entityId,
                            TextureKey = slotKey,
                            GeometryId = geoId,
                            IsAttachable = isAttachable,
                            SubtitleCaption = geoKeyLabel
                        };
                        aliasNode.Leaves.Add(leaf);
                    }
                }

                aliasNode.NotifyCountsChanged();
                entityNode.AliasGroups.Add(aliasNode);
            }

            entityNode.NotifyCountsChanged();
            entitiesTree.Add(entityNode);
        }

        // ── 4. UNCATEGORIZED ───────────────────────────────────────────────────
        var untracked = userAliases
            .Where(a => a.Status != TextureStatus.NoEntry && !trackedUserAliases.Contains(a))
            .ToList();

        BlockGroupNode? uncategorizedNode = null;
        if (untracked.Count > 0)
        {
            uncategorizedNode = new BlockGroupNode
            {
                BlockId = "uncategorized",
                DisplayName = "(Uncategorized)",
                Category = TextureCategory.Block
            };

            foreach (var grp in untracked.GroupBy(u => u.Alias, StringComparer.OrdinalIgnoreCase))
            {
                var aliasNode = new AliasGroupNode
                {
                    Alias = grp.Key,
                    Category = grp.First().Category,
                    ParentBlock = uncategorizedNode
                };

                foreach (var tile in grp)
                {
                    var leaf = new CatalogLeaf
                    {
                        Alias = tile.Alias,
                        DisplayName = tile.DisplayName,
                        RelativePath = tile.RelativePath,
                        FullPath = tile.FullPath,
                        Category = tile.Category,
                        Status = tile.Status switch
                        {
                            TextureStatus.Ok     => CatalogEntryStatus.Ok,
                            TextureStatus.Ghost  => CatalogEntryStatus.Ghost,
                            _                    => CatalogEntryStatus.Orphan
                        },
                        TextureAlias = tile,
                        SubtitleCaption = tile.SubtitleCaption,
                        PrimaryFaceBadgeText = tile.PrimaryFaceBadgeText,
                        Flipbook = tile.Flipbook
                    };
                    aliasNode.Leaves.Add(leaf);
                }

                aliasNode.NotifyCountsChanged();
                uncategorizedNode.AliasGroups.Add(aliasNode);
            }

            uncategorizedNode.NotifyCountsChanged();
        }

        var result = new List<BlockGroupNode>();
        result.AddRange(blocksTree.OrderBy(b => b.DisplayName, StringComparer.OrdinalIgnoreCase));
        result.AddRange(itemsTree.OrderBy(b => b.DisplayName, StringComparer.OrdinalIgnoreCase));
        result.AddRange(entitiesTree.OrderBy(b => b.DisplayName, StringComparer.OrdinalIgnoreCase));
        if (uncategorizedNode != null)
            result.Add(uncategorizedNode);

        return result;
    }
}
