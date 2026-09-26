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

        // 5. TEXTURE:DROP_IMPORT
        bridge.RegisterHandler<TextureDropImportPayload>(IpcMessageTypes.TextureDropImport, async (payload, corrId) =>
        {
            await dispatcher.InvokeAsync(async () =>
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

                    var base64 = payload.Base64Data;
                    var commaIdx = base64.IndexOf(',');
                    if (commaIdx >= 0 && base64.Substring(0, commaIdx).Contains("base64"))
                    {
                        base64 = base64.Substring(commaIdx + 1);
                    }
                    var bytes = Convert.FromBase64String(base64);

                    await File.WriteAllBytesAsync(targetPath, bytes);

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

                }
                catch (Exception ex)
                {
                    bridge.PushError("Texture Drop Failed", ex.Message, "error");
                }
            });
        });

        // 6. TEXTURE:COPY_FILE
        bridge.RegisterHandler<TextureCopyFilePayload>(IpcMessageTypes.TextureCopyFile, async (payload, corrId) =>
        {
            await dispatcher.InvokeAsync(async () =>
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

                    await Task.Run(() => File.Copy(payload.SourceFullPath, targetPath, overwrite: true));

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

                }
                catch (Exception ex)
                {
                    bridge.PushError("Texture Copy Failed", ex.Message, "error");
                }
            });
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
                    var srcPath = ResolveReferenceTexturePath(refDir, payload.FullPath, payload.RelativePath, payload.AliasKey, payload.Category, vm.PackRootPath);

                    if (!string.IsNullOrEmpty(srcPath) && File.Exists(srcPath))
                    {
                        var dir = Path.GetDirectoryName(payload.FullPath);
                        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                        {
                            Directory.CreateDirectory(dir);
                        }

                        File.Copy(srcPath, payload.FullPath, overwrite: true);

                        // If there is an associated atlas / flipbook texture companion in reference pack, extract it too
                        ExtractCompanionAtlasIfExists(refDir, srcPath, payload.FullPath, payload.AliasKey, vm.PackRootPath, vm.VanillaData);

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
                            IpcContractMapper.BuildVirtualTextureUrl(relPath, payload.FullPath),
                            relPath
                        );

                        await vm.RescanAsync();
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

    private static void ExtractCompanionAtlasIfExists(string refDir, string srcPath, string targetFullPath, string? aliasKey, string packRootPath, VanillaData? vanilla)
    {
        try
        {
            var searchDirs = new List<string>();
            if (!string.IsNullOrEmpty(refDir) && Directory.Exists(refDir))
                searchDirs.Add(refDir);
            var vanillaDir = CatalogReferenceService.VanillaReferencePackDirectory;
            if (!string.IsNullOrEmpty(vanillaDir) && Directory.Exists(vanillaDir) && !searchDirs.Contains(vanillaDir, StringComparer.OrdinalIgnoreCase))
                searchDirs.Add(vanillaDir);

            // 1. Flipbook-based discovery & registration
            if (!string.IsNullOrEmpty(aliasKey) && vanilla != null)
            {
                if (vanilla.RawFlipbookJson.TryGetValue(aliasKey, out var rawFbJson))
                {
                    JsonWriterService.AppendFlipbookIfNotExists(packRootPath, aliasKey, rawFbJson);

                    try
                    {
                        using var doc = JsonDocument.Parse(rawFbJson);
                        if (doc.RootElement.TryGetProperty("flipbook_texture", out var fbProp))
                        {
                            var fbTex = fbProp.GetString()?.Replace('\\', '/').TrimStart('/');
                            if (!string.IsNullOrEmpty(fbTex))
                            {
                                foreach (var sDir in searchDirs)
                                {
                                    var fbSrcPng = Path.Combine(sDir, fbTex + ".png");
                                    var fbSrcTga = Path.Combine(sDir, fbTex + ".tga");
                                    var fbSrcExact = Path.Combine(sDir, fbTex);

                                    string? chosenSrc = null;
                                    string ext = ".png";
                                    if (File.Exists(fbSrcPng)) { chosenSrc = fbSrcPng; ext = ".png"; }
                                    else if (File.Exists(fbSrcTga)) { chosenSrc = fbSrcTga; ext = ".tga"; }
                                    else if (File.Exists(fbSrcExact)) { chosenSrc = fbSrcExact; ext = Path.GetExtension(fbSrcExact); }

                                    if (chosenSrc != null)
                                    {
                                        var targetAtlasPath = Path.Combine(packRootPath, fbTex + ext);
                                        var targetDir = Path.GetDirectoryName(targetAtlasPath);
                                        if (!string.IsNullOrEmpty(targetDir) && !Directory.Exists(targetDir))
                                            Directory.CreateDirectory(targetDir);

                                        File.Copy(chosenSrc, targetAtlasPath, overwrite: true);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    catch { }
                }
            }

            // 2. Naming-convention companion discovery (e.g. compass_atlas.png, watch_atlas.png, clock_atlas.png, etc.)
            var fnWithoutExt = Path.GetFileNameWithoutExtension(srcPath);
            var baseName = fnWithoutExt;
            if (baseName.EndsWith("_item", StringComparison.OrdinalIgnoreCase))
                baseName = baseName.Substring(0, baseName.Length - 5);

            var atlasCandidates = new List<string>
            {
                $"{baseName}_atlas.png",
                $"{baseName}_atlas.tga",
                $"{fnWithoutExt}_atlas.png",
                $"{fnWithoutExt}_atlas.tga"
            };

            if (baseName.Equals("clock", StringComparison.OrdinalIgnoreCase) || baseName.Equals("watch", StringComparison.OrdinalIgnoreCase))
            {
                atlasCandidates.Add("watch_atlas.png");
                atlasCandidates.Add("watch_atlas.tga");
                atlasCandidates.Add("clock_atlas.png");
                atlasCandidates.Add("clock_atlas.tga");
            }
            else if (baseName.Equals("compass", StringComparison.OrdinalIgnoreCase))
            {
                atlasCandidates.Add("compass_atlas.png");
                atlasCandidates.Add("compass_atlas.tga");
            }
            else if (baseName.Equals("recovery_compass", StringComparison.OrdinalIgnoreCase))
            {
                atlasCandidates.Add("recovery_compass_atlas.png");
                atlasCandidates.Add("recovery_compass_atlas.tga");
            }
            else if (baseName.Equals("lodestonecompass", StringComparison.OrdinalIgnoreCase) || baseName.Equals("lodestone_compass", StringComparison.OrdinalIgnoreCase))
            {
                atlasCandidates.Add("lodestonecompass_atlas.png");
                atlasCandidates.Add("lodestonecompass_atlas.tga");
                atlasCandidates.Add("lodestone_compass_atlas.png");
                atlasCandidates.Add("lodestone_compass_atlas.tga");
            }

            var srcDir = Path.GetDirectoryName(srcPath);
            var destDir = Path.GetDirectoryName(targetFullPath);

            foreach (var candName in atlasCandidates.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                string? srcAtlasFound = null;

                // Check in same source directory first
                if (!string.IsNullOrEmpty(srcDir))
                {
                    var candPath = Path.Combine(srcDir, candName);
                    if (File.Exists(candPath))
                    {
                        srcAtlasFound = candPath;
                    }
                }

                // Check in searchDirs/textures/items
                if (srcAtlasFound == null)
                {
                    foreach (var sDir in searchDirs)
                    {
                        var candPath = Path.Combine(sDir, "textures", "items", candName);
                        if (File.Exists(candPath))
                        {
                            srcAtlasFound = candPath;
                            break;
                        }
                    }
                }

                if (srcAtlasFound != null)
                {
                    if (!string.IsNullOrEmpty(destDir))
                    {
                        if (!Directory.Exists(destDir)) Directory.CreateDirectory(destDir);
                        var destAtlasPath = Path.Combine(destDir, candName);
                        File.Copy(srcAtlasFound, destAtlasPath, overwrite: true);
                    }
                }
            }
        }
        catch { }
    }
}
