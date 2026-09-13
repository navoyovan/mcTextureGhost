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

        var ext = Path.GetExtension(fullPath);
        if (string.Equals(ext, ".tga", StringComparison.OrdinalIgnoreCase))
        {
            WriteTgaStub(fullPath, bitmap, size);
        }
        else
        {
            bitmap.Save(fullPath, ImageFormat.Png);
        }
    }

    private static void WriteTgaStub(string fullPath, Bitmap bitmap, int size)
    {
        using var fs = new FileStream(fullPath, FileMode.Create, FileAccess.Write, FileShare.None);
        using var bw = new BinaryWriter(fs);

        // Standard 18-byte TGA Header for uncompressed true-color 24-bit image
        bw.Write((byte)0);  // ID length
        bw.Write((byte)0);  // Color map type (none)
        bw.Write((byte)2);  // Image type (uncompressed true-color)
        bw.Write((short)0); // Color map origin
        bw.Write((short)0); // Color map length
        bw.Write((byte)0);  // Color map entry size
        bw.Write((short)0); // X-origin
        bw.Write((short)0); // Y-origin
        bw.Write((short)size); // Width
        bw.Write((short)size); // Height
        bw.Write((byte)24);    // Pixel depth (24 bpp BGR)
        bw.Write((byte)0x20);  // Image descriptor (0x20 = top-left origin)

        // Write BGR pixel data top-to-bottom
        for (var y = 0; y < size; y++)
        {
            for (var x = 0; x < size; x++)
            {
                var pixel = bitmap.GetPixel(x, y);
                bw.Write(pixel.B);
                bw.Write(pixel.G);
                bw.Write(pixel.R);
            }
        }
    }
}
