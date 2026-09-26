using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.Json;
using McTextureGhost.Models;

namespace McTextureGhost.Services;

/// <summary>
/// Provides utility routines for archive extraction, reference texture resolution, and companion texture discovery.
/// </summary>
public static class PackArchiveUtility
{
    /// <summary>
    /// Safely extracts entries from a zip archive into a destination folder, preventing Zip Slip directory traversal vulnerabilities.
    /// </summary>
    public static void ExtractZipSafely(string zipPath, string destinationDir, Func<ZipArchiveEntry, bool>? filter = null)
    {
        if (string.IsNullOrWhiteSpace(zipPath) || !File.Exists(zipPath))
            throw new FileNotFoundException("Archive file does not exist.", zipPath);

        if (string.IsNullOrWhiteSpace(destinationDir))
            throw new ArgumentNullException(nameof(destinationDir));

        var fullDestDir = Path.GetFullPath(destinationDir);
        if (!Directory.Exists(fullDestDir))
        {
            Directory.CreateDirectory(fullDestDir);
        }

        using var archive = ZipFile.OpenRead(zipPath);
        foreach (var entry in archive.Entries)
        {
            if (filter != null && !filter(entry))
            {
                continue;
            }

            var destinationPath = Path.GetFullPath(Path.Combine(fullDestDir, entry.FullName));
            if (!destinationPath.StartsWith(fullDestDir, StringComparison.OrdinalIgnoreCase))
            {
                // Prevent Zip Slip vulnerability
                continue;
            }

            if (string.IsNullOrEmpty(entry.Name))
            {
                // Directory entry
                Directory.CreateDirectory(destinationPath);
                continue;
            }

            var parentDir = Path.GetDirectoryName(destinationPath);
            if (!string.IsNullOrEmpty(parentDir) && !Directory.Exists(parentDir))
            {
                Directory.CreateDirectory(parentDir);
            }

            entry.ExtractToFile(destinationPath, overwrite: true);
        }
    }

    /// <summary>
    /// Searches reference pack directories and vanilla samples for a matching authentic source texture file.
    /// </summary>
    public static string? ResolveReferenceTexturePath(string refDir, string targetFullPath, string? relPath, string aliasKey, string? category, string? packRootPath)
    {
        var dirsToSearch = new List<string>();
        if (!string.IsNullOrEmpty(refDir) && Directory.Exists(refDir))
        {
            dirsToSearch.Add(refDir);
        }
        var vanillaDir = CatalogReferenceService.VanillaReferencePackDirectory;
        if (!string.IsNullOrEmpty(vanillaDir) && Directory.Exists(vanillaDir) && !dirsToSearch.Contains(vanillaDir, StringComparer.OrdinalIgnoreCase))
        {
            dirsToSearch.Add(vanillaDir);
        }

        foreach (var searchDir in dirsToSearch)
        {
            var candidates = new List<string>();

            if (!string.IsNullOrEmpty(relPath))
            {
                var cleanRel = relPath.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
                candidates.Add(Path.Combine(searchDir, cleanRel));
                if (!cleanRel.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
                {
                    candidates.Add(Path.Combine(searchDir, cleanRel + ".png"));
                }
            }

            if (!string.IsNullOrEmpty(targetFullPath) && !string.IsNullOrEmpty(packRootPath))
            {
                try
                {
                    var relFromRoot = Path.GetRelativePath(packRootPath, targetFullPath);
                    candidates.Add(Path.Combine(searchDir, relFromRoot));
                }
                catch { }
            }

            var fileName = Path.GetFileName(targetFullPath);
            if (!string.IsNullOrEmpty(fileName))
            {
                candidates.Add(Path.Combine(searchDir, "textures", "blocks", fileName));
                candidates.Add(Path.Combine(searchDir, "textures", "items", fileName));
                candidates.Add(Path.Combine(searchDir, "textures", "entity", fileName));
                candidates.Add(Path.Combine(searchDir, "textures", fileName));
            }

            if (!string.IsNullOrEmpty(aliasKey))
            {
                candidates.Add(Path.Combine(searchDir, "textures", "blocks", $"{aliasKey}.png"));
                candidates.Add(Path.Combine(searchDir, "textures", "items", $"{aliasKey}.png"));
                candidates.Add(Path.Combine(searchDir, "textures", "entity", $"{aliasKey}.png"));
                candidates.Add(Path.Combine(searchDir, "textures", $"{aliasKey}.png"));
            }

            foreach (var path in candidates)
            {
                if (File.Exists(path))
                {
                    return path;
                }
            }

            // Fallback: search textures folder for matching file name
            try
            {
                var texturesDir = Path.Combine(searchDir, "textures");
                if (Directory.Exists(texturesDir))
                {
                    var searchPattern = !string.IsNullOrEmpty(fileName) ? fileName : $"{aliasKey}.png";
                    var match = Directory.EnumerateFiles(texturesDir, searchPattern, SearchOption.AllDirectories).FirstOrDefault();
                    if (match != null && File.Exists(match))
                    {
                        return match;
                    }
                }
            }
            catch { }
        }

        return null;
    }

    /// <summary>
    /// Discovers and copies companion atlas or flipbook textures when extracting reference assets into a user pack.
    /// </summary>
    public static void ExtractCompanionAtlasIfExists(string refDir, string srcPath, string targetFullPath, string? aliasKey, string packRootPath, VanillaData? vanilla)
    {
        try
        {
            var searchDirs = new List<string>();
            if (!string.IsNullOrEmpty(refDir) && Directory.Exists(refDir))
                searchDirs.Add(refDir);
            var vanillaDir = CatalogReferenceService.VanillaReferencePackDirectory;
            if (!string.IsNullOrEmpty(vanillaDir) && Directory.Exists(vanillaDir) && !searchDirs.Contains(vanillaDir, StringComparer.OrdinalIgnoreCase))
                searchDirs.Add(vanillaDir);

            // 1. Flipbook-based discovery & registration
            if (!string.IsNullOrEmpty(aliasKey) && vanilla != null)
            {
                if (vanilla.RawFlipbookJson.TryGetValue(aliasKey, out var rawFbJson))
                {
                    JsonWriterService.AppendFlipbookIfNotExists(packRootPath, aliasKey, rawFbJson);

                    try
                    {
                        using var doc = JsonDocument.Parse(rawFbJson);
                        if (doc.RootElement.TryGetProperty("flipbook_texture", out var fbProp))
                        {
                            var fbTex = fbProp.GetString()?.Replace('\\', '/').TrimStart('/');
                            if (!string.IsNullOrEmpty(fbTex))
                            {
                                foreach (var sDir in searchDirs)
                                {
                                    var fbSrcPng = Path.Combine(sDir, fbTex + ".png");
                                    var fbSrcTga = Path.Combine(sDir, fbTex + ".tga");
                                    var fbSrcExact = Path.Combine(sDir, fbTex);

                                    string? chosenSrc = null;
                                    string ext = ".png";
                                    if (File.Exists(fbSrcPng)) { chosenSrc = fbSrcPng; ext = ".png"; }
                                    else if (File.Exists(fbSrcTga)) { chosenSrc = fbSrcTga; ext = ".tga"; }
                                    else if (File.Exists(fbSrcExact)) { chosenSrc = fbSrcExact; ext = Path.GetExtension(fbSrcExact); }

                                    if (chosenSrc != null)
                                    {
                                        var targetAtlasPath = Path.Combine(packRootPath, fbTex + ext);
                                        var targetDir = Path.GetDirectoryName(targetAtlasPath);
                                        if (!string.IsNullOrEmpty(targetDir) && !Directory.Exists(targetDir))
                                            Directory.CreateDirectory(targetDir);

                                        File.Copy(chosenSrc, targetAtlasPath, overwrite: true);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    catch { }
                }
            }

            // 2. Naming-convention companion discovery (e.g. compass_atlas.png, watch_atlas.png, clock_atlas.png, etc.)
            var fnWithoutExt = Path.GetFileNameWithoutExtension(srcPath);
            var baseName = fnWithoutExt;
            if (baseName.EndsWith("_item", StringComparison.OrdinalIgnoreCase))
                baseName = baseName.Substring(0, baseName.Length - 5);

            var atlasCandidates = new List<string>
            {
                $"{baseName}_atlas.png",
                $"{baseName}_atlas.tga",
                $"{fnWithoutExt}_atlas.png",
                $"{fnWithoutExt}_atlas.tga"
            };

            if (baseName.Equals("clock", StringComparison.OrdinalIgnoreCase) || baseName.Equals("watch", StringComparison.OrdinalIgnoreCase))
            {
                atlasCandidates.Add("watch_atlas.png");
                atlasCandidates.Add("watch_atlas.tga");
                atlasCandidates.Add("clock_atlas.png");
                atlasCandidates.Add("clock_atlas.tga");
            }
            else if (baseName.Equals("compass", StringComparison.OrdinalIgnoreCase))
            {
                atlasCandidates.Add("compass_atlas.png");
                atlasCandidates.Add("compass_atlas.tga");
            }
            else if (baseName.Equals("recovery_compass", StringComparison.OrdinalIgnoreCase))
            {
                atlasCandidates.Add("recovery_compass_atlas.png");
                atlasCandidates.Add("recovery_compass_atlas.tga");
            }
            else if (baseName.Equals("lodestonecompass", StringComparison.OrdinalIgnoreCase) || baseName.Equals("lodestone_compass", StringComparison.OrdinalIgnoreCase))
            {
                atlasCandidates.Add("lodestonecompass_atlas.png");
                atlasCandidates.Add("lodestonecompass_atlas.tga");
                atlasCandidates.Add("lodestone_compass_atlas.png");
                atlasCandidates.Add("lodestone_compass_atlas.tga");
            }

            var srcDir = Path.GetDirectoryName(srcPath);
            var destDir = Path.GetDirectoryName(targetFullPath);

            foreach (var candName in atlasCandidates.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                string? srcAtlasFound = null;

                // Check in same source directory first
                if (!string.IsNullOrEmpty(srcDir))
                {
                    var candPath = Path.Combine(srcDir, candName);
                    if (File.Exists(candPath))
                    {
                        srcAtlasFound = candPath;
                    }
                }

                // Check in searchDirs/textures/items
                if (srcAtlasFound == null)
                {
                    foreach (var sDir in searchDirs)
                    {
                        var candPath = Path.Combine(sDir, "textures", "items", candName);
                        if (File.Exists(candPath))
                        {
                            srcAtlasFound = candPath;
                            break;
                        }
                    }
                }

                if (srcAtlasFound != null)
                {
                    if (!string.IsNullOrEmpty(destDir))
                    {
                        if (!Directory.Exists(destDir)) Directory.CreateDirectory(destDir);
                        var destAtlasPath = Path.Combine(destDir, candName);
                        File.Copy(srcAtlasFound, destAtlasPath, overwrite: true);
                    }
                }
            }
        }
        catch { }
    }
}
