using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Data;
using McTextureGhost.Models;
using McTextureGhost.Services;
using Microsoft.Win32;
// JsonWriterService lives in McTextureGhost.Services, already imported above.

namespace McTextureGhost.ViewModels;

public class MainViewModel : INotifyPropertyChanged
{
    private FileSystemWatcher? _watcher;
    private string? _packRoot;

    public ObservableCollection<TextureAlias> Aliases { get; } = new();
    public ICollectionView FilteredAliases { get; }

    private string _searchText = "";
    public string SearchText
    {
        get => _searchText;
        set
        {
            if (_searchText == value) return;
            _searchText = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(ShowCreatePanel));
            FilteredAliases.Refresh();
        }
    }

    /// <summary>
    /// True when the user has typed a name that matches nothing currently
    /// declared - the "blank project" case where we offer to generate the
    /// JSON scaffolding instead of just showing an empty grid.
    /// </summary>
    public bool ShowCreatePanel =>
        _packRoot != null &&
        !string.IsNullOrWhiteSpace(SearchText) &&
        !Aliases.Any(a => a.Alias.Contains(SearchText.Trim(), StringComparison.OrdinalIgnoreCase));

    private bool _ghostsOnly;
    public bool GhostsOnly
    {
        get => _ghostsOnly;
        set
        {
            if (_ghostsOnly == value) return;
            _ghostsOnly = value;
            OnPropertyChanged();
            FilteredAliases.Refresh();
        }
    }

    private string _statusMessage = "Open a resource pack folder to begin.";
    public string StatusMessage
    {
        get => _statusMessage;
        set { _statusMessage = value; OnPropertyChanged(); }
    }

    public RelayCommand OpenPackFolderCommand { get; }
    public RelayCommand EditTextureCommand { get; }
    public RelayCommand RescanCommand { get; }
    public RelayCommand CreateTextureCommand { get; }

    public MainViewModel()
    {
        FilteredAliases = CollectionViewSource.GetDefaultView(Aliases);
        FilteredAliases.Filter = FilterPredicate;

        OpenPackFolderCommand = new RelayCommand(_ => OpenPackFolder());
        EditTextureCommand = new RelayCommand(param => EditTexture(param as TextureAlias));
        RescanCommand = new RelayCommand(_ => Rescan(), _ => _packRoot != null);
        CreateTextureCommand = new RelayCommand(param => CreateTexture(param as string));
    }

    private bool FilterPredicate(object obj)
    {
        if (obj is not TextureAlias alias) return false;

        if (GhostsOnly && alias.Exists) return false;

        if (string.IsNullOrWhiteSpace(SearchText)) return true;

        return alias.Alias.Contains(SearchText, StringComparison.OrdinalIgnoreCase);
    }

    private void OpenPackFolder()
    {
        // .NET 8 WPF's built-in folder picker - no extra package needed.
        var dialog = new OpenFolderDialog
        {
            Title = "Select your resource pack root (the folder with manifest.json)"
        };

        if (dialog.ShowDialog() != true) return;

        _packRoot = dialog.FolderName;
        Rescan();
        StartWatching();
    }

    private void Rescan()
    {
        if (_packRoot is null) return;

        try
        {
            var results = PackScanner.Scan(_packRoot);
            Aliases.Clear();
            foreach (var alias in results)
                Aliases.Add(alias);

            var ghostCount = results.Count(a => !a.Exists);
            StatusMessage = $"{results.Count} aliases found, {ghostCount} missing on disk.";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Scan failed: {ex.Message}";
        }
        finally
        {
            OnPropertyChanged(nameof(ShowCreatePanel));
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

    private void StartWatching()
    {
        _watcher?.Dispose();
        if (_packRoot is null) return;

        var texturesDir = Path.Combine(_packRoot, "textures");
        if (!Directory.Exists(texturesDir)) return;

        _watcher = new FileSystemWatcher(texturesDir)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite,
            EnableRaisingEvents = true
        };

        // Any create/delete/rename under textures/ just re-checks existence in place
        // rather than re-parsing JSON, so ghosts flip to "real" the moment you save.
        _watcher.Created += (_, _) => RefreshExistence();
        _watcher.Deleted += (_, _) => RefreshExistence();
        _watcher.Renamed += (_, _) => RefreshExistence();
    }

    private void RefreshExistence()
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher != null && !dispatcher.CheckAccess())
        {
            dispatcher.Invoke(RefreshExistence);
            return;
        }

        foreach (var alias in Aliases)
            alias.Exists = File.Exists(alias.FullPath);

        var ghostCount = Aliases.Count(a => !a.Exists);
        StatusMessage = $"{Aliases.Count} aliases found, {ghostCount} missing on disk.";
        FilteredAliases.Refresh();
    }

    private void EditTexture(TextureAlias? alias)
    {
        if (alias is null) return;

        if (!alias.Exists)
        {
            PlaceholderImageFactory.CreateStub(alias.FullPath);
            alias.Exists = true;
        }

        OpenWithLauncher.Show(alias.FullPath);
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
