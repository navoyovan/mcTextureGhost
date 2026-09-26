// Services/Ipc/Handlers/IpcHandlerContext.cs
using System;
using System.Windows.Threading;
using McTextureGhost.Models;
using McTextureGhost.ViewModels;
using McTextureGhost.Views;

namespace McTextureGhost.Services.Ipc.Handlers;

/// <summary>
/// Encapsulates the runtime context required by domain-specific IPC handlers.
/// </summary>
public sealed class IpcHandlerContext
{
    public MainWindow Window { get; }
    public MainViewModel ViewModel { get; }
    public IIpcBridgeService IpcBridge { get; }
    public Dispatcher Dispatcher => Window.Dispatcher;
    public Func<bool, TextureCategory?, PackStatePayload> CreatePackStatePayload { get; }

    public IpcHandlerContext(
        MainWindow window,
        MainViewModel viewModel,
        IIpcBridgeService ipcBridge,
        Func<bool, TextureCategory?, PackStatePayload> createPackStatePayload)
    {
        Window = window ?? throw new ArgumentNullException(nameof(window));
        ViewModel = viewModel ?? throw new ArgumentNullException(nameof(viewModel));
        IpcBridge = ipcBridge ?? throw new ArgumentNullException(nameof(ipcBridge));
        CreatePackStatePayload = createPackStatePayload ?? throw new ArgumentNullException(nameof(createPackStatePayload));
    }
}
