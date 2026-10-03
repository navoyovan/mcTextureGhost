using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Interop;
using Microsoft.Win32;
using McTextureGhost.Models;
using McTextureGhost.Services;
using McTextureGhost.Services.Ipc;
using McTextureGhost.ViewModels;
using McTextureGhost.Views;

namespace McTextureGhost.Services.Ipc.Handlers;

public static class TextureIpcHandlers
{
    public static void Register(IpcHandlerContext ctx)
    {
        var bridge = ctx.IpcBridge;
        var dispatcher = ctx.Dispatcher;
        var vm = ctx.ViewModel;
        var window = ctx.Window;

        // 1. TEXTURE:EDIT
        bridge.RegisterHandler<TextureEditPayload>(IpcMessageTypes.TextureEdit, async (payload, corrId) =>
        {
            await dispatcher.InvokeAsync(() =>
            {
                if (payload == null) return;
                var alias = !string.IsNullOrEmpty(payload.FullPath)
                    ? vm.Aliases.FirstOrDefault(a => !string.IsNullOrEmpty(a.FullPath) && a.FullPath.Equals(payload.FullPath, StringComparison.OrdinalIgnoreCase))
                    : null;
                if (alias == null)
                {
                    alias = vm.Aliases.FirstOrDefault(a => a.Alias.Equals(payload.AliasKey, StringComparison.OrdinalIgnoreCase));
                }
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
                    var relPath = alias?.RelativePath ?? Path.GetFileName(payload.FullPath);
                    bridge.PushTextureUpdated(
                        payload.AliasKey,
                        "OK",
                        payload.FullPath,
                        IpcContractMapper.BuildVirtualTextureUrl(relPath, payload.FullPath),
                        relPath
                    );
                }

                if (!payload.CreateOnly)
                {
                    try
                    {
                        var parentHwnd = new WindowInteropHelper(window).Handle;
                        OpenWithService.OpenFileWith(payload.FullPath, payload.ExePath, payload.ChooseDialog, parentHwnd);
                    }
                    catch (Exception ex)
                    {
                        bridge.PushError("Editor Launch Failed", ex.Message, "warning");
                    }
                }
            });
        });

        // 2. TEXTURE:DELETE_FILE
        bridge.RegisterHandler<TextureDeleteFilePayload>(IpcMessageTypes.TextureDeleteFile, async (payload, corrId) =>
        {
            if (payload != null && !string.IsNullOrWhiteSpace(payload.FullPath))
            {
                try
                {
                    await Task.Run(async () =>
                    {
                        ImagePathConverter.ClearCache();
                        bool deleted = false;
                        Exception? lastEx = null;
                        for (int attempt = 0; attempt < 5; attempt++)
                        {
                            try
                            {
                                if (File.Exists(payload.FullPath))
                                {
                                    WriteJournal.RecordWrite(payload.FullPath);
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
                    });

                    await dispatcher.InvokeAsync(async () =>
                    {
                        await vm.RescanAsync();
                    });
                }
                catch (Exception ex)
                {
                    bridge.PushError("Delete Texture File", $"Failed to delete texture: {ex.Message}", "warning");
                }
            }
        });

        // 3. TEXTURE:DELETE_ENTRIES
        bridge.RegisterHandler<TextureDeleteEntriesPayload>(IpcMessageTypes.TextureDeleteEntries, async (payload, corrId) =>
        {
            if (payload == null || string.IsNullOrWhiteSpace(payload.AliasKey)) return;
            var packRoot = await dispatcher.InvokeAsync(() => vm.PackRootPath);
            if (packRoot == null) return;
            try
            {
                await Task.Run(() => JsonWriterService.DeleteTextureEntries(packRoot, payload.AliasKey, payload.Category, payload.RelativePath));
                await dispatcher.InvokeAsync(async () => await vm.RescanAsync());
            }
            catch (Exception ex)
            {
                bridge.PushError("Delete JSON Entries", $"Failed to delete entries: {ex.Message}", "warning");
            }
        });

        // 4. TEXTURE:DELETE_VARIATION
        bridge.RegisterHandler<TextureDeleteVariationPayload>(IpcMessageTypes.TextureDeleteVariation, async (payload, corrId) =>
        {
            if (payload == null || string.IsNullOrWhiteSpace(payload.Alias)) return;
            var packRoot = await dispatcher.InvokeAsync(() => vm.PackRootPath);
            if (packRoot == null) return;
            try
            {
                var removed = await Task.Run(() => JsonWriterService.DeleteTextureVariation(packRoot, payload.Alias, payload.RelativePath));
                if (!removed)
                {
                    bridge.PushError("Delete Variation", $"No matching variation entry found for '{payload.Alias}'.", "warning");
                }
                await dispatcher.InvokeAsync(async () => await vm.RescanScopedAsync(TextureCategory.Block));
            }
            catch (Exception ex)
            {
                bridge.PushError("Delete Variation", $"Failed to delete variation: {ex.Message}", "warning");
            }
        });

        // 4c. BLOCK:DELETE_ENTRY
        bridge.RegisterHandler<BlockDeleteEntryPayload>(IpcMessageTypes.BlockDeleteEntry, async (payload, corrId) =>
        {
            if (payload == null || string.IsNullOrWhiteSpace(payload.BlockId)) return;
            var packRoot = await dispatcher.InvokeAsync(() => vm.PackRootPath);
            if (packRoot == null) return;
            try
            {
                var removed = await Task.Run(() => JsonWriterService.DeleteBlockEntry(packRoot, payload.BlockId));
                await dispatcher.InvokeAsync(async () => await vm.RescanScopedAsync(TextureCategory.Block));
            }
            catch (Exception ex)
            {
                bridge.PushError("Delete blocks.json Entry", $"Failed to delete blocks.json entry: {ex.Message}", "warning");
            }
        });

        // 4b. TEXTURE:SET_VARIATION_WEIGHT
        bridge.RegisterHandler<TextureSetVariationWeightPayload>(IpcMessageTypes.TextureSetVariationWeight, async (payload, corrId) =>
        {
            if (payload == null || string.IsNullOrWhiteSpace(payload.Alias)) return;
            var packRoot = await dispatcher.InvokeAsync(() => vm.PackRootPath);
            if (packRoot == null) return;
            try
            {
                var updated = await Task.Run(() => JsonWriterService.SetTextureVariationWeight(packRoot, payload.Alias, payload.RelativePath, payload.Weight));
                if (!updated)
                {
                    bridge.PushError("Set Variation Weight", $"No matching variation found for '{payload.Alias}'.", "warning");
                }
                await dispatcher.InvokeAsync(async () => await vm.RescanScopedAsync(TextureCategory.Block));
            }
            catch (Exception ex)
            {
                bridge.PushError("Set Variation Weight", $"Failed to update weight: {ex.Message}", "warning");
            }
        });

        // 4c. TEXTURE:RENAME_VARIATION
        bridge.RegisterHandler<TextureRenameVariationPayload>(IpcMessageTypes.TextureRenameVariation, async (payload, corrId) =>
        {
            if (payload == null || string.IsNullOrWhiteSpace(payload.Alias) || string.IsNullOrWhiteSpace(payload.NewLabelOrPath)) return;
            var packRoot = await dispatcher.InvokeAsync(() => vm.PackRootPath);
            if (packRoot == null) return;
            try
            {
                var (success, _, message) = await Task.Run(() => JsonWriterService.RenameTextureVariation(packRoot, payload.Alias, payload.OldRelativePath, payload.NewLabelOrPath));
                if (!success)
                {
                    bridge.PushError("Rename Variation", message ?? $"Failed to rename variation for '{payload.Alias}'.", "warning");
                }
                await dispatcher.InvokeAsync(async () => await vm.RescanScopedAsync(TextureCategory.Block));
            }
            catch (Exception ex)
            {
                bridge.PushError("Rename Variation", $"Failed to rename variation: {ex.Message}", "warning");
            }
        });

        // 5. TEXTURE:DROP_IMPORT
        bridge.RegisterHandler<TextureDropImportPayload>(IpcMessageTypes.TextureDropImport, async (payload, corrId) =>
        {
            if (payload == null || string.IsNullOrWhiteSpace(payload.FullPath) || string.IsNullOrWhiteSpace(payload.Base64Data))
            {
                bridge.PushError("Import Failed", "Invalid drop payload or missing file data.", "error");
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

                // Decode base64 and write file off the UI thread
                await Task.Run(async () =>
                {
                    var base64 = payload.Base64Data;
                    var commaIdx = base64.IndexOf(',');
                    if (commaIdx >= 0 && base64.Substring(0, commaIdx).Contains("base64"))
                    {
                        base64 = base64.Substring(commaIdx + 1);
                    }
                    var bytes = Convert.FromBase64String(base64);

                    WriteJournal.RecordWrite(targetPath);
                    await File.WriteAllBytesAsync(targetPath, bytes);
                });

                // Update UI state and notify frontend on UI Dispatcher thread
                await dispatcher.InvokeAsync(() =>
                {
                    ImagePathConverter.ClearCache();

                    var alias = vm.Aliases.FirstOrDefault(a =>
                        (!string.IsNullOrEmpty(a.FullPath) && a.FullPath.Equals(targetPath, StringComparison.OrdinalIgnoreCase)) ||
                        (!string.IsNullOrEmpty(a.RelativePath) && !string.IsNullOrEmpty(payload.RelativePath) && a.RelativePath.Equals(payload.RelativePath, StringComparison.OrdinalIgnoreCase)));
                    if (alias == null)
                    {
                        alias = vm.Aliases.FirstOrDefault(a => a.Alias.Equals(payload.AliasKey, StringComparison.OrdinalIgnoreCase));
                    }

                    if (alias != null)
                    {
                        alias.Status = TextureStatus.Ok;
                        alias.FullPath = targetPath;
                    }

                    var relPath = alias?.RelativePath ?? payload.RelativePath ?? Path.GetFileName(targetPath);
                    var virtualUrl = IpcContractMapper.BuildVirtualTextureUrl(relPath, targetPath, vm.PackRootPath);
                    bridge.PushTextureUpdated(
                        payload.AliasKey,
                        "OK",
                        targetPath,
                        $"{virtualUrl}?t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                        relPath
                    );
                });
            }
            catch (Exception ex)
            {
                bridge.PushError("Texture Drop Failed", ex.Message, "error");
            }
        });

        // 6. TEXTURE:COPY_FILE
        bridge.RegisterHandler<TextureCopyFilePayload>(IpcMessageTypes.TextureCopyFile, async (payload, corrId) =>
        {
            if (payload == null || string.IsNullOrWhiteSpace(payload.SourceFullPath) || string.IsNullOrWhiteSpace(payload.TargetFullPath))
            {
                bridge.PushError("Copy Failed", "Invalid copy payload or missing file path.", "error");
                return;
            }

            if (!File.Exists(payload.SourceFullPath))
            {
                bridge.PushError("Copy Failed", $"Source file '{payload.SourceFullPath}' does not exist.", "error");
                return;
            }

            try
            {
                var targetPath = payload.TargetFullPath;
                var dir = Path.GetDirectoryName(targetPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                // Copy file off the UI thread
                await Task.Run(() =>
                {
                    WriteJournal.RecordWrite(targetPath);
                    File.Copy(payload.SourceFullPath, targetPath, overwrite: true);
                });

                // Update UI state on UI Dispatcher thread
                await dispatcher.InvokeAsync(() =>
                {
                    ImagePathConverter.ClearCache();

                    var alias = vm.Aliases.FirstOrDefault(a =>
                        (!string.IsNullOrEmpty(a.FullPath) && a.FullPath.Equals(targetPath, StringComparison.OrdinalIgnoreCase)) ||
                        (!string.IsNullOrEmpty(a.RelativePath) && !string.IsNullOrEmpty(payload.TargetRelativePath) && a.RelativePath.Equals(payload.TargetRelativePath, StringComparison.OrdinalIgnoreCase)));
                    if (alias == null)
                    {
                        alias = vm.Aliases.FirstOrDefault(a => a.Alias.Equals(payload.TargetAliasKey, StringComparison.OrdinalIgnoreCase));
                    }

                    if (alias != null)
                    {
                        alias.Status = TextureStatus.Ok;
                        alias.FullPath = targetPath;
                    }

                    var relPath = alias?.RelativePath ?? payload.TargetRelativePath ?? Path.GetFileName(targetPath);
                    var virtualUrl = IpcContractMapper.BuildVirtualTextureUrl(relPath, targetPath, vm.PackRootPath);
                    bridge.PushTextureUpdated(
                        payload.TargetAliasKey,
                        "OK",
                        targetPath,
                        $"{virtualUrl}?t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                        relPath
                    );
                });
            }
            catch (Exception ex)
            {
                bridge.PushError("Texture Copy Failed", ex.Message, "error");
            }
        });

        // 7. SCAFFOLD:PLAIN
        bridge.RegisterHandler<ScaffoldPlainPayload>(IpcMessageTypes.ScaffoldPlain, async (payload, corrId) =>
        {
            await dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && vm.PackRootPath != null)
                {
                    JsonWriterService.AddPlainBlock(vm.PackRootPath, payload.AliasName, payload.BlockId);
                    await vm.RescanScopedAsync(TextureCategory.Block);
                }
            });
        });

        // 8. SCAFFOLD:PER_FACE
        bridge.RegisterHandler<ScaffoldPerFacePayload>(IpcMessageTypes.ScaffoldPerFace, async (payload, corrId) =>
        {
            await dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && vm.PackRootPath != null)
                {
                    JsonWriterService.AddPerFaceBlock(vm.PackRootPath, payload.AliasName, payload.BlockId);
                    await vm.RescanScopedAsync(TextureCategory.Block);
                }
            });
        });

        // 9. SCAFFOLD:FLIPBOOK
        bridge.RegisterHandler<ScaffoldFlipbookPayload>(IpcMessageTypes.ScaffoldFlipbook, async (payload, corrId) =>
        {
            await dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && vm.PackRootPath != null)
                {
                    JsonWriterService.AddFlipbookBlock(vm.PackRootPath, payload.AliasName, payload.BlockId, payload.TicksPerFrame ?? 10);
                    await vm.RescanScopedAsync(TextureCategory.Block);
                }
            });
        });

        // 10. SCAFFOLD:TEXTURE_VARIATION
        bridge.RegisterHandler<ScaffoldTextureVariationPayload>(IpcMessageTypes.ScaffoldTextureVariation, async (payload, corrId) =>
        {
            if (payload == null || string.IsNullOrWhiteSpace(payload.Alias)) return;
            var packRoot = await dispatcher.InvokeAsync(() => vm.PackRootPath);
            if (packRoot == null) return;
            var newPath = await Task.Run(() => JsonWriterService.AddTextureVariation(packRoot, payload.Alias, payload.BlockVariantIndex, payload.RelativePath));
            if (newPath == null)
            {
                bridge.PushError("Variation Not Added", $"Alias '{payload.Alias}' has an unrecognized terrain_texture.json shape.", "warning");
            }
            else
            {
                // Ensure the variation has an actual physical texture on disk
                var targetFile = Path.Combine(packRoot, newPath.Replace('/', '\\') + ".png");
                var targetDir = Path.GetDirectoryName(targetFile);
                if (!string.IsNullOrEmpty(targetDir) && !Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                if (!File.Exists(targetFile))
                {
                    // If source file exists, copy it as the starting variation texture
                    string? sourceFile = null;
                    if (!string.IsNullOrWhiteSpace(payload.RelativePath))
                    {
                        var candidate = Path.Combine(packRoot, payload.RelativePath.Replace('/', '\\'));
                        if (File.Exists(candidate)) sourceFile = candidate;
                        else if (File.Exists(candidate + ".png")) sourceFile = candidate + ".png";
                    }

                    if (sourceFile != null && File.Exists(sourceFile))
                    {
                        WriteJournal.RecordWrite(targetFile);
                        File.Copy(sourceFile, targetFile, overwrite: true);
                    }
                    else
                    {
                        // Fallback: extract from vanilla reference or create a clean stub
                        var refDir = CatalogReferenceService.GetActiveProfile()?.PackPath ?? CatalogReferenceService.VanillaReferencePackDirectory;
                        var vanillaSrc = PackArchiveUtility.ResolveReferenceTexturePath(refDir, targetFile, payload.RelativePath ?? newPath, payload.Alias, "block", packRoot);
                        if (!string.IsNullOrEmpty(vanillaSrc) && File.Exists(vanillaSrc))
                        {
                            WriteJournal.RecordWrite(targetFile);
                            File.Copy(vanillaSrc, targetFile, overwrite: true);
                        }
                        else
                        {
                            PlaceholderImageFactory.CreateStub(targetFile, 16);
                        }
                    }
                    ImagePathConverter.ClearCache();
                }
            }
            await dispatcher.InvokeAsync(async () => await vm.RescanScopedAsync(TextureCategory.Block));
        });

        // 11. ORPHAN:REGISTER
        bridge.RegisterHandler<OrphanRegisterPayload>(IpcMessageTypes.OrphanRegister, async (payload, corrId) =>
        {
            if (payload != null && vm.PackRootPath != null && !string.IsNullOrWhiteSpace(payload.RelativePath))
            {
                var alias = !string.IsNullOrWhiteSpace(payload.Alias)
                    ? payload.Alias
                    : Path.GetFileNameWithoutExtension(payload.RelativePath);

                var isItem = string.Equals(payload.Category, "item", StringComparison.OrdinalIgnoreCase);
                if (isItem)
                {
                    JsonWriterService.RegisterItemOrphan(vm.PackRootPath, alias, payload.RelativePath);
                }
                else
                {
                    JsonWriterService.RegisterOrphan(vm.PackRootPath, alias, payload.RelativePath);
                }
                var cat = isItem ? TextureCategory.Item : TextureCategory.Block;
                await dispatcher.InvokeAsync(async () => await vm.RescanScopedAsync(cat));
            }
        });

        // 12. TEXTURE:EXTRACT_REFERENCE
        bridge.RegisterHandler<TextureExtractReferencePayload>(IpcMessageTypes.TextureExtractReference, async (payload, corrId) =>
        {
            await dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && vm.PackRootPath != null && !string.IsNullOrEmpty(payload.FullPath))
                {
                    var refDir = CatalogReferenceService.GetActiveProfile()?.PackPath ?? CatalogReferenceService.VanillaReferencePackDirectory;
                    var srcPath = PackArchiveUtility.ResolveReferenceTexturePath(refDir, payload.FullPath, payload.RelativePath, payload.AliasKey, payload.Category, vm.PackRootPath);

                    if (!string.IsNullOrEmpty(srcPath) && File.Exists(srcPath))
                    {
                        var dir = Path.GetDirectoryName(payload.FullPath);
                        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                        {
                            Directory.CreateDirectory(dir);
                        }

                        File.Copy(srcPath, payload.FullPath, overwrite: true);

                        // If there is an associated atlas / flipbook texture companion in reference pack, extract it too
                        PackArchiveUtility.ExtractCompanionAtlasIfExists(refDir, srcPath, payload.FullPath, payload.AliasKey, vm.PackRootPath, vm.VanillaData);

                        ImagePathConverter.ClearCache();

                        var matchedAlias = vm.Aliases.FirstOrDefault(a =>
                            (!string.IsNullOrEmpty(a.FullPath) && a.FullPath.Equals(payload.FullPath, StringComparison.OrdinalIgnoreCase)) ||
                            (!string.IsNullOrEmpty(a.RelativePath) && !string.IsNullOrEmpty(payload.RelativePath) && a.RelativePath.Equals(payload.RelativePath, StringComparison.OrdinalIgnoreCase)));
                        if (matchedAlias == null)
                        {
                            matchedAlias = vm.Aliases.FirstOrDefault(a => a.Alias.Equals(payload.AliasKey, StringComparison.OrdinalIgnoreCase));
                        }
                        if (matchedAlias != null)
                        {
                            matchedAlias.Status = TextureStatus.Ok;
                        }

                        var relPath = matchedAlias?.RelativePath ?? payload.RelativePath ?? Path.GetFileName(payload.FullPath);
                        bridge.PushTextureUpdated(
                            payload.AliasKey,
                            "OK",
                            payload.FullPath,
                            IpcContractMapper.BuildVirtualTextureUrl(relPath, payload.FullPath, vm.PackRootPath),
                            relPath
                        );

                        await vm.RescanAsync();
                    }
                    else
                    {
                        bridge.PushError("Vanilla Extraction Failed", $"Could not find vanilla texture for '{payload.AliasKey}' ({payload.RelativePath ?? payload.FullPath}) in reference pack.", "error");
                    }
                }
            });
        });

        // 13. OPEN_IN_EXPLORER & PACK:OPEN_EXPLORER
        Action<OpenInExplorerPayload?, string?> handleOpenInExplorer = (payload, corrId) =>
        {
            dispatcher.Invoke(() =>
            {
                var target = payload?.TargetPath;
                if (string.IsNullOrWhiteSpace(target))
                {
                    target = vm.PackRootPath;
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
                        else if (Uri.TryCreate(target, UriKind.Absolute, out var webUri) &&
                                 (webUri.Scheme == Uri.UriSchemeHttp || webUri.Scheme == Uri.UriSchemeHttps))
                        {
                            Process.Start(new ProcessStartInfo
                            {
                                FileName = target,
                                UseShellExecute = true
                            });
                        }
                        else
                        {
                            bridge.PushError("Open in Explorer", $"Path '{target}' does not exist.", "warning");
                        }
                    }
                    catch (Exception ex)
                    {
                        bridge.PushError("Open in Explorer", $"Failed to open '{target}': {ex.Message}", "warning");
                    }
                }
            });
        };

        bridge.RegisterHandler<OpenInExplorerPayload>(IpcMessageTypes.OpenInExplorer, (payload, corrId) =>
        {
            handleOpenInExplorer(payload, corrId);
            return Task.CompletedTask;
        });

        bridge.RegisterHandler<OpenInExplorerPayload>(IpcMessageTypes.PackOpenExplorer, (payload, corrId) =>
        {
            handleOpenInExplorer(payload, corrId);
            return Task.CompletedTask;
        });

        // 14. OPEN_WITH:GET_APPS
        bridge.RegisterHandler<OpenWithGetAppsPayload>(IpcMessageTypes.OpenWithGetApps, (payload, corrId) =>
        {
            string category = payload?.Category ?? "all";
            if (string.Equals(category, "all", StringComparison.OrdinalIgnoreCase))
            {
                var imageApps = OpenWithService.GetOpenWithApps("image", forceRefresh: true);
                var jsonApps = OpenWithService.GetOpenWithApps("json", forceRefresh: true);
                bridge.PostMessage(IpcMessageTypes.OpenWithAppsList, new OpenWithAppsListPayload(imageApps, "image"));
                bridge.PostMessage(IpcMessageTypes.OpenWithAppsList, new OpenWithAppsListPayload(jsonApps, "json"));
            }
            else
            {
                var apps = OpenWithService.GetOpenWithApps(category, forceRefresh: true);
                bridge.PostMessage(IpcMessageTypes.OpenWithAppsList, new OpenWithAppsListPayload(apps, category));
            }
            return Task.CompletedTask;
        });

        // 15. OPEN_WITH:ADD_CUSTOM_APP
        bridge.RegisterHandler<OpenWithAddCustomAppPayload>(IpcMessageTypes.OpenWithAddCustomApp, (payload, corrId) =>
        {
            dispatcher.Invoke(() =>
            {
                string category = payload?.Category ?? "image";
                bool isJson = string.Equals(category, "json", StringComparison.OrdinalIgnoreCase);
                string? selectedPath = payload?.ExePath;
                if (string.IsNullOrWhiteSpace(selectedPath))
                {
                    var dlg = new OpenFileDialog
                    {
                        Title = isJson ? "Select Code / Text Editor Executable" : "Select Image Editor Executable",
                        Filter = "Executable files (*.exe)|*.exe|All files (*.*)|*.*",
                        CheckFileExists = true
                    };
                    if (dlg.ShowDialog(window) == true)
                    {
                        selectedPath = dlg.FileName;
                    }
                }

                if (!string.IsNullOrWhiteSpace(selectedPath))
                {
                    OpenWithService.AddApp(selectedPath, category: category);
                    var apps = OpenWithService.GetOpenWithApps(category, forceRefresh: true);
                    bridge.PostMessage(IpcMessageTypes.OpenWithAppsList, new OpenWithAppsListPayload(apps, category));
                }
            });
            return Task.CompletedTask;
        });

        // 16. OPEN_WITH:REMOVE_APP
        bridge.RegisterHandler<OpenWithRemoveAppPayload>(IpcMessageTypes.OpenWithRemoveApp, (payload, corrId) =>
        {
            dispatcher.Invoke(() =>
            {
                if (payload != null && !string.IsNullOrWhiteSpace(payload.Id))
                {
                    string category = payload.Category ?? "image";
                    OpenWithService.RemoveApp(payload.Id, category);
                    var apps = OpenWithService.GetOpenWithApps(category, forceRefresh: true);
                    bridge.PostMessage(IpcMessageTypes.OpenWithAppsList, new OpenWithAppsListPayload(apps, category));
                }
            });
            return Task.CompletedTask;
        });

        // 17. OPEN_WITH:SET_DEFAULT
        bridge.RegisterHandler<OpenWithSetDefaultPayload>(IpcMessageTypes.OpenWithSetDefault, (payload, corrId) =>
        {
            dispatcher.Invoke(() =>
            {
                string category = payload?.Category ?? "image";
                OpenWithService.SetDefaultApp(payload?.Id, category);
                var apps = OpenWithService.GetOpenWithApps(category, forceRefresh: true);
                bridge.PostMessage(IpcMessageTypes.OpenWithAppsList, new OpenWithAppsListPayload(apps, category));
            });
            return Task.CompletedTask;
        });
    }

}
