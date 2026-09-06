using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

namespace McTextureGhost.Services;

/// <summary>
/// Writes a Bedrock-style "missing texture" checkerboard PNG (black/magenta)
/// so a ghost tile has an actual file to hand off to "Open With" once clicked.
/// </summary>
public static class PlaceholderImageFactory
{
    public static void CreateStub(string fullPath, int size = 16)
    {
        var directory = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);

        using var bitmap = new Bitmap(size, size);
        var half = size / 2;
        var magenta = Color.FromArgb(255, 0xFC, 0x00, 0xFF);
        var black = Color.Black;

        for (var y = 0; y < size; y++)
        {
            for (var x = 0; x < size; x++)
            {
                var isTopLeftOrBottomRightQuadrant = (x < half) == (y < half);
                bitmap.SetPixel(x, y, isTopLeftOrBottomRightQuadrant ? black : magenta);
            }
        }

        bitmap.Save(fullPath, ImageFormat.Png);
    }
}
