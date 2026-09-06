using System.Diagnostics;

namespace McTextureGhost.Services;

/// <summary>
/// Launches the OS-native "Open With" picker for a given file. Uses the
/// documented-by-convention rundll32 shell32.dll,OpenAs_RunDLL entry point
/// rather than P/Invoking the undocumented SHOpenWithDialog export directly.
/// </summary>
public static class OpenWithLauncher
{
    public static void Show(string fullPath)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "rundll32.exe",
            Arguments = $"shell32.dll,OpenAs_RunDLL \"{fullPath}\"",
            UseShellExecute = true
        };
        Process.Start(psi);
    }
}
