using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Threading;
using McTextureGhost.Models;
using McTextureGhost.Services;
using McTextureGhost.Views;
using Microsoft.Win32;

namespace McTextureGhost.ViewModels;

/// <summary>Controls how large tiles render in the grid for accessibility.</summary>
public enum TileSizeMode { Compact, Comfortable, Large }

/// <summary>Specifies the active category tab in the texture manager.</summary>
public enum TextureTab { All, Blocks, Items }

public class MainViewModel : INotifyPropertyChanged
{
    public event Action? PackStateChanged;
    public event Action<TextureAlias>? TextureUpdated;

    private FileSystemWatcher? _watcher;
    private readonly DispatcherTimer _watchDebounceTimer;
    private readonly SemaphoreSlim _rescanGate = new(1, 1);
    private string? _packRoot;

    public ObservableCollection<TextureAlias> Aliases { get; } = new();
    public ICollectionView FilteredAliases { get; }

    public ObservableCollection<PackFolderItem> PackFolders { get; } = new();

    public bool IsPackLoaded => _packRoot != null;
    public string? PackRootPath => _packRoot;
    public string? RootDirectoryName => _packRoot != null ? Path.GetFileName(_packRoot) : null;
    private string? _cachedPackName;
    public string? PackName => _packRoot != null ? (_cachedPackName ??= GetPackDisplayName()) : null;
    public string? PackIconPath => _packRoot != null ? Path.Combine(_packRoot, "pack_icon.png") : null;
    public bool HasPackIcon => _packRoot != null && File.Exists(PackIconPath);
    public bool HasManifest => _packRoot != null && File.Exists(Path.Combine(_packRoot, "manifest.json"));

    private ManifestModel? _currentManifest;
    public ManifestModel? CurrentManifest
    {
        get => _currentManifest;
        set { _currentManifest = value; OnPropertyChanged(); }
    }

    private bool _isManifestViewActive;
    public bool IsManifestViewActive
    {
        get => _isManifestViewActive;
        set
        {
            if (_isManifestViewActive == value) return;
            _isManifestViewActive = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsExplorerViewActive));
        }
    }

    public bool IsExplorerViewActive => !_isManifestViewActive;

    private TextureTab _activeTab = TextureTab.All;
    public TextureTab ActiveTab
    {
        get => _activeTab;
        set
        {
            if (_activeTab == value) return;
            _activeTab = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsAllTab));
            OnPropertyChanged(nameof(IsBlocksTab));
            OnPropertyChanged(nameof(IsItemsTab));
            OnPropertyChanged(nameof(SearchPlaceholderText));
            OnPropertyChanged(nameof(TotalGhostCount));
            OnPropertyChanged(nameof(TotalAddedCount));
            OnPropertyChanged(nameof(TotalOrphanCount));
            OnPropertyChanged(nameof(TotalAliasCount));
            OnPropertyChanged(nameof(FilterStatusLabel));
            OnPropertyChanged(nameof(ShowCreatePanel));
            UpdateNoEntryTileAndMatches();
            FilteredAliases.Refresh();
            FilteredCatalogTree?.Refresh();
        }
    }

    public bool IsAllTab => _activeTab == TextureTab.All;
    public bool IsBlocksTab => _activeTab == TextureTab.Blocks;
    public bool IsItemsTab => _activeTab == TextureTab.Items;
    public TextureCategory? CurrentCategory => _activeTab switch
    {
        TextureTab.Blocks => TextureCategory.Block,
        TextureTab.Items  => TextureCategory.Item,
        _                 => null
    };

    public string SearchPlaceholderText => _activeTab switch
    {
        TextureTab.Blocks => "Search block name, e.g. stone...",
        TextureTab.Items  => "Search item name, e.g. apple...",
        _                 => "Search texture name, e.g. stone, apple..."
    };

    public string WindowTitle
    {
        get
        {
            if (_packRoot == null) return "McTextureGhost";
            var packName = PackName ?? "Pack";
            var ghostCount = AllGhostCount;
            return ghostCount > 0
                ? $"McTextureGhost — {packName} ({ghostCount} ghosts)"
                : $"McTextureGhost — {packName} (all OK)";
        }
    }

    private PackFolderItem? _selectedFolder;
    private string? _selectedFolderFilterPrefix;
    private string? _selectedFolderExact;

    public PackFolderItem? SelectedFolder
    {
        get => _selectedFolder;
        set
        {
            if (_selectedFolder == value) return;
            if (_selectedFolder != null) _selectedFolder.IsSelected = false;
            _selectedFolder = value;
            if (_selectedFolder != null) _selectedFolder.IsSelected = true;

            if (_selectedFolder != null && _selectedFolder.IsManifest)
            {
                OpenManifestForm();
            }
            else if (_selectedFolder != null && _selectedFolder.IsDirectory && !string.IsNullOrWhiteSpace(_selectedFolder.RelativePath))
            {
                _selectedFolderExact = _selectedFolder.RelativePath.Replace('\\', '/');
                _selectedFolderFilterPrefix = _selectedFolderExact.TrimEnd('/') + '/';
            }
            else
            {
                _selectedFolderExact = null;
                _selectedFolderFilterPrefix = null;
            }

            OnPropertyChanged();
            OnPropertyChanged(nameof(SelectedFolderPath));
            FilteredAliases.Refresh();
        }
    }

    public string? SelectedFolderPath => _selectedFolder?.RelativePath?.Replace('/', '\\');

    public int TotalGhostCount => CurrentCategory.HasValue
        ? Aliases.Count(a => a.Category == CurrentCategory.Value && a.Status == TextureStatus.Ghost)
        : AllGhostCount;

    public int TotalAddedCount => CurrentCategory.HasValue
        ? Aliases.Count(a => a.Category == CurrentCategory.Value && a.Status == TextureStatus.Ok)
        : Aliases.Count(a => a.Status == TextureStatus.Ok);

    public int TotalOrphanCount => CurrentCategory.HasValue
        ? Aliases.Count(a => a.Category == CurrentCategory.Value && a.Status == TextureStatus.Orphan)
        : Aliases.Count(a => a.Status == TextureStatus.Orphan);

    public int TotalAliasCount => CurrentCategory.HasValue
        ? Aliases.Count(a => a.Category == CurrentCategory.Value && a.Status != TextureStatus.NoEntry)
        : AllAliasCount;

    public int AllGhostCount => Aliases.Count(a => a.Status == TextureStatus.Ghost);
    public int AllAliasCount => Aliases.Count(a => a.Status != TextureStatus.NoEntry);

    public int BlocksGhostCount => Aliases.Count(a => a.Category == TextureCategory.Block && a.Status == TextureStatus.Ghost);
    public int ItemsGhostCount => Aliases.Count(a => a.Category == TextureCategory.Item && a.Status == TextureStatus.Ghost);

    public int BlocksTotalCount => Aliases.Count(a => a.Category == TextureCategory.Block && a.Status != TextureStatus.NoEntry);
    public int ItemsTotalCount => Aliases.Count(a => a.Category == TextureCategory.Item && a.Status != TextureStatus.NoEntry);

    private readonly DispatcherTimer _searchDebounceTimer;
    private string _appliedSearchQuery = "";
    private string _appliedSearchQueryLower = "";
    private bool _hasNonEmptySearchMatches = true;

    public RelayCommand CommitSearchCommand { get; }

    private TextureAlias? _noEntryAlias;

    private void UpdateNoEntryTileAndMatches()
    {
        if (_noEntryAlias != null)
        {
            Aliases.Remove(_noEntryAlias);
            _noEntryAlias = null;
        }

        if (_packRoot == null || string.IsNullOrWhiteSpace(_appliedSearchQuery))
        {
            _hasNonEmptySearchMatches = true;
            return;
        }

        // Fast scan with early exit on first match (< 0.1ms)
        bool hasMatch = false;
        var category = CurrentCategory;
        for (int i = 0; i < Aliases.Count; i++)
        {
            var a = Aliases[i];
            if (a.Status != TextureStatus.NoEntry &&
                (!category.HasValue || a.Category == category.Value) &&
                a.SearchFilterKey.Contains(_appliedSearchQueryLower, StringComparison.Ordinal))
            {
                hasMatch = true;
                break;
            }
        }

        _hasNonEmptySearchMatches = hasMatch;

        if (!hasMatch && !IsItemsTab)
        {
            _noEntryAlias = new TextureAlias
            {
                Category = TextureCategory.Block,
                Alias = _appliedSearchQuery,
                DisplayName = _appliedSearchQuery,
                RelativePath = "textures/blocks/" + _appliedSearchQuery,
                FullPath = Path.Combine(_packRoot, "textures", "blocks", _appliedSearchQuery + ".png"),
                Status = TextureStatus.NoEntry,
                VariantKind = VariantKind.None,
                BlockFaces = new List<BlockFaceUsage>()
            };
            Aliases.Insert(0, _noEntryAlias);
        }
    }

    private void ApplySearchFilter()
    {
        _appliedSearchQuery = _searchText.Trim();
        _appliedSearchQueryLower = _appliedSearchQuery.ToLowerInvariant();

        UpdateNoEntryTileAndMatches();
        FilteredAliases.Refresh();
        FilteredCatalogTree?.Refresh();

        if (!string.IsNullOrWhiteSpace(_appliedSearchQueryLower))
        {
            foreach (var node in CatalogTree)
            {
                if (node.SearchFilterKey.Contains(_appliedSearchQueryLower, StringComparison.Ordinal))
                {
                    node.IsExpanded = true;
                    foreach (var ag in node.AliasGroups)
                        ag.IsExpanded = true;
                }
            }
        }

        OnPropertyChanged(nameof(ShowCreatePanel));
    }

    /// <summary>Immediately applies search filter without waiting for the debounce timer.</summary>
    public void CommitSearch()
    {
        _searchDebounceTimer.Stop();
        ApplySearchFilter();
    }

    private string _searchText = "";
    public string SearchText
    {
        get => _searchText;
        set
        {
            if (_searchText == value) return;
            _searchText = value;
            OnPropertyChanged();

            if (string.IsNullOrWhiteSpace(_searchText))
            {
                // Immediate update when cleared
                _searchDebounceTimer.Stop();
                ApplySearchFilter();
            }
            else
            {
                // 400ms debounce to keep typing butter-smooth
                _searchDebounceTimer.Stop();
                _searchDebounceTimer.Start();
            }
        }
    }

    /// <summary>
    /// True when the user has typed a name that matches nothing currently
    /// declared - the "blank project" case where we offer to generate the
    /// JSON scaffolding instead of just showing an empty grid.
    /// Evaluated in O(1) from cached search match state.
    /// </summary>
    public bool ShowCreatePanel =>
        _packRoot != null &&
        !IsItemsTab &&
        !string.IsNullOrWhiteSpace(_appliedSearchQuery) &&
        !_hasNonEmptySearchMatches;

    private bool _ghostsOnly;
    public bool GhostsOnly
    {
        get => _ghostsOnly;
        set
        {
            if (_ghostsOnly == value) return;
            _ghostsOnly = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsFilterActive));
            OnPropertyChanged(nameof(FilterStatusLabel));
            FilteredAliases.Refresh();
            FilteredCatalogTree?.Refresh();
        }
    }

    private bool _addedOnly;
    public bool AddedOnly
    {
        get => _addedOnly;
        set
        {
            if (_addedOnly == value) return;
            _addedOnly = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsFilterActive));
            OnPropertyChanged(nameof(FilterStatusLabel));
            FilteredAliases.Refresh();
            FilteredCatalogTree?.Refresh();
        }
    }

    private bool _orphansOnly;
    public bool OrphansOnly
    {
        get => _orphansOnly;
        set
        {
            if (_orphansOnly == value) return;
            _orphansOnly = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsFilterActive));
            OnPropertyChanged(nameof(FilterStatusLabel));
            FilteredAliases.Refresh();
            FilteredCatalogTree?.Refresh();
        }
    }

    public bool IsFilterActive => GhostsOnly || AddedOnly || OrphansOnly;

    public string FilterStatusLabel
    {
        get
        {
            int active = (GhostsOnly ? 1 : 0) + (AddedOnly ? 1 : 0) + (OrphansOnly ? 1 : 0);
            if (active == 0) return "Filter: All";
            if (active == 1)
            {
                if (GhostsOnly) return $"Ghosts ({TotalGhostCount})";
                if (AddedOnly) return $"Added ({TotalAddedCount})";
                if (OrphansOnly) return $"Orphans ({TotalOrphanCount})";
            }
            if (active == 2)
            {
                if (GhostsOnly && OrphansOnly) return $"Missing/Orphan ({TotalGhostCount + TotalOrphanCount})";
                if (GhostsOnly && AddedOnly) return $"Added & Ghosts ({TotalAddedCount + TotalGhostCount})";
                if (AddedOnly && OrphansOnly) return $"Added & Orphans ({TotalAddedCount + TotalOrphanCount})";
            }
            return $"Filtered ({active})";
        }
    }

    private bool _isScanning;
    public bool IsScanning
    {
        get => _isScanning;
        set
        {
            if (_isScanning == value) return;
            _isScanning = value;
            OnPropertyChanged();
        }
    }

    private string _statusMessage = "Open a resource pack folder to begin.";
    public string StatusMessage
    {
        get => _statusMessage;
        set { _statusMessage = value; OnPropertyChanged(); }
    }

    // ─── Zoom & Accessibility Tile Sizing ──────────────────────────────────
    private TileSizeMode _currentTileSizeMode = TileSizeMode.Comfortable;
    public TileSizeMode CurrentTileSizeMode
    {
        get => _currentTileSizeMode;
        set
        {
            if (_currentTileSizeMode == value) return;
            _currentTileSizeMode = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(TileButtonWidth));
            OnPropertyChanged(nameof(TileButtonHeight));
            OnPropertyChanged(nameof(TileImageSize));
            OnPropertyChanged(nameof(IsZoomCompact));
            OnPropertyChanged(nameof(IsZoomComfortable));
            OnPropertyChanged(nameof(IsZoomLarge));
        }
    }

    public bool IsZoomCompact => _currentTileSizeMode == TileSizeMode.Compact;
    public bool IsZoomComfortable => _currentTileSizeMode == TileSizeMode.Comfortable;
    public bool IsZoomLarge => _currentTileSizeMode == TileSizeMode.Large;

    public int TileButtonWidth => _currentTileSizeMode switch
    {
        TileSizeMode.Compact => 124,
        TileSizeMode.Large => 210,
        _ => 160 // Comfortable
    };

    public int TileButtonHeight => _currentTileSizeMode switch
    {
        TileSizeMode.Compact => 150,
        TileSizeMode.Large => 248,
        _ => 190 // Comfortable
    };

    public int TileImageSize => _currentTileSizeMode switch
    {
        TileSizeMode.Compact => 68,
        TileSizeMode.Large => 140,
        _ => 96 // Comfortable
    };

    // ─── Window Frosted Glass Background & Dev Settings ──────────────────────
    private bool _showCategoryTabs = false;
    public bool ShowCategoryTabs
    {
        get => _showCategoryTabs;
        set
        {
            if (_showCategoryTabs == value) return;
            _showCategoryTabs = value;
            OnPropertyChanged();
            if (!_showCategoryTabs && _activeTab != TextureTab.All)
            {
                ActiveTab = TextureTab.All;
            }
        }
    }

    private int _tintOpacityPercent = 83;
    public int TintOpacityPercent
    {
        get => _tintOpacityPercent;
        set
        {
            var clamped = Math.Clamp(value, 0, 100);
            if (_tintOpacityPercent == clamped) return;
            _tintOpacityPercent = clamped;
            OnPropertyChanged();
            UpdateBackgroundBrush();
        }
    }

    private int _tintBrightness = 18;
    public int TintBrightness
    {
        get => _tintBrightness;
        set
        {
            var clamped = Math.Clamp(value, 0, 60);
            if (_tintBrightness == clamped) return;
            _tintBrightness = clamped;
            OnPropertyChanged();
            UpdateBackgroundBrush();
        }
    }

    private SolidColorBrush _windowBackgroundBrush = new(Color.FromArgb(212, 18, 18, 20));
    public SolidColorBrush WindowBackgroundBrush => _windowBackgroundBrush;

    public string TintHexCode => $"#{_windowBackgroundBrush.Color.A:X2}{_windowBackgroundBrush.Color.R:X2}{_windowBackgroundBrush.Color.G:X2}{_windowBackgroundBrush.Color.B:X2}";

    private void UpdateBackgroundBrush()
    {
        byte alpha = (byte)Math.Clamp((int)Math.Round(_tintOpacityPercent * 255.0 / 100.0), 0, 255);
        byte r = (byte)Math.Clamp(_tintBrightness, 0, 255);
        byte g = (byte)Math.Clamp(_tintBrightness, 0, 255);
        byte b = (byte)Math.Clamp(_tintBrightness + 2, 0, 255);

        var brush = new SolidColorBrush(Color.FromArgb(alpha, r, g, b));
        brush.Freeze();
        _windowBackgroundBrush = brush;
        OnPropertyChanged(nameof(WindowBackgroundBrush));
        OnPropertyChanged(nameof(TintHexCode));
    }

    public void ResetTintSettings()
    {
        _tintOpacityPercent = 83;
        _tintBrightness = 18;
        OnPropertyChanged(nameof(TintOpacityPercent));
        OnPropertyChanged(nameof(TintBrightness));
        UpdateBackgroundBrush();
    }

    // ─── View Mode (Pack Grid vs Catalog Tree vs Block Workspace) ──────────────
    public enum ViewMode { Pack, Catalog, BlockWorkspace }

    private ViewMode _viewMode = ViewMode.Pack;
    public ViewMode CurrentViewMode
    {
        get => _viewMode;
        set
        {
            if (_viewMode == value) return;
            _viewMode = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsPackView));
            OnPropertyChanged(nameof(IsCatalogView));
            OnPropertyChanged(nameof(IsBlockWorkspaceView));
        }
    }

    public bool IsPackView            => _viewMode == ViewMode.Pack;
    public bool IsCatalogView         => _viewMode == ViewMode.Catalog;
    public bool IsBlockWorkspaceView  => _viewMode == ViewMode.BlockWorkspace;

    public RelayCommand SwitchToPackViewCommand           { get; }
    public RelayCommand SwitchToCatalogViewCommand        { get; }
    public RelayCommand SwitchToBlockWorkspaceViewCommand { get; }

    // ─── Block Workspace Tree ─────────────────────────────────────────────────
    /// <summary>
    /// 4-tier tree (Block → AliasGroup → FaceNode → CatalogLeaf) sourced
    /// exclusively from the user's pack. Populated on every rescan alongside
    /// <see cref="CatalogTree"/>.
    /// </summary>
    public ObservableCollection<BlockGroupNode> BlockWorkspaceTree { get; } = new();

    // ─── Vanilla Reference Data ───────────────────────────────────────────────
    private VanillaData? _vanillaData;
    public VanillaData? VanillaData => _vanillaData;
    public bool IsVanillaDataLoaded => _vanillaData != null;

    private bool _isVanillaLoading;
    public bool IsVanillaLoading
    {
        get => _isVanillaLoading;
        set
        {
            if (_isVanillaLoading == value) return;
            _isVanillaLoading = value;
            OnPropertyChanged();
        }
    }

    private string _vanillaDataStatusLabel = "Checking vanilla catalog...";
    public string VanillaDataStatusLabel
    {
        get => _vanillaDataStatusLabel;
        set
        {
            if (_vanillaDataStatusLabel == value) return;
            _vanillaDataStatusLabel = value;
            OnPropertyChanged();
        }
    }

    public RelayCommand FetchVanillaDataCommand { get; }

    // ─── Catalog Tree & Dialog ────────────────────────────────────────────────
    public ObservableCollection<BlockGroupNode> CatalogTree { get; } = new();
    public ICollectionView FilteredCatalogTree { get; }
    public RelayCommand AddVanillaEntryCommand { get; }
    public RelayCommand OpenCatalogDialogCommand { get; }
    public RelayCommand SetCatalogCategoryAllCommand { get; }
    public RelayCommand SetCatalogCategoryBlocksCommand { get; }
    public RelayCommand SetCatalogCategoryItemsCommand { get; }

    private string _catalogSearchText = "";
    public string CatalogSearchText
    {
        get => _catalogSearchText;
        set
        {
            if (_catalogSearchText != value)
            {
                _catalogSearchText = value ?? "";
                OnPropertyChanged();
                ApplyCatalogFilter();
            }
        }
    }

    private TextureCategory? _catalogCategoryFilter = null;
    public bool IsCatalogAllCategory => _catalogCategoryFilter == null;
    public bool IsCatalogBlocksCategory => _catalogCategoryFilter == TextureCategory.Block;
    public bool IsCatalogItemsCategory => _catalogCategoryFilter == TextureCategory.Item;

    // ─── Commands ────────────────────────────────────────────────────────────
    public RelayCommand SwitchToAllCommand    { get; }
    public RelayCommand SwitchToBlocksCommand { get; }
    public RelayCommand SwitchToItemsCommand  { get; }
    public RelayCommand OpenPackFolderCommand { get; }
    public RelayCommand CreateNewPackCommand { get; }
    public RelayCommand ClosePackCommand { get; }
    public RelayCommand ClearFolderFilterCommand { get; }
    public RelayCommand OpenTutorialCommand { get; }
    public RelayCommand OpenInExplorerCommand { get; }
    public RelayCommand OpenSelectedFileCommand { get; }
    public RelayCommand EditTextureCommand { get; }
    public RelayCommand RescanCommand { get; }
    public RelayCommand CreateTextureCommand { get; }
    public RelayCommand CopyPathCommand           { get; }
    public RelayCommand OpenTextureFolderCommand  { get; }
    public RelayCommand RevealInSidebarCommand    { get; }
    public RelayCommand AddOrphanToJsonCommand    { get; }
    public RelayCommand AddItemOrphanToJsonCommand { get; }
    public RelayCommand ResetStatusFilterCommand  { get; }
    public RelayCommand OpenPackIconCommand       { get; }
    public RelayCommand SwitchToExplorerViewCommand { get; }
    public RelayCommand SwitchToManifestViewCommand { get; }
    public RelayCommand ToggleManifestViewCommand { get; }
    public RelayCommand SaveManifestCommand       { get; }
    public RelayCommand GenerateManifestCommand   { get; }
    public RelayCommand RegenerateHeaderUuidCommand { get; }
    public RelayCommand RegenerateModuleUuidCommand { get; }
    public RelayCommand CopyHeaderUuidCommand     { get; }
    public RelayCommand CopyModuleUuidCommand     { get; }
    public RelayCommand OpenManifestInEditorCommand { get; }
    public RelayCommand ToggleAdvancedManifestCommand { get; }
    public RelayCommand SetZoomCompactCommand { get; }
    public RelayCommand SetZoomComfortableCommand { get; }
    public RelayCommand SetZoomLargeCommand { get; }
    public RelayCommand ResetTintSettingsCommand { get; }
    public RelayCommand OpenRecentPackCommand { get; }
    public RelayCommand RemoveRecentPackCommand { get; }
    public RelayCommand ClearRecentPacksCommand { get; }

    private readonly RecentPacksService _recentPacksService = new();
    public ObservableCollection<RecentPackItem> RecentPacks { get; } = new();
    public bool HasRecentPacks => RecentPacks.Count > 0;

    private bool _isAdvancedManifestExpanded;
    public bool IsAdvancedManifestExpanded
    {
        get => _isAdvancedManifestExpanded;
        set { if (_isAdvancedManifestExpanded != value) { _isAdvancedManifestExpanded = value; OnPropertyChanged(); } }
    }

    public MainViewModel()
    {
        FilteredAliases = CollectionViewSource.GetDefaultView(Aliases);
        FilteredAliases.Filter = FilterPredicate;

        FilteredCatalogTree = CollectionViewSource.GetDefaultView(CatalogTree);
        FilteredCatalogTree.Filter = CatalogFilterPredicate;

        _searchDebounceTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(400)
        };
        _searchDebounceTimer.Tick += (s, e) =>
        {
            _searchDebounceTimer.Stop();
            ApplySearchFilter();
        };

        _watchDebounceTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(150)
        };
        _watchDebounceTimer.Tick += (s, e) =>
        {
            _watchDebounceTimer.Stop();
            _ = RescanAsync();
        };

        CommitSearchCommand = new RelayCommand(_ => CommitSearch());

        SwitchToAllCommand     = new RelayCommand(_ => ActiveTab = TextureTab.All);
        SwitchToBlocksCommand  = new RelayCommand(_ => ActiveTab = TextureTab.Blocks);
        SwitchToItemsCommand   = new RelayCommand(_ => ActiveTab = TextureTab.Items);

        SwitchToPackViewCommand           = new RelayCommand(_ => CurrentViewMode = ViewMode.Pack);
        SwitchToCatalogViewCommand        = new RelayCommand(_ => CurrentViewMode = ViewMode.Catalog, _ => IsVanillaDataLoaded);
        SwitchToBlockWorkspaceViewCommand = new RelayCommand(_ => CurrentViewMode = ViewMode.BlockWorkspace, _ => _packRoot != null);

        FetchVanillaDataCommand    = new RelayCommand(_ => _ = RefreshVanillaDataAsync());
        AddVanillaEntryCommand     = new RelayCommand(param => AddVanillaEntry(param), _ => _packRoot != null && _vanillaData != null);
        OpenCatalogDialogCommand        = new RelayCommand(_ => OpenCatalogDialog(), _ => _packRoot != null);
        SetCatalogCategoryAllCommand    = new RelayCommand(_ => SetCatalogCategory(null));
        SetCatalogCategoryBlocksCommand = new RelayCommand(_ => SetCatalogCategory(TextureCategory.Block));
        SetCatalogCategoryItemsCommand  = new RelayCommand(_ => SetCatalogCategory(TextureCategory.Item));

        OpenPackIconCommand    = new RelayCommand(_ => HandlePackIconClick(), _ => _packRoot != null);

        OpenPackFolderCommand  = new RelayCommand(_ => OpenPackFolder());
        CreateNewPackCommand   = new RelayCommand(_ => CreateNewPack());
        ClosePackCommand       = new RelayCommand(_ => ClosePack(), _ => _packRoot != null);
        ClearFolderFilterCommand = new RelayCommand(_ => ClearFolderFilter());
        OpenTutorialCommand    = new RelayCommand(_ => OpenTutorial());
        OpenInExplorerCommand  = new RelayCommand(_ => OpenInExplorer(), _ => _packRoot != null);
        OpenSelectedFileCommand = new RelayCommand(_ => OpenSelectedFile(),
            _ => SelectedFolder != null && !SelectedFolder.IsDirectory && !SelectedFolder.IsPlaceholder);
        EditTextureCommand     = new RelayCommand(param => EditTexture(param as TextureAlias));
        RescanCommand          = new RelayCommand(_ => Rescan(), _ => _packRoot != null && !IsScanning);
        CreateTextureCommand   = new RelayCommand(param => CreateTexture(param as string));

        CopyPathCommand          = new RelayCommand(param => CopyPath(param as TextureAlias));
        OpenTextureFolderCommand = new RelayCommand(param => OpenTextureFolder(param as TextureAlias));
        RevealInSidebarCommand   = new RelayCommand(param => RevealInSidebar(param as TextureAlias));
        AddOrphanToJsonCommand   = new RelayCommand(param => AddOrphanToJson(param as TextureAlias));
        AddItemOrphanToJsonCommand = new RelayCommand(param => AddItemOrphanToJson(param as TextureAlias));
        ResetStatusFilterCommand = new RelayCommand(_ =>
        {
            GhostsOnly = false;
            AddedOnly = false;
            OrphansOnly = false;
        });

        SwitchToExplorerViewCommand = new RelayCommand(_ => SwitchToExplorerView());
        SwitchToManifestViewCommand = new RelayCommand(_ => SwitchToManifestView(), _ => _packRoot != null);
        ToggleManifestViewCommand   = new RelayCommand(_ =>
        {
            if (IsManifestViewActive)
                SwitchToExplorerView();
            else
                SwitchToManifestView();
        }, _ => _packRoot != null);
        SaveManifestCommand         = new RelayCommand(_ => SaveManifest(), _ => _packRoot != null && CurrentManifest != null);
        GenerateManifestCommand     = new RelayCommand(_ => GenerateManifest(), _ => _packRoot != null);
        RegenerateHeaderUuidCommand = new RelayCommand(_ => CurrentManifest?.RegenerateHeaderUuid());
        RegenerateModuleUuidCommand = new RelayCommand(_ => CurrentManifest?.RegenerateModuleUuid());
        CopyHeaderUuidCommand       = new RelayCommand(_ =>
        {
            if (!string.IsNullOrEmpty(CurrentManifest?.HeaderUuid))
            {
                Clipboard.SetText(CurrentManifest.HeaderUuid);
                StatusMessage = "Header UUID copied to clipboard.";
            }
        });
        CopyModuleUuidCommand       = new RelayCommand(_ =>
        {
            if (!string.IsNullOrEmpty(CurrentManifest?.ModuleUuid))
            {
                Clipboard.SetText(CurrentManifest.ModuleUuid);
                StatusMessage = "Module UUID copied to clipboard.";
            }
        });
        OpenManifestInEditorCommand = new RelayCommand(_ => OpenManifestInEditor(), _ => _packRoot != null);
        ToggleAdvancedManifestCommand = new RelayCommand(_ => IsAdvancedManifestExpanded = !IsAdvancedManifestExpanded);
        SetZoomCompactCommand = new RelayCommand(_ => CurrentTileSizeMode = TileSizeMode.Compact);
        SetZoomComfortableCommand = new RelayCommand(_ => CurrentTileSizeMode = TileSizeMode.Comfortable);
        SetZoomLargeCommand = new RelayCommand(_ => CurrentTileSizeMode = TileSizeMode.Large);
        ResetTintSettingsCommand = new RelayCommand(_ => ResetTintSettings());
        OpenRecentPackCommand = new RelayCommand(param =>
        {
            if (param is RecentPackItem item)
            {
                LoadPack(item.FolderPath);
            }
            else if (param is string path)
            {
                LoadPack(path);
            }
        });
        RemoveRecentPackCommand = new RelayCommand(param =>
        {
            if (param is RecentPackItem item)
            {
                _recentPacksService.RemovePack(item.FolderPath);
                RefreshRecentPacks();
            }
            else if (param is string path)
            {
                _recentPacksService.RemovePack(path);
                RefreshRecentPacks();
            }
        });
        ClearRecentPacksCommand = new RelayCommand(_ =>
        {
            _recentPacksService.ClearAll();
            RefreshRecentPacks();
        });

        RefreshRecentPacks();

        _ = InitializeVanillaDataAsync();
    }

    private bool FilterPredicate(object obj)
    {
        if (obj is not TextureAlias alias) return false;

        // NoEntry tile should only show when search produces zero matches and not on Items tab
        if (alias.Status == TextureStatus.NoEntry) return !IsItemsTab;

        // Tab filter: All vs Blocks vs Items
        if (IsBlocksTab && alias.Category != TextureCategory.Block) return false;
        if (IsItemsTab && alias.Category != TextureCategory.Item) return false;

        bool hasStatusFilter = GhostsOnly || AddedOnly || OrphansOnly;
        if (hasStatusFilter)
        {
            bool matchStatus = (GhostsOnly && alias.Status == TextureStatus.Ghost) ||
                                (AddedOnly && alias.Status == TextureStatus.Ok) ||
                                (OrphansOnly && alias.Status == TextureStatus.Orphan);
            if (!matchStatus) return false;
        }

        if (_selectedFolderFilterPrefix != null && _selectedFolderExact != null)
        {
            if (!PathMatchesFolder(alias.RelativePath, _selectedFolderExact, _selectedFolderFilterPrefix))
            {
                return false;
            }
        }

        if (string.IsNullOrWhiteSpace(_appliedSearchQueryLower)) return true;

        return alias.SearchFilterKey.Contains(_appliedSearchQueryLower, StringComparison.Ordinal);
    }

    private bool CatalogFilterPredicate(object obj)
    {
        if (obj is not BlockGroupNode node) return false;

        if (_catalogCategoryFilter.HasValue && node.Category != _catalogCategoryFilter.Value)
            return false;

        var query = _catalogSearchText.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(query)) return true;

        return node.SearchFilterKey.Contains(query, StringComparison.Ordinal);
    }

    public void RefreshRecentPacks()
    {
        RecentPacks.Clear();
        foreach (var item in _recentPacksService.LoadRecentPacks())
        {
            RecentPacks.Add(item);
        }
        OnPropertyChanged(nameof(HasRecentPacks));
    }

    public void LoadPack(string folderPath)
    {
        if (string.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath)) return;
        _packRoot = folderPath;
        _cachedPackName = null;
        Rescan();
        StartWatching();

        if (File.Exists(Path.Combine(folderPath, "manifest.json")))
        {
            _recentPacksService.AddOrUpdatePack(folderPath);
            RefreshRecentPacks();
        }
    }

    private void OpenPackFolder()
    {
        var dialog = new OpenFileDialog
        {
            Title = "Select resource pack folder or manifest.json",
            Filter = "Bedrock Resource Pack|manifest.json;pack_icon.png;*.json|All files (*.*)|*.*|Bedrock Manifest (manifest.json)|manifest.json",
            FileName = "Select Current Folder",
            CheckFileExists = false,
            CheckPathExists = true,
            ValidateNames = false
        };

        if (!string.IsNullOrEmpty(_packRoot) && Directory.Exists(_packRoot))
        {
            dialog.InitialDirectory = _packRoot;
        }

        var owner = Application.Current?.MainWindow;
        bool? result = owner != null ? dialog.ShowDialog(owner) : dialog.ShowDialog();
        if (result != true) return;

        var resolvedFolder = ResolvePackFolder(dialog.FileName);
        if (!string.IsNullOrEmpty(resolvedFolder) && Directory.Exists(resolvedFolder))
        {
            LoadPack(resolvedFolder);
        }
    }

    /// <summary>
    /// Resolves the intended resource pack folder from a user-selected path in the open dialog.
    /// Supports selecting manifest.json, any pack asset file, an existing folder, or confirming
    /// the current folder via the dialog placeholder.
    /// </summary>
    public static string? ResolvePackFolder(string? selectedPath)
    {
        if (string.IsNullOrWhiteSpace(selectedPath)) return null;

        try
        {
            // 1. Direct directory match
            if (Directory.Exists(selectedPath))
            {
                return Path.GetFullPath(selectedPath);
            }

            // 2. Existing file match (e.g. manifest.json, pack_icon.png, or asset file in subfolder)
            if (File.Exists(selectedPath))
            {
                var dir = Path.GetDirectoryName(selectedPath);
                if (string.IsNullOrEmpty(dir)) return null;

                // If manifest.json is directly in this file's folder, that's the pack root
                if (File.Exists(Path.Combine(dir, "manifest.json")))
                {
                    return Path.GetFullPath(dir);
                }

                // Check parent directories up to 4 levels up for manifest.json (e.g. selected textures/blocks/stone.png)
                var current = Directory.GetParent(dir);
                int depth = 0;
                while (current != null && depth < 4)
                {
                    if (File.Exists(Path.Combine(current.FullName, "manifest.json")))
                    {
                        return Path.GetFullPath(current.FullName);
                    }
                    current = current.Parent;
                    depth++;
                }

                return Path.GetFullPath(dir);
            }

            // 3. Virtual/placeholder path returned by OpenFileDialog when CheckFileExists = false
            var parentDir = Path.GetDirectoryName(selectedPath);
            if (!string.IsNullOrEmpty(parentDir) && Directory.Exists(parentDir))
            {
                var fileName = Path.GetFileName(selectedPath);

                // Common placeholders or intentions
                if (string.IsNullOrWhiteSpace(fileName) ||
                    fileName.Equals("Select Current Folder", StringComparison.OrdinalIgnoreCase) ||
                    fileName.Equals("manifest.json", StringComparison.OrdinalIgnoreCase) ||
                    fileName == ".")
                {
                    return Path.GetFullPath(parentDir);
                }

                // If the user typed a relative subfolder name that exists
                var combined = Path.Combine(parentDir, fileName);
                if (Directory.Exists(combined))
                {
                    return Path.GetFullPath(combined);
                }

                // Fallback to the directory currently open in the dialog
                return Path.GetFullPath(parentDir);
            }
        }
        catch
        {
            // Fallback gracefully on any path formatting exception
        }

        return null;
    }

    private void CreateNewPack()
    {
        var dialog = new OpenFolderDialog
        {
            Title = "Select or create an empty folder for your new resource pack"
        };

        if (dialog.ShowDialog() != true) return;

        var targetFolder = dialog.FolderName;
        var packName = Path.GetFileName(targetFolder);
        if (string.IsNullOrWhiteSpace(packName)) packName = "MyResourcePack";

        var manifestPath = Path.Combine(targetFolder, "manifest.json");
        var defaultManifest = ManifestModel.CreateDefault(packName, manifestPath);

        var manifestDialog = new CreatePackManifestDialog(defaultManifest)
        {
            Owner = Application.Current?.MainWindow
        };

        if (manifestDialog.ShowDialog() != true)
        {
            return; // Cancelled
        }

        try
        {
            Directory.CreateDirectory(targetFolder);
            var texturesDir = Path.Combine(targetFolder, "textures");
            var blocksDir = Path.Combine(texturesDir, "blocks");
            Directory.CreateDirectory(blocksDir);
            var itemsDir = Path.Combine(texturesDir, "items");
            Directory.CreateDirectory(itemsDir);

            if (manifestDialog.ShouldGenerateManifest)
            {
                defaultManifest.SaveToFile(manifestPath);
            }

            var terrainPath = Path.Combine(texturesDir, "terrain_texture.json");
            if (!File.Exists(terrainPath))
            {
                var terrainObj = new JsonObject
                {
                    ["format_version"] = "1.19.30",
                    ["resource_pack_name"] = packName,
                    ["texture_name"] = "atlas.terrain",
                    ["padding"] = 8,
                    ["num_mip_levels"] = 4,
                    ["texture_data"] = new JsonObject()
                };
                File.WriteAllText(terrainPath, terrainObj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            }

            var itemTexturePath = Path.Combine(texturesDir, "item_texture.json");
            if (!File.Exists(itemTexturePath))
            {
                var itemObj = new JsonObject
                {
                    ["resource_pack_name"] = packName,
                    ["texture_name"] = "atlas.items",
                    ["texture_data"] = new JsonObject()
                };
                File.WriteAllText(itemTexturePath, itemObj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            }

            var blocksPath = Path.Combine(targetFolder, "blocks.json");
            if (!File.Exists(blocksPath))
            {
                var blocksObj = new JsonObject { ["format_version"] = "1.19.30" };
                File.WriteAllText(blocksPath, blocksObj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            }

            _packRoot = targetFolder;
            _cachedPackName = null;
            Rescan();
            StartWatching();

            if (manifestDialog.ShouldGenerateManifest)
            {
                StatusMessage = "Resource pack created with manifest.json.";
                _recentPacksService.AddOrUpdatePack(targetFolder);
                RefreshRecentPacks();
            }
            else
            {
                StatusMessage = "Resource pack created without manifest. Click manifest.json on the left to generate one anytime.";
            }
        }
        catch (Exception ex)
        {
            StatusMessage = $"Failed to create pack: {ex.Message}";
        }
    }

    public void OpenManifestForm()
    {
        if (_packRoot == null) return;
        var manifestPath = Path.Combine(_packRoot, "manifest.json");
        var packName = PackName ?? Path.GetFileName(_packRoot);
        CurrentManifest = ManifestModel.LoadFromFile(manifestPath, packName);
        IsManifestViewActive = true;
    }

    public void SaveManifest()
    {
        if (_packRoot == null || CurrentManifest == null) return;
        var manifestPath = Path.Combine(_packRoot, "manifest.json");
        try
        {
            CurrentManifest.SaveToFile(manifestPath);
            _cachedPackName = null;
            OnPropertyChanged(nameof(PackName));
            OnPropertyChanged(nameof(WindowTitle));
            OnPropertyChanged(nameof(HasManifest));
            BuildFolderTree();
            StatusMessage = "manifest.json saved successfully.";

            if (File.Exists(manifestPath))
            {
                _recentPacksService.AddOrUpdatePack(_packRoot);
                RefreshRecentPacks();
            }
        }
        catch (Exception ex)
        {
            StatusMessage = $"Failed to save manifest.json: {ex.Message}";
        }
    }

    public void GenerateManifest()
    {
        if (_packRoot == null) return;
        var manifestPath = Path.Combine(_packRoot, "manifest.json");
        if (CurrentManifest == null)
        {
            var packName = PackName ?? Path.GetFileName(_packRoot);
            CurrentManifest = ManifestModel.CreateDefault(packName, manifestPath);
        }
        SaveManifest();
    }

    public void SwitchToExplorerView()
    {
        IsManifestViewActive = false;
    }

    public void SwitchToManifestView()
    {
        OpenManifestForm();
    }

    public void OpenManifestInEditor()
    {
        if (_packRoot == null) return;
        var manifestPath = Path.Combine(_packRoot, "manifest.json");
        if (File.Exists(manifestPath))
        {
            try
            {
                Process.Start(new ProcessStartInfo { FileName = manifestPath, UseShellExecute = true });
            }
            catch (Exception ex)
            {
                StatusMessage = $"Could not open file: {ex.Message}";
            }
        }
    }

    private void ClosePack()
    {
        _watchDebounceTimer.Stop();
        _watcher?.Dispose();
        _watcher = null;
        _packRoot = null;
        _cachedPackName = null;
        CurrentManifest = null;
        IsManifestViewActive = false;
        FlipbookAnimationManager.ClearCache();
        Aliases.Clear();
        CatalogTree.Clear();
        BlockWorkspaceTree.Clear();
        PackFolders.Clear();
        SelectedFolder = null;
        SearchText = "";
        GhostsOnly = false;
        AddedOnly = false;
        OrphansOnly = false;
        StatusMessage = "Open a resource pack folder to begin.";

        RefreshRecentPacks();
        NotifyPackStateChanged();
    }

    private void ClearFolderFilter()
    {
        SelectedFolder = null;
    }

    private void OpenTutorial()
    {
        MessageBox.Show(
            "Welcome to MC Texture Ghost!\n\n" +
            "• Ghost Tiles: Missing PNG textures declared in your pack's JSON files are shown with a bright magenta border.\n\n" +
            "• Create Textures: Click any ghost tile to generate a 16x16 placeholder PNG and immediately open your default image editor.\n\n" +
            "• Declare New Blocks: If a block doesn't exist yet, type its name in the search bar and select Plain, Per-face, or Flipbook to generate the JSON scaffolding automatically.\n\n" +
            "• Live Reload: Whenever you save an image in your image editor, the app instantly updates the tile!",
            "MC Texture Ghost - Tutorial",
            MessageBoxButton.OK,
            MessageBoxImage.Information);
    }

    private void OpenInExplorer()
    {
        if (_packRoot is null || !Directory.Exists(_packRoot)) return;
        Process.Start(new ProcessStartInfo
        {
            FileName = _packRoot,
            UseShellExecute = true
        });
    }

    private void OpenSelectedFile()
    {
        if (SelectedFolder != null && !SelectedFolder.IsDirectory && File.Exists(SelectedFolder.FullPath))
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = SelectedFolder.FullPath,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                StatusMessage = $"Could not open file: {ex.Message}";
            }
        }
    }

    private string GetPackDisplayName()
    {
        if (_packRoot is null) return "";
        var manifestPath = Path.Combine(_packRoot, "manifest.json");
        if (File.Exists(manifestPath))
        {
            try
            {
                using var stream = File.OpenRead(manifestPath);
                using var doc = JsonDocument.Parse(stream, new JsonDocumentOptions
                {
                    AllowTrailingCommas = true,
                    CommentHandling = JsonCommentHandling.Skip
                });
                if (doc.RootElement.TryGetProperty("header", out var header) &&
                    header.TryGetProperty("name", out var nameProp))
                {
                    var name = nameProp.GetString();
                    if (!string.IsNullOrWhiteSpace(name)) return name;
                }
            }
            catch { }
        }
        return Path.GetFileName(_packRoot);
    }

    private void NotifyPackStateChanged()
    {
        OnPropertyChanged(nameof(IsPackLoaded));
        OnPropertyChanged(nameof(PackName));
        OnPropertyChanged(nameof(RootDirectoryName));
        OnPropertyChanged(nameof(PackRootPath));
        OnPropertyChanged(nameof(PackIconPath));
        OnPropertyChanged(nameof(HasPackIcon));
        OnPropertyChanged(nameof(HasManifest));
        OnPropertyChanged(nameof(TotalGhostCount));
        OnPropertyChanged(nameof(TotalAddedCount));
        OnPropertyChanged(nameof(TotalOrphanCount));
        OnPropertyChanged(nameof(TotalAliasCount));
        OnPropertyChanged(nameof(AllGhostCount));
        OnPropertyChanged(nameof(AllAliasCount));
        OnPropertyChanged(nameof(BlocksGhostCount));
        OnPropertyChanged(nameof(ItemsGhostCount));
        OnPropertyChanged(nameof(BlocksTotalCount));
        OnPropertyChanged(nameof(ItemsTotalCount));
        OnPropertyChanged(nameof(FilterStatusLabel));
        OnPropertyChanged(nameof(IsFilterActive));
        OnPropertyChanged(nameof(ShowCreatePanel));
        OnPropertyChanged(nameof(WindowTitle));
        FilteredAliases.Refresh();
        PackStateChanged?.Invoke();
    }

    public async void Rescan()
    {
        await RescanAsync();
    }

    public async Task RescanAsync()
    {
        if (_packRoot is null) return;

        await _rescanGate.WaitAsync();

        try
        {
            _cachedPackName = null;
            IsScanning = true;
            StatusMessage = "Scanning pack textures...";

            // Clear the current snapshot before rebuilding it so deleted entries cannot remain visible.
            Aliases.Clear();
            CatalogTree.Clear();
            BlockWorkspaceTree.Clear();
            PackFolders.Clear();
            FilteredAliases.Refresh();
            FilteredCatalogTree.Refresh();

            // Discard cached BitmapImages and flipbook frame slices so modified-on-disk textures reload fresh.
            ImagePathConverter.ClearCache();
            FlipbookAnimationManager.ClearCache();

            var packRoot = _packRoot;

            try
            {
                var results = await Task.Run(() => PackScanner.Scan(packRoot, _vanillaData));

                foreach (var alias in results)
                    Aliases.Add(alias);
                ApplySearchFilter();

                if (_vanillaData != null)
                {
                    var (catalogNodes, workspaceNodes) = await Task.Run(() =>
                    {
                        var cat = PackScanner.BuildCatalogTree(results, _vanillaData, packRoot);
                        var ws  = PackScanner.BuildBlockWorkspaceTree(results, _vanillaData, packRoot);
                        return (cat, ws);
                    });

                    foreach (var node in catalogNodes)
                        CatalogTree.Add(node);
                    FilteredCatalogTree.Refresh();

                    foreach (var node in workspaceNodes)
                        BlockWorkspaceTree.Add(node);
                }

                var blockCount = results.Count(a => a.Category == TextureCategory.Block);
                var itemCount = results.Count(a => a.Category == TextureCategory.Item);
                var ghostCount = results.Count(a => a.Status == TextureStatus.Ghost);
                var orphanCount = results.Count(a => a.Status == TextureStatus.Orphan);
                StatusMessage = orphanCount > 0
                    ? $"{results.Count} textures found ({blockCount} blocks, {itemCount} items • {ghostCount} ghosts, {orphanCount} orphans)."
                    : $"{results.Count} textures found ({blockCount} blocks, {itemCount} items • {ghostCount} ghosts).";
            }
            catch (Exception ex)
            {
                StatusMessage = $"Scan failed: {ex.Message}";
            }
            finally
            {
                var manifestPath = Path.Combine(packRoot, "manifest.json");
                if (File.Exists(manifestPath))
                {
                    CurrentManifest = ManifestModel.LoadFromFile(manifestPath, PackName ?? Path.GetFileName(packRoot));
                }
                else
                {
                    CurrentManifest = null;
                }

                BuildFolderTree();
                NotifyPackStateChanged();
                IsScanning = false;
            }
        }
        finally
        {
            _rescanGate.Release();
        }
    }

    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".tga", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".ico", ".tiff", ".tif"
    };

    private static PackFolderItem CreatePlaceholder() => new()
    {
        Name = "Loading...",
        RelativePath = "",
        FullPath = "",
        IsDirectory = false,
        IsPlaceholder = true
    };

    private void BuildFolderTree()
    {
        PackFolders.Clear();
        if (_packRoot is null || !Directory.Exists(_packRoot)) return;

        try
        {
            // 1. Subdirectories directly under _packRoot (textures, texts, subpacks, etc.)
            var subDirs = Directory.GetDirectories(_packRoot);
            foreach (var dir in subDirs.OrderBy(d => Path.GetFileName(d), StringComparer.OrdinalIgnoreCase))
            {
                var subName = Path.GetFileName(dir);
                if (subName.StartsWith(".")) continue;

                var childNode = CreateFolderNode(dir, subName, subName, 0);
                PackFolders.Add(childNode);

                // Auto-expand textures folder for instant access
                if (subName.Equals("textures", StringComparison.OrdinalIgnoreCase))
                {
                    childNode.IsExpanded = true;
                }
            }

            // 2. Non-image files directly under _packRoot (e.g. manifest.json)
            var files = Directory.GetFiles(_packRoot);
            bool foundManifest = false;
            foreach (var file in files.OrderBy(f => Path.GetFileName(f), StringComparer.OrdinalIgnoreCase))
            {
                var fileName = Path.GetFileName(file);
                var ext = Path.GetExtension(file);

                if (ImageExtensions.Contains(ext)) continue;
                if (fileName.StartsWith(".")) continue;

                if (fileName.Equals("manifest.json", StringComparison.OrdinalIgnoreCase))
                {
                    foundManifest = true;
                }

                var fileNode = new PackFolderItem
                {
                    Name = fileName,
                    RelativePath = fileName,
                    FullPath = file,
                    IsDirectory = false,
                    Depth = 0,
                    IsLoaded = true,
                    IsMissing = false,
                    TextureCount = 0,
                    GhostCount = 0
                };

                PackFolders.Add(fileNode);
            }

            // If manifest.json is missing on disk, insert a missing manifest placeholder
            if (!foundManifest)
            {
                var manifestPath = Path.Combine(_packRoot, "manifest.json");
                var missingManifestNode = new PackFolderItem
                {
                    Name = "manifest.json",
                    RelativePath = "manifest.json",
                    FullPath = manifestPath,
                    IsDirectory = false,
                    Depth = 0,
                    IsLoaded = true,
                    IsMissing = true,
                    TextureCount = 0,
                    GhostCount = 0
                };
                PackFolders.Add(missingManifestNode);
            }

            // Select textures folder by default so the center view shows all textures
            var texturesFolder = PackFolders.FirstOrDefault(f => f.RelativePath.Equals("textures", StringComparison.OrdinalIgnoreCase));
            if (texturesFolder != null)
            {
                SelectedFolder = texturesFolder;
            }
            else if (PackFolders.Count > 0)
            {
                SelectedFolder = PackFolders[0];
            }
        }
        catch (Exception ex)
        {
            StatusMessage = $"Failed to build folder tree: {ex.Message}";
        }
    }

    private PackFolderItem CreateFolderNode(string fullPath, string relativePath, string name, int depth = 0)
    {
        var node = new PackFolderItem
        {
            Name = name,
            RelativePath = relativePath.Replace('\\', '/'),
            FullPath = fullPath,
            IsDirectory = true,
            Depth = depth,
            IsLoaded = true
        };

        ComputeCountsForNode(node);

        if (depth >= 15) return node;

        try
        {
            if (Directory.Exists(fullPath))
            {
                // 1. Subdirectories recursively
                var subDirs = Directory.GetDirectories(fullPath);
                foreach (var dir in subDirs.OrderBy(d => Path.GetFileName(d), StringComparer.OrdinalIgnoreCase))
                {
                    var subName = Path.GetFileName(dir);
                    if (subName.StartsWith(".")) continue;

                    var subRel = string.IsNullOrEmpty(relativePath)
                        ? subName
                        : (relativePath.Replace('\\', '/') + "/" + subName);

                    var childNode = CreateFolderNode(dir, subRel, subName, depth + 1);
                    node.SubFolders.Add(childNode);
                }

                // 2. Non-image files in this directory
                var files = Directory.GetFiles(fullPath);
                foreach (var file in files.OrderBy(f => Path.GetFileName(f), StringComparer.OrdinalIgnoreCase))
                {
                    var fileName = Path.GetFileName(file);
                    var ext = Path.GetExtension(file);

                    if (ImageExtensions.Contains(ext)) continue;
                    if (fileName.StartsWith(".")) continue;

                    var fileRel = string.IsNullOrEmpty(relativePath)
                        ? fileName
                        : (relativePath.Replace('\\', '/') + "/" + fileName);

                    var fileNode = new PackFolderItem
                    {
                        Name = fileName,
                        RelativePath = fileRel,
                        FullPath = file,
                        IsDirectory = false,
                        Depth = depth + 1,
                        IsLoaded = true,
                        IsMissing = false,
                        TextureCount = 0,
                        GhostCount = 0
                    };

                    node.SubFolders.Add(fileNode);
                }
            }
        }
        catch { }

        return node;
    }

    private void LoadFolderChildren(PackFolderItem node)
    {
        if (node.IsLoaded) return;
        node.IsLoaded = true;
    }

    private static bool PathMatchesFolder(string itemRelPath, string folderRelPath, string folderPrefix)
    {
        var itemNorm = itemRelPath.Replace('\\', '/');
        var folderNorm = folderRelPath.Replace('\\', '/');
        var prefixNorm = folderPrefix.Replace('\\', '/');

        if (itemNorm.Equals(folderNorm, StringComparison.OrdinalIgnoreCase) ||
            itemNorm.StartsWith(prefixNorm, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        // Handle variations between with / without "textures/" prefix
        if (folderNorm.StartsWith("textures/", StringComparison.OrdinalIgnoreCase))
        {
            var folderWithoutTextures = folderNorm.Substring(9);
            var prefixWithoutTextures = folderWithoutTextures.TrimEnd('/') + '/';
            if (itemNorm.Equals(folderWithoutTextures, StringComparison.OrdinalIgnoreCase) ||
                itemNorm.StartsWith(prefixWithoutTextures, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        else if (itemNorm.StartsWith("textures/", StringComparison.OrdinalIgnoreCase))
        {
            var itemWithoutTextures = itemNorm.Substring(9);
            if (itemWithoutTextures.Equals(folderNorm, StringComparison.OrdinalIgnoreCase) ||
                itemWithoutTextures.StartsWith(prefixNorm, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private void ComputeCountsForNode(PackFolderItem node)
    {
        if (string.IsNullOrEmpty(node.RelativePath))
        {
            node.TextureCount = Aliases.Count;
            node.GhostCount = Aliases.Count(a => !a.Exists);
            return;
        }

        var folderExact = node.RelativePath.Replace('\\', '/');
        var prefix = folderExact.EndsWith('/') ? folderExact : folderExact + "/";
        int texCount = 0;
        int ghostCount = 0;

        foreach (var a in Aliases)
        {
            if (PathMatchesFolder(a.RelativePath, folderExact, prefix))
            {
                texCount++;
                if (!a.Exists) ghostCount++;
            }
        }

        node.TextureCount = texCount;
        node.GhostCount = ghostCount;
    }

    private void RefreshTreeCounts()
    {
        foreach (var node in PackFolders)
        {
            UpdateNodeCountsRecursive(node);
        }
    }

    private void UpdateNodeCountsRecursive(PackFolderItem node)
    {
        if (!node.IsDirectory || node.IsPlaceholder) return;

        ComputeCountsForNode(node);

        foreach (var child in node.SubFolders)
        {
            if (child.IsDirectory && child.IsLoaded)
            {
                UpdateNodeCountsRecursive(child);
            }
        }
    }

    /// <summary>
    /// Handles a preset button click from the "no match found" panel: writes
    /// the JSON scaffolding for a brand-new texture, rescans so it shows up
    /// as an ordinary declared-but-missing ghost, then immediately opens it
    /// (stub PNG + Open With) so the user lands straight in painting mode.
    /// </summary>
    private void CreateTexture(string? preset)
    {
        if (_packRoot is null || string.IsNullOrWhiteSpace(SearchText)) return;
        var alias = SearchText.Trim();

        try
        {
            string aliasToOpen = alias;

            switch (preset)
            {
                case "plain":
                    JsonWriterService.AddPlainBlock(_packRoot, alias);
                    break;
                case "perface":
                    aliasToOpen = JsonWriterService.AddPerFaceBlock(_packRoot, alias);
                    break;
                case "flipbook":
                    JsonWriterService.AddFlipbookBlock(_packRoot, alias);
                    break;
                default:
                    return;
            }

            Rescan();

            var created = Aliases.FirstOrDefault(a =>
                a.Alias.Equals(aliasToOpen, StringComparison.OrdinalIgnoreCase));

            SearchText = ""; // clears the filter so the newly created tile(s) are visible

            if (created != null)
                EditTexture(created);
        }
        catch (Exception ex)
        {
            StatusMessage = $"Create failed: {ex.Message}";
        }
    }

    // ─── Context-menu actions ────────────────────────────────────────────────

    private void CopyPath(TextureAlias? alias)
    {
        if (alias is null) return;
        try
        {
            Clipboard.SetText(alias.RelativePath);
            StatusMessage = $"Copied: {alias.RelativePath}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Copy failed: {ex.Message}";
        }
    }

    private void OpenTextureFolder(TextureAlias? alias)
    {
        if (alias is null) return;
        try
        {
            if (File.Exists(alias.FullPath))
            {
                // Highlight the file inside Explorer
                Process.Start(new ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = $"/select,\"{alias.FullPath}\"",
                    UseShellExecute = false
                });
            }
            else
            {
                // File doesn't exist yet — open the parent dir instead
                var dir = Path.GetDirectoryName(alias.FullPath);
                if (dir != null && Directory.Exists(dir))
                    Process.Start(new ProcessStartInfo { FileName = dir, UseShellExecute = true });
            }
        }
        catch (Exception ex)
        {
            StatusMessage = $"Could not open folder: {ex.Message}";
        }
    }

    private void RevealInSidebar(TextureAlias? alias)
    {
        if (alias is null) return;

        var relPath = alias.RelativePath.Replace('\\', '/');
        var parentDir = relPath.Contains('/')
            ? relPath[..relPath.LastIndexOf('/')]
            : string.Empty;

        if (string.IsNullOrEmpty(parentDir))
        {
            if (PackFolders.Count > 0) SelectedFolder = PackFolders[0];
            return;
        }

        var found = FindFolderNode(PackFolders, parentDir);
        if (found != null)
        {
            // Expand ancestors so the node is visible
            found.IsExpanded = true;
            SelectedFolder = found;
            StatusMessage = $"Revealed: {found.RelativePath}";
        }
        else
        {
            StatusMessage = $"Folder not found in sidebar: {parentDir}";
        }
    }

    private PackFolderItem? FindFolderNode(IEnumerable<PackFolderItem> nodes, string targetRelPath)
    {
        foreach (var node in nodes)
        {
            if (!node.IsDirectory || node.IsPlaceholder) continue;

            var nodeRel = node.RelativePath.Replace('\\', '/');
            if (nodeRel.Equals(targetRelPath, StringComparison.OrdinalIgnoreCase))
                return node;

            // Only recurse if this node is a prefix of the target
            if (targetRelPath.StartsWith(nodeRel + "/", StringComparison.OrdinalIgnoreCase) ||
                string.IsNullOrEmpty(nodeRel))
            {
                if (!node.IsLoaded) LoadFolderChildren(node);
                var found = FindFolderNode(node.SubFolders, targetRelPath);
                if (found != null) return found;
            }
        }
        return null;
    }

    private void StartWatching()
    {
        _watcher?.Dispose();
        _watchDebounceTimer.Stop();
        if (_packRoot is null || !Directory.Exists(_packRoot)) return;

        _watcher = new FileSystemWatcher(_packRoot)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
            EnableRaisingEvents = true
        };

        void OnFileChanged(object sender, FileSystemEventArgs e)
        {
            var dispatcher = Application.Current?.Dispatcher;
            if (dispatcher == null) return;
            dispatcher.InvokeAsync(() =>
            {
                _watchDebounceTimer.Stop();
                _watchDebounceTimer.Start();
            });
        }

        void OnFileRenamed(object sender, RenamedEventArgs e)
        {
            var dispatcher = Application.Current?.Dispatcher;
            if (dispatcher == null) return;
            dispatcher.InvokeAsync(() =>
            {
                _watchDebounceTimer.Stop();
                _watchDebounceTimer.Start();
            });
        }

        // Any create/delete/rename/change in pack root or textures/ refreshes existence in place
        // with debouncing so external editor saves flip to "real" immediately without file locks.
        _watcher.Created += OnFileChanged;
        _watcher.Deleted += OnFileChanged;
        _watcher.Renamed += OnFileRenamed;
        _watcher.Changed += OnFileChanged;
    }

    private void RefreshExistence()
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher != null && !dispatcher.CheckAccess())
        {
            dispatcher.Invoke(RefreshExistence);
            return;
        }

        ImagePathConverter.ClearCache();
        FlipbookAnimationManager.ClearCache();

        foreach (var alias in Aliases)
        {
            if (alias.Status == TextureStatus.Orphan)
            {
                alias.Status = File.Exists(alias.FullPath) ? TextureStatus.Orphan : TextureStatus.Ghost;
            }
            else if (alias.Status != TextureStatus.NoEntry)
            {
                alias.Status = File.Exists(alias.FullPath) ? TextureStatus.Ok : TextureStatus.Ghost;
            }
        }

        // Synchronize CatalogTree leaves and refresh thumbnails
        foreach (var block in CatalogTree)
        {
            bool blockChanged = false;
            foreach (var ag in block.AliasGroups)
            {
                bool agChanged = false;
                foreach (var leaf in ag.Leaves)
                {
                    if (leaf.TextureAlias != null)
                    {
                        var newStatus = leaf.TextureAlias.Status switch
                        {
                            TextureStatus.Ok => CatalogEntryStatus.Ok,
                            TextureStatus.Ghost => CatalogEntryStatus.Ghost,
                            TextureStatus.Orphan => CatalogEntryStatus.Orphan,
                            _ => CatalogEntryStatus.Ok
                        };
                        if (leaf.Status != newStatus)
                        {
                            leaf.Status = newStatus;
                            agChanged = true;
                        }
                    }
                    else if (leaf.Status == CatalogEntryStatus.NotAdded || leaf.Status == CatalogEntryStatus.VanillaOverride)
                    {
                        var exists = File.Exists(leaf.FullPath);
                        var newStatus = exists ? CatalogEntryStatus.VanillaOverride : CatalogEntryStatus.NotAdded;
                        if (leaf.Status != newStatus)
                        {
                            leaf.Status = newStatus;
                            agChanged = true;
                        }
                    }

                    leaf.RefreshThumbnail();
                }

                if (agChanged)
                {
                    ag.NotifyCountsChanged();
                    blockChanged = true;
                }
            }

            if (blockChanged)
            {
                block.NotifyCountsChanged();
            }
        }

        RefreshTreeCounts();

        var blockCount = Aliases.Count(a => a.Category == TextureCategory.Block);
        var itemCount = Aliases.Count(a => a.Category == TextureCategory.Item);
        var ghostCount = Aliases.Count(a => a.Status == TextureStatus.Ghost);
        var orphanCount = Aliases.Count(a => a.Status == TextureStatus.Orphan);

        StatusMessage = orphanCount > 0
            ? $"{Aliases.Count} textures ({blockCount} blocks, {itemCount} items • {ghostCount} ghosts, {orphanCount} orphans)."
            : $"{Aliases.Count} textures ({blockCount} blocks, {itemCount} items • {ghostCount} ghosts).";

        OnPropertyChanged(nameof(TotalGhostCount));
        OnPropertyChanged(nameof(TotalAddedCount));
        OnPropertyChanged(nameof(TotalOrphanCount));
        OnPropertyChanged(nameof(TotalAliasCount));
        OnPropertyChanged(nameof(AllGhostCount));
        OnPropertyChanged(nameof(AllAliasCount));
        OnPropertyChanged(nameof(BlocksGhostCount));
        OnPropertyChanged(nameof(ItemsGhostCount));
        OnPropertyChanged(nameof(BlocksTotalCount));
        OnPropertyChanged(nameof(ItemsTotalCount));
        OnPropertyChanged(nameof(FilterStatusLabel));
        OnPropertyChanged(nameof(IsFilterActive));
        OnPropertyChanged(nameof(WindowTitle));
        OnPropertyChanged(nameof(HasPackIcon));
        OnPropertyChanged(nameof(PackIconPath));
        FilteredAliases.Refresh();
        FilteredCatalogTree.Refresh();
    }

    private void HandlePackIconClick()
    {
        if (_packRoot is null) return;
        var iconPath = Path.Combine(_packRoot, "pack_icon.png");
        if (!File.Exists(iconPath))
        {
            try
            {
                PlaceholderImageFactory.CreateStub(iconPath, 64);
                ImagePathConverter.ClearCache();
                OnPropertyChanged(nameof(HasPackIcon));
                OnPropertyChanged(nameof(PackIconPath));
                StatusMessage = "Created placeholder pack_icon.png";
            }
            catch (Exception ex)
            {
                StatusMessage = $"Could not create pack icon: {ex.Message}";
                return;
            }
        }

        OpenWithLauncher.Show(iconPath);
    }

    private void EditTexture(TextureAlias? alias)
    {
        if (alias is null) return;

        // Clicking a NoEntry tile triggers the generation workflow
        if (alias.Status == TextureStatus.NoEntry)
        {
            CreateTexture("plain");
            return;
        }

        if (alias.Status == TextureStatus.Ghost)
        {
            PlaceholderImageFactory.CreateStub(alias.FullPath);
            ImagePathConverter.ClearCache();
            alias.Status = TextureStatus.Ok;
            RefreshTreeCounts();
            OnPropertyChanged(nameof(TotalGhostCount));
            OnPropertyChanged(nameof(TotalAddedCount));
            OnPropertyChanged(nameof(WindowTitle));
            FilteredAliases.Refresh();
            TextureUpdated?.Invoke(alias);
        }

        OpenWithLauncher.Show(alias.FullPath);
    }

    private void AddOrphanToJson(TextureAlias? alias)
    {
        if (alias is null || _packRoot is null) return;
        try
        {
            JsonWriterService.RegisterOrphan(_packRoot, alias.Alias, alias.RelativePath);
            StatusMessage = $"Registered orphan \"{alias.Alias}\" in terrain_texture.json.";
            Rescan();
        }
        catch (Exception ex)
        {
            StatusMessage = $"Failed to register orphan: {ex.Message}";
        }
    }

    private void AddItemOrphanToJson(TextureAlias? alias)
    {
        if (alias is null || _packRoot is null) return;
        try
        {
            JsonWriterService.RegisterItemOrphan(_packRoot, alias.Alias, alias.RelativePath);
            StatusMessage = $"Registered orphan item \"{alias.Alias}\" in item_texture.json.";
            Rescan();
        }
        catch (Exception ex)
        {
            StatusMessage = $"Failed to register item orphan: {ex.Message}";
        }
    }

    private async Task InitializeVanillaDataAsync()
    {
        IsVanillaLoading = true;
        VanillaDataStatusLabel = "Loading vanilla catalog...";

        try
        {
            var data = await VanillaDataService.LoadAsync(forceRefresh: false, progress =>
            {
                App.Current?.Dispatcher?.Invoke(() => VanillaDataStatusLabel = progress);
            });

            _vanillaData = data;
            if (data != null)
            {
                VanillaDataStatusLabel = $"Vanilla: {data.RawBlocksJson.Count} blocks, {data.ItemTextures.Count} items";
                OnPropertyChanged(nameof(IsVanillaDataLoaded));
                OnPropertyChanged(nameof(VanillaData));

                if (_packRoot != null)
                {
                    Rescan();
                }
            }
            else
            {
                VanillaDataStatusLabel = "Offline (no vanilla data)";
            }
        }
        catch (Exception ex)
        {
            VanillaDataStatusLabel = $"Vanilla load failed: {ex.Message}";
        }
        finally
        {
            IsVanillaLoading = false;
        }
    }

    private async Task RefreshVanillaDataAsync()
    {
        IsVanillaLoading = true;
        VanillaDataStatusLabel = "Checking for vanilla updates...";

        try
        {
            var data = await VanillaDataService.LoadAsync(forceRefresh: true, progress =>
            {
                App.Current?.Dispatcher?.Invoke(() => VanillaDataStatusLabel = progress);
            });

            _vanillaData = data;
            if (data != null)
            {
                VanillaDataStatusLabel = $"Vanilla: {data.RawBlocksJson.Count} blocks, {data.ItemTextures.Count} items";
                OnPropertyChanged(nameof(IsVanillaDataLoaded));
                OnPropertyChanged(nameof(VanillaData));

                if (_packRoot != null)
                {
                    Rescan();
                }
            }
            else
            {
                VanillaDataStatusLabel = "Could not reach GitHub";
            }
        }
        catch (Exception ex)
        {
            VanillaDataStatusLabel = $"Refresh failed: {ex.Message}";
        }
        finally
        {
            IsVanillaLoading = false;
        }
    }

    private void AddVanillaEntry(object? param)
    {
        if (_packRoot == null || _vanillaData == null) return;

        try
        {
            if (param is BlockGroupNode blockNode)
            {
                if (blockNode.Category == TextureCategory.Block)
                {
                    JsonWriterService.AddVanillaBlock(_packRoot, blockNode.BlockId, _vanillaData);
                    StatusMessage = $"Added {blockNode.DisplayName} to pack.";
                }
                else
                {
                    JsonWriterService.AddVanillaItem(_packRoot, blockNode.BlockId, _vanillaData);
                    StatusMessage = $"Added {blockNode.DisplayName} to pack.";
                }
                Rescan();
            }
            else if (param is AliasGroupNode aliasNode)
            {
                if (aliasNode.Category == TextureCategory.Block)
                {
                    JsonWriterService.AddVanillaBlockAlias(_packRoot, aliasNode.Alias, _vanillaData);
                    StatusMessage = $"Added alias {aliasNode.Alias} to terrain_texture.json.";
                }
                else
                {
                    JsonWriterService.AddVanillaItem(_packRoot, aliasNode.Alias, _vanillaData);
                    StatusMessage = $"Added item {aliasNode.Alias} to item_texture.json.";
                }
                Rescan();
            }
            else if (param is CatalogLeaf leaf)
            {
                if (leaf.Category == TextureCategory.Block)
                {
                    JsonWriterService.AddVanillaBlockAlias(_packRoot, leaf.Alias, _vanillaData);
                    StatusMessage = $"Added alias {leaf.Alias} to terrain_texture.json.";
                }
                else
                {
                    JsonWriterService.AddVanillaItem(_packRoot, leaf.Alias, _vanillaData);
                    StatusMessage = $"Added item {leaf.Alias} to item_texture.json.";
                }
                Rescan();
            }
        }
        catch (Exception ex)
        {
            StatusMessage = $"Failed to add entry: {ex.Message}";
        }
    }

    public void SetCatalogCategory(TextureCategory? category)
    {
        _catalogCategoryFilter = category;
        OnPropertyChanged(nameof(IsCatalogAllCategory));
        OnPropertyChanged(nameof(IsCatalogBlocksCategory));
        OnPropertyChanged(nameof(IsCatalogItemsCategory));
        ApplyCatalogFilter();
    }

    private void ApplyCatalogFilter()
    {
        FilteredCatalogTree?.Refresh();
        var query = _catalogSearchText.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(query))
        {
            foreach (var node in CatalogTree)
            {
                if (node.SearchFilterKey.Contains(query, StringComparison.Ordinal))
                {
                    node.IsExpanded = true;
                    foreach (var ag in node.AliasGroups)
                        ag.IsExpanded = true;
                }
            }
        }
    }

    private void OpenCatalogDialog()
    {
        if (_packRoot == null) return;
        if (!IsVanillaDataLoaded)
        {
            StatusMessage = "Vanilla catalog is still loading. Please wait...";
            return;
        }

        var dialog = new Views.CatalogDialog(this)
        {
            Owner = Application.Current?.MainWindow
        };
        dialog.ShowDialog();
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
