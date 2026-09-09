using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace McTextureGhost.Models;

/// <summary>
/// Represents a folder node in the Directory Explorer (dir-exp) TreeView.
/// </summary>
public class PackFolderItem : INotifyPropertyChanged
{
    public required string Name { get; init; }
    public required string RelativePath { get; init; }
    public required string FullPath { get; init; }

    public bool IsDirectory { get; init; } = true;
    public bool IsPlaceholder { get; init; } = false;

    public PackFolderItem()
    {
        SubFolders.CollectionChanged += (s, e) =>
        {
            OnPropertyChanged(nameof(CanExpand));
            OnPropertyChanged(nameof(IsFilledFolder));
            OnPropertyChanged(nameof(IsOutlineFolder));
        };
    }

    public bool CanExpand => IsDirectory && (SubFolders.Count > 0 || !IsLoaded);

    private bool _isLoaded;
    public bool IsLoaded
    {
        get => _isLoaded;
        set
        {
            if (_isLoaded == value) return;
            _isLoaded = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(CanExpand));
            OnPropertyChanged(nameof(IsFilledFolder));
            OnPropertyChanged(nameof(IsOutlineFolder));
        }
    }

    private bool _isMissing;
    public bool IsMissing
    {
        get => _isMissing;
        set { _isMissing = value; OnPropertyChanged(); OnPropertyChanged(nameof(Icon)); }
    }

    public bool IsManifest => Name.Equals("manifest.json", StringComparison.OrdinalIgnoreCase);

    public Action<PackFolderItem>? OnExpand { get; set; }

    public string Icon => IsPlaceholder ? "⏳" : (IsMissing ? "⚠️" : (IsDirectory ? "📁" : GetFileIcon(Name)));

    private static string GetFileIcon(string filename)
    {
        var ext = System.IO.Path.GetExtension(filename).ToLowerInvariant();
        return ext switch
        {
            ".json" => "📋",
            ".lang" or ".txt" => "📝",
            ".material" => "🔮",
            _ => "📄"
        };
    }

    private int _textureCount;
    public int TextureCount
    {
        get => _textureCount;
        set
        {
            _textureCount = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsFilledFolder));
            OnPropertyChanged(nameof(IsOutlineFolder));
        }
    }

    private int _ghostCount;
    public int GhostCount
    {
        get => _ghostCount;
        set { _ghostCount = value; OnPropertyChanged(); }
    }

    private int _depth;
    public int Depth
    {
        get => _depth;
        set
        {
            if (_depth == value) return;
            _depth = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsChild));
            OnPropertyChanged(nameof(IsRoot));
        }
    }

    public bool IsChild => _depth > 0;
    public bool IsRoot => _depth == 0;
    public bool IsFilledFolder => IsDirectory && (_textureCount > 0 || SubFolders.Count > 0 || !IsLoaded);
    public bool IsOutlineFolder => IsDirectory && !IsFilledFolder;

    private bool _isSelected;
    public bool IsSelected
    {
        get => _isSelected;
        set { _isSelected = value; OnPropertyChanged(); }
    }

    private bool _isExpanded;
    public bool IsExpanded
    {
        get => _isExpanded;
        set
        {
            if (!CanExpand && value) return;
            if (_isExpanded == value) return;
            _isExpanded = value;
            OnPropertyChanged();
            if (_isExpanded && !IsLoaded && IsDirectory && OnExpand != null)
            {
                OnExpand(this);
                if (SubFolders.Count == 0)
                {
                    _isExpanded = false;
                    OnPropertyChanged();
                }
                OnPropertyChanged(nameof(CanExpand));
            }
        }
    }

    public ObservableCollection<PackFolderItem> SubFolders { get; } = new();

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
