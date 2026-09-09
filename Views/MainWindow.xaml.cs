using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using McTextureGhost.Models;
using McTextureGhost.ViewModels;

namespace McTextureGhost.Views;

public partial class MainWindow : Wpf.Ui.Controls.FluentWindow
{
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE_OLD = 19;

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

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
        };

        Loaded += (s, e) =>
        {
            if (StatusFilterPopup != null)
            {
                StatusFilterPopup.DataContext = DataContext;
            }
        };

        DataContextChanged += (s, e) =>
        {
            if (StatusFilterPopup != null)
            {
                StatusFilterPopup.DataContext = e.NewValue;
            }
        };
    }

    private void TitleBarDragGrip_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton == MouseButton.Left)
        {
            if (e.ClickCount == 2)
            {
                WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
            }
            else
            {
                if (WindowState == WindowState.Maximized)
                {
                    var mousePos = PointToScreen(e.GetPosition(this));
                    WindowState = WindowState.Normal;
                    Left = mousePos.X - (ActualWidth / 2);
                    Top = mousePos.Y - 20;
                }
                try
                {
                    DragMove();
                }
                catch (InvalidOperationException)
                {
                    // Ignored if drag operation interrupted
                }
            }
        }
    }

    private bool _isFilterPopupClosing;

    private void StatusFilterButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isFilterPopupClosing)
        {
            _isFilterPopupClosing = false;
            return;
        }

        if (StatusFilterPopup != null)
        {
            StatusFilterPopup.DataContext = DataContext;
            StatusFilterPopup.IsOpen = !StatusFilterPopup.IsOpen;
        }
    }

    private void StatusFilterPopup_Closed(object? sender, EventArgs e)
    {
        if (StatusFilterButton.IsMouseOver)
        {
            _isFilterPopupClosing = true;
            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Input, () =>
            {
                _isFilterPopupClosing = false;
            });
        }
    }

    private void TreeView_SelectedItemChanged(object sender, RoutedPropertyChangedEventArgs<object> e)
    {
        if (DataContext is MainViewModel vm)
        {
            var item = e.NewValue as PackFolderItem;
            if (item != null && item.IsPlaceholder) return;
            vm.SelectedFolder = item;
        }
    }

    private void ExpanderButton_MouseLeftButtonDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.DataContext is PackFolderItem folderItem)
        {
            if (folderItem.CanExpand)
            {
                folderItem.IsExpanded = !folderItem.IsExpanded;
            }
            e.Handled = true;
        }
    }

    private void ItemRowBorder_MouseLeftButtonDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.DataContext is PackFolderItem folderItem)
        {
            if (DataContext is MainViewModel vm)
            {
                vm.SelectedFolder = folderItem;
            }

            // On single click, expand if collapsed so user sees contents,
            // but do not accidentally collapse if already open or if empty.
            if (folderItem.CanExpand && !folderItem.IsExpanded)
            {
                folderItem.IsExpanded = true;
            }

            e.Handled = true;
        }
    }

    private void TreeViewItem_MouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (sender is System.Windows.Controls.TreeViewItem item && item.DataContext is PackFolderItem fileItem)
        {
            if (fileItem.IsManifest)
            {
                if (DataContext is MainViewModel vm)
                {
                    vm.OpenManifestForm();
                    e.Handled = true;
                    return;
                }
            }

            if (fileItem.IsDirectory)
            {
                if (fileItem.CanExpand)
                {
                    fileItem.IsExpanded = !fileItem.IsExpanded;
                }
                e.Handled = true;
                return;
            }

            if (!fileItem.IsDirectory && !fileItem.IsPlaceholder && System.IO.File.Exists(fileItem.FullPath))
            {
                try
                {
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = fileItem.FullPath,
                        UseShellExecute = true
                    });
                    e.Handled = true;
                }
                catch { }
            }
        }
    }
}

