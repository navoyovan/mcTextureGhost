using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Media;

namespace McTextureGhost.Models;

/// <summary>
/// Represents a block geometry face mapping from blocks.json (e.g. "cactus" -> "side").
/// </summary>
public record BlockFaceUsage(string BlockId, string Face);

/// <summary>
/// Specifies whether a multi-texture alias represents a block data-value variant or random texture variations.
/// </summary>
public enum VariantKind
{
    /// <summary>Single texture alias.</summary>
    None,
    /// <summary>Declared via "textures": [ ... ] (block state / data-value slot, e.g. cobblestone_wall).</summary>
    BlockVariant,
    /// <summary>Declared via "variations": [ ... ] (random in-world cosmetic variation with weights, e.g. cobblestone).</summary>
    TextureVariant,
    /// <summary>Nested: a block state slot in "textures": [ ... ] containing "variations": [ ... ] (e.g. dirt).</summary>
    NestedVariant
}

/// <summary>
/// The 4 consolidated status states for texture tiles.
/// </summary>
public enum TextureStatus
{
    /// <summary>Declared in JSON and physically exists on disk.</summary>
    Ok,
    /// <summary>Declared in JSON but file is missing from disk.</summary>
    Ghost,
    /// <summary>Physically exists on disk but is not referenced in JSON.</summary>
    Orphan,
    /// <summary>Search name with zero matches; represents the create-flow trigger.</summary>
    NoEntry
}

/// <summary>
/// One entry from terrain_texture.json's texture_data block, resolved against
/// the actual filesystem so the UI can tell "real file" from "ghost".
/// </summary>
public class TextureAlias : INotifyPropertyChanged
{
    // ─── Static Frozen Brushes (thread-safe, zero per-tile allocation) ────────
    private static SolidColorBrush FreezeBrush(string hex, double opacity = 1.0)
    {
        var color = (Color)ColorConverter.ConvertFromString(hex);
        if (opacity < 1.0)
            color = Color.FromArgb((byte)(opacity * 255), color.R, color.G, color.B);
        var b = new SolidColorBrush(color);
        b.Freeze();
        return b;
    }

    private static readonly SolidColorBrush OkDotBrush      = FreezeBrush("#22C55E"); // green-500
    private static readonly SolidColorBrush GhostDotBrush   = FreezeBrush("#F472B6"); // pink-400 (soft, not #FC00FF)
    private static readonly SolidColorBrush OrphanDotBrush  = FreezeBrush("#F59E0B"); // amber-500
    private static readonly SolidColorBrush NoEntryDotBrush = FreezeBrush("#38BDF8"); // sky-400

    private static readonly SolidColorBrush OkMutedBrush      = FreezeBrush("#884ADE80");
    private static readonly SolidColorBrush GhostMutedBrush   = FreezeBrush("#A0F472B6");
    private static readonly SolidColorBrush OrphanMutedBrush  = FreezeBrush("#A0FBBF24");
    private static readonly SolidColorBrush NoEntryMutedBrush = FreezeBrush("#A038BDF8");

    private static readonly SolidColorBrush OkBorderBrush      = FreezeBrush("#27272A");       // solid neutral
    private static readonly SolidColorBrush GhostBorderBrush   = FreezeBrush("#55F472B6");       // dashed soft pink
    private static readonly SolidColorBrush OrphanBorderBrush  = FreezeBrush("#66F59E0B");       // dashed amber
    private static readonly SolidColorBrush NoEntryBorderBrush = FreezeBrush("#6638BDF8");       // dashed sky blue

    private static readonly SolidColorBrush OkBgBrush      = FreezeBrush("#18181B");
    private static readonly SolidColorBrush GhostBgBrush   = FreezeBrush("#141014");
    private static readonly SolidColorBrush OrphanBgBrush  = FreezeBrush("#161410");
    private static readonly SolidColorBrush NoEntryBgBrush = FreezeBrush("#10141A");

    private static readonly SolidColorBrush GhostPlaceholderBg   = FreezeBrush("#1E1420");
    private static readonly SolidColorBrush NoEntryPlaceholderBg = FreezeBrush("#142033");

    // ─── Properties ──────────────────────────────────────────────────────────

    /// <summary>The key in texture_data, e.g. "stone", "demo_stone".</summary>
    public required string Alias { get; init; }

    /// <summary>Relative path as declared in JSON, no extension, e.g. "textures/blocks/stone".</summary>
    public required string RelativePath { get; init; }

    /// <summary>Absolute path on disk this alias resolves to (RelativePath + ".png").</summary>
    public required string FullPath { get; set; }

    /// <summary>All block face mappings from blocks.json that reference this alias.</summary>
    public List<BlockFaceUsage> BlockFaces { get; init; } = new();

    /// <summary>Block IDs (namespace:name) from blocks.json that reference this alias, if any.</summary>
    public List<string> UsedByBlocks => BlockFaces.Select(b => b.BlockId).Distinct().ToList();

    /// <summary>Block variant index (1-based), e.g. 1 of 14 for cobblestone_wall or 1 of 2 for dirt.</summary>
    public int? BlockVariantIndex { get; init; }

    /// <summary>Total number of block variants for this alias, or null if uniform block.</summary>
    public int? TotalBlockVariants { get; init; }

    /// <summary>Random texture variation index (1-based), e.g. 1 of 8 for cobblestone or 1 of 2 for dirt.</summary>
    public int? TextureVariantIndex { get; init; }

    /// <summary>Total number of random texture variations in this slot, or null if no variations.</summary>
    public int? TotalTextureVariants { get; init; }

    /// <summary>Indicates if this item is a block state / data value variant (declared via "textures": [ ... ] in terrain_texture.json).</summary>
    public bool IsBlockVariant => BlockVariantIndex.HasValue && TotalBlockVariants.HasValue && TotalBlockVariants.Value > 1;

    /// <summary>Indicates if this item is a random cosmetic variation (declared via "variations": [ ... ] in terrain_texture.json).</summary>
    public bool IsTextureVariant => TextureVariantIndex.HasValue && TotalTextureVariants.HasValue && TotalTextureVariants.Value > 1;

    /// <summary>Indicates if this item has both a block state variant slot and random texture variations.</summary>
    public bool IsNestedVariant => IsBlockVariant && IsTextureVariant;

    /// <summary>The kind of variant structure defined in terrain_texture.json.</summary>
    public VariantKind VariantKind
    {
        get =>
            IsNestedVariant ? VariantKind.NestedVariant :
            (IsBlockVariant ? VariantKind.BlockVariant :
            (IsTextureVariant ? VariantKind.TextureVariant : VariantKind.None));
        init { }
    }

    /// <summary>Backward-compatible helper: true if either block variant or texture variant.</summary>
    public bool IsVariant => IsBlockVariant || IsTextureVariant;

    /// <summary>Backward-compatible variant index (1-based).</summary>
    public int? VariantIndex => TextureVariantIndex ?? BlockVariantIndex;

    /// <summary>Backward-compatible total variants count.</summary>
    public int? TotalVariants => TotalTextureVariants ?? TotalBlockVariants;

    /// <summary>Optional spawn weight for random texture variations (defaults to 1 in Minecraft if omitted).</summary>
    public int? Weight { get; init; }

    /// <summary>The display title shown on the tile - always the clean alias name.</summary>
    public required string DisplayName { get; init; }

    private TextureStatus _status = TextureStatus.Ok;
    public TextureStatus Status
    {
        get => _status;
        set
        {
            if (_status == value) return;
            _status = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(Exists));
            OnPropertyChanged(nameof(HasDashedBorder));
            OnPropertyChanged(nameof(StatusDotBrush));
            OnPropertyChanged(nameof(StatusMutedBrush));
            OnPropertyChanged(nameof(StatusLabel));
            OnPropertyChanged(nameof(CardBorderBrush));
            OnPropertyChanged(nameof(CardBackgroundBrush));
            OnPropertyChanged(nameof(SubtitleCaption));
            OnPropertyChanged(nameof(IsOk));
            OnPropertyChanged(nameof(IsGhost));
            OnPropertyChanged(nameof(IsOrphan));
            OnPropertyChanged(nameof(IsNoEntry));
            OnPropertyChanged(nameof(ShowsImageThumbnail));
            OnPropertyChanged(nameof(ShowsPlaceholderGlyph));
            OnPropertyChanged(nameof(PlaceholderBackgroundBrush));
            OnPropertyChanged(nameof(PlaceholderGlyph));
            OnPropertyChanged(nameof(PlaceholderGlyphBrush));
        }
    }

    /// <summary>Backward-compatible helper: true if the file physically exists on disk.</summary>
    public bool Exists
    {
        get => _status == TextureStatus.Ok || _status == TextureStatus.Orphan;
        set => Status = value ? TextureStatus.Ok : TextureStatus.Ghost;
    }

    public bool HasDashedBorder => Status != TextureStatus.Ok;
    public bool IsOk => Status == TextureStatus.Ok;
    public bool IsGhost => Status == TextureStatus.Ghost;
    public bool IsOrphan => Status == TextureStatus.Orphan;
    public bool IsNoEntry => Status == TextureStatus.NoEntry;

    public bool ShowsImageThumbnail => Status == TextureStatus.Ok || Status == TextureStatus.Orphan;
    public bool ShowsPlaceholderGlyph => Status == TextureStatus.Ghost || Status == TextureStatus.NoEntry;

    public SolidColorBrush StatusDotBrush => Status switch
    {
        TextureStatus.Ok      => OkDotBrush,
        TextureStatus.Ghost   => GhostDotBrush,
        TextureStatus.Orphan  => OrphanDotBrush,
        TextureStatus.NoEntry => NoEntryDotBrush,
        _ => OkDotBrush
    };

    public SolidColorBrush StatusMutedBrush => Status switch
    {
        TextureStatus.Ok      => OkMutedBrush,
        TextureStatus.Ghost   => GhostMutedBrush,
        TextureStatus.Orphan  => OrphanMutedBrush,
        TextureStatus.NoEntry => NoEntryMutedBrush,
        _ => OkMutedBrush
    };

    public string StatusLabel => Status switch
    {
        TextureStatus.Ok      => "OK",
        TextureStatus.Ghost   => "GHOST",
        TextureStatus.Orphan  => "ORPHAN",
        TextureStatus.NoEntry => "NEW",
        _ => "OK"
    };

    public SolidColorBrush CardBorderBrush => Status switch
    {
        TextureStatus.Ok      => OkBorderBrush,
        TextureStatus.Ghost   => GhostBorderBrush,
        TextureStatus.Orphan  => OrphanBorderBrush,
        TextureStatus.NoEntry => NoEntryBorderBrush,
        _ => OkBorderBrush
    };

    public SolidColorBrush CardBackgroundBrush => Status switch
    {
        TextureStatus.Ok      => OkBgBrush,
        TextureStatus.Ghost   => GhostBgBrush,
        TextureStatus.Orphan  => OrphanBgBrush,
        TextureStatus.NoEntry => NoEntryBgBrush,
        _ => OkBgBrush
    };

    public SolidColorBrush PlaceholderBackgroundBrush => Status switch
    {
        TextureStatus.NoEntry => NoEntryPlaceholderBg,
        _ => GhostPlaceholderBg
    };

    public string PlaceholderGlyph => Status switch
    {
        TextureStatus.NoEntry => "+",
        _ => "?"
    };

    public SolidColorBrush PlaceholderGlyphBrush => Status switch
    {
        TextureStatus.NoEntry => NoEntryMutedBrush,
        _ => GhostMutedBrush
    };

    /// <summary>
    /// Short normalized face name for block faces from blocks.json (e.g. "top", "btm", "side", "top/btm").
    /// </summary>
    public string PrimaryFaceBadgeText
    {
        get
        {
            if (BlockFaces.Count == 0) return string.Empty;

            var directionalFaces = BlockFaces
                .Select(b => b.Face.ToLowerInvariant())
                .Where(f => f != "all")
                .ToHashSet();

            if (directionalFaces.Count == 0) return string.Empty;

            if (directionalFaces.SetEquals(new[] { "up" })) return "top";
            if (directionalFaces.SetEquals(new[] { "down" })) return "btm";
            if (directionalFaces.SetEquals(new[] { "side" })) return "side";
            if (directionalFaces.SetEquals(new[] { "up", "down" })) return "top/btm";

            if (directionalFaces.SetEquals(new[] { "north", "south", "east", "west" }) ||
                directionalFaces.SetEquals(new[] { "side", "north", "south", "east", "west" }))
                return "sides";

            if (directionalFaces.SetEquals(new[] { "north" })) return "north";
            if (directionalFaces.SetEquals(new[] { "south" })) return "south";
            if (directionalFaces.SetEquals(new[] { "east" })) return "east";
            if (directionalFaces.SetEquals(new[] { "west" })) return "west";

            if (directionalFaces.SetEquals(new[] { "east", "west" })) return "e/w";
            if (directionalFaces.SetEquals(new[] { "north", "south" })) return "n/s";

            if (directionalFaces.Contains("up") && !directionalFaces.Contains("down")) return "top";
            if (directionalFaces.Contains("down") && !directionalFaces.Contains("up")) return "btm";
            if (directionalFaces.Contains("side")) return "side";

            if (directionalFaces.All(f => f.StartsWith("carried"))) return "hand";

            return directionalFaces.First().ToLowerInvariant();
        }
    }

    public bool HasFaceBadge => !string.IsNullOrEmpty(PrimaryFaceBadgeText);

    private string? _searchFilterKey;
    /// <summary>
    /// Pre-computed lowercased search corpus containing alias, display name, relative path,
    /// primary face badge text, and all mapped block IDs and face names.
    /// Enables zero-allocation ordinal substring searching across thousands of items.
    /// </summary>
    public string SearchFilterKey
    {
        get
        {
            if (_searchFilterKey != null) return _searchFilterKey;

            var sb = new System.Text.StringBuilder(128);
            sb.Append(Alias).Append(' ')
              .Append(DisplayName).Append(' ')
              .Append(RelativePath).Append(' ')
              .Append(PrimaryFaceBadgeText).Append(' ');

            foreach (var face in BlockFaces)
            {
                sb.Append(face.BlockId).Append(' ')
                  .Append(face.Face).Append(' ');
            }

            _searchFilterKey = sb.ToString().ToLowerInvariant();
            return _searchFilterKey;
        }
    }

    /// <summary>
    /// Consolidated, single muted caption line below the alias name.
    /// Distinguishes block data-value variants (block N/M), random texture variations (tex N/M • w:weight),
    /// and geometry block faces (face: ...).
    /// </summary>
    public string SubtitleCaption
    {
        get
        {
            if (Status == TextureStatus.Orphan) return "not in json";
            if (Status == TextureStatus.NoEntry) return "click to generate";

            bool hasFace = !string.IsNullOrEmpty(PrimaryFaceBadgeText);

            if (IsNestedVariant)
            {
                var weightSuffix = Weight.HasValue && Weight.Value > 0 ? $" • w:{Weight}" : string.Empty;
                var nestedText = $"b{BlockVariantIndex}/{TotalBlockVariants} • tex {TextureVariantIndex}/{TotalTextureVariants}{weightSuffix}";
                return hasFace ? $"{nestedText} • {PrimaryFaceBadgeText}" : nestedText;
            }

            if (IsBlockVariant && BlockVariantIndex.HasValue && TotalBlockVariants.HasValue)
            {
                var blockText = $"block {BlockVariantIndex}/{TotalBlockVariants}";
                return hasFace ? $"{blockText} • {PrimaryFaceBadgeText}" : blockText;
            }

            if (IsTextureVariant && TextureVariantIndex.HasValue && TotalTextureVariants.HasValue)
            {
                var weightSuffix = Weight.HasValue && Weight.Value > 0 ? $" • w:{Weight}" : string.Empty;
                var texText = $"tex {TextureVariantIndex}/{TotalTextureVariants}{weightSuffix}";
                return hasFace ? $"{texText} • {PrimaryFaceBadgeText}" : texText;
            }

            if (hasFace)
                return $"face: {PrimaryFaceBadgeText}";

            return string.Empty;
        }
    }

    public string UsedBySummary
    {
        get
        {
            var lines = new List<string>
            {
                $"Alias: {Alias}"
            };

            if (Status == TextureStatus.Orphan)
            {
                lines.Add("Status: ORPHAN (exists on disk, not referenced in terrain_texture.json)");
                lines.Add($"File: {RelativePath}");
                return string.Join(Environment.NewLine, lines);
            }

            if (Status == TextureStatus.NoEntry)
            {
                lines.Add("Status: NO ENTRY (searched name with zero matches)");
                lines.Add("Action: Click to scaffold block in JSON");
                return string.Join(Environment.NewLine, lines);
            }

            if (IsNestedVariant)
            {
                lines.Add($"Block Variant: {BlockVariantIndex} of {TotalBlockVariants} (terrain_texture.json \"textures\" array)");
                var weightText = Weight.HasValue ? $" (weight: {Weight})" : "";
                lines.Add($"Texture Variation: {TextureVariantIndex} of {TotalTextureVariants}{weightText} (nested \"variations\" array)");
                lines.Add("  → Block state slot with random in-world cosmetic variations");
            }
            else if (IsBlockVariant && BlockVariantIndex.HasValue && TotalBlockVariants.HasValue)
            {
                lines.Add($"Block Variant: {BlockVariantIndex} of {TotalBlockVariants} (terrain_texture.json \"textures\" array)");
                lines.Add("  → Selected by block state / data-value metadata at runtime");
            }
            else if (IsTextureVariant && TextureVariantIndex.HasValue && TotalTextureVariants.HasValue)
            {
                var weightText = Weight.HasValue ? $" (weight: {Weight})" : "";
                lines.Add($"Texture Variation: {TextureVariantIndex} of {TotalTextureVariants}{weightText} (terrain_texture.json \"variations\" array)");
                lines.Add("  → Random in-world cosmetic variation to reduce visual repetition");
            }
            else
            {
                lines.Add("Variant: None (single texture in terrain_texture.json)");
            }

            var ext = System.IO.Path.GetExtension(FullPath);
            if (string.IsNullOrEmpty(ext)) ext = ".png";
            lines.Add($"File: {RelativePath}{ext}");
            lines.Add($"Status: {(Exists ? "OK (found on disk)" : "GHOST (missing file)")}");

            if (BlockFaces.Count > 0)
            {
                lines.Add("Block Faces (blocks.json geometry):");
                foreach (var grp in BlockFaces.GroupBy(b => b.BlockId))
                {
                    var facesStr = string.Join(", ", grp.Select(b => b.Face).Distinct());
                    lines.Add($"  • {grp.Key} → {facesStr}");
                }
            }
            else
            {
                lines.Add("Block Faces: (unused by any block in blocks.json)");
            }

            return string.Join(Environment.NewLine, lines);
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
