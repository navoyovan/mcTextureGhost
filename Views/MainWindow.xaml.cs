using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using McTextureGhost.Models;
using McTextureGhost.Services;
using McTextureGhost.Services.Ipc.Handlers;
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
    internal const bool IsDebugMode = true;
#else
    internal const bool IsDebugMode = false;
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

        // Open external web links in the user's default browser instead of navigating the WebView
        WebView.CoreWebView2.NewWindowRequested += (sender, e) =>
        {
            e.Handled = true;
            if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var targetUri) &&
                (targetUri.Scheme == Uri.UriSchemeHttp || targetUri.Scheme == Uri.UriSchemeHttps))
            {
                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = e.Uri,
                        UseShellExecute = true
                    });
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[WebView2] Failed to open external URL '{e.Uri}': {ex.Message}");
                }
            }
        };
    }

    private void RegisterVirtualHosts()
    {
        _ipcBridge?.SetVanillaVirtualHost();
        _ipcBridge?.SetPackVirtualHost(ViewModel.PackRootPath);
    }

    private void RegisterCommandHandlers()
    {
        if (_ipcBridge == null) return;

        var ctx = new IpcHandlerContext(this, ViewModel, _ipcBridge, CreatePackStatePayload);
        AppIpcHandlers.Register(ctx);
        PackIpcHandlers.Register(ctx);
        CatalogIpcHandlers.Register(ctx);
        TextureIpcHandlers.Register(ctx);
    }

    private void HookViewModelEvents()
    {
        ViewModel.PackStateChanged += () =>
        {
            Dispatcher.Invoke(() =>
            {
                _ipcBridge?.SetPackVirtualHost(ViewModel.PackRootPath);
                _ipcBridge?.PushPackState(CreatePackStatePayload(includeAllTrees: true));
            });
        };

        ViewModel.PackStateScopedChanged += (category) =>
        {
            Dispatcher.Invoke(() =>
            {
                _ipcBridge?.PushPackState(CreatePackStatePayload(includeAllTrees: false, categoryScope: category));
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
                    IpcContractMapper.BuildVirtualTextureUrl(alias.RelativePath, alias.FullPath, ViewModel.PackRootPath),
                    alias.RelativePath
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

    private PackStatePayload CreatePackStatePayload(bool includeAllTrees = true, TextureCategory? categoryScope = null)
    {
        var refProfiles = includeAllTrees ? CatalogReferenceService.GetAllProfiles().Select(p => new ReferencePackProfileDto(
            Id: p.Id,
            Name: p.Name,
            Version: p.Version,
            Description: p.Description,
            PackPath: p.PackPath,
            IconUrl: p.IconUrl,
            IsVanilla: p.IsVanilla
        )).ToList() : null;

        bool includeBlocks = includeAllTrees || categoryScope == null || categoryScope == TextureCategory.Block;
        bool includeEntities = includeAllTrees || categoryScope == null || categoryScope == TextureCategory.Entity;

        return new PackStatePayload(
            PackRoot: ViewModel.PackRootPath,
            PackName: ViewModel.PackName,
            HasManifest: ViewModel.HasManifest,
            HasPackIcon: ViewModel.HasPackIcon,
            PackIconUrl: ViewModel.HasPackIcon ? IpcContractMapper.BuildVirtualTextureUrl("pack_icon.png", ViewModel.PackIconPath, ViewModel.PackRootPath) : null,
            Manifest: ViewModel.CurrentManifest?.ToDto(),
            Aliases: ViewModel.Aliases.Select(a => a.ToDto(ViewModel.PackRootPath)).ToList(),
            BlockWorkspaceTree: includeBlocks ? ViewModel.BlockWorkspaceTree.Select(b => b.ToDto(ViewModel.PackRootPath)).ToList() : null,
            PackFolders: includeAllTrees ? ViewModel.PackFolders.Select(f => f.ToDto()).ToList() : null,
            RecentPacks: includeAllTrees ? ViewModel.RecentPacks.Select(r => r.ToDto(ViewModel.PackRootPath)).ToList() : null,
            Stats: ViewModel.ExtractStats(),
            CatalogTree: includeAllTrees ? ViewModel.CatalogTree.Select(c => c.ToDto(ViewModel.PackRootPath)).ToList() : null,
            ReferencePacks: refProfiles,
            ActiveReferenceId: CatalogReferenceService.ActiveReferenceId,
            EntityWorkspaceTree: includeEntities ? ViewModel.EntityWorkspaceTree.Select(e => e.ToDto(ViewModel.PackRootPath)).ToList() : null,
            HasVanillaAssets: CatalogReferenceService.Has3DModelsInstalled()
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
