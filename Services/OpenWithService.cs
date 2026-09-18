using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace McTextureGhost.Services;

public record OpenWithAppDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("exePath")] string ExePath,
    [property: JsonPropertyName("iconDataUrl")] string? IconDataUrl = null,
    [property: JsonPropertyName("isDefault")] bool IsDefault = false,
    [property: JsonPropertyName("category")] string Category = "image"
);

public static class OpenWithService
{
    private static readonly string SettingsFilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "McTextureGhost",
        "custom_editors.json"
    );

    private static readonly List<OpenWithAppDto> _customApps = new();
    private static string? _defaultImageAppId;
    private static string? _defaultJsonAppId;
    private static bool _loaded = false;
    private static readonly object _lock = new();

    [DllImport("shell32.dll", SetLastError = true)]
    private static extern int SHOpenWithDialog(IntPtr hwndParent, ref OPENASINFO poainfo);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct OPENASINFO
    {
        [MarshalAs(UnmanagedType.LPTStr)]
        public string pcszFile;
        [MarshalAs(UnmanagedType.LPTStr)]
        public string? pcszClass;
        public uint oaifInFlags;
    }

    private const uint OAIF_ALLOW_REGISTRATION = 0x00000001;
    private const uint OAIF_REGISTER_EXT = 0x00000002;
    private const uint OAIF_EXEC = 0x00000004;

    private static void EnsureLoaded()
    {
        lock (_lock)
        {
            if (_loaded) return;
            _loaded = true;

            try
            {
                if (File.Exists(SettingsFilePath))
                {
                    var json = File.ReadAllText(SettingsFilePath);
                    using var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;

                    if (root.TryGetProperty("defaultAppId", out var defProp) && defProp.ValueKind == JsonValueKind.String)
                    {
                        _defaultImageAppId = defProp.GetString();
                    }
                    if (root.TryGetProperty("defaultImageAppId", out var defImgProp) && defImgProp.ValueKind == JsonValueKind.String)
                    {
                        _defaultImageAppId = defImgProp.GetString();
                    }
                    if (root.TryGetProperty("defaultJsonAppId", out var defJsonProp) && defJsonProp.ValueKind == JsonValueKind.String)
                    {
                        _defaultJsonAppId = defJsonProp.GetString();
                    }

                    if (root.TryGetProperty("editors", out var editorsProp) && editorsProp.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var item in editorsProp.EnumerateArray())
                        {
                            var id = item.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
                            var name = item.TryGetProperty("name", out var nProp) ? nProp.GetString() : null;
                            var exePath = item.TryGetProperty("exePath", out var pProp) ? pProp.GetString() : null;
                            var category = item.TryGetProperty("category", out var cProp) ? cProp.GetString() : "image";
                            if (string.IsNullOrWhiteSpace(category)) category = "image";

                            if (!string.IsNullOrWhiteSpace(id) && !string.IsNullOrWhiteSpace(exePath))
                            {
                                string? iconUrl = GetAppIconDataUrl(exePath);
                                string? activeDefaultId = category == "json" ? _defaultJsonAppId : _defaultImageAppId;
                                bool isDef = string.Equals(id, activeDefaultId, StringComparison.OrdinalIgnoreCase);
                                _customApps.Add(new OpenWithAppDto(
                                    Id: id,
                                    Name: name ?? Path.GetFileNameWithoutExtension(exePath),
                                    ExePath: exePath,
                                    IconDataUrl: iconUrl,
                                    IsDefault: isDef,
                                    Category: category
                                ));
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[OpenWithService] Failed to load custom editors: {ex.Message}");
            }
        }
    }

    private static void SaveSettings()
    {
        lock (_lock)
        {
            try
            {
                var dir = Path.GetDirectoryName(SettingsFilePath);
                if (dir != null && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                var data = new
                {
                    defaultImageAppId = _defaultImageAppId,
                    defaultJsonAppId = _defaultJsonAppId,
                    editors = _customApps.Select(a => new
                    {
                        id = a.Id,
                        name = a.Name,
                        exePath = a.ExePath,
                        category = a.Category
                    }).ToList()
                };

                var options = new JsonSerializerOptions { WriteIndented = true };
                File.WriteAllText(SettingsFilePath, JsonSerializer.Serialize(data, options));
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[OpenWithService] Failed to save custom editors: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Returns the list of user-configured Open With editors, optionally filtered by category ("image" or "json").
    /// </summary>
    public static List<OpenWithAppDto> GetOpenWithApps(string? category = null, bool forceRefresh = false)
    {
        lock (_lock)
        {
            EnsureLoaded();

            var query = _customApps.AsEnumerable();
            if (!string.IsNullOrWhiteSpace(category))
            {
                query = query.Where(a => string.Equals(a.Category, category, StringComparison.OrdinalIgnoreCase));
            }

            return query
                .Select(a =>
                {
                    string? activeDefaultId = string.Equals(a.Category, "json", StringComparison.OrdinalIgnoreCase)
                        ? _defaultJsonAppId
                        : _defaultImageAppId;
                    return a with { IsDefault = string.Equals(a.Id, activeDefaultId, StringComparison.OrdinalIgnoreCase) };
                })
                .OrderByDescending(a => a.IsDefault)
                .ThenBy(a => a.Name)
                .ToList();
        }
    }

    public static OpenWithAppDto? GetDefaultApp(string category = "image")
    {
        lock (_lock)
        {
            EnsureLoaded();
            string? activeDefaultId = string.Equals(category, "json", StringComparison.OrdinalIgnoreCase)
                ? _defaultJsonAppId
                : _defaultImageAppId;

            if (string.IsNullOrEmpty(activeDefaultId)) return null;
            return _customApps.FirstOrDefault(a => string.Equals(a.Id, activeDefaultId, StringComparison.OrdinalIgnoreCase));
        }
    }

    public static OpenWithAppDto? AddApp(string exePath, string? customName = null, string category = "image")
    {
        if (string.IsNullOrWhiteSpace(exePath)) return null;

        lock (_lock)
        {
            EnsureLoaded();

            var cleanPath = Path.GetFullPath(exePath);
            var cleanCategory = string.Equals(category, "json", StringComparison.OrdinalIgnoreCase) ? "json" : "image";
            var id = "app_" + Math.Abs($"{cleanCategory}:{cleanPath.ToLowerInvariant()}".GetHashCode()).ToString("X8");

            var existing = _customApps.FirstOrDefault(a =>
                string.Equals(a.ExePath, cleanPath, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(a.Category, cleanCategory, StringComparison.OrdinalIgnoreCase));

            if (existing != null)
            {
                return existing;
            }

            var displayName = !string.IsNullOrWhiteSpace(customName)
                ? customName
                : GetDisplayName(cleanPath, Path.GetFileName(cleanPath));

            var iconUrl = GetAppIconDataUrl(cleanPath);

            var existingInCategory = _customApps.Count(a => string.Equals(a.Category, cleanCategory, StringComparison.OrdinalIgnoreCase));
            bool isFirstInCategory = existingInCategory == 0;

            var app = new OpenWithAppDto(
                Id: id,
                Name: displayName,
                ExePath: cleanPath,
                IconDataUrl: iconUrl,
                IsDefault: isFirstInCategory,
                Category: cleanCategory
            );

            if (app.IsDefault)
            {
                if (cleanCategory == "json") _defaultJsonAppId = id;
                else _defaultImageAppId = id;
            }

            _customApps.Add(app);
            SaveSettings();
            return app;
        }
    }

    public static bool RemoveApp(string id, string? category = null)
    {
        lock (_lock)
        {
            EnsureLoaded();
            var item = _customApps.FirstOrDefault(a => string.Equals(a.Id, id, StringComparison.OrdinalIgnoreCase));
            if (item != null)
            {
                _customApps.Remove(item);
                if (string.Equals(_defaultImageAppId, id, StringComparison.OrdinalIgnoreCase))
                {
                    _defaultImageAppId = _customApps.FirstOrDefault(a => string.Equals(a.Category, "image", StringComparison.OrdinalIgnoreCase))?.Id;
                }
                if (string.Equals(_defaultJsonAppId, id, StringComparison.OrdinalIgnoreCase))
                {
                    _defaultJsonJsonIdOrDefault(item.Category);
                }
                SaveSettings();
                return true;
            }
            return false;
        }
    }

    private static void _defaultJsonJsonIdOrDefault(string category)
    {
        _defaultJsonAppId = _customApps.FirstOrDefault(a => string.Equals(a.Category, "json", StringComparison.OrdinalIgnoreCase))?.Id;
    }

    public static bool SetDefaultApp(string? id, string category = "image")
    {
        lock (_lock)
        {
            EnsureLoaded();
            bool isJson = string.Equals(category, "json", StringComparison.OrdinalIgnoreCase);

            if (string.IsNullOrEmpty(id))
            {
                if (isJson) _defaultJsonAppId = null;
                else _defaultImageAppId = null;
                SaveSettings();
                return true;
            }

            var match = _customApps.FirstOrDefault(a => string.Equals(a.Id, id, StringComparison.OrdinalIgnoreCase));
            if (match != null)
            {
                if (isJson || string.Equals(match.Category, "json", StringComparison.OrdinalIgnoreCase))
                {
                    _defaultJsonAppId = match.Id;
                }
                else
                {
                    _defaultImageAppId = match.Id;
                }
                SaveSettings();
                return true;
            }
            return false;
        }
    }

    private static string GetDisplayName(string exePath, string rawName)
    {
        if (File.Exists(exePath))
        {
            try
            {
                var vi = FileVersionInfo.GetVersionInfo(exePath);
                if (!string.IsNullOrWhiteSpace(vi.FileDescription))
                    return vi.FileDescription;
                if (!string.IsNullOrWhiteSpace(vi.ProductName))
                    return vi.ProductName;
            }
            catch { }
        }

        var baseName = Path.GetFileNameWithoutExtension(rawName);
        if (baseName.Equals("mspaint", StringComparison.OrdinalIgnoreCase)) return "Paint";
        if (baseName.Equals("firefox", StringComparison.OrdinalIgnoreCase)) return "Firefox";
        if (baseName.Equals("chrome", StringComparison.OrdinalIgnoreCase)) return "Google Chrome";
        if (baseName.Equals("Code", StringComparison.OrdinalIgnoreCase)) return "Visual Studio Code";
        if (baseName.Equals("notepad", StringComparison.OrdinalIgnoreCase)) return "Notepad";
        if (baseName.Equals("notepad++", StringComparison.OrdinalIgnoreCase)) return "Notepad++";
        return baseName;
    }

    private static string? GetAppIconDataUrl(string exePath)
    {
        if (!File.Exists(exePath)) return null;

        try
        {
            using var icon = Icon.ExtractAssociatedIcon(exePath);
            if (icon == null) return null;

            using var bmp = icon.ToBitmap();
            using var ms = new MemoryStream();
            bmp.Save(ms, ImageFormat.Png);
            return $"data:image/png;base64,{Convert.ToBase64String(ms.ToArray())}";
        }
        catch
        {
            return null;
        }
    }

    public static void OpenFileWith(string fullPath, string? exePath = null, bool chooseDialog = false, IntPtr parentHwnd = default)
    {
        if (!File.Exists(fullPath)) return;

        if (chooseDialog)
        {
            try
            {
                var info = new OPENASINFO
                {
                    pcszFile = fullPath,
                    pcszClass = null,
                    oaifInFlags = OAIF_EXEC | OAIF_ALLOW_REGISTRATION | OAIF_REGISTER_EXT
                };
                int hr = SHOpenWithDialog(parentHwnd, ref info);
                if (hr != 0)
                {
                    OpenWithLauncher.Show(fullPath);
                }
            }
            catch
            {
                OpenWithLauncher.Show(fullPath);
            }
            return;
        }

        var ext = Path.GetExtension(fullPath).ToLowerInvariant();
        bool isJsonOrText = ext is ".json" or ".material" or ".lang" or ".txt";
        string category = isJsonOrText ? "json" : "image";

        // If no explicit exePath passed, check configured default app for this category
        if (string.IsNullOrWhiteSpace(exePath))
        {
            var defApp = GetDefaultApp(category);
            if (defApp != null && !string.IsNullOrWhiteSpace(defApp.ExePath))
            {
                exePath = defApp.ExePath;
            }
        }

        if (!string.IsNullOrWhiteSpace(exePath))
        {
            try
            {
                var fileName = Path.GetFileName(exePath);
                // Handle packaged Paint on modern Windows
                if (fileName.Equals("mspaint.exe", StringComparison.OrdinalIgnoreCase) ||
                    fileName.Equals("mspaint", StringComparison.OrdinalIgnoreCase))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "mspaint",
                        Arguments = $"\"{fullPath}\"",
                        UseShellExecute = true
                    });
                    return;
                }

                var psi = new ProcessStartInfo
                {
                    FileName = exePath,
                    Arguments = $"\"{fullPath}\"",
                    UseShellExecute = true
                };
                Process.Start(psi);
                return;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[OpenWithService] Custom exe launch failed: {ex.Message}");
            }
        }

        // If NO default app is configured and it is a JSON/text file,
        // trigger native Windows Open With dialog so it never silently fails or opens in wrong tool
        if (isJsonOrText)
        {
            OpenWithLauncher.Show(fullPath);
            return;
        }

        // Default shell launch
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = fullPath,
                UseShellExecute = true
            };
            Process.Start(psi);
        }
        catch
        {
            OpenWithLauncher.Show(fullPath);
        }
    }
}
