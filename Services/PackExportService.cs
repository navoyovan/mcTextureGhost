using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;

namespace McTextureGhost.Services;

public static class PackExportService
{
    private static readonly string[] ExcludedFolders = new[]
    {
        ".git",
        ".github",
        ".vscode",
        ".idea",
        "node_modules",
        "bin",
        "obj",
        ".vs"
    };

    private static readonly string[] ExcludedFiles = new[]
    {
        "thumbs.db",
        ".ds_store",
        "desktop.ini"
    };

    /// <summary>
    /// Exports the resource pack at packRoot as a .mcpack ZIP archive.
    /// </summary>
    public static (bool Success, string Message, string? OutputPath) ExportAsMcpack(string packRoot, string? destinationPath = null)
    {
        if (string.IsNullOrWhiteSpace(packRoot) || !Directory.Exists(packRoot))
        {
            return (false, "Resource pack folder not found.", null);
        }

        try
        {
            var manifestPath = Path.Combine(packRoot, "manifest.json");
            if (!File.Exists(manifestPath))
            {
                Debug.WriteLine("[PackExportService] Warning: exporting pack without manifest.json");
            }

            if (string.IsNullOrWhiteSpace(destinationPath))
            {
                var folderName = Path.GetFileName(packRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
                if (string.IsNullOrWhiteSpace(folderName)) folderName = "ResourcePack";
                var desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                destinationPath = Path.Combine(desktop, $"{folderName}.mcpack");
            }

            var destDir = Path.GetDirectoryName(destinationPath);
            if (!string.IsNullOrEmpty(destDir) && !Directory.Exists(destDir))
            {
                Directory.CreateDirectory(destDir);
            }

            // Remove existing destination file if present
            if (File.Exists(destinationPath))
            {
                File.Delete(destinationPath);
            }

            // Create ZIP with .mcpack extension
            using (var zipToOpen = new FileStream(destinationPath, FileMode.Create))
            using (var archive = new ZipArchive(zipToOpen, ZipArchiveMode.Create))
            {
                var allFiles = Directory.EnumerateFiles(packRoot, "*", SearchOption.AllDirectories);

                foreach (var file in allFiles)
                {
                    var relPath = file.Substring(packRoot.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                    var normalizedRel = relPath.Replace('\\', '/');
                    var parts = normalizedRel.Split('/');

                    // Check excluded directory segments
                    if (parts.Any(p => ExcludedFolders.Contains(p, StringComparer.OrdinalIgnoreCase)))
                    {
                        continue;
                    }

                    // Check excluded files or temporary extensions
                    var fileName = Path.GetFileName(file);
                    if (ExcludedFiles.Contains(fileName, StringComparer.OrdinalIgnoreCase) ||
                        fileName.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase) ||
                        fileName.EndsWith(".crswap", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    // Add entry to ZIP archive
                    archive.CreateEntryFromFile(file, normalizedRel, CompressionLevel.Optimal);
                }
            }

            return (true, $"Exported successfully to {destinationPath}", destinationPath);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[PackExportService] Export failed: {ex.Message}");
            return (false, ex.Message, null);
        }
    }
}
