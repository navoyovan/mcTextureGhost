using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Data;
using System.Windows.Threading;
using McTextureGhost.Models;
using McTextureGhost.Services;
using McTextureGhost.Views;
using Microsoft.Win32;

namespace McTextureGhost.ViewModels;

/// <summary>Controls how large tiles render in the grid.</summary>
public enum TileSizeMode { Small, Medium, Large }

public class MainViewModel : INotifyPropertyChanged
{
    private FileSystemWatcher? _watcher;
    private string? _packRoot;

    public ObservableCollection<TextureAlias> Aliases { get; } = new();
    public ICollectionView FilteredAliases { get; }

    public ObservableCollection<PackFolderItem> PackFolders { get; } = new();

    public bool IsPackLoaded => _packRoot != null;
    public string? PackRootPath => _packRoot;
    private string? _cachedPackName;
    public string? PackName => _packRoot != null ? (_cachedPackName ??= GetPackDisplayName()) : null;
    public string? PackIconPath => _packRoot != null ? Path.Combine(_packRoot, "pack_icon.png") : null;
    public bool HasPackIcon => _packRoot != null && File.Exists(PackIconPath);

    public string WindowTitle
    {
        get
        {
            if (_packRoot == null) return "McTextureGhost";
            var packName = PackName ?? "Pack";
            var ghostCount = TotalGhostCount;
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

            if (_selectedFolder != null && _selectedFolder.IsDirectory && !string.IsNullOrWhiteSpace(_selectedFolder.RelativePath))
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

    public string? SelectedFolderPath => _selectedFolder?.RelativePath;

    public int TotalGhostCount => Aliases.Count(a => a.Status == TextureStatus.Ghost);
    public int TotalAddedCount => Aliases.Count(a => a.Status == TextureStatus.Ok);
    public int TotalOrphanCount => Aliases.Count(a => a.Status == TextureStatus.Orphan);
    public int TotalAliasCount => Aliases.Count(a => a.Status != TextureStatus.NoEntry);

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
        for (int i = 0; i < Aliases.Count; i++)
        {
            var a = Aliases[i];
            if (a.Status != TextureStatus.NoEntry &&
                a.SearchFilterKey.Contains(_appliedSearchQueryLower, StringComparison.Ordinal))
            {
                hasMatch = true;
                break;
            }
        }

        _hasNonEmptySearchMatches = hasMatch;

        if (!hasMatch)
        {
            _noEntryAlias = new TextureAlias
            {
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

    // ─── Tile size ───────────────────────────────────────────────────────────
    private TileSizeMode _tileSizeMode = TileSizeMode.Medium;
    public TileSizeMode CurrentTileSizeMode
    {
        get => _tileSizeMode;
        set
        {
            if (_tileSizeMode == value) return;
            _tileSizeMode = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(TileButtonWidth));
            OnPropertyChanged(nameof(TileButtonHeight));
            OnPropertyChanged(nameof(TileImageSize));
            OnPropertyChanged(nameof(IsTileSizeSmall));
            OnPropertyChanged(nameof(IsTileSizeMedium));
            OnPropertyChanged(nameof(IsTileSizeLarge));
        }
    }

    public int TileButtonWidth  => _tileSizeMode switch { TileSizeMode.Small => 84,  TileSizeMode.Large => 156, _ => 112 };
    public int TileButtonHeight => _tileSizeMode switch { TileSizeMode.Small => 108, TileSizeMode.Large => 180, _ => 134 };
    public int TileImageSize    => _tileSizeMode switch { TileSizeMode.Small => 48,  TileSizeMode.Large => 96,  _ => 64  };

    public bool IsTileSizeSmall  => _tileSizeMode == TileSizeMode.Small;
    public bool IsTileSizeMedium => _tileSizeMode == TileSizeMode.Medium;
    public bool IsTileSizeLarge  => _tileSizeMode == TileSizeMode.Large;

    // ─── Commands ────────────────────────────────────────────────────────────
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
    public RelayCommand SetTileSizeSmallCommand  { get; }
    public RelayCommand SetTileSizeMediumCommand { get; }
    public RelayCommand SetTileSizeLargeCommand  { get; }
    public RelayCommand CopyPathCommand           { get; }
    public RelayCommand OpenTextureFolderCommand  { get; }
    public RelayCommand RevealInSidebarCommand    { get; }
    public RelayCommand AddOrphanToJsonCommand    { get; }
    public RelayCommand ResetStatusFilterCommand  { get; }
    public RelayCommand OpenPackIconCommand       { get; }

    public MainViewModel()
    {
        FilteredAliases = CollectionViewSource.GetDefaultView(Aliases);
        FilteredAliases.Filter = FilterPredicate;

        _searchDebounceTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(400)
        };
        _searchDebounceTimer.Tick += (s, e) =>
        {
            _searchDebounceTimer.Stop();
            ApplySearchFilter();
        };

        CommitSearchCommand = new RelayCommand(_ => CommitSearch());

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

        SetTileSizeSmallCommand  = new RelayCommand(_ => CurrentTileSizeMode = TileSizeMode.Small);
        SetTileSizeMediumCommand = new RelayCommand(_ => CurrentTileSizeMode = TileSizeMode.Medium);
        SetTileSizeLargeCommand  = new RelayCommand(_ => CurrentTileSizeMode = TileSizeMode.Large);

        CopyPathCommand          = new RelayCommand(param => CopyPath(param as TextureAlias));
        OpenTextureFolderCommand = new RelayCommand(param => OpenTextureFolder(param as TextureAlias));
        RevealInSidebarCommand   = new RelayCommand(param => RevealInSidebar(param as TextureAlias));
        AddOrphanToJsonCommand   = new RelayCommand(param => AddOrphanToJson(param as TextureAlias));
        ResetStatusFilterCommand = new RelayCommand(_ =>
        {
            GhostsOnly = false;
            AddedOnly = false;
            OrphansOnly = false;
        });
    }

    private bool FilterPredicate(object obj)
    {
        if (obj is not TextureAlias alias) return false;

        // NoEntry tile should always show when search produces zero matches
        if (alias.Status == TextureStatus.NoEntry) return true;

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

    public void LoadPack(string folderPath)
    {
        if (string.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath)) return;
        _packRoot = folderPath;
        _cachedPackName = null;
        Rescan();
        StartWatching();
    }

    private void OpenPackFolder()
    {
        // .NET 8 WPF's built-in folder picker - no extra package needed.
        var dialog = new OpenFolderDialog
        {
            Title = "Select your resource pack root (the folder with manifest.json)"
        };

        if (dialog.ShowDialog() != true) return;

        LoadPack(dialog.FolderName);
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

        try
        {
            Directory.CreateDirectory(targetFolder);
            var texturesDir = Path.Combine(targetFolder, "textures");
            var blocksDir = Path.Combine(texturesDir, "blocks");
            Directory.CreateDirectory(blocksDir);

            var manifestPath = Path.Combine(targetFolder, "manifest.json");
            if (!File.Exists(manifestPath))
            {
                var manifestObj = new JsonObject
                {
                    ["format_version"] = 2,
                    ["header"] = new JsonObject
                    {
                        ["name"] = packName,
                        ["description"] = "Bedrock resource pack created with McTextureGhost",
                        ["uuid"] = Guid.NewGuid().ToString(),
                        ["version"] = new JsonArray { 1, 0, 0 },
                        ["min_engine_version"] = new JsonArray { 1, 20, 0 }
                    },
                    ["modules"] = new JsonArray
                    {
                        new JsonObject
                        {
                            ["type"] = "resources",
                            ["uuid"] = Guid.NewGuid().ToString(),
                            ["version"] = new JsonArray { 1, 0, 0 }
                        }
                    }
                };
                File.WriteAllText(manifestPath, manifestObj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
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
        }
        catch (Exception ex)
        {
            StatusMessage = $"Failed to create pack: {ex.Message}";
        }
    }

    private void ClosePack()
    {
        _watcher?.Dispose();
        _watcher = null;
        _packRoot = null;
        _cachedPackName = null;
        Aliases.Clear();
        PackFolders.Clear();
        SelectedFolder = null;
        SearchText = "";
        GhostsOnly = false;
        AddedOnly = false;
        OrphansOnly = false;
        StatusMessage = "Open a resource pack folder to begin.";

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
        OnPropertyChanged(nameof(PackRootPath));
        OnPropertyChanged(nameof(PackIconPath));
        OnPropertyChanged(nameof(HasPackIcon));
        OnPropertyChanged(nameof(TotalGhostCount));
        OnPropertyChanged(nameof(TotalAddedCount));
        OnPropertyChanged(nameof(TotalOrphanCount));
        OnPropertyChanged(nameof(TotalAliasCount));
        OnPropertyChanged(nameof(FilterStatusLabel));
        OnPropertyChanged(nameof(IsFilterActive));
        OnPropertyChanged(nameof(ShowCreatePanel));
        OnPropertyChanged(nameof(WindowTitle));
        FilteredAliases.Refresh();
    }

    private async void Rescan()
    {
        await RescanAsync();
    }

    private async Task RescanAsync()
    {
        if (_packRoot is null) return;
        _cachedPackName = null;
        IsScanning = true;
        StatusMessage = "Scanning pack textures...";

        // Discard cached BitmapImages so modified-on-disk textures reload fresh.
        ImagePathConverter.ClearCache();

        var packRoot = _packRoot;

        try
        {
            var results = await Task.Run(() => PackScanner.Scan(packRoot));

            Aliases.Clear();
            foreach (var alias in results)
                Aliases.Add(alias);
            ApplySearchFilter();

            var ghostCount = results.Count(a => a.Status == TextureStatus.Ghost);
            var addedCount = results.Count(a => a.Status == TextureStatus.Ok);
            var orphanCount = results.Count(a => a.Status == TextureStatus.Orphan);
            StatusMessage = orphanCount > 0
                ? $"{results.Count} textures found ({addedCount} ok, {ghostCount} ghosts, {orphanCount} orphans)."
                : $"{results.Count} textures found ({addedCount} ok, {ghostCount} ghosts).";
        }
        catch (Exception ex)
        {
            Aliases.Clear();
            StatusMessage = $"Scan failed: {ex.Message}";
        }
        finally
        {
            BuildFolderTree();
            NotifyPackStateChanged();
            IsScanning = false;
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

        var rootNode = CreateFolderNode(_packRoot, "", PackName ?? Path.GetFileName(_packRoot));
        PackFolders.Add(rootNode);
        rootNode.IsExpanded = true;
    }

    private PackFolderItem CreateFolderNode(string fullPath, string relativePath, string name)
    {
        var node = new PackFolderItem
        {
            Name = name,
            RelativePath = relativePath.Replace('\\', '/'),
            FullPath = fullPath,
            IsDirectory = true,
            OnExpand = LoadFolderChildren
        };

        ComputeCountsForNode(node);

        // Check if there are any child entries without full recursion
        bool hasChildren = false;
        try
        {
            using var dirs = Directory.EnumerateDirectories(fullPath).GetEnumerator();
            if (dirs.MoveNext())
            {
                hasChildren = true;
            }
            else
            {
                using var files = Directory.EnumerateFiles(fullPath).GetEnumerator();
                while (files.MoveNext())
                {
                    var ext = Path.GetExtension(files.Current);
                    if (!ImageExtensions.Contains(ext))
                    {
                        hasChildren = true;
                        break;
                    }
                }
            }
        }
        catch { }

        if (hasChildren)
        {
            node.SubFolders.Add(CreatePlaceholder());
        }
        else
        {
            node.IsLoaded = true;
        }

        return node;
    }

    private void LoadFolderChildren(PackFolderItem node)
    {
        if (node.IsLoaded) return;
        node.IsLoaded = true;
        node.SubFolders.Clear();

        if (string.IsNullOrEmpty(node.FullPath) || !Directory.Exists(node.FullPath))
            return;

        try
        {
            // 1. Subdirectories
            var subDirs = Directory.GetDirectories(node.FullPath);
            foreach (var dir in subDirs.OrderBy(d => Path.GetFileName(d), StringComparer.OrdinalIgnoreCase))
            {
                var subName = Path.GetFileName(dir);
                if (subName.StartsWith(".")) continue;

                var subRel = string.IsNullOrEmpty(node.RelativePath)
                    ? subName
                    : (node.RelativePath + "/" + subName);

                var childNode = CreateFolderNode(dir, subRel, subName);
                node.SubFolders.Add(childNode);

                // Auto-expand textures folder under pack root for instant access
                if (childNode.RelativePath.Equals("textures", StringComparison.OrdinalIgnoreCase))
                {
                    childNode.IsExpanded = true;
                }
            }

            // 2. Non-image files in this directory (exclude images; keep PNGs truncated as is)
            var files = Directory.GetFiles(node.FullPath);
            foreach (var file in files.OrderBy(f => Path.GetFileName(f), StringComparer.OrdinalIgnoreCase))
            {
                var fileName = Path.GetFileName(file);
                var ext = Path.GetExtension(file);

                if (ImageExtensions.Contains(ext)) continue;
                if (fileName.StartsWith(".")) continue;

                var fileRel = string.IsNullOrEmpty(node.RelativePath)
                    ? fileName
                    : (node.RelativePath + "/" + fileName);

                var fileNode = new PackFolderItem
                {
                    Name = fileName,
                    RelativePath = fileRel,
                    FullPath = file,
                    IsDirectory = false,
                    IsLoaded = true,
                    TextureCount = 0,
                    GhostCount = 0
                };

                node.SubFolders.Add(fileNode);
            }
        }
        catch { }
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
        if (PackFolders.Count == 0) return;
        UpdateNodeCountsRecursive(PackFolders[0]);
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
        if (_packRoot is null || !Directory.Exists(_packRoot)) return;

        _watcher = new FileSystemWatcher(_packRoot)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite,
            EnableRaisingEvents = true
        };

        // Any create/delete/rename in pack root or textures/ refreshes existence in place
        // so ghosts flip to "real" the moment you save.
        _watcher.Created += (_, _) => RefreshExistence();
        _watcher.Deleted += (_, _) => RefreshExistence();
        _watcher.Renamed += (_, _) => RefreshExistence();
        _watcher.Changed += (_, _) => RefreshExistence();
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

        RefreshTreeCounts();

        var ghostCount = Aliases.Count(a => a.Status == TextureStatus.Ghost);
        var addedCount = Aliases.Count(a => a.Status == TextureStatus.Ok);
        var orphanCount = Aliases.Count(a => a.Status == TextureStatus.Orphan);

        StatusMessage = orphanCount > 0
            ? $"{Aliases.Count} textures ({addedCount} ok, {ghostCount} ghosts, {orphanCount} orphans)."
            : $"{Aliases.Count} textures ({addedCount} ok, {ghostCount} ghosts).";

        OnPropertyChanged(nameof(TotalGhostCount));
        OnPropertyChanged(nameof(TotalAddedCount));
        OnPropertyChanged(nameof(TotalOrphanCount));
        OnPropertyChanged(nameof(FilterStatusLabel));
        OnPropertyChanged(nameof(IsFilterActive));
        OnPropertyChanged(nameof(WindowTitle));
        OnPropertyChanged(nameof(HasPackIcon));
        OnPropertyChanged(nameof(PackIconPath));
        FilteredAliases.Refresh();
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
            alias.Status = TextureStatus.Ok;
            RefreshTreeCounts();
            OnPropertyChanged(nameof(TotalGhostCount));
            OnPropertyChanged(nameof(TotalAddedCount));
            OnPropertyChanged(nameof(WindowTitle));
            FilteredAliases.Refresh();
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

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
