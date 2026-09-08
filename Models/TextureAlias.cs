using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Media;

namespace McTextureGhost.Models;

/// <summary>
/// Represents a block geometry face mapping from blocks.json (e.g. "cactus" -> "side").
/// </summary>
public record BlockFaceUsage(string BlockId, string Face);

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

    /// <summary>Indicates if this item is a variant (one of multiple textures declared in terrain_texture.json).</summary>
    public bool IsVariant { get; init; }

    /// <summary>Variant index (1-based), or null if single texture.</summary>
    public int? VariantIndex { get; init; }

    /// <summary>Total number of variants for this alias, or null if single texture.</summary>
    public int? TotalVariants { get; init; }

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

    /// <summary>
    /// Consolidated, single muted caption line below the alias name (e.g. "var 2 of 8 • side", "face: top").
    /// Replaces competing pill badges and avoids visual fatigue.
    /// </summary>
    public string SubtitleCaption
    {
        get
        {
            if (Status == TextureStatus.Orphan) return "not in json";
            if (Status == TextureStatus.NoEntry) return "click to generate";

            bool hasVar = IsVariant && VariantIndex.HasValue && TotalVariants.HasValue;
            bool hasFace = !string.IsNullOrEmpty(PrimaryFaceBadgeText);

            if (hasVar && hasFace)
                return $"var {VariantIndex}/{TotalVariants} • {PrimaryFaceBadgeText}";
            if (hasVar)
                return $"var {VariantIndex}/{TotalVariants}";
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

            if (IsVariant && VariantIndex.HasValue && TotalVariants.HasValue)
            {
                lines.Add($"Variant: {VariantIndex} of {TotalVariants} (terrain_texture.json)");
            }
            else
            {
                lines.Add("Variant: None (single texture)");
            }

            var ext = System.IO.Path.GetExtension(FullPath);
            if (string.IsNullOrEmpty(ext)) ext = ".png";
            lines.Add($"File: {RelativePath}{ext}");
            lines.Add($"Status: {(Exists ? "OK (found on disk)" : "GHOST (missing file)")}");

            if (BlockFaces.Count > 0)
            {
                lines.Add("Block Faces (blocks.json):");
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
