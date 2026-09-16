using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json.Serialization;
using Microsoft.Win32;

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
    private static List<OpenWithAppDto>? _cachedApps;
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

    /// <summary>
    /// Returns the list of registered Open With image editors and viewers.
    /// </summary>
    public static List<OpenWithAppDto> GetOpenWithApps(bool forceRefresh = false)
    {
        lock (_lock)
        {
            if (_cachedApps != null && !forceRefresh)
            {
                return _cachedApps;
            }

            var appMap = new Dictionary<string, OpenWithAppDto>(StringComparer.OrdinalIgnoreCase);
            string? defaultProgId = GetDefaultProgId(".png");

            // 1. Query HKCU FileExts OpenWithList
            try
            {
                using var extKey = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.png\OpenWithList");
                if (extKey != null)
                {
                    foreach (var valName in extKey.GetValueNames())
                    {
                        if (string.Equals(valName, "MRUList", StringComparison.OrdinalIgnoreCase)) continue;
                        var exeName = extKey.GetValue(valName)?.ToString();
                        if (!string.IsNullOrWhiteSpace(exeName))
                        {
                            TryAddApp(appMap, exeName, defaultProgId);
                        }
                    }
                }
            }
            catch { }

            // 2. Query HKCR .png OpenWithList
            try
            {
                using var extKey = Registry.ClassesRoot.OpenSubKey(@".png\OpenWithList");
                if (extKey != null)
                {
                    foreach (var subKeyName in extKey.GetSubKeyNames())
                    {
                        TryAddApp(appMap, subKeyName, defaultProgId);
                    }
                }
            }
            catch { }

            // 3. Look for standard known editors if not already populated
            var knownCandidates = new[]
            {
                "mspaint.exe",
                "FireAlpaca.exe",
                "Photoshop.exe",
                "Aseprite.exe",
                "PaintDotNet.exe",
                "gimp.exe",
                "Blockbench.exe",
                "krita.exe",
                "firefox.exe",
                "chrome.exe",
                "Photos.exe",
                "Code.exe"
            };

            foreach (var candidate in knownCandidates)
            {
                TryAddApp(appMap, candidate, defaultProgId);
            }

            _cachedApps = appMap.Values.OrderByDescending(a => a.IsDefault).ThenBy(a => a.Name).ToList();
            return _cachedApps;
        }
    }

    private static void TryAddApp(Dictionary<string, OpenWithAppDto> appMap, string rawExe, string? defaultProgId)
    {
        if (string.IsNullOrWhiteSpace(rawExe)) return;

        // Skip internal/non-editor entries
        if (rawExe.Contains("PickerHost", StringComparison.OrdinalIgnoreCase) ||
            rawExe.Contains("PhoneExperience", StringComparison.OrdinalIgnoreCase) ||
            rawExe.Contains("nearby_share", StringComparison.OrdinalIgnoreCase) ||
            rawExe.Contains("McTextureGhost", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        string? resolvedPath = ResolveExePath(rawExe);
        if (string.IsNullOrEmpty(resolvedPath) && !string.Equals(rawExe, "mspaint.exe", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        string effectivePath = resolvedPath ?? rawExe;
        string id = Path.GetFileNameWithoutExtension(rawExe).ToLowerInvariant();
        if (appMap.ContainsKey(id) || appMap.ContainsKey(effectivePath)) return;

        string displayName = GetDisplayName(effectivePath, rawExe);
        string? iconUrl = GetAppIconDataUrl(effectivePath);
        bool isDefault = defaultProgId != null && (
            defaultProgId.Contains(id, StringComparison.OrdinalIgnoreCase) ||
            (id.Equals("mspaint", StringComparison.OrdinalIgnoreCase) && defaultProgId.Contains("Paint", StringComparison.OrdinalIgnoreCase))
        );

        appMap[id] = new OpenWithAppDto(
            Id: id,
            Name: displayName,
            ExePath: effectivePath,
            IconDataUrl: iconUrl,
            IsDefault: isDefault
        );
    }

    private static string? ResolveExePath(string exeName)
    {
        if (File.Exists(exeName)) return exeName;

        // 1. Check HKCR\Applications\<exe>\shell\open\command
        try
        {
            using var cmdKey = Registry.ClassesRoot.OpenSubKey($@"Applications\{exeName}\shell\open\command");
            var cmd = cmdKey?.GetValue("")?.ToString();
            if (!string.IsNullOrWhiteSpace(cmd))
            {
                var parsed = ParseExeFromCommand(cmd);
                if (!string.IsNullOrEmpty(parsed) && File.Exists(parsed)) return parsed;
            }
        }
        catch { }

        // 2. Check App Paths (HKLM & HKCU)
        try
        {
            using var hklmAppPath = Registry.LocalMachine.OpenSubKey($@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exeName}");
            var path = hklmAppPath?.GetValue("")?.ToString();
            if (!string.IsNullOrWhiteSpace(path) && File.Exists(path)) return path;

            using var hkcuAppPath = Registry.CurrentUser.OpenSubKey($@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exeName}");
            path = hkcuAppPath?.GetValue("")?.ToString();
            if (!string.IsNullOrWhiteSpace(path) && File.Exists(path)) return path;
        }
        catch { }

        // 3. Known common application paths
        var knownLocations = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "FireAlpaca", "FireAlpaca64", "FireAlpaca20", "FireAlpaca.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "FireAlpaca", "FireAlpaca.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "paint.net", "PaintDotNet.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Steam", "steamapps", "common", "Aseprite", "Aseprite.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Blockbench", "Blockbench.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Microsoft VS Code", "Code.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "mspaint.exe")
        };

        foreach (var loc in knownLocations)
        {
            if (File.Exists(loc) && Path.GetFileName(loc).Equals(exeName, StringComparison.OrdinalIgnoreCase))
            {
                return loc;
            }
        }

        // 4. Try PATH environment
        var envPath = Environment.GetEnvironmentVariable("PATH");
        if (envPath != null)
        {
            foreach (var folder in envPath.Split(Path.PathSeparator))
            {
                try
                {
                    var full = Path.Combine(folder.Trim(), exeName);
                    if (File.Exists(full)) return full;
                }
                catch { }
            }
        }

        return null;
    }

    private static string ParseExeFromCommand(string cmd)
    {
        var trimmed = cmd.Trim();
        if (trimmed.StartsWith("\""))
        {
            int nextQuote = trimmed.IndexOf('"', 1);
            if (nextQuote > 1)
            {
                return trimmed.Substring(1, nextQuote - 1);
            }
        }
        int spaceIdx = trimmed.IndexOf(' ');
        return spaceIdx > 0 ? trimmed.Substring(0, spaceIdx) : trimmed;
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

    private static string? GetDefaultProgId(string extension)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey($@"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\{extension}\UserChoice");
            return key?.GetValue("ProgId")?.ToString();
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

        if (!string.IsNullOrWhiteSpace(exePath))
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = exePath,
                    Arguments = $"\"{fullPath}\"",
                    UseShellExecute = true
                };
                Process.Start(psi);
                return;
            }
            catch { }
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
