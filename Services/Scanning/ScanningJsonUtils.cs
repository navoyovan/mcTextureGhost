using System.IO;
using System.Text.Json;

namespace McTextureGhost.Services.Scanning;

/// <summary>
/// Common JSON reading and sharing configuration for pack scanners.
/// </summary>
public static class ScanningJsonUtils
{
    public static readonly JsonDocumentOptions ScanDocOptions = new()
    {
        AllowTrailingCommas = true,
        CommentHandling = JsonCommentHandling.Skip
    };

    /// <summary>
    /// Opens a pack JSON file for reading with <see cref="FileShare.ReadWrite"/> so
    /// background rescans never lock out concurrent writers.
    /// </summary>
    public static FileStream OpenSharedRead(string path) =>
        new(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
}
