using System.Globalization;
using System.IO;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media.Imaging;
using System.Collections.Concurrent;

namespace McTextureGhost.Views;

public class BoolToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is true ? Visibility.Visible : Visibility.Collapsed;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public class InverseBoolToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is true ? Visibility.Collapsed : Visibility.Visible;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public class NullToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value != null ? Visibility.Visible : Visibility.Collapsed;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public class InverseNullToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value == null ? Visibility.Visible : Visibility.Collapsed;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public class StringNotEmptyToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        !string.IsNullOrWhiteSpace(value as string) ? Visibility.Visible : Visibility.Collapsed;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public class IntGreaterThanZeroToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is int i && i > 0 ? Visibility.Visible : Visibility.Collapsed;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

/// <summary>
/// Converts a file path string to a cached <see cref="BitmapImage"/>.
/// Uses <see cref="BitmapCacheOption.OnLoad"/> with <see cref="MemoryStream"/> decoding so the image
/// is fully decoded into memory and the file handle released immediately without locking disk files.
/// Keeps native pixel dimensions without resampling so pixel art remains crisp and jagged with NearestNeighbor scaling.
/// </summary>
public class ImagePathConverter : IValueConverter
{
    private static readonly ConcurrentDictionary<string, BitmapImage?> _cache = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Fired whenever the image cache is invalidated so active thumbnails reload immediately.</summary>
    public static event Action? CacheCleared;

    /// <summary>Call this after a rescan or file save so stale disk images are not cached forever.</summary>
    public static void ClearCache()
    {
        _cache.Clear();
        CacheCleared?.Invoke();
    }

    public static BitmapImage? GetBitmap(string? path)
    {
        if (string.IsNullOrEmpty(path) || !File.Exists(path))
            return null;

        return _cache.GetOrAdd(path, static p =>
        {
            // Retry loop for external editor write locks (e.g. Aseprite, Photoshop, Paint, Blockbench)
            byte[]? bytes = null;
            for (int attempt = 0; attempt < 5; attempt++)
            {
                try
                {
                    using var fs = new FileStream(p, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                    if (fs.Length == 0)
                    {
                        // File may be in middle of truncate/flush cycle
                        System.Threading.Thread.Sleep(30);
                        continue;
                    }

                    bytes = new byte[fs.Length];
                    int bytesRead = 0;
                    while (bytesRead < bytes.Length)
                    {
                        int n = fs.Read(bytes, bytesRead, bytes.Length - bytesRead);
                        if (n == 0) break;
                        bytesRead += n;
                    }
                    break;
                }
                catch (IOException)
                {
                    System.Threading.Thread.Sleep(30);
                }
                catch
                {
                    return null;
                }
            }

            if (bytes == null || bytes.Length == 0)
                return null;

            try
            {
                using var ms = new MemoryStream(bytes);
                var bi = new BitmapImage();
                bi.BeginInit();
                bi.CacheOption = BitmapCacheOption.OnLoad;
                bi.CreateOptions = BitmapCreateOptions.IgnoreColorProfile;
                bi.StreamSource = ms;
                // Preserve native pixel dimensions (e.g. 16x16) so NearestNeighbor
                // scaling renders authentic, razor-sharp jagged Minecraft pixels without blur.
                bi.EndInit();
                bi.Freeze();
                return bi;
            }
            catch
            {
                return null;
            }
        });
    }

    public object? Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is not string path)
            return null;

        return GetBitmap(path);
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

