// Services/Ipc/Handlers/AppIpcHandlers.cs
using System.Threading.Tasks;
using McTextureGhost.Services;
using McTextureGhost.Views;

namespace McTextureGhost.Services.Ipc.Handlers;

/// <summary>
/// Registers IPC handlers for application lifecycle, window management, and tint configuration.
/// </summary>
public static class AppIpcHandlers
{
    public static void Register(IpcHandlerContext context)
    {
        // 0. APP:READY (Frontend mounted & ready to receive initial state)
        context.IpcBridge.RegisterHandler("APP:READY", async (payload, corrId) =>
        {
            context.Dispatcher.Invoke(() =>
            {
                context.IpcBridge.PushPackState(context.CreatePackStatePayload(true, null));
                context.IpcBridge.PushAppConfig(
                    context.ViewModel.TintOpacityPercent,
                    context.ViewModel.TintBrightness,
                    context.ViewModel.TintHexCode,
                    MainWindow.IsDebugMode,
                    context.ViewModel.WindowTitle,
                    OpenWithService.GetOpenWithApps());

                bool has3D = CatalogReferenceService.Has3DModelsInstalled();
                context.IpcBridge.PostMessage(IpcMessageTypes.Vanilla3DStatus, new Vanilla3DStatusPayload(has3D, CatalogReferenceService.VanillaReferencePackDirectory));
            });

            var detailedStatus = await CatalogReferenceService.GetDetailedStatusAsync();
            context.IpcBridge.PostMessage(IpcMessageTypes.CatalogDetailedStatus, detailedStatus);
        });

        // 1. WINDOW:ACTION (Minimize, Maximize/Restore, Close, Drag)
        context.IpcBridge.RegisterHandler<WindowActionPayload>(IpcMessageTypes.WindowAction, (payload, corrId) =>
        {
            if (payload != null)
            {
                context.Window.HandleWindowAction(payload.Action);
            }
        });

        // 2. TINT:SET (Update window tint opacity, brightness)
        context.IpcBridge.RegisterHandler<TintSetPayload>(IpcMessageTypes.TintSet, (payload, corrId) =>
        {
            context.Dispatcher.Invoke(() =>
            {
                if (payload != null)
                {
                    context.ViewModel.TintOpacityPercent = payload.OpacityPercent;
                    context.ViewModel.TintBrightness = payload.Brightness;
                    context.IpcBridge.PushAppConfig(
                        context.ViewModel.TintOpacityPercent,
                        context.ViewModel.TintBrightness,
                        context.ViewModel.TintHexCode,
                        MainWindow.IsDebugMode,
                        context.ViewModel.WindowTitle,
                        OpenWithService.GetOpenWithApps());
                }
            });
        });
    }
}
