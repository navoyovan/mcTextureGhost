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

    [StructLayout(LayoutKind.Sequential)]
    private struct MINMAXINFO
    {
        public POINT ptReserved;
        public POINT ptMaxSize;
        public POINT ptMaxPosition;
        public POINT ptMinTrackSize;
        public POINT ptMaxTrackSize;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public int dwFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct APPBARDATA
    {
        public int cbSize;
        public IntPtr hWnd;
        public uint uCallbackMessage;
        public uint uEdge;
        public RECT rc;
        public IntPtr lParam;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr handle, int flags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

    [DllImport("shell32.dll", EntryPoint = "SHAppBarMessage")]
    private static extern IntPtr SHAppBarMessage(uint dwMessage, ref APPBARDATA pData);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr FindWindow(string lpClassName, string? lpWindowName);

    private const uint ABM_GETSTATE = 0x00000004;
    private const uint ABM_GETTASKBARPOS = 0x00000005;
    private const uint ABS_AUTOHIDE = 0x00000001;
    private const uint ABE_LEFT = 0;
    private const uint ABE_TOP = 1;
    private const uint ABE_RIGHT = 2;
    private const uint ABE_BOTTOM = 3;

    private const int WM_GETMINMAXINFO = 0x0024;
    private const int MONITOR_DEFAULTTONEAREST = 0x00000002;
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
        if (msg == WM_GETMINMAXINFO)
        {
            var mmi = Marshal.PtrToStructure<MINMAXINFO>(lParam);
            var monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            if (monitor != IntPtr.Zero)
            {
                var monitorInfo = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
                if (GetMonitorInfo(monitor, ref monitorInfo))
                {
                    var rcWork = monitorInfo.rcWork;
                    var rcMonitor = monitorInfo.rcMonitor;

                    AdjustForAutoHideTaskbar(monitor, ref rcWork, rcMonitor);

                    mmi.ptMaxPosition.X = rcWork.Left - rcMonitor.Left;
                    mmi.ptMaxPosition.Y = rcWork.Top - rcMonitor.Top;
                    mmi.ptMaxSize.X = rcWork.Right - rcWork.Left;
                    mmi.ptMaxSize.Y = rcWork.Bottom - rcWork.Top;
                    mmi.ptMaxTrackSize.X = mmi.ptMaxSize.X;
                    mmi.ptMaxTrackSize.Y = mmi.ptMaxSize.Y;
                }
            }
            Marshal.StructureToPtr(mmi, lParam, true);
            handled = true;
            return IntPtr.Zero;
        }

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

    private static void AdjustForAutoHideTaskbar(IntPtr monitor, ref RECT rcWork, RECT rcMonitor)
    {
        var appbarData = new APPBARDATA { cbSize = Marshal.SizeOf<APPBARDATA>() };
        IntPtr taskbarHwnd = FindWindow("Shell_TrayWnd", null);
        if (taskbarHwnd != IntPtr.Zero)
        {
            appbarData.hWnd = taskbarHwnd;
            uint state = (uint)SHAppBarMessage(ABM_GETSTATE, ref appbarData);
            if ((state & ABS_AUTOHIDE) != 0)
            {
                if (SHAppBarMessage(ABM_GETTASKBARPOS, ref appbarData) != IntPtr.Zero)
                {
                    var taskbarMonitor = MonitorFromWindow(taskbarHwnd, MONITOR_DEFAULTTONEAREST);
                    if (taskbarMonitor == monitor)
                    {
                        switch (appbarData.uEdge)
                        {
                            case ABE_LEFT:
                                rcWork.Left += 2;
                                break;
                            case ABE_TOP:
                                rcWork.Top += 2;
                                break;
                            case ABE_RIGHT:
                                rcWork.Right -= 2;
                                break;
                            case ABE_BOTTOM:
                                rcWork.Bottom -= 2;
                                break;
                        }
                        return;
                    }
                }

                // Fallback if taskbar is on this screen or full work area matches monitor
                if (rcWork.Bottom == rcMonitor.Bottom)
                {
                    rcWork.Bottom -= 2;
                }
            }
        }
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
                if (!payload.CreateOnly)
                {
                    try
                    {
                        var parentHwnd = new WindowInteropHelper(this).Handle;
                        OpenWithService.OpenFileWith(payload.FullPath, payload.ExePath, payload.ChooseDialog, parentHwnd);
                    }
                    catch (Exception ex)
                    {
                        _ipcBridge.PushError("Editor Launch Failed", ex.Message, "warning");
                    }
                }
            });
        });

        // 4b. TEXTURE:DELETE_FILE
        _ipcBridge.RegisterHandler<TextureDeleteFilePayload>(IpcMessageTypes.TextureDeleteFile, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && !string.IsNullOrWhiteSpace(payload.FullPath))
                {
                    try
                    {
                        ImagePathConverter.ClearCache();
                        GC.Collect();
                        GC.WaitForPendingFinalizers();

                        bool deleted = false;
                        Exception? lastEx = null;
                        for (int attempt = 0; attempt < 5; attempt++)
                        {
                            try
                            {
                                if (File.Exists(payload.FullPath))
                                {
                                    File.Delete(payload.FullPath);
                                }
                                deleted = true;
                                break;
                            }
                            catch (IOException ioEx)
                            {
                                lastEx = ioEx;
                                await Task.Delay(60);
                            }
                        }

                        if (!deleted && lastEx != null)
                        {
                            throw lastEx;
                        }

                        await ViewModel.RescanAsync();
                    }
                    catch (Exception ex)
                    {
                        _ipcBridge.PushError("Delete Texture File", $"Failed to delete texture: {ex.Message}", "warning");
                    }
                }
            });
        });

        // 4c. TEXTURE:DELETE_ENTRIES
        _ipcBridge.RegisterHandler<TextureDeleteEntriesPayload>(IpcMessageTypes.TextureDeleteEntries, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && ViewModel.PackRootPath != null && !string.IsNullOrWhiteSpace(payload.AliasKey))
                {
                    try
                    {
                        JsonWriterService.DeleteTextureEntries(ViewModel.PackRootPath, payload.AliasKey, payload.Category, payload.RelativePath);
                        await ViewModel.RescanAsync();
                    }
                    catch (Exception ex)
                    {
                        _ipcBridge.PushError("Delete JSON Entries", $"Failed to delete entries: {ex.Message}", "warning");
                    }
                }
            });
        });

        // 4d. TEXTURE:DROP_IMPORT
        _ipcBridge.RegisterHandler<TextureDropImportPayload>(IpcMessageTypes.TextureDropImport, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                if (payload == null || string.IsNullOrWhiteSpace(payload.FullPath) || string.IsNullOrWhiteSpace(payload.Base64Data))
                {
                    _ipcBridge.PushError("Import Failed", "Invalid drop payload or missing file data.", "error");
                    return;
                }

                try
                {
                    var targetPath = payload.FullPath;
                    var dir = Path.GetDirectoryName(targetPath);
                    if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    {
                        Directory.CreateDirectory(dir);
                    }

                    var base64 = payload.Base64Data;
                    var commaIdx = base64.IndexOf(',');
                    if (commaIdx >= 0 && base64.Substring(0, commaIdx).Contains("base64"))
                    {
                        base64 = base64.Substring(commaIdx + 1);
                    }
                    var bytes = Convert.FromBase64String(base64);

                    await File.WriteAllBytesAsync(targetPath, bytes);

                    ImagePathConverter.ClearCache();

                    var alias = ViewModel.Aliases.FirstOrDefault(a => a.Alias.Equals(payload.AliasKey, StringComparison.OrdinalIgnoreCase) ||
                        (!string.IsNullOrEmpty(a.FullPath) && a.FullPath.Equals(targetPath, StringComparison.OrdinalIgnoreCase)));

                    if (alias != null)
                    {
                        alias.Status = TextureStatus.Ok;
                        alias.FullPath = targetPath;
                    }

                    var virtualUrl = IpcContractMapper.BuildVirtualTextureUrl(alias?.RelativePath ?? Path.GetFileName(targetPath), targetPath, ViewModel.PackRootPath);
                    _ipcBridge.PushTextureUpdated(
                        payload.AliasKey,
                        "OK",
                        targetPath,
                        $"{virtualUrl}?t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}"
                    );
                }
                catch (Exception ex)
                {
                    _ipcBridge.PushError("Texture Drop Failed", ex.Message, "error");
                }
            });
        });

        // 5. SCAFFOLD:PLAIN
        _ipcBridge.RegisterHandler<ScaffoldPlainPayload>(IpcMessageTypes.ScaffoldPlain, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && ViewModel.PackRootPath != null)
                {
                    JsonWriterService.AddPlainBlock(ViewModel.PackRootPath, payload.AliasName, payload.BlockId);
                    await ViewModel.RescanAsync();
                }
            });
        });

        // 6. SCAFFOLD:PER_FACE
        _ipcBridge.RegisterHandler<ScaffoldPerFacePayload>(IpcMessageTypes.ScaffoldPerFace, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && ViewModel.PackRootPath != null)
                {
                    JsonWriterService.AddPerFaceBlock(ViewModel.PackRootPath, payload.AliasName, payload.BlockId);
                    await ViewModel.RescanAsync();
                }
            });
        });

        // 7. SCAFFOLD:FLIPBOOK
        _ipcBridge.RegisterHandler<ScaffoldFlipbookPayload>(IpcMessageTypes.ScaffoldFlipbook, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && ViewModel.PackRootPath != null)
                {
                    JsonWriterService.AddFlipbookBlock(ViewModel.PackRootPath, payload.AliasName, payload.BlockId, payload.TicksPerFrame ?? 10);
                    await ViewModel.RescanAsync();
                }
            });
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
                        ViewModel.CurrentManifest = File.Exists(manifestPath)
                            ? ManifestModel.LoadFromFile(manifestPath, ViewModel.PackName ?? Path.GetFileName(ViewModel.PackRootPath ?? ""))
                            : new ManifestModel { FilePath = manifestPath, FileExists = false };
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

        // 12. VANILLA:ADD (Catalog Drawer -> scaffolds JSON schema definitions into pack; creates GHOSTS without needing PNGs or downloads)
        _ipcBridge.RegisterHandler<VanillaAddPayload>(IpcMessageTypes.VanillaAdd, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && ViewModel.PackRootPath != null)
                {
                    if (ViewModel.VanillaData != null)
                    {
                        if (string.Equals(payload.Category, "entity", StringComparison.OrdinalIgnoreCase))
                        {
                            JsonWriterService.AddVanillaEntity(ViewModel.PackRootPath, payload.Id, ViewModel.VanillaData);
                        }
                        else if (string.Equals(payload.Category, "item", StringComparison.OrdinalIgnoreCase))
                        {
                            JsonWriterService.AddVanillaItem(ViewModel.PackRootPath, payload.Id, ViewModel.VanillaData);
                        }
                        else
                        {
                            // Check if payload.Id is a known BlockId in blocks.json
                            if (ViewModel.VanillaData.RawBlocksJson.ContainsKey(payload.Id))
                            {
                                JsonWriterService.AddVanillaBlock(ViewModel.PackRootPath, payload.Id, ViewModel.VanillaData);
                            }
                            else if (ViewModel.VanillaData.RawTerrainTextureJson.ContainsKey(payload.Id))
                            {
                                // It's a specific alias (e.g. "door_upper" or "door_lower")
                                JsonWriterService.AddVanillaBlockAlias(ViewModel.PackRootPath, payload.Id, ViewModel.VanillaData);
                            }
                            else
                            {
                                // Fallback
                                JsonWriterService.AddVanillaBlock(ViewModel.PackRootPath, payload.Id, ViewModel.VanillaData);
                            }
                        }
                    }

                    // Scaffolding JSON entries creates GHOSTS in the pack without needing PNG files or downloads
                    await ViewModel.RescanAsync();
                }
            });
        });

        // 12b. TEXTURE:EXTRACT_REFERENCE (Ghost Morph Tile -> copies authentic reference PNG into pack)
        _ipcBridge.RegisterHandler<TextureExtractReferencePayload>(IpcMessageTypes.TextureExtractReference, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && ViewModel.PackRootPath != null && !string.IsNullOrEmpty(payload.FullPath))
                {
                    var refDir = CatalogReferenceService.GetActiveProfile()?.PackPath ?? CatalogReferenceService.VanillaReferencePackDirectory;
                    var srcPath = ResolveReferenceTexturePath(refDir, payload.FullPath, payload.RelativePath, payload.AliasKey, payload.Category, ViewModel.PackRootPath);

                    if (!string.IsNullOrEmpty(srcPath) && File.Exists(srcPath))
                    {
                        var dir = Path.GetDirectoryName(payload.FullPath);
                        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                        {
                            Directory.CreateDirectory(dir);
                        }

                        File.Copy(srcPath, payload.FullPath, overwrite: true);
                        ImagePathConverter.ClearCache();

                        var matchedAlias = ViewModel.Aliases.FirstOrDefault(a => a.Alias.Equals(payload.AliasKey, StringComparison.OrdinalIgnoreCase));
                        if (matchedAlias != null)
                        {
                            matchedAlias.Status = TextureStatus.Ok;
                        }

                        _ipcBridge.PushTextureUpdated(
                            payload.AliasKey,
                            "OK",
                            payload.FullPath,
                            IpcContractMapper.BuildVirtualTextureUrl(payload.RelativePath ?? Path.GetFileName(payload.FullPath), payload.FullPath)
                        );

                        await ViewModel.RescanAsync();
                    }
                }
            });
        });

        // 12b. VANILLA:GET_3D_STATUS
        _ipcBridge.RegisterHandler(IpcMessageTypes.VanillaGet3DStatus, (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                bool has3D = CatalogReferenceService.Has3DModelsInstalled();
                _ipcBridge.PostMessage(IpcMessageTypes.Vanilla3DStatus, new Vanilla3DStatusPayload(has3D, CatalogReferenceService.VanillaReferencePackDirectory));
            });
            return Task.CompletedTask;
        });

        // 12c. VANILLA:DOWNLOAD_3D_ASSETS
        _ipcBridge.RegisterHandler(IpcMessageTypes.VanillaDownload3DAssets, async (payload, corrId) =>
        {
            await Task.Run(async () =>
            {
                bool success = await CatalogReferenceService.DownloadVanillaSamplePackAsync((pct, msg) =>
                {
                    Dispatcher.Invoke(() =>
                    {
                        _ipcBridge.PostMessage(IpcMessageTypes.DownloadProgress, new DownloadProgressPayload("download_3d_assets", pct, msg));
                    });
                });

                await Dispatcher.InvokeAsync(async () =>
                {
                    if (success)
                    {
                        // Reload VanillaData from the newly extracted files before rescanning
                        // so the catalog reflects the downloaded pack content (e.g. poplar blocks).
                        await ViewModel.RefreshVanillaAndRescanAsync();
                    }

                    bool has3D = CatalogReferenceService.Has3DModelsInstalled();
                    _ipcBridge.PostMessage(IpcMessageTypes.Vanilla3DStatus, new Vanilla3DStatusPayload(has3D, CatalogReferenceService.VanillaReferencePackDirectory));
                    _ipcBridge.PostMessage(IpcMessageTypes.CatalogDetailedStatus, CatalogReferenceService.GetDetailedStatus());
                });
            });
        });

        // 12d. CATALOG:GET_DETAILED_STATUS
        _ipcBridge.RegisterHandler(IpcMessageTypes.CatalogGetDetailedStatus, (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                var detailedStatus = CatalogReferenceService.GetDetailedStatus();
                _ipcBridge.PostMessage(IpcMessageTypes.CatalogDetailedStatus, detailedStatus);
            });
            return Task.CompletedTask;
        });

        // 12e. CATALOG:PURGE_TEMP_ARCHIVE
        _ipcBridge.RegisterHandler(IpcMessageTypes.CatalogPurgeTempArchive, (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                CatalogReferenceService.PurgeTempArchive();
                var detailedStatus = CatalogReferenceService.GetDetailedStatus();
                _ipcBridge.PostMessage(IpcMessageTypes.CatalogDetailedStatus, detailedStatus);
            });
            return Task.CompletedTask;
        });

        // 12f. CATALOG:PURGE_EXTRACTED_DATA
        _ipcBridge.RegisterHandler(IpcMessageTypes.CatalogPurgeExtractedData, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                CatalogReferenceService.PurgeExtractedData();
                await ViewModel.RescanAsync();
                var detailedStatus = CatalogReferenceService.GetDetailedStatus();
                _ipcBridge.PostMessage(IpcMessageTypes.CatalogDetailedStatus, detailedStatus);
                bool has3D = CatalogReferenceService.Has3DModelsInstalled();
                _ipcBridge.PostMessage(IpcMessageTypes.Vanilla3DStatus, new Vanilla3DStatusPayload(has3D, CatalogReferenceService.VanillaReferencePackDirectory));
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
                    ViewModel.WindowTitle,
                    OpenWithService.GetOpenWithApps());
            });
            return Task.CompletedTask;
        });

        // 16b. OPEN_WITH:GET_APPS
        _ipcBridge.RegisterHandler(IpcMessageTypes.OpenWithGetApps, (payload, corrId) =>
        {
            var apps = OpenWithService.GetOpenWithApps(forceRefresh: true);
            _ipcBridge.PostMessage(IpcMessageTypes.OpenWithAppsList, new OpenWithAppsListPayload(apps));
            return Task.CompletedTask;
        });

        // 16c. OPEN_WITH:ADD_CUSTOM_APP
        _ipcBridge.RegisterHandler<OpenWithAddCustomAppPayload>(IpcMessageTypes.OpenWithAddCustomApp, (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                string? selectedPath = payload?.ExePath;
                if (string.IsNullOrWhiteSpace(selectedPath))
                {
                    var dlg = new Microsoft.Win32.OpenFileDialog
                    {
                        Title = "Select Image Editor Executable",
                        Filter = "Executable files (*.exe)|*.exe|All files (*.*)|*.*",
                        CheckFileExists = true
                    };
                    if (dlg.ShowDialog(this) == true)
                    {
                        selectedPath = dlg.FileName;
                    }
                }

                if (!string.IsNullOrWhiteSpace(selectedPath))
                {
                    OpenWithService.AddApp(selectedPath);
                    var apps = OpenWithService.GetOpenWithApps(forceRefresh: true);
                    _ipcBridge.PostMessage(IpcMessageTypes.OpenWithAppsList, new OpenWithAppsListPayload(apps));
                }
            });
            return Task.CompletedTask;
        });

        // 16d. OPEN_WITH:REMOVE_APP
        _ipcBridge.RegisterHandler<OpenWithRemoveAppPayload>(IpcMessageTypes.OpenWithRemoveApp, (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                if (payload != null && !string.IsNullOrWhiteSpace(payload.Id))
                {
                    OpenWithService.RemoveApp(payload.Id);
                    var apps = OpenWithService.GetOpenWithApps(forceRefresh: true);
                    _ipcBridge.PostMessage(IpcMessageTypes.OpenWithAppsList, new OpenWithAppsListPayload(apps));
                }
            });
            return Task.CompletedTask;
        });

        // 16e. OPEN_WITH:SET_DEFAULT
        _ipcBridge.RegisterHandler<OpenWithSetDefaultPayload>(IpcMessageTypes.OpenWithSetDefault, (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                OpenWithService.SetDefaultApp(payload?.Id);
                var apps = OpenWithService.GetOpenWithApps(forceRefresh: true);
                _ipcBridge.PostMessage(IpcMessageTypes.OpenWithAppsList, new OpenWithAppsListPayload(apps));
            });
            return Task.CompletedTask;
        });

        // 17. VANILLA:LOAD_CATALOG
        _ipcBridge.RegisterHandler(IpcMessageTypes.VanillaLoadCatalog, async (payload, corrId) =>
        {
            CatalogReferenceService.ClearCache();
            var activeData = CatalogReferenceService.GetActiveData(ViewModel.VanillaData);
            if (activeData != null)
            {
                // Snapshot Aliases on the UI thread before handing off to Task.Run.
                // ViewModel.Aliases is an ObservableCollection owned by the UI thread;
                // calling .ToList() on it from a background thread throws a cross-thread exception.
                var aliasSnapshot = await Dispatcher.InvokeAsync(() => ViewModel.Aliases.ToList());
                var cat = await Task.Run(() => PackScanner.BuildCatalogTree(aliasSnapshot, activeData, ViewModel.PackRootPath));
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


        // 18. CATALOG:PICK_REFERENCE
        _ipcBridge.RegisterHandler<CatalogPickReferencePayload>(IpcMessageTypes.CatalogPickReference, async (payload, corrId) =>
        {
            await Dispatcher.InvokeAsync(async () =>
            {
                string? selectedFolder = payload?.FolderPath;
                if (string.IsNullOrWhiteSpace(selectedFolder))
                {
                    // Open dialog allowing either folder picking or manifest.json picking
                    var fileDlg = new Microsoft.Win32.OpenFileDialog
                    {
                        Title = "Select Reference Resource Pack (manifest.json or pack folder)",
                        Filter = "Minecraft Pack Files (manifest.json;pack_icon.png)|manifest.json;pack_icon.png|All Files (*.*)|*.*",
                        CheckFileExists = false,
                        FileName = "Select Folder"
                    };

                    if (fileDlg.ShowDialog() == true)
                    {
                        var picked = fileDlg.FileName;
                        selectedFolder = MainViewModel.ResolvePackFolder(picked)
                                         ?? (Directory.Exists(picked) ? picked : Path.GetDirectoryName(picked));
                    }
                }

                if (!string.IsNullOrWhiteSpace(selectedFolder))
                {
                    var resolved = MainViewModel.ResolvePackFolder(selectedFolder) ?? selectedFolder;
                    if (Directory.Exists(resolved))
                    {
                        var added = CatalogReferenceService.AddCustomPack(resolved);
                        if (added != null)
                        {
                            _ipcBridge.SetReferenceVirtualHost(added.PackPath);
                            var activeData = CatalogReferenceService.GetActiveData(ViewModel.VanillaData);
                            if (activeData != null)
                            {
                                var cat = await Task.Run(() => PackScanner.BuildCatalogTree(ViewModel.Aliases.ToList(), activeData, ViewModel.PackRootPath));
                                ViewModel.CatalogTree.Clear();
                                foreach (var node in cat)
                                {
                                    ViewModel.CatalogTree.Add(node);
                                }
                            }
                        }
                    }
                }
                _ipcBridge.PushPackState(CreatePackStatePayload());
            });
        });

        // 19. CATALOG:SET_REFERENCE
        _ipcBridge.RegisterHandler<CatalogSetReferencePayload>(IpcMessageTypes.CatalogSetReference, async (payload, corrId) =>
        {
            if (payload != null && !string.IsNullOrWhiteSpace(payload.Id))
            {
                await Dispatcher.InvokeAsync(async () =>
                {
                    if (CatalogReferenceService.SetActiveReference(payload.Id))
                    {
                        var active = CatalogReferenceService.GetActiveProfile();
                        if (active != null && !active.IsVanilla)
                        {
                            _ipcBridge.SetReferenceVirtualHost(active.PackPath);
                        }
                        else
                        {
                            _ipcBridge.SetReferenceVirtualHost(null);
                        }

                        var activeData = CatalogReferenceService.GetActiveData(ViewModel.VanillaData);
                        if (activeData != null)
                        {
                            var cat = await Task.Run(() => PackScanner.BuildCatalogTree(ViewModel.Aliases.ToList(), activeData, ViewModel.PackRootPath));
                            ViewModel.CatalogTree.Clear();
                            foreach (var node in cat)
                            {
                                ViewModel.CatalogTree.Add(node);
                            }
                        }
                    }
                    _ipcBridge.PushPackState(CreatePackStatePayload());
                });
            }
        });

        // 20. CATALOG:REMOVE_REFERENCE
        _ipcBridge.RegisterHandler<CatalogRemoveReferencePayload>(IpcMessageTypes.CatalogRemoveReference, async (payload, corrId) =>
        {
            if (payload != null && !string.IsNullOrWhiteSpace(payload.Id))
            {
                await Dispatcher.InvokeAsync(async () =>
                {
                    if (CatalogReferenceService.RemoveCustomPack(payload.Id))
                    {
                        var active = CatalogReferenceService.GetActiveProfile();
                        if (active != null && !active.IsVanilla)
                        {
                            _ipcBridge.SetReferenceVirtualHost(active.PackPath);
                        }
                        else
                        {
                            _ipcBridge.SetReferenceVirtualHost(null);
                        }

                        var activeData = CatalogReferenceService.GetActiveData(ViewModel.VanillaData);
                        if (activeData != null)
                        {
                            var cat = await Task.Run(() => PackScanner.BuildCatalogTree(ViewModel.Aliases.ToList(), activeData, ViewModel.PackRootPath));
                            ViewModel.CatalogTree.Clear();
                            foreach (var node in cat)
                            {
                                ViewModel.CatalogTree.Add(node);
                            }
                        }
                    }
                    _ipcBridge.PushPackState(CreatePackStatePayload());
                });
            }
        });

        // 20. GEOMETRY:GET
        _ipcBridge.RegisterHandler<GeometryGetPayload>(IpcMessageTypes.GeometryGet, (payload, corrId) =>
        {
            Dispatcher.Invoke(() =>
            {
                string? geoJson = null;
                string? geoId = payload?.GeometryId;
                var entityId = payload?.EntityId;

                if (!string.IsNullOrEmpty(geoId) && ViewModel.VanillaData != null)
                {
                    geoJson = ViewModel.VanillaData.GetGeometryJson(geoId);
                }

                if (string.IsNullOrEmpty(geoJson) && !string.IsNullOrEmpty(entityId) && ViewModel.VanillaData != null)
                {
                    var resolvedGeoId = ViewModel.VanillaData.GetGeometryForEntity(entityId);
                    if (!string.IsNullOrEmpty(resolvedGeoId))
                    {
                        geoId ??= resolvedGeoId;
                        geoJson = ViewModel.VanillaData.GetGeometryJson(resolvedGeoId);
                    }
                }

                // Also check if user pack has models/entity/{geoId}.geo.json
                if (string.IsNullOrEmpty(geoJson) && ViewModel.PackRootPath != null && Directory.Exists(ViewModel.PackRootPath))
                {
                    var packModels = Path.Combine(ViewModel.PackRootPath, "models", "entity");
                    if (Directory.Exists(packModels))
                    {
                        var cleanName = (geoId ?? entityId ?? "").Replace("geometry.", "", StringComparison.OrdinalIgnoreCase);
                        var file = Path.Combine(packModels, $"{cleanName}.geo.json");
                        if (File.Exists(file)) geoJson = File.ReadAllText(file);
                    }
                }

                geoId ??= entityId ?? "unknown";
                _ipcBridge.PostMessage(IpcMessageTypes.GeometryData, new GeometryDataPayload(
                    GeometryId: geoId,
                    RawJson: geoJson ?? string.Empty,
                    EntityId: entityId
                ), corrId);
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

        ViewModel.ScanProgressChanged += (stage, current, total, message) =>
        {
            Dispatcher.Invoke(() =>
            {
                _ipcBridge?.PushScanProgress(stage, current, total, message);
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
        var refProfiles = CatalogReferenceService.GetAllProfiles().Select(p => new ReferencePackProfileDto(
            Id: p.Id,
            Name: p.Name,
            Version: p.Version,
            Description: p.Description,
            PackPath: p.PackPath,
            IconUrl: p.IconUrl,
            IsVanilla: p.IsVanilla
        )).ToList();

        return new PackStatePayload(
            PackRoot: ViewModel.PackRootPath,
            PackName: ViewModel.PackName,
            HasManifest: ViewModel.HasManifest,
            HasPackIcon: ViewModel.HasPackIcon,
            PackIconUrl: ViewModel.HasPackIcon ? IpcContractMapper.BuildVirtualTextureUrl("pack_icon.png", ViewModel.PackIconPath, ViewModel.PackRootPath) : null,
            Manifest: ViewModel.CurrentManifest?.ToDto(),
            Aliases: ViewModel.Aliases.Select(a => a.ToDto(ViewModel.PackRootPath)).ToList(),
            BlockWorkspaceTree: ViewModel.BlockWorkspaceTree.Select(b => b.ToDto(ViewModel.PackRootPath)).ToList(),
            PackFolders: ViewModel.PackFolders.Select(f => f.ToDto()).ToList(),
            RecentPacks: ViewModel.RecentPacks.Select(r => r.ToDto(ViewModel.PackRootPath)).ToList(),
            Stats: ViewModel.ExtractStats(),
            CatalogTree: ViewModel.CatalogTree.Select(c => c.ToDto(ViewModel.PackRootPath)).ToList(),
            ReferencePacks: refProfiles,
            ActiveReferenceId: CatalogReferenceService.ActiveReferenceId,
            EntityWorkspaceTree: ViewModel.EntityWorkspaceTree.Select(e => e.ToDto(ViewModel.PackRootPath)).ToList()
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

    private static string? ResolveReferenceTexturePath(string refDir, string targetFullPath, string? relPath, string aliasKey, string? category, string? packRootPath)
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

    protected override void OnClosed(EventArgs e)
    {
        base.OnClosed(e);
        _ipcBridge?.Dispose();
        WebView?.Dispose();
    }
}
