// Services/Ipc/Handlers/CatalogIpcHandlers.cs
using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using McTextureGhost.Models;
using McTextureGhost.Services;
using McTextureGhost.ViewModels;

namespace McTextureGhost.Services.Ipc.Handlers;

/// <summary>
/// Registers IPC handlers for vanilla catalog operations, reference pack management, and 3D geometry querying.
/// </summary>
public static class CatalogIpcHandlers
{
    public static void Register(IpcHandlerContext context)
    {
        // 12. VANILLA:ADD (Catalog Drawer -> scaffolds JSON schema definitions into pack; creates GHOSTS without needing PNGs or downloads)
        context.IpcBridge.RegisterHandler<VanillaAddPayload>(IpcMessageTypes.VanillaAdd, async (payload, corrId) =>
        {
            if (payload == null) return;
            var packRoot = await context.Dispatcher.InvokeAsync(() => context.ViewModel.PackRootPath);
            if (packRoot == null) return;
            var vData = await context.Dispatcher.InvokeAsync(() => context.ViewModel.VanillaData);
            if (vData != null)
            {
                await Task.Run(() =>
                {
                    if (string.Equals(payload.Category, "entity", StringComparison.OrdinalIgnoreCase))
                    {
                        JsonWriterService.AddVanillaEntity(packRoot, payload.Id, vData);
                    }
                    else if (string.Equals(payload.Category, "item", StringComparison.OrdinalIgnoreCase))
                    {
                        JsonWriterService.AddVanillaItem(packRoot, payload.Id, vData);
                    }
                    else
                    {
                        // Explicit alias intent from catalog (e.g. glowing_obsidian alias vs glowingobsidian block)
                        // fixes: alias "obsidian" equals blockId "obsidian" — must not add blocks.json when only terrain was requested
                        if (!string.IsNullOrEmpty(payload.Alias))
                        {
                            JsonWriterService.AddVanillaBlockAlias(packRoot, payload.Alias, vData);
                        }
                        else if (vData.RawBlocksJson.ContainsKey(payload.Id))
                        {
                            JsonWriterService.AddVanillaBlock(packRoot, payload.Id, vData);
                        }
                        else if (vData.RawTerrainTextureJson.ContainsKey(payload.Id))
                        {
                            // It's a specific alias (e.g. "door_upper" or "door_lower")
                            JsonWriterService.AddVanillaBlockAlias(packRoot, payload.Id, vData);
                        }
                        else
                        {
                            // Fallback
                            JsonWriterService.AddVanillaBlock(packRoot, payload.Id, vData);
                        }
                    }
                });
            }

            // Scaffolding JSON entries creates GHOSTS in the pack without needing PNG files or downloads
            var cat = string.Equals(payload.Category, "entity", StringComparison.OrdinalIgnoreCase)
                ? TextureCategory.Entity
                : string.Equals(payload.Category, "item", StringComparison.OrdinalIgnoreCase)
                    ? TextureCategory.Item
                    : TextureCategory.Block;
            await context.Dispatcher.InvokeAsync(async () => await context.ViewModel.RescanScopedAsync(cat));
        });

        // 12b. VANILLA:GET_3D_STATUS
        context.IpcBridge.RegisterHandler(IpcMessageTypes.VanillaGet3DStatus, (payload, corrId) =>
        {
            context.Dispatcher.Invoke(() =>
            {
                bool has3D = CatalogReferenceService.Has3DModelsInstalled();
                context.IpcBridge.PostMessage(IpcMessageTypes.Vanilla3DStatus, new Vanilla3DStatusPayload(has3D, CatalogReferenceService.VanillaReferencePackDirectory));
            });
            return Task.CompletedTask;
        });

        // 12c. VANILLA:DOWNLOAD_3D_ASSETS
        context.IpcBridge.RegisterHandler(IpcMessageTypes.VanillaDownload3DAssets, async (payload, corrId) =>
        {
            await Task.Run(async () =>
            {
                bool success = await CatalogReferenceService.DownloadVanillaSamplePackAsync((pct, msg) =>
                {
                    context.Dispatcher.Invoke(() =>
                    {
                        context.IpcBridge.PostMessage(IpcMessageTypes.DownloadProgress, new DownloadProgressPayload("download_3d_assets", pct, msg));
                    });
                });

                await context.Dispatcher.InvokeAsync(async () =>
                {
                    if (success)
                    {
                        // Reload VanillaData from the newly extracted files before rescanning
                        // so the catalog reflects the downloaded pack content (e.g. poplar blocks).
                        await context.ViewModel.RefreshVanillaAndRescanAsync();
                    }

                    bool has3D = CatalogReferenceService.Has3DModelsInstalled();
                    context.IpcBridge.PostMessage(IpcMessageTypes.Vanilla3DStatus, new Vanilla3DStatusPayload(has3D, CatalogReferenceService.VanillaReferencePackDirectory));
                });

                var detailedStatus = await CatalogReferenceService.GetDetailedStatusAsync();
                context.IpcBridge.PostMessage(IpcMessageTypes.CatalogDetailedStatus, detailedStatus);
            });
        });

        // 12d. CATALOG:GET_DETAILED_STATUS
        context.IpcBridge.RegisterHandler(IpcMessageTypes.CatalogGetDetailedStatus, async (payload, corrId) =>
        {
            var detailedStatus = await CatalogReferenceService.GetDetailedStatusAsync();
            context.IpcBridge.PostMessage(IpcMessageTypes.CatalogDetailedStatus, detailedStatus);
        });

        // 12e. CATALOG:PURGE_TEMP_ARCHIVE
        context.IpcBridge.RegisterHandler(IpcMessageTypes.CatalogPurgeTempArchive, async (payload, corrId) =>
        {
            await Task.Run(() => CatalogReferenceService.PurgeTempArchive());
            var detailedStatus = await CatalogReferenceService.GetDetailedStatusAsync();
            context.IpcBridge.PostMessage(IpcMessageTypes.CatalogDetailedStatus, detailedStatus);
        });

        // 12f. CATALOG:PURGE_EXTRACTED_DATA
        context.IpcBridge.RegisterHandler(IpcMessageTypes.CatalogPurgeExtractedData, async (payload, corrId) =>
        {
            await Task.Run(() => CatalogReferenceService.PurgeExtractedData());
            await context.Dispatcher.InvokeAsync(async () =>
            {
                await context.ViewModel.RescanAsync();
                bool has3D = CatalogReferenceService.Has3DModelsInstalled();
                context.IpcBridge.PostMessage(IpcMessageTypes.Vanilla3DStatus, new Vanilla3DStatusPayload(has3D, CatalogReferenceService.VanillaReferencePackDirectory));
            });
            var detailedStatus = await CatalogReferenceService.GetDetailedStatusAsync();
            context.IpcBridge.PostMessage(IpcMessageTypes.CatalogDetailedStatus, detailedStatus);
        });

        // 15. ADD_VANILLA_ENTRY
        context.IpcBridge.RegisterHandler<AddVanillaEntryPayload>(IpcMessageTypes.AddVanillaEntry, async (payload, corrId) =>
        {
            await context.Dispatcher.InvokeAsync(async () =>
            {
                if (payload != null && context.ViewModel.PackRootPath != null && context.ViewModel.VanillaData != null)
                {
                    var id = payload.Id ?? payload.BlockId ?? payload.Alias;
                    if (!string.IsNullOrWhiteSpace(id))
                    {
                        if (string.Equals(payload.Category, "item", StringComparison.OrdinalIgnoreCase))
                        {
                            JsonWriterService.AddVanillaItem(context.ViewModel.PackRootPath, id, context.ViewModel.VanillaData);
                        }
                        else
                        {
                            JsonWriterService.AddVanillaBlock(context.ViewModel.PackRootPath, id, context.ViewModel.VanillaData);
                        }
                        await context.ViewModel.RescanAsync();
                    }
                }
            });
        });

        // 17. VANILLA:LOAD_CATALOG
        context.IpcBridge.RegisterHandler(IpcMessageTypes.VanillaLoadCatalog, async (payload, corrId) =>
        {
            CatalogReferenceService.ClearCache();
            var activeData = CatalogReferenceService.GetActiveData(context.ViewModel.VanillaData);
            if (activeData != null)
            {
                // Snapshot Aliases on the UI thread before handing off to Task.Run.
                // ViewModel.Aliases is an ObservableCollection owned by the UI thread;
                // calling .ToList() on it from a background thread throws a cross-thread exception.
                var aliasSnapshot = await context.Dispatcher.InvokeAsync(() => context.ViewModel.Aliases.ToList());
                var cat = await Task.Run(() => PackScanner.BuildCatalogTree(aliasSnapshot, activeData, context.ViewModel.PackRootPath));
                context.Dispatcher.Invoke(() =>
                {
                    context.ViewModel.CatalogTree.Clear();
                    foreach (var node in cat)
                    {
                        context.ViewModel.CatalogTree.Add(node);
                    }
                });
            }
            context.Dispatcher.Invoke(() =>
            {
                context.IpcBridge.PushPackState(context.CreatePackStatePayload(true, null));
            });
        });

        // 18. CATALOG:PICK_REFERENCE
        context.IpcBridge.RegisterHandler<CatalogPickReferencePayload>(IpcMessageTypes.CatalogPickReference, async (payload, corrId) =>
        {
            await context.Dispatcher.InvokeAsync(async () =>
            {
                string? selectedFolder = payload?.FolderPath;
                if (string.IsNullOrWhiteSpace(selectedFolder))
                {
                    // Open dialog allowing either folder picking or manifest.json picking
                    var fileDlg = new Microsoft.Win32.OpenFileDialog
                    {
                        Title = "Select Reference Resource Pack (manifest.json or pack folder)",
                        Filter = "Minecraft Pack Files (manifest.json;pack_icon.png)|manifest.json;pack_icon.png|All Files (*.*)|*.*",
                        CheckFileExists = false,
                        FileName = "Select Folder"
                    };

                    if (fileDlg.ShowDialog(context.Window) == true)
                    {
                        var picked = fileDlg.FileName;
                        selectedFolder = MainViewModel.ResolvePackFolder(picked)
                                         ?? (Directory.Exists(picked) ? picked : Path.GetDirectoryName(picked));
                    }
                }

                if (!string.IsNullOrWhiteSpace(selectedFolder))
                {
                    var resolved = MainViewModel.ResolvePackFolder(selectedFolder) ?? selectedFolder;
                    if (Directory.Exists(resolved))
                    {
                        var added = CatalogReferenceService.AddCustomPack(resolved);
                        if (added != null)
                        {
                            context.IpcBridge.SetReferenceVirtualHost(added.PackPath);
                            var activeData = CatalogReferenceService.GetActiveData(context.ViewModel.VanillaData);
                            if (activeData != null)
                            {
                                var cat = await Task.Run(() => PackScanner.BuildCatalogTree(context.ViewModel.Aliases.ToList(), activeData, context.ViewModel.PackRootPath));
                                context.ViewModel.CatalogTree.Clear();
                                foreach (var node in cat)
                                {
                                    context.ViewModel.CatalogTree.Add(node);
                                }
                            }
                        }
                    }
                }
                context.IpcBridge.PushPackState(context.CreatePackStatePayload(true, null));
            });
        });

        // 19. CATALOG:SET_REFERENCE
        context.IpcBridge.RegisterHandler<CatalogSetReferencePayload>(IpcMessageTypes.CatalogSetReference, async (payload, corrId) =>
        {
            if (payload != null && !string.IsNullOrWhiteSpace(payload.Id))
            {
                await context.Dispatcher.InvokeAsync(async () =>
                {
                    if (CatalogReferenceService.SetActiveReference(payload.Id))
                    {
                        var active = CatalogReferenceService.GetActiveProfile();
                        if (active != null && !active.IsVanilla)
                        {
                            context.IpcBridge.SetReferenceVirtualHost(active.PackPath);
                        }
                        else
                        {
                            context.IpcBridge.SetReferenceVirtualHost(null);
                        }

                        var activeData = CatalogReferenceService.GetActiveData(context.ViewModel.VanillaData);
                        if (activeData != null)
                        {
                            var cat = await Task.Run(() => PackScanner.BuildCatalogTree(context.ViewModel.Aliases.ToList(), activeData, context.ViewModel.PackRootPath));
                            context.ViewModel.CatalogTree.Clear();
                            foreach (var node in cat)
                            {
                                context.ViewModel.CatalogTree.Add(node);
                            }
                        }
                    }
                    context.IpcBridge.PushPackState(context.CreatePackStatePayload(true, null));
                });
            }
        });

        // 20. CATALOG:REMOVE_REFERENCE
        context.IpcBridge.RegisterHandler<CatalogRemoveReferencePayload>(IpcMessageTypes.CatalogRemoveReference, async (payload, corrId) =>
        {
            if (payload != null && !string.IsNullOrWhiteSpace(payload.Id))
            {
                await context.Dispatcher.InvokeAsync(async () =>
                {
                    if (CatalogReferenceService.RemoveCustomPack(payload.Id))
                    {
                        var active = CatalogReferenceService.GetActiveProfile();
                        if (active != null && !active.IsVanilla)
                        {
                            context.IpcBridge.SetReferenceVirtualHost(active.PackPath);
                        }
                        else
                        {
                            context.IpcBridge.SetReferenceVirtualHost(null);
                        }

                        var activeData = CatalogReferenceService.GetActiveData(context.ViewModel.VanillaData);
                        if (activeData != null)
                        {
                            var cat = await Task.Run(() => PackScanner.BuildCatalogTree(context.ViewModel.Aliases.ToList(), activeData, context.ViewModel.PackRootPath));
                            context.ViewModel.CatalogTree.Clear();
                            foreach (var node in cat)
                            {
                                context.ViewModel.CatalogTree.Add(node);
                            }
                        }
                    }
                    context.IpcBridge.PushPackState(context.CreatePackStatePayload(true, null));
                });
            }
        });

        // 20. GEOMETRY:GET
        context.IpcBridge.RegisterHandler<GeometryGetPayload>(IpcMessageTypes.GeometryGet, (payload, corrId) =>
        {
            context.Dispatcher.Invoke(() =>
            {
                string? geoJson = null;
                string? geoId = payload?.GeometryId;
                var entityId = payload?.EntityId;

                if (!string.IsNullOrEmpty(geoId) && context.ViewModel.VanillaData != null)
                {
                    geoJson = context.ViewModel.VanillaData.GetGeometryJson(geoId);
                }

                if (string.IsNullOrEmpty(geoJson) && !string.IsNullOrEmpty(entityId) && context.ViewModel.VanillaData != null)
                {
                    var resolvedGeoId = context.ViewModel.VanillaData.GetGeometryForEntity(entityId);
                    if (!string.IsNullOrEmpty(resolvedGeoId))
                    {
                        geoId ??= resolvedGeoId;
                        geoJson = context.ViewModel.VanillaData.GetGeometryJson(resolvedGeoId);
                    }
                }

                // Also check if user pack has models/entity/{geoId}.geo.json
                if (string.IsNullOrEmpty(geoJson) && context.ViewModel.PackRootPath != null && Directory.Exists(context.ViewModel.PackRootPath))
                {
                    var packModels = Path.Combine(context.ViewModel.PackRootPath, "models", "entity");
                    if (Directory.Exists(packModels))
                    {
                        var cleanName = (geoId ?? entityId ?? "").Replace("geometry.", "", StringComparison.OrdinalIgnoreCase);
                        var file = Path.Combine(packModels, $"{cleanName}.geo.json");
                        if (File.Exists(file)) geoJson = File.ReadAllText(file);
                    }
                }

                geoId ??= entityId ?? "unknown";
                context.IpcBridge.PostMessage(IpcMessageTypes.GeometryData, new GeometryDataPayload(
                    GeometryId: geoId,
                    RawJson: geoJson ?? string.Empty,
                    EntityId: entityId
                ), corrId);
            });
        });
    }
}
