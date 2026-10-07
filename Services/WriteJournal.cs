using System;
using System.Collections.Concurrent;
using System.IO;

namespace McTextureGhost.Services;

/// <summary>
/// Thread-safe registry that tracks files modified or created by the application itself.
/// Used to suppress redundant FileSystemWatcher events for self-initiated writes.
/// </summary>
public static class WriteJournal
{
    private static readonly ConcurrentDictionary<string, DateTime> _journal = new(StringComparer.OrdinalIgnoreCase);
    private static readonly TimeSpan DefaultTtl = TimeSpan.FromSeconds(6);

    private static string Normalize(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return string.Empty;
        try
        {
            return Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }
        catch
        {
            return path.TrimEnd('/', '\\');
        }
    }

    /// <summary>
    /// Records an upcoming or immediate self-write for a file path, as well as its immediate parent
    /// directory to suppress secondary NTFS folder LastWrite timestamp update events.
    /// </summary>
    public static void RecordWrite(string? fullPath, TimeSpan? ttl = null)
    {
        if (string.IsNullOrWhiteSpace(fullPath)) return;
        var normalized = Normalize(fullPath);
        if (string.IsNullOrEmpty(normalized)) return;

        var expiry = DateTime.UtcNow.Add(ttl ?? DefaultTtl);
        _journal[normalized] = expiry;

        // Also record the parent directory so NTFS folder timestamp updates triggered by writing this file are suppressed
        try
        {
            var parent = Path.GetDirectoryName(normalized);
            if (!string.IsNullOrWhiteSpace(parent))
            {
                var normParent = Normalize(parent);
                if (!string.IsNullOrEmpty(normParent))
                {
                    _journal[normParent] = expiry;
                }
            }
        }
        catch { }
    }

    /// <summary>
    /// Checks whether an event for the specified file path was caused by a self-write.
    /// Cleans up expired entries periodically. Does not consume the entry so multiple events
    /// (e.g. content write + metadata/timestamp update) remain suppressed within the TTL window.
    /// </summary>
    public static bool IsSelfWrite(string? fullPath)
    {
        if (string.IsNullOrWhiteSpace(fullPath)) return false;
        var normalized = Normalize(fullPath);
        if (string.IsNullOrEmpty(normalized)) return false;

        PruneExpired();

        if (_journal.TryGetValue(normalized, out var expiry))
        {
            if (DateTime.UtcNow <= expiry)
            {
                return true;
            }
        }

        return false;
    }

    private static void PruneExpired()
    {
        if (_journal.Count > 50)
        {
            var now = DateTime.UtcNow;
            foreach (var kvp in _journal)
            {
                if (now > kvp.Value)
                {
                    _journal.TryRemove(kvp.Key, out _);
                }
            }
        }
    }
}
