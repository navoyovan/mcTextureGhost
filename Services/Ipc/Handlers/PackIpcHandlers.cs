// Services/Ipc/Handlers/PackIpcHandlers.cs
using System;
using System.IO;
using System.Threading.Tasks;
using McTextureGhost.Models;
using McTextureGhost.Services;
using McTextureGhost.ViewModels;

namespace McTextureGhost.Services.Ipc.Handlers;

/// <summary>
/// Registers IPC handlers for resource pack management (open, reload, create, close, export, manifest save).
/// </summary>
public static class PackIpcHandlers
{
    public static void Register(IpcHandlerContext context)
    {
        // 1. PACK:OPEN_FOLDER
        context.IpcBridge.RegisterHandler<PackOpenFolderPayload>(IpcMessageTypes.PackOpenFolder, (payload, corrId) =>
        {
            context.Dispatcher.Invoke(() =>
            {
                if (string.IsNullOrWhiteSpace(payload?.FolderPath))
                {
                    context.ViewModel.OpenPackFolderCommand.Execute(null);
                }
                else if (Directory.Exists(payload.FolderPath))
                {
                    var resolved = MainViewModel.ResolvePackFolder(payload.FolderPath) ?? payload.FolderPath;
                    context.ViewModel.LoadPack(resolved);
                }
                else
                {
                    context.IpcBridge.PushError("Folder Not Found", $"Path '{payload.FolderPath}' does not exist.", "error");
                }
            });
        });

        // 2. PACK:RELOAD
        context.IpcBridge.RegisterHandler<PackReloadPayload>(IpcMessageTypes.PackReload, async (payload, corrId) =>
        {
            var rescanTask = await context.Dispatcher.InvokeAsync(() =>
            {
                if (context.ViewModel.IsPackLoaded)
                {
                    return context.ViewModel.RescanAsync();
                }

                context.IpcBridge.PushError("Reload Pack", "No pack currently loaded.", "info");
                return Task.CompletedTask;
            });
            await rescanTask;

            // After a successful rescan, explicitly push a fresh pack state to the frontend
            await context.Dispatcher.InvokeAsync(() =>
            {
                if (context.ViewModel.IsPackLoaded)
                {
                    context.IpcBridge.PushPackState(context.CreatePackStatePayload(true, null));
                }
            });
        });

        // 3. PACK:CREATE
        context.IpcBridge.RegisterHandler<PackCreatePayload>(IpcMessageTypes.PackCreate, async (payload, corrId) =>
        {
            await context.Dispatcher.InvokeAsync(async () =>
            {
                if (payload == null || string.IsNullOrWhiteSpace(payload.PackName))
                {
                    context.ViewModel.CreateNewPackCommand.Execute(null);
                    return;
                }

                string? targetDir = payload.TargetDirectory;
                if (string.IsNullOrWhiteSpace(targetDir))
                {
                    var dialog = new Microsoft.Win32.OpenFolderDialog
                    {
                        Title = $"Select parent directory for new pack '{payload.PackName}'"
                    };
                    if (dialog.ShowDialog(context.Window) == true)
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

                    context.ViewModel.LoadPack(targetDir);
                }
                catch (Exception ex)
                {
                    context.IpcBridge.PushError("Pack Creation Failed", ex.Message, "error");
                }
            });
        });

        // 4. MANIFEST:SAVE
        context.IpcBridge.RegisterHandler<ManifestSavePayload>(IpcMessageTypes.ManifestSave, (payload, corrId) =>
        {
            context.Dispatcher.Invoke(() =>
            {
                if (payload?.Manifest != null)
                {
                    if (context.ViewModel.CurrentManifest == null)
                    {
                        var manifestPath = Path.Combine(context.ViewModel.PackRootPath ?? "", "manifest.json");
                        context.ViewModel.CurrentManifest = File.Exists(manifestPath)
                            ? ManifestModel.LoadFromFile(manifestPath, context.ViewModel.PackName ?? Path.GetFileName(context.ViewModel.PackRootPath ?? ""))
                            : new ManifestModel { FilePath = manifestPath, FileExists = false };
                    }
                    payload.Manifest.ApplyTo(context.ViewModel.CurrentManifest);
                    context.ViewModel.SaveManifestCommand.Execute(null);
                    context.IpcBridge.PushPackState(context.CreatePackStatePayload(true, null));
                }
            });
        });

        // 5. PACK:CLOSE
        context.IpcBridge.RegisterHandler(IpcMessageTypes.PackClose, (payload, corrId) =>
        {
            context.Dispatcher.Invoke(() =>
            {
                if (context.ViewModel.ClosePackCommand.CanExecute(null))
                {
                    context.ViewModel.ClosePackCommand.Execute(null);
                }
                context.IpcBridge.PushPackState(context.CreatePackStatePayload(true, null));
            });
            return Task.CompletedTask;
        });

        // 6. PACK:EXPORT_MCPACK
        context.IpcBridge.RegisterHandler<PackExportMcpackPayload>(IpcMessageTypes.PackExportMcpack, async (payload, corrId) =>
        {
            await context.Dispatcher.InvokeAsync(async () =>
            {
                var packRoot = context.ViewModel.PackRootPath;
                if (string.IsNullOrWhiteSpace(packRoot) || !Directory.Exists(packRoot))
                {
                    context.IpcBridge.PushError("Export Failed", "No active resource pack loaded.", "warning");
                    context.IpcBridge.PostMessage(IpcMessageTypes.PackExportMcpackResult, new PackExportMcpackResultPayload(false, "No active pack loaded."), corrId);
                    return;
                }

                string? destinationPath = payload?.DestinationPath;
                if (string.IsNullOrWhiteSpace(destinationPath))
                {
                    var defaultName = context.ViewModel.PackName ?? Path.GetFileName(packRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)) ?? "ResourcePack";
                    foreach (var c in Path.GetInvalidFileNameChars()) defaultName = defaultName.Replace(c, '_');

                    var dlg = new Microsoft.Win32.SaveFileDialog
                    {
                        Title = "Export Resource Pack as .mcpack",
                        Filter = "Minecraft Bedrock Resource Pack (*.mcpack)|*.mcpack|Zip Archive (*.zip)|*.zip|All Files (*.*)|*.*",
                        DefaultExt = ".mcpack",
                        FileName = $"{defaultName}.mcpack"
                    };

                    if (dlg.ShowDialog(context.Window) == true)
                    {
                        destinationPath = dlg.FileName;
                    }
                    else
                    {
                        return;
                    }
                }

                var (success, message, outputPath) = await Task.Run(() => PackExportService.ExportAsMcpack(packRoot, destinationPath));
                if (success && outputPath != null)
                {
                    context.IpcBridge.PushError("Pack Exported", $"Saved as {Path.GetFileName(outputPath)}", "info");
                }
                else
                {
                    context.IpcBridge.PushError("Export Failed", message, "error");
                }

                context.IpcBridge.PostMessage(IpcMessageTypes.PackExportMcpackResult, new PackExportMcpackResultPayload(success, message, outputPath), corrId);
            });
        });
    }
}
