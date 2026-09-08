using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace McTextureGhost;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += (s, args) =>
        {
            try { File.WriteAllText("crash.txt", args.Exception.ToString()); } catch { }
        };
        AppDomain.CurrentDomain.UnhandledException += (s, args) =>
        {
            try { File.WriteAllText("crash.txt", args.ExceptionObject?.ToString()); } catch { }
        };

        base.OnStartup(e);

        if (e.Args.Length >= 2 && e.Args[0] == "--screenshot")
        {
            var targetPath = e.Args[1];
            var packPath = e.Args.Length >= 3 ? e.Args[2] : null;
            var searchQuery = e.Args.Length >= 4 ? e.Args[3] : null;

            // Wait for window to load and render
            Dispatcher.InvokeAsync(async () =>
            {
                if (MainWindow != null && MainWindow.DataContext is ViewModels.MainViewModel vm && !string.IsNullOrEmpty(packPath))
                {
                    vm.LoadPack(packPath);
                    if (searchQuery == "--manifest")
                    {
                        vm.OpenManifestForm();
                    }
                    else if (!string.IsNullOrEmpty(searchQuery))
                    {
                        vm.SearchText = searchQuery;
                    }
                }

                await Task.Delay(1000);
                if (MainWindow != null)
                {
                    int w = Math.Max(1, (int)MainWindow.ActualWidth);
                    int h = Math.Max(1, (int)MainWindow.ActualHeight);
                    var rtb = new RenderTargetBitmap(w, h, 96, 96, PixelFormats.Pbgra32);
                    rtb.Render(MainWindow);
                    var encoder = new PngBitmapEncoder();
                    encoder.Frames.Add(BitmapFrame.Create(rtb));
                    using (var fs = File.Create(targetPath))
                    {
                        encoder.Save(fs);
                    }
                }
                Shutdown();
            }, DispatcherPriority.ApplicationIdle);
        }
    }
}
