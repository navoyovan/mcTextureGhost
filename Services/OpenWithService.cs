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
    [property: JsonPropertyName("isDefault")] bool IsDefault = false
);

public static class OpenWithService
{
    private static readonly string SettingsFilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "McTextureGhost",
        "custom_editors.json"
    );

    private static readonly List<OpenWithAppDto> _customApps = new();
    private static string? _defaultAppId;
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
                        _defaultAppId = defProp.GetString();
                    }

                    if (root.TryGetProperty("editors", out var editorsProp) && editorsProp.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var item in editorsProp.EnumerateArray())
                        {
                            var id = item.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
                            var name = item.TryGetProperty("name", out var nProp) ? nProp.GetString() : null;
                            var exePath = item.TryGetProperty("exePath", out var pProp) ? pProp.GetString() : null;

                            if (!string.IsNullOrWhiteSpace(id) && !string.IsNullOrWhiteSpace(exePath))
                            {
                                string? iconUrl = GetAppIconDataUrl(exePath);
                                bool isDef = string.Equals(id, _defaultAppId, StringComparison.OrdinalIgnoreCase);
                                _customApps.Add(new OpenWithAppDto(
                                    Id: id,
                                    Name: name ?? Path.GetFileNameWithoutExtension(exePath),
                                    ExePath: exePath,
                                    IconDataUrl: iconUrl,
                                    IsDefault: isDef
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
                    defaultAppId = _defaultAppId,
                    editors = _customApps.Select(a => new
                    {
                        id = a.Id,
                        name = a.Name,
                        exePath = a.ExePath
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
    /// Returns the list of user-configured Open With editors. Default is empty until user adds them.
    /// </summary>
    public static List<OpenWithAppDto> GetOpenWithApps(bool forceRefresh = false)
    {
        lock (_lock)
        {
            EnsureLoaded();

            return _customApps
                .Select(a => a with { IsDefault = string.Equals(a.Id, _defaultAppId, StringComparison.OrdinalIgnoreCase) })
                .OrderByDescending(a => a.IsDefault)
                .ThenBy(a => a.Name)
                .ToList();
        }
    }

    public static OpenWithAppDto? GetDefaultApp()
    {
        lock (_lock)
        {
            EnsureLoaded();
            if (string.IsNullOrEmpty(_defaultAppId)) return null;
            return _customApps.FirstOrDefault(a => string.Equals(a.Id, _defaultAppId, StringComparison.OrdinalIgnoreCase));
        }
    }

    public static OpenWithAppDto? AddApp(string exePath, string? customName = null)
    {
        if (string.IsNullOrWhiteSpace(exePath)) return null;

        lock (_lock)
        {
            EnsureLoaded();

            var cleanPath = Path.GetFullPath(exePath);
            var id = "app_" + Math.Abs(cleanPath.ToLowerInvariant().GetHashCode()).ToString("X8");

            var existing = _customApps.FirstOrDefault(a => string.Equals(a.ExePath, cleanPath, StringComparison.OrdinalIgnoreCase));
            if (existing != null)
            {
                return existing;
            }

            var displayName = !string.IsNullOrWhiteSpace(customName)
                ? customName
                : GetDisplayName(cleanPath, Path.GetFileName(cleanPath));

            var iconUrl = GetAppIconDataUrl(cleanPath);

            var app = new OpenWithAppDto(
                Id: id,
                Name: displayName,
                ExePath: cleanPath,
                IconDataUrl: iconUrl,
                IsDefault: _customApps.Count == 0 // Make default if first editor added
            );

            if (app.IsDefault)
            {
                _defaultAppId = id;
            }

            _customApps.Add(app);
            SaveSettings();
            return app;
        }
    }

    public static bool RemoveApp(string id)
    {
        lock (_lock)
        {
            EnsureLoaded();
            var item = _customApps.FirstOrDefault(a => string.Equals(a.Id, id, StringComparison.OrdinalIgnoreCase));
            if (item != null)
            {
                _customApps.Remove(item);
                if (string.Equals(_defaultAppId, id, StringComparison.OrdinalIgnoreCase))
                {
                    _defaultAppId = _customApps.FirstOrDefault()?.Id;
                }
                SaveSettings();
                return true;
            }
            return false;
        }
    }

    public static bool SetDefaultApp(string? id)
    {
        lock (_lock)
        {
            EnsureLoaded();
            if (string.IsNullOrEmpty(id))
            {
                _defaultAppId = null;
                SaveSettings();
                return true;
            }

            var match = _customApps.FirstOrDefault(a => string.Equals(a.Id, id, StringComparison.OrdinalIgnoreCase));
            if (match != null)
            {
                _defaultAppId = match.Id;
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

        // If no explicit exePath passed, check configured default app
        if (string.IsNullOrWhiteSpace(exePath))
        {
            var defApp = GetDefaultApp();
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
