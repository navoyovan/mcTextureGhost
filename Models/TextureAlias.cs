using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace McTextureGhost.Models;

/// <summary>
/// One entry from terrain_texture.json's texture_data block, resolved against
/// the actual filesystem so the UI can tell "real file" from "ghost".
/// </summary>
public class TextureAlias : INotifyPropertyChanged
{
    /// <summary>The key in texture_data, e.g. "stone", "demo_stone".</summary>
    public required string Alias { get; init; }

    /// <summary>Relative path as declared in JSON, no extension, e.g. "textures/blocks/stone".</summary>
    public required string RelativePath { get; init; }

    /// <summary>Absolute path on disk this alias resolves to (RelativePath + ".png").</summary>
    public required string FullPath { get; set; }

    /// <summary>Block IDs (namespace:name) from blocks.json that reference this alias, if any.</summary>
    public List<string> UsedByBlocks { get; init; } = new();

    private bool _exists;
    public bool Exists
    {
        get => _exists;
        set
        {
            if (_exists == value) return;
            _exists = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(StatusText));
        }
    }

    public string StatusText => Exists ? "OK" : "GHOST";

    public string UsedBySummary => UsedByBlocks.Count == 0
        ? "(unused by any block)"
        : string.Join(", ", UsedByBlocks);

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
