using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using McTextureGhost.Models;
using McTextureGhost.Services;
using McTextureGhost.ViewModels;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace McTextureGhost.Views;

public partial class MainWindow : Wpf.Ui.Controls.FluentWindow
{
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE_OLD = 19;

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT point);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X, Y; }

    private const int WM_NCLBUTTONDOWN = 0xA1;
    private const int HTCAPTION = 0x2;
    private const int HTLEFT = 10;
    private const int HTRIGHT = 11;
    private const int HTTOP = 12;
    private const int HTTOPLEFT = 13;
    private const int HTTOPRIGHT = 14;
    private const int HTBOTTOM = 15;
    private const int HTBOTTOMLEFT = 16;
    private const int HTBOTTOMRIGHT = 17;
    private const int WM_NCHITTEST = 0x0084;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int RESIZE_BORDER_PX = 8;

#if DEBUG
    private const bool IsDebugMode = true;
#else
    private const bool IsDebugMode = false;
#endif

    private IIpcBridgeService? _ipcBridge;
    public IIpcBridgeService? IpcBridge => _ipcBridge;
    public MainViewModel ViewModel => (MainViewModel)DataContext;
    public Microsoft.Web.WebView2.Wpf.WebView2 BrowserView => WebView;

    public MainWindow()
    {
        InitializeComponent();

        SourceInitialized += (s, e) =>
        {
            var handle = new WindowInteropHelper(this).Handle;
            int darkMode = 1;
            if (DwmSetWindowAttribute(handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref darkMode, sizeof(int)) != 0)
            {
                DwmSetWindowAttribute(handle, DWMWA_USE_IMMERSIVE_DARK_MODE_OLD, ref darkMode, sizeof(int));
            }

            HwndSource.FromHwnd(handle)?.AddHook(MainWindowWndProc);
            WebView.MessageHook += WebView_MessageHook;
        };

        Loaded += MainWindow_Loaded;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await InitializeWebViewAsync();
    }

    private IntPtr WebView_MessageHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg != WM_NCHITTEST || WindowState == WindowState.Maximized)
        {
            if (msg != WM_LBUTTONDOWN || WindowState == WindowState.Maximized || !GetCursorPos(out var cursor))
                return IntPtr.Zero;

            int mouseHit = GetResizeHit(cursor.X, cursor.Y);
            if (mouseHit == 0)
                return IntPtr.Zero;

            ReleaseCapture();
            SendMessage(new WindowInteropHelper(this).Handle, WM_NCLBUTTONDOWN,
                (IntPtr)mouseHit, IntPtr.Zero);
            handled = true;
            return IntPtr.Zero;
        }

        // Let the top-level WPF window handle only its resize pixels. The
        // rest of the WebView remains a normal interactive child HWND.
        var windowHandle = new WindowInteropHelper(this).Handle;
        if (!GetWindowRect(windowHandle, out var rect))
            return IntPtr.Zero;

        int x = unchecked((short)(lParam.ToInt32() & 0xFFFF));
        int y = unchecked((short)((lParam.ToInt32() >> 16) & 0xFFFF));
        int hit = GetResizeHit(x, y);
        if (hit == 0)
            return IntPtr.Zero;

        handled = true;
        return new IntPtr(hit);
    }

    private int GetResizeHit(int x, int y)
    {
        var windowHandle = new WindowInteropHelper(this).Handle;
        if (!GetWindowRect(windowHandle, out var rect))
            return 0;

        bool left = x < rect.Left + RESIZE_BORDER_PX;
        bool right = x >= rect.Right - RESIZE_BORDER_PX;
        bool top = y < rect.Top + RESIZE_BORDER_PX;
        bool bottom = y >= rect.Bottom - RESIZE_BORDER_PX;
        if (!left && !right && !top && !bottom)
            return 0;

        return top ? (left ? HTTOPLEFT : right ? HTTOPRIGHT : HTTOP)
            : bottom ? (left ? HTBOTTOMLEFT : right ? HTBOTTOMRIGHT : HTBOTTOM)
            : left ? HTLEFT : HTRIGHT;
    }

    private IntPtr MainWindowWndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg != WM_NCHITTEST || WindowState == WindowState.Maximized || !GetWindowRect(hwnd, out var rect))
            return IntPtr.Zero;

        int x = unchecked((short)(lParam.ToInt32() & 0xFFFF));
        int y = unchecked((short)((lParam.ToInt32() >> 16) & 0xFFFF));
        bool left = x < rect.Left + RESIZE_BORDER_PX;
        bool right = x >= rect.Right - RESIZE_BORDER_PX;
        bool top = y < rect.Top + RESIZE_BORDER_PX;
        bool bottom = y >= rect.Bottom - RESIZE_BORDER_PX;
        if (!left && !right && !top && !bottom)
            return IntPtr.Zero;

        handled = true;
        int hit = top ? (left ? HTTOPLEFT : right ? HTTOPRIGHT : HTTOP)
            : bottom ? (left ? HTBOTTOMLEFT : right ? HTBOTTOMRIGHT : HTBOTTOM)
            : left ? HTLEFT : HTRIGHT;
        return new IntPtr(hit);
    }

    private async Task InitializeWebViewAsync()
    {
        try
        {
            WebView.DefaultBackgroundColor = System.Drawing.Color.Transparent;

            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var userDataDir = Path.Combine(localAppData, "McTextureGhost", "WebView2Data");
            Directory.CreateDirectory(userDataDir);

            var env = await CoreWebView2Environment.CreateAsync(
                browserExecutableFolder: null,
                userDataFolder: userDataDir,
                options: new CoreWebView2EnvironmentOptions());

            await WebView.EnsureCoreWebView2Async(env);

            ConfigureSettings();

            _ipcBridge = new IpcBridgeService(WebView.CoreWebView2, Dispatcher);

            RegisterVirtualHosts();
            RegisterCommandHandlers();
            HookViewModelEvents();

            NavigateToContent();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Failed to initialize WebView2: {ex.Message}",
                "WebView2 Initialization Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void ConfigureSettings()
    {
        var settings = WebView.CoreWebView2.Settings;
#if DEBUG
        settings.AreDevToolsEnabled = true;
        settings.AreDefaultContextMenusEnabled = true;
#else
        settings.AreDevToolsEnabled = false;
        settings.AreDefaultContextMenusEnabled = false;
#endif
        settings.IsStatusBarEnabled = false;
        settings.IsZoomControlEnabled = false;
        WebView.CoreWebView2.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Dark;
    }

    private void RegisterVirtualHosts()
    {
        _ipcBridge?.SetVanillaVirtualHost();
        _ipcBridge?.SetPackVirtualHost(ViewModel.PackRootPath);
    }

    private void RegisterCommandHandlers()
    {
        if (_ipcBridge == null) return;

        // 1. PACK:OPEN_FOLDER
        _ipcBridge.RegisterHandler<PackOpenFolderPayload>(IpcMessageTypes.PackOpenFolder, (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                if (string.IsNullOrWhiteSpace(payload?.FolderPath))
                {
                    ViewModel.OpenPackFolderCommand.Execute(null);
                }
                else if (Directory.Exists(payload.FolderPath))
                {
                    var resolved = MainViewModel.ResolvePackFolder(payload.FolderPath) ?? payload.FolderPath;
                    ViewModel.LoadPack(resolved);
                }
                else
                {
                    _ipcBridge.PushError("Folder Not Found", $"Path '{payload.FolderPath}' does not exist.", "error");
                }
            });
        });

        // 2. PACK:RELOAD
        _ipcBridge.RegisterHandler<PackReloadPayload>(IpcMessageTypes.PackReload, async (payload, corrId) =>
        {
            var rescanTask = await Dispatcher.InvokeAsync(() =>
            {
                if (ViewModel.IsPackLoaded)
                {
                    return ViewModel.RescanAsync();
                }

                _ipcBridge.PushError("Reload Pack", "No pack currently loaded.", "info");
                return Task.CompletedTask;
            });
            await rescanTask;

            // After a successful rescan, explicitly push a fresh pack state to the frontend
            await Dispatcher.InvokeAsync(() =>
            {
                if (ViewModel.IsPackLoaded)
                {
                    _ipcBridge?.PushPackState(CreatePackStatePayload());
                }
            });
        });

        // 3. PACK:CREATE
        _ipcBridge.RegisterHandler<PackCreatePayload>(IpcMessageTypes.PackCreate, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                if (payload == null || string.IsNullOrWhiteSpace(payload.PackName))
                {
                    ViewModel.CreateNewPackCommand.Execute(null);
                    return;
                }

                string? targetDir = payload.TargetDirectory;
                if (string.IsNullOrWhiteSpace(targetDir))
                {
                    var dialog = new Microsoft.Win32.OpenFolderDialog
                    {
                        Title = $"Select parent directory for new pack '{payload.PackName}'"
                    };
                    if (dialog.ShowDialog(this) == true)
                    {
                        targetDir = Path.Combine(dialog.FolderName, payload.PackName);
                    }
                    else
                    {
                        return;
                    }
                }

                try
                {
                    Directory.CreateDirectory(targetDir);
                    var texturesDir = Path.Combine(targetDir, "textures");
                    Directory.CreateDirectory(Path.Combine(texturesDir, "blocks"));
                    Directory.CreateDirectory(Path.Combine(texturesDir, "items"));

                    var manifestPath = Path.Combine(targetDir, "manifest.json");
                    var defaultManifest = ManifestModel.CreateDefault(payload.PackName, manifestPath);
                    defaultManifest.SaveToFile(manifestPath);

                    var terrainPath = Path.Combine(texturesDir, "terrain_texture.json");
                    if (!File.Exists(terrainPath))
                    {
                        File.WriteAllText(terrainPath, "{\n  \"resource_pack_name\": \"" + payload.PackName + "\",\n  \"texture_name\": \"atlas.terrain\",\n  \"texture_data\": {}\n}");
                    }

                    var itemTexturePath = Path.Combine(texturesDir, "item_texture.json");
                    if (!File.Exists(itemTexturePath))
                    {
                        File.WriteAllText(itemTexturePath, "{\n  \"resource_pack_name\": \"" + payload.PackName + "\",\n  \"texture_name\": \"atlas.items\",\n  \"texture_data\": {}\n}");
                    }

                    var blocksPath = Path.Combine(targetDir, "blocks.json");
                    if (!File.Exists(blocksPath))
                    {
                        File.WriteAllText(blocksPath, "{\n  \"format_version\": [1, 1, 0]\n}");
                    }

                    ViewModel.LoadPack(targetDir);
                }
                catch (Exception ex)
                {
                    _ipcBridge.PushError("Pack Creation Failed", ex.Message, "error");
                }
            });
        });

        // 4. TEXTURE:EDIT
        _ipcBridge.RegisterHandler<TextureEditPayload>(IpcMessageTypes.TextureEdit, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(() =>
            {
                if (payload == null) return;
                var alias = ViewModel.Aliases.FirstOrDefault(a => a.Alias.Equals(payload.AliasKey, StringComparison.OrdinalIgnoreCase));
                if (payload.IsGhost || (alias != null && alias.Status == TextureStatus.Ghost) || !File.Exists(payload.FullPath))
                {
                    var dir = Path.GetDirectoryName(payload.FullPath);
                    if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    {
                        Directory.CreateDirectory(dir);
                    }
                    PlaceholderImageFactory.CreateStub(payload.FullPath, 16);
                    ImagePathConverter.ClearCache();
                    if (alias != null)
                    {
                        alias.Status = TextureStatus.Ok;
                    }
                    _ipcBridge.PushTextureUpdated(
                        payload.AliasKey,
                        "OK",
                        payload.FullPath,
                        IpcContractMapper.BuildVirtualTextureUrl(alias?.RelativePath ?? Path.GetFileName(payload.FullPath), payload.FullPath)
                    );
                }
                try
                {
                    OpenWithLauncher.Show(payload.FullPath);
                }
                catch (Exception ex)
                {
                    _ipcBridge.PushError("Editor Launch Failed", ex.Message, "warning");
                }
            });
        });

        // 5. SCAFFOLD:PLAIN
        _ipcBridge.RegisterHandler<ScaffoldPlainPayload>(IpcMessageTypes.ScaffoldPlain, async (payload, corrId) =>
        {
            if (payload != null && ViewModel.PackRootPath != null)
            {
                JsonWriterService.AddPlainBlock(ViewModel.PackRootPath, payload.AliasName, payload.BlockId);
                await Dispatcher.InvokeAsync(async () => await ViewModel.RescanAsync());
            }
        });

        // 6. SCAFFOLD:PER_FACE
        _ipcBridge.RegisterHandler<ScaffoldPerFacePayload>(IpcMessageTypes.ScaffoldPerFace, async (payload, corrId) =>
        {
            if (payload != null && ViewModel.PackRootPath != null)
            {
                JsonWriterService.AddPerFaceBlock(ViewModel.PackRootPath, payload.AliasName, payload.BlockId);
                await Dispatcher.InvokeAsync(async () => await ViewModel.RescanAsync());
            }
        });

        // 7. SCAFFOLD:FLIPBOOK
        _ipcBridge.RegisterHandler<ScaffoldFlipbookPayload>(IpcMessageTypes.ScaffoldFlipbook, async (payload, corrId) =>
        {
            if (payload != null && ViewModel.PackRootPath != null)
            {
                JsonWriterService.AddFlipbookBlock(ViewModel.PackRootPath, payload.AliasName, payload.BlockId, payload.TicksPerFrame ?? 10);
                await Dispatcher.InvokeAsync(async () => await ViewModel.RescanAsync());
            }
        });

        // 8. ORPHAN:REGISTER
        _ipcBridge.RegisterHandler<OrphanRegisterPayload>(IpcMessageTypes.OrphanRegister, async (payload, corrId) =>
        {
            if (payload != null && ViewModel.PackRootPath != null && !string.IsNullOrWhiteSpace(payload.RelativePath))
            {
                var alias = !string.IsNullOrWhiteSpace(payload.Alias)
                    ? payload.Alias
                    : Path.GetFileNameWithoutExtension(payload.RelativePath);

                if (string.Equals(payload.Category, "item", StringComparison.OrdinalIgnoreCase))
                {
                    JsonWriterService.RegisterItemOrphan(ViewModel.PackRootPath, alias, payload.RelativePath);
                }
                else
                {
                    JsonWriterService.RegisterOrphan(ViewModel.PackRootPath, alias, payload.RelativePath);
                }
                await Dispatcher.InvokeAsync(async () => await ViewModel.RescanAsync());
            }
        });

        // 9. MANIFEST:SAVE
        _ipcBridge.RegisterHandler<ManifestSavePayload>(IpcMessageTypes.ManifestSave, (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                if (payload?.Manifest != null)
                {
                    if (ViewModel.CurrentManifest == null)
                    {
                        var manifestPath = Path.Combine(ViewModel.PackRootPath ?? "", "manifest.json");
                        ViewModel.CurrentManifest = new ManifestModel { FilePath = manifestPath, FileExists = File.Exists(manifestPath) };
                    }
                    payload.Manifest.ApplyTo(ViewModel.CurrentManifest);
                    ViewModel.SaveManifestCommand.Execute(null);
                    _ipcBridge.PushPackState(CreatePackStatePayload());
                }
            });
        });

        // 10. WINDOW:ACTION
        _ipcBridge.RegisterHandler<WindowActionPayload>(IpcMessageTypes.WindowAction, (payload, corrId) =>
        {
            if (payload != null)
            {
                HandleWindowAction(payload.Action);
            }
        });

        // 11. TINT:SET
        _ipcBridge.RegisterHandler<TintSetPayload>(IpcMessageTypes.TintSet, (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                if (payload != null)
                {
                    ViewModel.TintOpacityPercent = payload.OpacityPercent;
                    ViewModel.TintBrightness = payload.Brightness;
                    _ipcBridge.PushAppConfig(
                        ViewModel.TintOpacityPercent,
                        ViewModel.TintBrightness,
                        ViewModel.TintHexCode,
                        IsDebugMode,
                        ViewModel.WindowTitle);
                }
            });
        });

        // 12. VANILLA:ADD
        _ipcBridge.RegisterHandler<VanillaAddPayload>(IpcMessageTypes.VanillaAdd, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && ViewModel.PackRootPath != null && ViewModel.VanillaData != null)
                {
                    if (string.Equals(payload.Category, "item", StringComparison.OrdinalIgnoreCase))
                    {
                        JsonWriterService.AddVanillaItem(ViewModel.PackRootPath, payload.Id, ViewModel.VanillaData);
                    }
                    else
                    {
                        JsonWriterService.AddVanillaBlock(ViewModel.PackRootPath, payload.Id, ViewModel.VanillaData);
                    }
                    await ViewModel.RescanAsync();
                }
            });
        });

        // 13. OPEN_IN_EXPLORER & PACK:OPEN_EXPLORER
        Action<OpenInExplorerPayload?, string?> handleOpenInExplorer = (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                var target = payload?.TargetPath;
                if (string.IsNullOrWhiteSpace(target))
                {
                    target = ViewModel.PackRootPath;
                }

                if (!string.IsNullOrWhiteSpace(target))
                {
                    try
                    {
                        if (payload?.SelectFile == true && File.Exists(target))
                        {
                            Process.Start(new ProcessStartInfo
                            {
                                FileName = "explorer.exe",
                                Arguments = $"/select,\"{target}\"",
                                UseShellExecute = false
                            });
                        }
                        else if (File.Exists(target))
                        {
                            var dir = Path.GetDirectoryName(target);
                            if (dir != null && Directory.Exists(dir))
                            {
                                Process.Start(new ProcessStartInfo { FileName = dir, UseShellExecute = true });
                            }
                        }
                        else if (Directory.Exists(target))
                        {
                            Process.Start(new ProcessStartInfo { FileName = target, UseShellExecute = true });
                        }
                        else
                        {
                            _ipcBridge.PushError("Open in Explorer", $"Path '{target}' does not exist.", "warning");
                        }
                    }
                    catch (Exception ex)
                    {
                        _ipcBridge.PushError("Open in Explorer", $"Failed to open '{target}': {ex.Message}", "warning");
                    }
                }
            });
        };

        _ipcBridge.RegisterHandler<OpenInExplorerPayload>(IpcMessageTypes.OpenInExplorer, (payload, corrId) =>
        {
            handleOpenInExplorer(payload, corrId);
            return Task.CompletedTask;
        });

        _ipcBridge.RegisterHandler<OpenInExplorerPayload>(IpcMessageTypes.PackOpenExplorer, (payload, corrId) =>
        {
            handleOpenInExplorer(payload, corrId);
            return Task.CompletedTask;
        });

        // 14. PACK:CLOSE
        _ipcBridge.RegisterHandler(IpcMessageTypes.PackClose, (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                if (ViewModel.ClosePackCommand.CanExecute(null))
                {
                    ViewModel.ClosePackCommand.Execute(null);
                }
                _ipcBridge.PushPackState(CreatePackStatePayload());
            });
            return Task.CompletedTask;
        });

        // 15. ADD_VANILLA_ENTRY
        _ipcBridge.RegisterHandler<AddVanillaEntryPayload>(IpcMessageTypes.AddVanillaEntry, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && ViewModel.PackRootPath != null && ViewModel.VanillaData != null)
                {
                    var id = payload.Id ?? payload.BlockId ?? payload.Alias;
                    if (!string.IsNullOrWhiteSpace(id))
                    {
                        if (string.Equals(payload.Category, "item", StringComparison.OrdinalIgnoreCase))
                        {
                            JsonWriterService.AddVanillaItem(ViewModel.PackRootPath, id, ViewModel.VanillaData);
                        }
                        else
                        {
                            JsonWriterService.AddVanillaBlock(ViewModel.PackRootPath, id, ViewModel.VanillaData);
                        }
                        await ViewModel.RescanAsync();
                    }
                }
            });
        });

        // 16. APP:READY (Frontend mounted handshake)
        _ipcBridge.RegisterHandler("APP:READY", (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                _ipcBridge.PushPackState(CreatePackStatePayload());
                _ipcBridge.PushAppConfig(
                    ViewModel.TintOpacityPercent,
                    ViewModel.TintBrightness,
                    ViewModel.TintHexCode,
                    IsDebugMode,
                    ViewModel.WindowTitle);
            });
            return Task.CompletedTask;
        });

        // 17. VANILLA:LOAD_CATALOG
        _ipcBridge.RegisterHandler(IpcMessageTypes.VanillaLoadCatalog, async (payload, corrId) =>
        {
            if (ViewModel.CatalogTree.Count == 0 && ViewModel.VanillaData != null)
            {
                var cat = await Task.Run(() => PackScanner.BuildCatalogTree(ViewModel.Aliases.ToList(), ViewModel.VanillaData, ViewModel.PackRootPath));
                Dispatcher.Invoke(() =>
                {
                    ViewModel.CatalogTree.Clear();
                    foreach (var node in cat)
                    {
                        ViewModel.CatalogTree.Add(node);
                    }
                });
            }
            Dispatcher.Invoke(() =>
            {
                _ipcBridge.PushPackState(CreatePackStatePayload());
            });
        });
    }


    private void HookViewModelEvents()
    {
        ViewModel.PackStateChanged += () =>
        {
            Dispatcher.Invoke(() =>
            {
                _ipcBridge?.SetPackVirtualHost(ViewModel.PackRootPath);
                _ipcBridge?.PushPackState(CreatePackStatePayload());
            });
        };

        ViewModel.TextureUpdated += (alias) =>
        {
            Dispatcher.Invoke(() =>
            {
                _ipcBridge?.PushTextureUpdated(
                    alias.Alias,
                    alias.StatusLabel,
                    alias.FullPath,
                    IpcContractMapper.BuildVirtualTextureUrl(alias.RelativePath, alias.FullPath, ViewModel.PackRootPath)
                );
            });
        };

        ViewModel.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(MainViewModel.PackRootPath))
            {
                _ipcBridge?.SetPackVirtualHost(ViewModel.PackRootPath);
            }
        };
    }

    private PackStatePayload CreatePackStatePayload()
    {
        return new PackStatePayload(
            PackRoot: ViewModel.PackRootPath,
            PackName: ViewModel.PackName,
            HasManifest: ViewModel.HasManifest,
            HasPackIcon: ViewModel.HasPackIcon,
            PackIconUrl: ViewModel.HasPackIcon ? "https://pack.local/pack_icon.png" : null,
            Manifest: ViewModel.CurrentManifest?.ToDto(),
            Aliases: ViewModel.Aliases.Select(a => a.ToDto(ViewModel.PackRootPath)).ToList(),
            BlockWorkspaceTree: ViewModel.BlockWorkspaceTree.Select(b => b.ToDto(ViewModel.PackRootPath)).ToList(),
            PackFolders: ViewModel.PackFolders.Select(f => f.ToDto()).ToList(),
            RecentPacks: ViewModel.RecentPacks.Select(r => r.ToDto(ViewModel.PackRootPath)).ToList(),
            Stats: ViewModel.ExtractStats(),
            CatalogTree: ViewModel.CatalogTree.Select(c => c.ToDto(ViewModel.PackRootPath)).ToList()
        );
    }

    private void NavigateToContent()
    {
#if DEBUG
        NavigateToDevServerWithFallback();
#else
        NavigateToReleaseBundle();
#endif
    }

    private void NavigateToDevServerWithFallback()
    {
        bool devServerReachable = false;
        try
        {
            using var client = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromMilliseconds(400) };
            var response = client.GetAsync("http://localhost:5188/").GetAwaiter().GetResult();
            devServerReachable = response.IsSuccessStatusCode;
        }
        catch { }

        if (devServerReachable)
        {
            WebView.NavigationCompleted += (s, e) =>
            {
                if (e.IsSuccess && _ipcBridge != null)
                {
                    _ipcBridge.PushPackState(CreatePackStatePayload());
                    _ipcBridge.PushAppConfig(
                        ViewModel.TintOpacityPercent,
                        ViewModel.TintBrightness,
                        ViewModel.TintHexCode,
                        IsDebugMode,
                        ViewModel.WindowTitle);
                }
            };
            WebView.CoreWebView2.Navigate("http://localhost:5188/");
        }
        else
        {
            // Fallback seamlessly to local dist bundle if dev server is not running
            NavigateToReleaseBundle();
        }
    }


    private void ShowDevServerFallbackHtml()
    {
        const string fallbackHtml = """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8" />
                <meta http-equiv="refresh" content="2;url=http://localhost:5188/" />
                <title>Waiting for Dev Server</title>
                <style>
                    * { box-sizing: border-box; }
                    body {
                        background-color: #121214;
                        color: #D4D4D8;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                        user-select: none;
                    }
                    .card {
                        background: #18181B;
                        border: 1px solid #27272A;
                        border-radius: 12px;
                        padding: 32px;
                        max-width: 440px;
                        text-align: center;
                        box-shadow: 0 12px 32px rgba(0,0,0,0.5);
                    }
                    .badge {
                        display: inline-block;
                        background: #2F1C33;
                        color: #FC00FF;
                        font-size: 11px;
                        font-weight: 700;
                        padding: 4px 10px;
                        border-radius: 9999px;
                        margin-bottom: 16px;
                    }
                    h2 { margin: 0 0 10px 0; color: #FFFFFF; font-size: 18px; font-weight: 600; }
                    p { margin: 0 0 16px 0; color: #A1A1AA; font-size: 13px; line-height: 1.5; }
                    .cmd {
                        background: #09090B;
                        border: 1px solid #27272A;
                        border-radius: 6px;
                        padding: 8px 12px;
                        font-family: Consolas, monospace;
                        font-size: 12px;
                        color: #38BDF8;
                        margin-bottom: 16px;
                    }
                    .spinner {
                        width: 20px;
                        height: 20px;
                        border: 2px solid #27272A;
                        border-top-color: #FC00FF;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 12px auto;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    .status { font-size: 11px; color: #71717A; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="badge">DEBUG ENVIRONMENT</div>
                    <div class="spinner"></div>
                    <h2>Waiting for Vite Dev Server</h2>
                    <p>The host shell is waiting for the frontend development server on port 5188.</p>
                    <div class="cmd">cd frontend &amp;&amp; npm run dev</div>
                    <div class="status">Auto-retrying connection every 2 seconds...</div>
                </div>
            </body>
            </html>
            """;

        WebView.NavigateToString(fallbackHtml);
    }

    private void NavigateToReleaseBundle()
    {
        string distDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "frontend", "dist");
        if (!Directory.Exists(distDir))
        {
            distDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dist");
        }
        if (!Directory.Exists(distDir))
        {
            var candidate = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "frontend", "dist"));
            if (Directory.Exists(candidate))
            {
                distDir = candidate;
            }
        }

        if (Directory.Exists(distDir) && File.Exists(Path.Combine(distDir, "index.html")))
        {
            _ipcBridge?.SetAppVirtualHost(distDir);
            WebView.NavigationCompleted += (s, e) =>
            {
                if (e.IsSuccess && _ipcBridge != null)
                {
                    _ipcBridge.PushPackState(CreatePackStatePayload());
                    _ipcBridge.PushAppConfig(
                        ViewModel.TintOpacityPercent,
                        ViewModel.TintBrightness,
                        ViewModel.TintHexCode,
                        IsDebugMode,
                        ViewModel.WindowTitle);
                }
            };
            WebView.CoreWebView2.Navigate("https://app.local/index.html");
        }
        else
        {
            const string missingDistHtml = """
                <!DOCTYPE html>
                <html>
                <body style="background:#121214;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;">
                    <h2 style="color:#F43F5E;">Production Bundle Missing</h2>
                    <p style="color:#A1A1AA;">Could not find <code>frontend/dist/index.html</code>.</p>
                    <p style="color:#71717A;">Please run <code>npm run build</code> in the frontend directory.</p>
                </body>
                </html>
                """;
            WebView.NavigateToString(missingDistHtml);
        }
    }

    public void HandleWindowAction(string action)
    {
        Dispatcher.Invoke(() =>
        {
            switch (action?.ToLowerInvariant())
            {
                case "minimize":
                    WindowState = WindowState.Minimized;
                    break;
                case "maximize":
                    WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
                    break;
                case "close":
                    Close();
                    break;
                case "drag":
                    var helper = new WindowInteropHelper(this);
                    ReleaseCapture();
                    SendMessage(helper.Handle, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero);
                    break;
            }
        });
    }

    protected override void OnClosed(EventArgs e)
    {
        base.OnClosed(e);
        _ipcBridge?.Dispose();
        WebView?.Dispose();
    }
}
