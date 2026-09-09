using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using McTextureGhost.Models;

namespace McTextureGhost.Services;

public class RecentPacksService
{
    private static readonly string SettingsDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "McTextureGhost");

    private static readonly string RecentPacksFilePath = Path.Combine(SettingsDirectory, "recent_packs.json");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public List<RecentPackItem> LoadRecentPacks()
    {
        try
        {
            if (!File.Exists(RecentPacksFilePath))
                return new List<RecentPackItem>();

            var json = File.ReadAllText(RecentPacksFilePath);
            var list = JsonSerializer.Deserialize<List<RecentPackItem>>(json, JsonOptions) ?? new List<RecentPackItem>();

            // Strictly filter for verified packs: folder AND manifest.json must exist
            var verified = new List<RecentPackItem>();
            bool needsResave = false;

            foreach (var item in list)
            {
                if (string.IsNullOrWhiteSpace(item.FolderPath))
                {
                    needsResave = true;
                    continue;
                }

                var fullPath = Path.GetFullPath(item.FolderPath);
                var manifestPath = Path.Combine(fullPath, "manifest.json");

                if (!Directory.Exists(fullPath) || !File.Exists(manifestPath))
                {
                    // Prune deleted or unverified packs
                    needsResave = true;
                    continue;
                }

                item.FolderPath = fullPath;
                var iconPath = Path.Combine(fullPath, "pack_icon.png");
                item.PackIconPath = File.Exists(iconPath) ? iconPath : null;

                verified.Add(item);
            }

            var ordered = verified.OrderByDescending(p => p.LastOpened).Take(3).ToList();

            if (needsResave || ordered.Count != list.Count)
            {
                SaveList(ordered);
            }

            return ordered;
        }
        catch
        {
            return new List<RecentPackItem>();
        }
    }

    public void AddOrUpdatePack(string folderPath)
    {
        if (string.IsNullOrWhiteSpace(folderPath)) return;

        try
        {
            var fullPath = Path.GetFullPath(folderPath);
            var manifestPath = Path.Combine(fullPath, "manifest.json");

            // A pack is ONLY verified if manifest.json exists
            if (!Directory.Exists(fullPath) || !File.Exists(manifestPath))
                return;

            string packName = Path.GetFileName(fullPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
            string? description = null;
            string? version = null;

            try
            {
                var manifestText = File.ReadAllText(manifestPath);
                using var doc = JsonDocument.Parse(manifestText);
                if (doc.RootElement.TryGetProperty("header", out var header))
                {
                    if (header.TryGetProperty("name", out var nameProp))
                    {
                        var n = nameProp.GetString();
                        if (!string.IsNullOrWhiteSpace(n)) packName = n;
                    }

                    if (header.TryGetProperty("description", out var descProp))
                    {
                        description = descProp.GetString();
                    }

                    if (header.TryGetProperty("version", out var verProp) && verProp.ValueKind == JsonValueKind.Array)
                    {
                        var parts = verProp.EnumerateArray().Select(v => v.ToString()).ToList();
                        if (parts.Count > 0) version = string.Join(".", parts);
                    }
                }
            }
            catch
            {
                // Fallback to folder name
            }

            var iconPath = Path.Combine(fullPath, "pack_icon.png");

            var current = LoadRecentPacks();
            var existing = current.FirstOrDefault(p =>
                string.Equals(Path.GetFullPath(p.FolderPath), fullPath, StringComparison.OrdinalIgnoreCase));

            if (existing != null)
            {
                existing.PackName = packName;
                existing.Description = description;
                existing.Version = version;
                existing.PackIconPath = File.Exists(iconPath) ? iconPath : null;
                existing.LastOpened = DateTime.UtcNow;
            }
            else
            {
                current.Insert(0, new RecentPackItem
                {
                    FolderPath = fullPath,
                    PackName = packName,
                    Description = description,
                    Version = version,
                    PackIconPath = File.Exists(iconPath) ? iconPath : null,
                    LastOpened = DateTime.UtcNow
                });
            }

            var ordered = current.OrderByDescending(p => p.LastOpened).Take(3).ToList();
            SaveList(ordered);
        }
        catch
        {
            // Silently ignore I/O failures
        }
    }

    public void RemovePack(string folderPath)
    {
        try
        {
            var fullPath = Path.GetFullPath(folderPath);
            var current = LoadRecentPacks();
            var updated = current.Where(p =>
                !string.Equals(Path.GetFullPath(p.FolderPath), fullPath, StringComparison.OrdinalIgnoreCase)).ToList();

            SaveList(updated);
        }
        catch
        {
        }
    }

    public void ClearAll()
    {
        try
        {
            if (File.Exists(RecentPacksFilePath))
            {
                File.Delete(RecentPacksFilePath);
            }
        }
        catch
        {
        }
    }

    private static void SaveList(List<RecentPackItem> items)
    {
        try
        {
            if (!Directory.Exists(SettingsDirectory))
            {
                Directory.CreateDirectory(SettingsDirectory);
            }

            var json = JsonSerializer.Serialize(items, JsonOptions);
            File.WriteAllText(RecentPacksFilePath, json);
        }
        catch
        {
        }
    }
}
