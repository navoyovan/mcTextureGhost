using System;
using System.IO;

namespace McTextureGhost.Models;

public class RecentPackItem
{
    public string FolderPath { get; set; } = string.Empty;
    public string PackName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? PackIconPath { get; set; }
    public bool HasPackIcon => !string.IsNullOrEmpty(PackIconPath) && File.Exists(PackIconPath);
    public DateTime LastOpened { get; set; } = DateTime.UtcNow;
    public string? Version { get; set; }

    public string RelativeTime
    {
        get
        {
            var span = DateTime.UtcNow - LastOpened;
            if (span.TotalMinutes < 1) return "Just now";
            if (span.TotalMinutes < 60) return $"{(int)span.TotalMinutes}m ago";
            if (span.TotalHours < 24) return $"{(int)span.TotalHours}h ago";
            if (span.TotalDays < 2) return "Yesterday";
            if (span.TotalDays < 7) return $"{(int)span.TotalDays}d ago";
            return LastOpened.ToLocalTime().ToString("MMM d");
        }
    }

    public string DisplayFolder
    {
        get
        {
            if (string.IsNullOrEmpty(FolderPath)) return string.Empty;
            try
            {
                var dirName = Path.GetFileName(FolderPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
                return string.IsNullOrEmpty(dirName) ? FolderPath : dirName;
            }
            catch
            {
                return FolderPath;
            }
        }
    }
}
