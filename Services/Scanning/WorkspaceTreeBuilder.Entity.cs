using System.IO;
using McTextureGhost.Models;

namespace McTextureGhost.Services.Scanning;

public static partial class WorkspaceTreeBuilder
{
    /// <summary>
    /// Constructs a hierarchical workspace tree specifically for Entity textures,
    /// grouping by entity identifier and geometry variant.
    /// </summary>
    public static List<BlockGroupNode> BuildEntityWorkspaceTree(
        IList<TextureAlias> userAliases,
        VanillaData? vanilla,
        string? packRoot)
    {
        var result = new List<BlockGroupNode>();

        var entityAliases = userAliases
            .Where(a => a.Category == TextureCategory.Entity && a.Status != TextureStatus.NoEntry && a.Status != TextureStatus.Orphan)
            .ToList();

        if (entityAliases.Count == 0)
            return result;

        // Group by EntityId (e.g. "minecraft:zombie", "minecraft:elytra")
        var groups = entityAliases
            .GroupBy(a => !string.IsNullOrEmpty(a.EntityId) ? a.EntityId : a.Alias, StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase);

        foreach (var group in groups)
        {
            var entityId = group.Key;
            var cleanId = entityId.StartsWith("minecraft:", StringComparison.OrdinalIgnoreCase)
                ? entityId.Substring("minecraft:".Length)
                : entityId;

            var isAttachable = group.Any(t => t.IsAttachable);
            var displayName = vanilla?.GetEntityDisplayName(entityId) ?? cleanId;

            var isCustomEntity = group.Any(t => t.IsUserDefined);
            var hasPackJson = packRoot != null && (
                File.Exists(Path.Combine(packRoot, "entity", $"{cleanId}.entity.json")) ||
                File.Exists(Path.Combine(packRoot, "entity", $"{cleanId}.json")) ||
                File.Exists(Path.Combine(packRoot, "attachables", $"{cleanId}.json")) ||
                group.Any(t => t.IsAttachable && File.Exists(Path.Combine(packRoot, "attachables", $"{t.Alias}.json")))
            );
            var isUserDefined = isCustomEntity || hasPackJson;

            var entityNode = new BlockGroupNode
            {
                BlockId = entityId,
                DisplayName = displayName,
                Category = TextureCategory.Entity,
                IsUserDefined = isUserDefined
            };

            // Group tiles by their distinct geometry so adult, baby, and variant geometries are separated cleanly
            var slotGroups = group
                .GroupBy(t => t.GeometryId ?? "default", StringComparer.OrdinalIgnoreCase)
                .OrderBy(g => g.Key.Contains("baby", StringComparison.OrdinalIgnoreCase) ? 1 : 0);

            foreach (var slotGroup in slotGroups)
            {
                var firstTile = slotGroup.FirstOrDefault();
                var geoId = firstTile?.GeometryId;
                var isBabySlot = geoId != null && geoId.Contains("baby", StringComparison.OrdinalIgnoreCase);

                string slotAlias;
                if (slotGroups.Count() > 1)
                {
                    if (isBabySlot)
                    {
                        slotAlias = $"{cleanId} (baby)";
                    }
                    else
                    {
                        var suffix = geoId?.Replace("geometry.", "", StringComparison.OrdinalIgnoreCase) ?? "variant";
                        if (suffix.StartsWith(cleanId + ".", StringComparison.OrdinalIgnoreCase))
                            suffix = suffix.Substring(cleanId.Length + 1);
                        if (suffix.Equals(cleanId, StringComparison.OrdinalIgnoreCase) || string.IsNullOrEmpty(suffix))
                            suffix = "default";
                        slotAlias = $"{cleanId} ({suffix})";
                    }
                }
                else
                {
                    slotAlias = cleanId;
                }

                var aliasNode = new AliasGroupNode
                {
                    Alias = slotAlias,
                    Category = TextureCategory.Entity,
                    FaceSummary = isAttachable ? "attachable" : (isBabySlot ? "baby" : "entity"),
                    GeometryId = geoId,
                    IsAttachable = isAttachable
                };

                var faceNode = new FaceNode
                {
                    FaceLabel = isAttachable ? "attachable" : (isBabySlot ? "baby" : "model")
                };

                foreach (var tile in slotGroup)
                {
                    var leafStatus = tile.Status switch
                    {
                        TextureStatus.Ok => CatalogEntryStatus.Ok,
                        TextureStatus.Ghost => CatalogEntryStatus.Ghost,
                        _ => CatalogEntryStatus.Orphan
                    };

                    var slotCaption = !string.IsNullOrEmpty(tile.TextureKey)
                        ? tile.TextureKey
                        : "default";

                    var leaf = new CatalogLeaf
                    {
                        Alias = tile.Alias,
                        DisplayName = tile.DisplayName,
                        RelativePath = tile.RelativePath,
                        FullPath = tile.FullPath,
                        Category = TextureCategory.Entity,
                        Status = leafStatus,
                        TextureAlias = tile,
                        EntityId = tile.EntityId,
                        TextureKey = tile.TextureKey,
                        GeometryId = tile.GeometryId,
                        IsAttachable = tile.IsAttachable,
                        VariantKind = tile.VariantKind,
                        SubtitleCaption = !string.IsNullOrEmpty(tile.SubtitleCaption) ? tile.SubtitleCaption : slotCaption,
                        PrimaryFaceBadgeText = slotCaption
                    };

                    faceNode.Leaves.Add(leaf);
                    aliasNode.Leaves.Add(leaf);
                }

                aliasNode.FaceNodes.Add(faceNode);
                aliasNode.NotifyCountsChanged();
                entityNode.AliasGroups.Add(aliasNode);
            }

            entityNode.NotifyCountsChanged();
            result.Add(entityNode);
        }

        return result;
    }
}
