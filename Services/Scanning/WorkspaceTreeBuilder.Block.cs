using System.IO;
using System.Text.Json;
using McTextureGhost.Models;

namespace McTextureGhost.Services.Scanning;

public static partial class WorkspaceTreeBuilder
{
    /// <summary>
    /// Constructs the Block Workspace tree: a 4-tier hierarchy
    /// (Block → AliasGroup → FaceNode → CatalogLeaf) sourced exclusively from the
    /// user's pack. Vanilla-only blocks are excluded — the Catalog dialog covers those.
    /// Terrain-declared aliases claimed by no block (neither user nor vanilla
    /// blocks.json) get their own fallback block entries instead of pooling under
    /// (Uncategorized); only true orphans (on disk, declared in no JSON) surface
    /// under (Uncategorized) with Orphan status so the user can see what needs wiring.
    /// </summary>
    public static List<BlockGroupNode> BuildBlockWorkspaceTree(
        IList<TextureAlias> userAliases,
        VanillaData vanilla,
        string? packRoot)
    {
        // ── Index user aliases ─────────────────────────────────────────────────
        var userBlockAliases = userAliases
            .Where(a => a.Category == TextureCategory.Block && a.Status != TextureStatus.NoEntry && a.Status != TextureStatus.Orphan)
            .GroupBy(a => a.Alias, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        // ── Parse user blocks.json for block→alias and block→face mappings ────
        var userBlocksJsonPath = packRoot != null ? Path.Combine(packRoot, "blocks.json") : null;
        var userBlocksMap = (userBlocksJsonPath != null && File.Exists(userBlocksJsonPath))
            ? ParseBlocksJson(userBlocksJsonPath)
            : new Dictionary<string, List<BlockFaceUsage>>(StringComparer.OrdinalIgnoreCase);

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
                        foreach (var (a, _) in ExtractAliasFaces(tp)) aliasSet.Add(a);
                    if (entry.Value.TryGetProperty("carried_textures", out var cp))
                        foreach (var (a, _) in ExtractAliasFaces(cp, isCarried: true)) aliasSet.Add(a);
                    userBlockToAliases[entry.Name] = aliasSet.ToList();
                }
            }
            catch { }
        }

        var trackedAliases = new HashSet<TextureAlias>();
        var result = new List<BlockGroupNode>();

        // ── Build one BlockGroupNode per block ID in user's blocks.json ────────
        foreach (var blockId in userBlockToAliases.Keys.OrderBy(k => k, StringComparer.OrdinalIgnoreCase))
        {
            if (!userBlockToAliases.TryGetValue(blockId, out var aliasesForBlock) || aliasesForBlock.Count == 0)
                continue;

            var blockNode = new BlockGroupNode
            {
                BlockId = blockId,
                DisplayName = vanilla.GetBlockDisplayName(blockId),
                Category = TextureCategory.Block,
                IsUserDefined = true
            };

            foreach (var alias in aliasesForBlock)
            {
                var aliasNode = new AliasGroupNode
                {
                    Alias = alias,
                    Category = TextureCategory.Block,
                    ParentBlock = blockNode
                };

                // Collect the face usages for this alias from user's blocks.json,
                // falling back to vanilla if the user hasn't overridden.
                var facesForAlias = userBlocksMap.TryGetValue(alias, out var uf) ? uf :
                                    (vanilla.BlockUsage.TryGetValue(alias, out var vf) ? vf : new List<BlockFaceUsage>());
                aliasNode.FaceSummary = SummarizeFaces(facesForAlias);

                // Determine the distinct face labels for this alias under this block.
                // Face labels are normalised to lowercase; "all" is the fallback when
                // no directional faces exist.
                var faceLabels = facesForAlias
                    .Where(f => f.BlockId.Equals(blockId, StringComparison.OrdinalIgnoreCase))
                    .Select(f => f.Face.ToLowerInvariant())
                    .Distinct()
                    .ToList();

                if (faceLabels.Count == 0)
                    faceLabels.Add("all");

                // Build a FaceNode per distinct face label.
                var faceNodeMap = new Dictionary<string, FaceNode>(StringComparer.OrdinalIgnoreCase);
                foreach (var faceLabel in faceLabels)
                {
                    var faceNode = new FaceNode { FaceLabel = faceLabel, IsExpanded = true };
                    faceNodeMap[faceLabel] = faceNode;
                    aliasNode.FaceNodes.Add(faceNode);
                }

                // Populate leaves into their FaceNodes.
                if (userBlockAliases.TryGetValue(alias, out var userTiles))
                {
                    foreach (var tile in userTiles)
                    {
                        trackedAliases.Add(tile);

                        var leafStatus = tile.Status switch
                        {
                            TextureStatus.Ok     => CatalogEntryStatus.Ok,
                            TextureStatus.Ghost  => CatalogEntryStatus.Ghost,
                            TextureStatus.Orphan => CatalogEntryStatus.Orphan,
                            _                    => CatalogEntryStatus.Ok
                        };

                        // Assign leaf to all face nodes for this alias under this block.
                        foreach (var faceNode in aliasNode.FaceNodes)
                        {
                            var faceLeaf = new CatalogLeaf
                            {
                                Alias        = alias,
                                DisplayName  = tile.DisplayName,
                                RelativePath = tile.RelativePath,
                                FullPath     = tile.FullPath,
                                Category     = TextureCategory.Block,
                                Status       = leafStatus,
                                TextureAlias = tile,
                                VariantKind  = tile.VariantKind,
                                BlockVariantIndex = tile.BlockVariantIndex,
                                TotalBlockVariants = tile.TotalBlockVariants,
                                TextureVariantIndex = tile.TextureVariantIndex,
                                TotalTextureVariants = tile.TotalTextureVariants,
                                Weight       = tile.Weight,
                                SubtitleCaption   = tile.SubtitleCaption,
                                PrimaryFaceBadgeText = faceNode.FaceLabel,
                                Flipbook     = tile.Flipbook
                            };

                            faceNode.Leaves.Add(faceLeaf);
                        }

                        // Also keep Leaves in sync so the alias node counts work.
                        var aliasLeaf = new CatalogLeaf
                        {
                            Alias        = alias,
                            DisplayName  = tile.DisplayName,
                            RelativePath = tile.RelativePath,
                            FullPath     = tile.FullPath,
                            Category     = TextureCategory.Block,
                            Status       = leafStatus,
                            TextureAlias = tile,
                            VariantKind  = tile.VariantKind,
                            BlockVariantIndex = tile.BlockVariantIndex,
                            TotalBlockVariants = tile.TotalBlockVariants,
                            TextureVariantIndex = tile.TextureVariantIndex,
                            TotalTextureVariants = tile.TotalTextureVariants,
                            Weight       = tile.Weight,
                            SubtitleCaption   = tile.SubtitleCaption,
                            PrimaryFaceBadgeText = tile.PrimaryFaceBadgeText,
                            Flipbook     = tile.Flipbook
                        };
                        aliasNode.Leaves.Add(aliasLeaf);
                    }
                }
                else
                {
                    // No user entry for this alias in terrain_texture.json → resolve from vanilla terrain_texture.json!
                    if (vanilla.TerrainTextures.TryGetValue(alias, out var vData) && vData.Entries.Count > 0)
                    {
                        foreach (var vEntry in vData.Entries)
                        {
                            var rawPath = vEntry.RawPath;
                            var fileName = Path.GetFileNameWithoutExtension(rawPath);
                            var normRaw = VanillaDataService.NormalizeTexturePath(rawPath);
                            var fullPath = packRoot != null
                                ? Path.Combine(packRoot, (normRaw + ".png").Replace('/', Path.DirectorySeparatorChar))
                                : normRaw;

                            var caption = vEntry.TotalBlockVariants.HasValue
                                ? $"block state {vEntry.BlockVariantIndex}/{vEntry.TotalBlockVariants}"
                                : (vEntry.TotalTextureVariants.HasValue
                                    ? $"tex {vEntry.TextureVariantIndex}/{vEntry.TotalTextureVariants}"
                                    : "missing texture");

                            foreach (var faceNode in aliasNode.FaceNodes)
                            {
                                var faceLeaf = new CatalogLeaf
                                {
                                    Alias        = alias,
                                    DisplayName  = fileName,
                                    RelativePath = normRaw,
                                    FullPath     = fullPath,
                                    Category     = TextureCategory.Block,
                                    Status       = CatalogEntryStatus.Ghost,
                                    TextureAlias = null,
                                    VariantKind  = vEntry.TotalBlockVariants.HasValue ? VariantKind.BlockVariant : (vEntry.TotalTextureVariants.HasValue ? VariantKind.TextureVariant : VariantKind.None),
                                    BlockVariantIndex = vEntry.BlockVariantIndex,
                                    TotalBlockVariants = vEntry.TotalBlockVariants,
                                    TextureVariantIndex = vEntry.TextureVariantIndex,
                                    TotalTextureVariants = vEntry.TotalTextureVariants,
                                    Weight       = vEntry.Weight,
                                    SubtitleCaption      = caption,
                                    PrimaryFaceBadgeText = faceNode.FaceLabel,
                                    Flipbook     = vanilla.Flipbooks.Find(alias, rawPath, vEntry.BlockVariantIndex, vEntry.TextureVariantIndex)
                                };
                                faceNode.Leaves.Add(faceLeaf);
                            }

                            var aliasLeaf = new CatalogLeaf
                            {
                                Alias        = alias,
                                DisplayName  = fileName,
                                RelativePath = normRaw,
                                FullPath     = fullPath,
                                Category     = TextureCategory.Block,
                                Status       = CatalogEntryStatus.Ghost,
                                TextureAlias = null,
                                VariantKind  = vEntry.TotalBlockVariants.HasValue ? VariantKind.BlockVariant : (vEntry.TotalTextureVariants.HasValue ? VariantKind.TextureVariant : VariantKind.None),
                                BlockVariantIndex = vEntry.BlockVariantIndex,
                                TotalBlockVariants = vEntry.TotalBlockVariants,
                                TextureVariantIndex = vEntry.TextureVariantIndex,
                                TotalTextureVariants = vEntry.TotalTextureVariants,
                                Weight       = vEntry.Weight,
                                SubtitleCaption      = caption,
                                PrimaryFaceBadgeText = aliasNode.FaceSummary,
                                Flipbook     = vanilla.Flipbooks.Find(alias, rawPath, vEntry.BlockVariantIndex, vEntry.TextureVariantIndex)
                            };
                            aliasNode.Leaves.Add(aliasLeaf);
                        }
                    }
                    else
                    {
                        // Custom alias not declared in vanilla terrain_texture.json
                        foreach (var faceNode in aliasNode.FaceNodes)
                        {
                            var leaf = new CatalogLeaf
                            {
                                Alias        = alias,
                                DisplayName  = alias,
                                RelativePath = $"textures/blocks/{alias}",
                                FullPath     = packRoot != null
                                    ? Path.Combine(packRoot, "textures", "blocks", $"{alias}.png")
                                    : alias,
                                Category     = TextureCategory.Block,
                                Status       = CatalogEntryStatus.Ghost,
                                TextureAlias = null,
                                SubtitleCaption      = "missing declaration",
                                PrimaryFaceBadgeText = faceNode.FaceLabel
                            };
                            faceNode.Leaves.Add(leaf);
                            aliasNode.Leaves.Add(leaf);
                        }
                    }
                }

                aliasNode.NotifyCountsChanged();
                blockNode.AliasGroups.Add(aliasNode);
            }

            blockNode.NotifyCountsChanged();
            result.Add(blockNode);
        }

        // ── 2. Fallback to vanilla blocks.json for aliases present in terrain_texture.json ──
        var untracked = userAliases
            .Where(a => a.Category == TextureCategory.Block
                     && a.Status != TextureStatus.NoEntry
                     && !trackedAliases.Contains(a))
            .ToList();

        if (untracked.Count > 0)
        {
            var vanillaBlockGroups = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
            var remainingUntracked = new List<TextureAlias>();

            foreach (var aliasItem in untracked)
            {
                // Orphan files on disk are not declared in terrain_texture.json;
                // do not match them against vanilla blocks simply by filename.
                if (aliasItem.Status == TextureStatus.Orphan)
                {
                    remainingUntracked.Add(aliasItem);
                    continue;
                }

                var aliasName = aliasItem.Alias;
                if (vanilla.BlockUsage.TryGetValue(aliasName, out var vFaces) && vFaces.Count > 0)
                {
                    var blockIds = vFaces.Select(f => f.BlockId).Distinct(StringComparer.OrdinalIgnoreCase);
                    foreach (var bId in blockIds)
                    {
                        if (!vanillaBlockGroups.TryGetValue(bId, out var aliasList))
                            vanillaBlockGroups[bId] = aliasList = new List<string>();
                        if (!aliasList.Contains(aliasName, StringComparer.OrdinalIgnoreCase))
                            aliasList.Add(aliasName);
                    }
                }
                else
                {
                    var matchingBlocks = vanilla.BlockToAliases
                        .Where(kvp => kvp.Value.Contains(aliasName, StringComparer.OrdinalIgnoreCase))
                        .Select(kvp => kvp.Key)
                        .ToList();

                    if (matchingBlocks.Count > 0)
                    {
                        foreach (var bId in matchingBlocks)
                        {
                            if (!vanillaBlockGroups.TryGetValue(bId, out var aliasList))
                                vanillaBlockGroups[bId] = aliasList = new List<string>();
                            if (!aliasList.Contains(aliasName, StringComparer.OrdinalIgnoreCase))
                                aliasList.Add(aliasName);
                        }
                    }
                    else
                    {
                        remainingUntracked.Add(aliasItem);
                    }
                }
            }

            foreach (var (blockId, aliasesForBlock) in vanillaBlockGroups.OrderBy(k => k.Key, StringComparer.OrdinalIgnoreCase))
            {
                var blockNode = new BlockGroupNode
                {
                    BlockId = blockId,
                    DisplayName = vanilla.GetBlockDisplayName(blockId),
                    Category = TextureCategory.Block,
                    IsUserDefined = false
                };

                foreach (var alias in aliasesForBlock)
                {
                    var aliasNode = new AliasGroupNode
                    {
                        Alias = alias,
                        Category = TextureCategory.Block,
                        ParentBlock = blockNode
                    };

                    var facesForAlias = vanilla.BlockUsage.TryGetValue(alias, out var vf) ? vf : new List<BlockFaceUsage>();
                    aliasNode.FaceSummary = SummarizeFaces(facesForAlias);

                    var faceLabels = facesForAlias
                        .Where(f => f.BlockId.Equals(blockId, StringComparison.OrdinalIgnoreCase))
                        .Select(f => f.Face.ToLowerInvariant())
                        .Distinct()
                        .ToList();

                    if (faceLabels.Count == 0)
                        faceLabels.Add("all");

                    var faceNodeMap = new Dictionary<string, FaceNode>(StringComparer.OrdinalIgnoreCase);
                    foreach (var faceLabel in faceLabels)
                    {
                        var faceNode = new FaceNode { FaceLabel = faceLabel, IsExpanded = true };
                        faceNodeMap[faceLabel] = faceNode;
                        aliasNode.FaceNodes.Add(faceNode);
                    }

                    if (userBlockAliases.TryGetValue(alias, out var userTiles))
                    {
                        foreach (var tile in userTiles)
                        {
                            trackedAliases.Add(tile);
                            var leafStatus = tile.Status switch
                            {
                                TextureStatus.Ok     => CatalogEntryStatus.Ok,
                                TextureStatus.Ghost  => CatalogEntryStatus.Ghost,
                                TextureStatus.Orphan => CatalogEntryStatus.Orphan,
                                _                    => CatalogEntryStatus.Ok
                            };

                            var targetFaceLabels = tile.BlockFaces
                                .Where(f => f.BlockId.Equals(blockId, StringComparison.OrdinalIgnoreCase))
                                .Select(f => f.Face.ToLowerInvariant())
                                .Distinct()
                                .ToList();

                            var targetNodes = aliasNode.FaceNodes
                                .Where(fn => targetFaceLabels.Count == 0 || targetFaceLabels.Contains(fn.FaceLabel.ToLowerInvariant()) || fn.FaceLabel == "all")
                                .ToList();

                            if (targetNodes.Count == 0)
                                targetNodes = aliasNode.FaceNodes.ToList();

                            foreach (var faceNode in targetNodes)
                            {
                                var faceLeaf = new CatalogLeaf
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
                                    PrimaryFaceBadgeText = faceNode.FaceLabel,
                                    Flipbook = tile.Flipbook
                                };
                                faceNode.Leaves.Add(faceLeaf);
                            }

                            var aliasLeaf = new CatalogLeaf
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
                            aliasNode.Leaves.Add(aliasLeaf);
                        }
                    }

                    aliasNode.NotifyCountsChanged();
                    blockNode.AliasGroups.Add(aliasNode);
                }

                blockNode.NotifyCountsChanged();
                result.Add(blockNode);
            }

            // ── 3. Declared-but-unclaimed aliases get their own fallback block
            // entries; true orphans (on disk, not declared in any JSON) stay
            // under (Uncategorized) ──
            var finalUntracked = remainingUntracked
                .Where(a => !trackedAliases.Contains(a))
                .ToList();

            var takenBlockIds = new HashSet<string>(result.Select(b => b.BlockId), StringComparer.OrdinalIgnoreCase);
            var fallbackGroups = new List<IGrouping<string, TextureAlias>>();
            var orphanItems = new List<TextureAlias>();

            foreach (var grp in finalUntracked.GroupBy(u => u.Alias, StringComparer.OrdinalIgnoreCase))
            {
                bool isDeclared = grp.Any(t => t.Status != TextureStatus.Orphan);
                if (isDeclared && !takenBlockIds.Contains(grp.Key))
                {
                    fallbackGroups.Add(grp);
                    takenBlockIds.Add(grp.Key);
                }
                else
                {
                    // True orphans, or declared aliases colliding with an
                    // existing block id, fall through to (Uncategorized).
                    orphanItems.AddRange(grp);
                }
            }

            foreach (var grp in fallbackGroups.OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase))
            {
                var aliasName = grp.Key;
                var fallbackFaces = vanilla.BlockUsage.TryGetValue(aliasName, out var fbFaces)
                    ? fbFaces
                    : new List<BlockFaceUsage>();

                var fallbackNode = new BlockGroupNode
                {
                    BlockId = aliasName,
                    DisplayName = vanilla.GetBlockDisplayName(aliasName),
                    Category = TextureCategory.Block,
                    IsUserDefined = false
                };

                var fallbackAliasNode = new AliasGroupNode
                {
                    Alias = aliasName,
                    Category = TextureCategory.Block,
                    ParentBlock = fallbackNode,
                    FaceSummary = SummarizeFaces(fallbackFaces)
                };

                var fallbackFaceNode = new FaceNode { FaceLabel = "all", IsExpanded = true };
                fallbackAliasNode.FaceNodes.Add(fallbackFaceNode);

                foreach (var tile in grp)
                {
                    var fallbackLeaf = new CatalogLeaf
                    {
                        Alias = tile.Alias,
                        DisplayName = tile.DisplayName,
                        RelativePath = tile.RelativePath,
                        FullPath = tile.FullPath,
                        Category = TextureCategory.Block,
                        Status = tile.Status switch
                        {
                            TextureStatus.Ok => CatalogEntryStatus.Ok,
                            TextureStatus.Ghost => CatalogEntryStatus.Ghost,
                            _ => CatalogEntryStatus.Orphan
                        },
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
                    fallbackFaceNode.Leaves.Add(fallbackLeaf);
                    fallbackAliasNode.Leaves.Add(fallbackLeaf);
                }

                fallbackAliasNode.NotifyCountsChanged();
                fallbackNode.AliasGroups.Add(fallbackAliasNode);
                fallbackNode.NotifyCountsChanged();
                result.Add(fallbackNode);
            }

            if (orphanItems.Count > 0)
            {
                var uncategorizedNode = new BlockGroupNode
                {
                    BlockId = "uncategorized",
                    DisplayName = "(Uncategorized)",
                    Category = TextureCategory.Block,
                    IsUserDefined = false
                };

                foreach (var grp in orphanItems.GroupBy(u => u.Alias, StringComparer.OrdinalIgnoreCase))
                {
                    var aliasNode = new AliasGroupNode
                    {
                        Alias = grp.Key,
                        Category = TextureCategory.Block,
                        ParentBlock = uncategorizedNode,
                        FaceSummary = string.Empty
                    };

                    var faceNode = new FaceNode { FaceLabel = "all", IsExpanded = true };
                    aliasNode.FaceNodes.Add(faceNode);

                    foreach (var tile in grp)
                    {
                        var leaf = new CatalogLeaf
                        {
                            Alias = tile.Alias,
                            DisplayName = tile.DisplayName,
                            RelativePath = tile.RelativePath,
                            FullPath = tile.FullPath,
                            Category = TextureCategory.Block,
                            Status = tile.Status switch
                            {
                                TextureStatus.Ok => CatalogEntryStatus.Ok,
                                TextureStatus.Ghost => CatalogEntryStatus.Ghost,
                                _ => CatalogEntryStatus.Orphan
                            },
                            TextureAlias = tile,
                            SubtitleCaption = tile.SubtitleCaption,
                            PrimaryFaceBadgeText = tile.PrimaryFaceBadgeText,
                            Flipbook = tile.Flipbook
                        };
                        faceNode.Leaves.Add(leaf);
                        aliasNode.Leaves.Add(leaf);
                    }

                    aliasNode.NotifyCountsChanged();
                    uncategorizedNode.AliasGroups.Add(aliasNode);
                }

                uncategorizedNode.NotifyCountsChanged();
                result.Add(uncategorizedNode);
            }
        }

        return result;
    }
}
