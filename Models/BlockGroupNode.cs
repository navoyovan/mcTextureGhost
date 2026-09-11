using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Media;

namespace McTextureGhost.Models;

/// <summary>
/// Status of an entry in the vanilla reference catalog compared against the active pack.
/// </summary>
public enum CatalogEntryStatus
{
    /// <summary>Declared in vanilla data, but not yet present in the active pack.</summary>
    NotAdded,
    /// <summary>Declared in pack JSON, but file is missing from disk.</summary>
    Ghost,
    /// <summary>Declared in pack JSON and physically exists on disk.</summary>
    Ok,
    /// <summary>File exists on disk matching vanilla relative path, but without explicit user JSON entry.</summary>
    VanillaOverride,
    /// <summary>File exists on disk but is not declared in either pack JSON or vanilla JSON.</summary>
    Orphan
}

/// <summary>
/// Leaf row in the hierarchical catalog tree, representing an individual texture slot or variant.
/// </summary>
public class CatalogLeaf : INotifyPropertyChanged
{
    private static SolidColorBrush FreezeBrush(string hex, double opacity = 1.0)
    {
        var color = (Color)ColorConverter.ConvertFromString(hex);
        if (opacity < 1.0)
            color = Color.FromArgb((byte)(opacity * 255), color.R, color.G, color.B);
        var b = new SolidColorBrush(color);
        b.Freeze();
        return b;
    }

    private static readonly SolidColorBrush OkDotBrush       = FreezeBrush("#22C55E"); // green-500
    private static readonly SolidColorBrush GhostDotBrush    = FreezeBrush("#F472B6"); // pink-400
    private static readonly SolidColorBrush OverrideDotBrush = FreezeBrush("#2DD4BF"); // teal-400
    private static readonly SolidColorBrush OrphanDotBrush   = FreezeBrush("#F59E0B"); // amber-500
    private static readonly SolidColorBrush NotAddedDotBrush = FreezeBrush("#38BDF8"); // sky-400

    private static readonly SolidColorBrush OkMutedBrush       = FreezeBrush("#884ADE80");
    private static readonly SolidColorBrush GhostMutedBrush    = FreezeBrush("#A0F472B6");
    private static readonly SolidColorBrush OverrideMutedBrush = FreezeBrush("#A02DD4BF");
    private static readonly SolidColorBrush OrphanMutedBrush   = FreezeBrush("#A0FBBF24");
    private static readonly SolidColorBrush NotAddedMutedBrush = FreezeBrush("#A038BDF8");

    private static readonly SolidColorBrush GhostPlaceholderBg   = FreezeBrush("#1E1420");
    private static readonly SolidColorBrush NotAddedPlaceholderBg = FreezeBrush("#101A24");

    public required string Alias { get; init; }
    public required string DisplayName { get; init; }
    public required string RelativePath { get; init; }
    public required string FullPath { get; init; }
    public required TextureCategory Category { get; init; }
    public VariantKind VariantKind { get; init; } = VariantKind.None;
    public int? BlockVariantIndex { get; init; }
    public int? TotalBlockVariants { get; init; }
    public int? TextureVariantIndex { get; init; }
    public int? TotalTextureVariants { get; init; }
    public int? Weight { get; init; }

    private CatalogEntryStatus _status;
    public CatalogEntryStatus Status
    {
        get => _status;
        set
        {
            if (_status == value) return;
            _status = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(StatusDotBrush));
            OnPropertyChanged(nameof(StatusMutedBrush));
            OnPropertyChanged(nameof(StatusLabel));
            OnPropertyChanged(nameof(ShowsImageThumbnail));
            OnPropertyChanged(nameof(ShowsPlaceholderGlyph));
            OnPropertyChanged(nameof(PlaceholderGlyph));
            OnPropertyChanged(nameof(PlaceholderBackgroundBrush));
            OnPropertyChanged(nameof(PlaceholderGlyphBrush));
            OnPropertyChanged(nameof(CanAdd));
        }
    }

    /// <summary>Backing TextureAlias if present in user pack, or null if NotAdded.</summary>
    public TextureAlias? TextureAlias { get; set; }

    public string SubtitleCaption { get; set; } = string.Empty;
    public string PrimaryFaceBadgeText { get; set; } = string.Empty;
    public bool HasFaceBadge => !string.IsNullOrEmpty(PrimaryFaceBadgeText);

    public FlipbookDefinition? Flipbook { get; init; }
    public bool IsFlipbook => Flipbook != null;
    public string? FlipbookTooltip => TextureAlias?.FlipbookTooltip;

    public bool CanAdd => Status == CatalogEntryStatus.NotAdded;

    public bool ShowsImageThumbnail => Status == CatalogEntryStatus.Ok ||
                                       Status == CatalogEntryStatus.VanillaOverride ||
                                       Status == CatalogEntryStatus.Orphan;

    public bool ShowsPlaceholderGlyph => Status == CatalogEntryStatus.NotAdded ||
                                         Status == CatalogEntryStatus.Ghost;

    public string PlaceholderGlyph => Status switch
    {
        CatalogEntryStatus.NotAdded => "+",
        _ => "?"
    };

    public SolidColorBrush PlaceholderBackgroundBrush => Status switch
    {
        CatalogEntryStatus.NotAdded => NotAddedPlaceholderBg,
        _ => GhostPlaceholderBg
    };

    public SolidColorBrush PlaceholderGlyphBrush => Status switch
    {
        CatalogEntryStatus.NotAdded => NotAddedMutedBrush,
        _ => GhostMutedBrush
    };

    public SolidColorBrush StatusDotBrush => Status switch
    {
        CatalogEntryStatus.Ok              => OkDotBrush,
        CatalogEntryStatus.VanillaOverride => OverrideDotBrush,
        CatalogEntryStatus.Ghost           => GhostDotBrush,
        CatalogEntryStatus.Orphan          => OrphanDotBrush,
        CatalogEntryStatus.NotAdded        => NotAddedDotBrush,
        _                                  => NotAddedDotBrush
    };

    public SolidColorBrush StatusMutedBrush => Status switch
    {
        CatalogEntryStatus.Ok              => OkMutedBrush,
        CatalogEntryStatus.VanillaOverride => OverrideMutedBrush,
        CatalogEntryStatus.Ghost           => GhostMutedBrush,
        CatalogEntryStatus.Orphan          => OrphanMutedBrush,
        CatalogEntryStatus.NotAdded        => NotAddedMutedBrush,
        _                                  => NotAddedMutedBrush
    };

    public string StatusLabel => Status switch
    {
        CatalogEntryStatus.Ok              => "OK",
        CatalogEntryStatus.VanillaOverride => "OVERRIDE",
        CatalogEntryStatus.Ghost           => "GHOST",
        CatalogEntryStatus.Orphan          => "ORPHAN",
        CatalogEntryStatus.NotAdded        => "VANILLA",
        _                                  => "VANILLA"
    };

    public void RefreshThumbnail()
    {
        OnPropertyChanged(nameof(FullPath));
        OnPropertyChanged(nameof(ShowsImageThumbnail));
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}

/// <summary>
/// Face tier node in the block workspace tree, grouping texture leaves for one logical face
/// (e.g. "up", "side", "north", "all") of a single alias.
/// </summary>
public class FaceNode : INotifyPropertyChanged
{
    /// <summary>Normalised face label shown in the tree (e.g. "up", "side", "all").</summary>
    public required string FaceLabel { get; init; }

    /// <summary>Leaves (texture variants) belonging to this face.</summary>
    public ObservableCollection<CatalogLeaf> Leaves { get; } = new();

    private bool _isExpanded = true;
    public bool IsExpanded
    {
        get => _isExpanded;
        set { if (_isExpanded != value) { _isExpanded = value; OnPropertyChanged(); } }
    }

    public int GhostCount => Leaves.Count(l => l.Status == CatalogEntryStatus.Ghost);
    public int OrphanCount => Leaves.Count(l => l.Status == CatalogEntryStatus.Orphan);

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}

/// <summary>
/// Intermediate node in the catalog tree, grouping all variant leaves of a single texture alias.
/// </summary>
public class AliasGroupNode : INotifyPropertyChanged
{
    public required string Alias { get; init; }
    public required TextureCategory Category { get; init; }
    public BlockGroupNode? ParentBlock { get; set; }

    /// <summary>Flat leaf collection — used by the Catalog dialog.</summary>
    public ObservableCollection<CatalogLeaf> Leaves { get; } = new();

    /// <summary>
    /// Face-grouped leaf collection — used by the Block Workspace view.
    /// Each <see cref="FaceNode"/> holds the leaves for one logical face direction.
    /// Populated by <c>BuildBlockWorkspaceTree</c>; empty when built via <c>BuildCatalogTree</c>.
    /// </summary>
    public ObservableCollection<FaceNode> FaceNodes { get; } = new();

    private bool _isExpanded;
    public bool IsExpanded
    {
        get => _isExpanded;
        set { if (_isExpanded != value) { _isExpanded = value; OnPropertyChanged(); } }
    }

    private string _faceSummary = string.Empty;
    public string FaceSummary
    {
        get => _faceSummary;
        set { if (_faceSummary != value) { _faceSummary = value; OnPropertyChanged(); OnPropertyChanged(nameof(HasFaceSummary)); } }
    }
    public bool HasFaceSummary => !string.IsNullOrEmpty(_faceSummary);

    public int GhostCount => Leaves.Count(l => l.Status == CatalogEntryStatus.Ghost);
    public int NotAddedCount => Leaves.Count(l => l.Status == CatalogEntryStatus.NotAdded);
    public bool CanAdd => NotAddedCount > 0;

    public void NotifyCountsChanged()
    {
        OnPropertyChanged(nameof(GhostCount));
        OnPropertyChanged(nameof(NotAddedCount));
        OnPropertyChanged(nameof(CanAdd));
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}

/// <summary>
/// Top-level node in the catalog tree, representing a Minecraft block (or item) and its aliases.
/// </summary>
public class BlockGroupNode : INotifyPropertyChanged
{
    public required string BlockId { get; init; }
    public required string DisplayName { get; init; }
    public required TextureCategory Category { get; init; }
    public bool IsUserDefined { get; init; } = true;

    public ObservableCollection<AliasGroupNode> AliasGroups { get; } = new();

    private bool _isExpanded;
    public bool IsExpanded
    {
        get => _isExpanded;
        set { if (_isExpanded != value) { _isExpanded = value; OnPropertyChanged(); } }
    }

    public int GhostCount => AliasGroups.Sum(a => a.GhostCount);
    public int NotAddedCount => AliasGroups.Sum(a => a.NotAddedCount);
    public int TotalVariants => AliasGroups.Sum(a => a.Leaves.Count);

    public bool HasGhost => GhostCount > 0;
    public bool CanAddAll => NotAddedCount > 0;
    public bool HasMultipleVariants => TotalVariants > 1;

    public string IconGlyph => Category == TextureCategory.Item ? "🗡" : "🧱";

    private string? _searchFilterKey;
    public string SearchFilterKey
    {
        get
        {
            if (_searchFilterKey != null) return _searchFilterKey;

            var sb = new System.Text.StringBuilder(128);
            sb.Append(BlockId).Append(' ')
              .Append(DisplayName).Append(' ');

            foreach (var ag in AliasGroups)
            {
                sb.Append(ag.Alias).Append(' ')
                  .Append(ag.FaceSummary).Append(' ');
                foreach (var leaf in ag.Leaves)
                {
                    sb.Append(leaf.RelativePath).Append(' ')
                      .Append(leaf.SubtitleCaption).Append(' ');
                }
            }

            _searchFilterKey = sb.ToString().ToLowerInvariant();
            return _searchFilterKey;
        }
    }

    public void NotifyCountsChanged()
    {
        _searchFilterKey = null;
        OnPropertyChanged(nameof(GhostCount));
        OnPropertyChanged(nameof(NotAddedCount));
        OnPropertyChanged(nameof(TotalVariants));
        OnPropertyChanged(nameof(HasGhost));
        OnPropertyChanged(nameof(CanAddAll));
        OnPropertyChanged(nameof(HasMultipleVariants));
        OnPropertyChanged(nameof(SearchFilterKey));
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
