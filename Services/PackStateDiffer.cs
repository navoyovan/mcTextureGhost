using McTextureGhost.Models;

namespace McTextureGhost.Services;

/// <summary>
/// Computes structural and item diffs between consecutive PackStatePayload snapshots
/// to produce minimal PACK:PATCH payloads rather than re-transmitting multi-megabyte snapshots.
/// </summary>
public static class PackStateDiffer
{
    private const int MaxPatchItemsThreshold = 500;

    /// <summary>
    /// Compares <paramref name="current"/> against <paramref name="previous"/>.
    /// Returns a <see cref="PackPatchPayload"/> if the diff is within the incremental threshold,
    /// or null if a full snapshot re-transmission is warranted.
    /// </summary>
    public static PackPatchPayload? ComputeDiff(PackStatePayload? previous, PackStatePayload current, long seq)
    {
        if (previous == null ||
            string.IsNullOrEmpty(current.PackRoot) ||
            !string.Equals(previous.PackRoot, current.PackRoot, StringComparison.OrdinalIgnoreCase))
        {
            return null; // Full snapshot required on initial load or pack switch
        }

        // 1. Alias diffs
        var prevAliases = previous.Aliases ?? new List<TextureAliasDto>();
        var currAliases = current.Aliases ?? new List<TextureAliasDto>();

        var prevAliasMap = new Dictionary<string, TextureAliasDto>(prevAliases.Count, StringComparer.OrdinalIgnoreCase);
        foreach (var a in prevAliases)
        {
            var key = GetAliasKey(a);
            if (!string.IsNullOrEmpty(key)) prevAliasMap[key] = a;
        }

        var currAliasMap = new Dictionary<string, TextureAliasDto>(currAliases.Count, StringComparer.OrdinalIgnoreCase);
        var upsertAliases = new List<TextureAliasDto>();

        foreach (var a in currAliases)
        {
            var key = GetAliasKey(a);
            if (string.IsNullOrEmpty(key)) continue;
            currAliasMap[key] = a;

            if (!prevAliasMap.TryGetValue(key, out var prevA) || !AreAliasesEqual(prevA, a))
            {
                upsertAliases.Add(a);
            }
        }

        var removeAliasKeys = new List<string>();
        foreach (var key in prevAliasMap.Keys)
        {
            if (!currAliasMap.ContainsKey(key))
            {
                removeAliasKeys.Add(key);
            }
        }

        // If the number of alias mutations is huge (e.g. bulk format migration), fall back to full state
        if (upsertAliases.Count + removeAliasKeys.Count > MaxPatchItemsThreshold)
        {
            return null;
        }

        // 2. Block Workspace Tree diffs
        List<BlockGroupNodeDto>? upsertBlocks = null;
        List<string>? removeBlockIds = null;
        if (current.BlockWorkspaceTree != null)
        {
            var prevBlocks = previous.BlockWorkspaceTree ?? new List<BlockGroupNodeDto>();
            var prevBlockMap = new Dictionary<string, BlockGroupNodeDto>(prevBlocks.Count, StringComparer.OrdinalIgnoreCase);
            foreach (var b in prevBlocks)
                if (!string.IsNullOrEmpty(b.BlockId)) prevBlockMap[b.BlockId] = b;

            var currBlockMap = new Dictionary<string, BlockGroupNodeDto>(current.BlockWorkspaceTree.Count, StringComparer.OrdinalIgnoreCase);
            upsertBlocks = new List<BlockGroupNodeDto>();

            foreach (var b in current.BlockWorkspaceTree)
            {
                if (string.IsNullOrEmpty(b.BlockId)) continue;
                currBlockMap[b.BlockId] = b;

                if (!prevBlockMap.TryGetValue(b.BlockId, out var prevB) || !AreBlocksEqual(prevB, b))
                {
                    upsertBlocks.Add(b);
                }
            }

            removeBlockIds = new List<string>();
            foreach (var blockId in prevBlockMap.Keys)
            {
                if (!currBlockMap.ContainsKey(blockId))
                {
                    removeBlockIds.Add(blockId);
                }
            }
        }

        // 3. Entity Workspace Tree diffs
        List<BlockGroupNodeDto>? upsertEntities = null;
        List<string>? removeEntityIds = null;
        if (current.EntityWorkspaceTree != null)
        {
            var prevEntities = previous.EntityWorkspaceTree ?? new List<BlockGroupNodeDto>();
            var prevEntityMap = new Dictionary<string, BlockGroupNodeDto>(prevEntities.Count, StringComparer.OrdinalIgnoreCase);
            foreach (var e in prevEntities)
                if (!string.IsNullOrEmpty(e.BlockId)) prevEntityMap[e.BlockId] = e;

            var currEntityMap = new Dictionary<string, BlockGroupNodeDto>(current.EntityWorkspaceTree.Count, StringComparer.OrdinalIgnoreCase);
            upsertEntities = new List<BlockGroupNodeDto>();

            foreach (var e in current.EntityWorkspaceTree)
            {
                if (string.IsNullOrEmpty(e.BlockId)) continue;
                currEntityMap[e.BlockId] = e;

                if (!prevEntityMap.TryGetValue(e.BlockId, out var prevE) || !AreBlocksEqual(prevE, e))
                {
                    upsertEntities.Add(e);
                }
            }

            removeEntityIds = new List<string>();
            foreach (var entityId in prevEntityMap.Keys)
            {
                if (!currEntityMap.ContainsKey(entityId))
                {
                    removeEntityIds.Add(entityId);
                }
            }
        }

        // 4. Manifest check
        ManifestModelDto? manifestPatch = null;
        if (current.Manifest != previous.Manifest)
        {
            manifestPatch = current.Manifest;
        }

        return new PackPatchPayload(
            Seq: seq,
            UpsertAliases: upsertAliases.Count > 0 ? upsertAliases : null,
            RemoveAliasKeys: removeAliasKeys.Count > 0 ? removeAliasKeys : null,
            UpsertBlocks: upsertBlocks != null && upsertBlocks.Count > 0 ? upsertBlocks : null,
            RemoveBlockIds: removeBlockIds != null && removeBlockIds.Count > 0 ? removeBlockIds : null,
            UpsertEntities: upsertEntities != null && upsertEntities.Count > 0 ? upsertEntities : null,
            RemoveEntityIds: removeEntityIds != null && removeEntityIds.Count > 0 ? removeEntityIds : null,
            UpsertCatalog: null,
            Stats: current.Stats,
            Manifest: manifestPatch,
            HasPackIcon: current.HasPackIcon != previous.HasPackIcon ? current.HasPackIcon : null,
            PackIconUrl: current.PackIconUrl != previous.PackIconUrl ? current.PackIconUrl : null
        );
    }

    private static string GetAliasKey(TextureAliasDto a)
    {
        return !string.IsNullOrEmpty(a.Key) ? a.Key : a.Alias;
    }

    private static bool AreAliasesEqual(TextureAliasDto a, TextureAliasDto b)
    {
        return a.Status == b.Status &&
               a.Exists == b.Exists &&
               a.Weight == b.Weight &&
               a.TextureVariantIndex == b.TextureVariantIndex &&
               a.TotalTextureVariants == b.TotalTextureVariants &&
               a.BlockVariantIndex == b.BlockVariantIndex &&
               a.TotalBlockVariants == b.TotalBlockVariants &&
               a.IsFlipbook == b.IsFlipbook &&
               string.Equals(a.FullPath, b.FullPath, StringComparison.OrdinalIgnoreCase) &&
               string.Equals(a.ImageUrl, b.ImageUrl, StringComparison.Ordinal) &&
               string.Equals(a.PrimaryFaceBadgeText, b.PrimaryFaceBadgeText, StringComparison.Ordinal) &&
               string.Equals(a.SubtitleCaption, b.SubtitleCaption, StringComparison.Ordinal);
    }

    private static bool AreBlocksEqual(BlockGroupNodeDto a, BlockGroupNodeDto b)
    {
        if (a.GhostCount != b.GhostCount ||
            a.TotalVariants != b.TotalVariants ||
            a.IsUserDefined != b.IsUserDefined ||
            !string.Equals(a.DisplayName, b.DisplayName, StringComparison.Ordinal))
        {
            return false;
        }

        if (a.AliasGroups.Count != b.AliasGroups.Count) return false;
        for (int i = 0; i < a.AliasGroups.Count; i++)
        {
            var agA = a.AliasGroups[i];
            var agB = b.AliasGroups[i];
            if (agA.GhostCount != agB.GhostCount ||
                agA.NotAddedCount != agB.NotAddedCount ||
                agA.Leaves.Count != agB.Leaves.Count)
            {
                return false;
            }

            for (int j = 0; j < agA.Leaves.Count; j++)
            {
                var lA = agA.Leaves[j];
                var lB = agB.Leaves[j];
                if (lA.Status != lB.Status ||
                    !string.Equals(lA.FullPath, lB.FullPath, StringComparison.OrdinalIgnoreCase) ||
                    !string.Equals(lA.ImageUrl, lB.ImageUrl, StringComparison.Ordinal))
                {
                    return false;
                }
            }
        }

        return true;
    }
}
