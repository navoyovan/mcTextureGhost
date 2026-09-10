using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;

namespace McTextureGhost.Services;

#region Event Arguments & Interfaces

public class IpcMessageEventArgs : EventArgs
{
    public required string Type { get; init; }
    public JsonElement Payload { get; init; }
    public string? CorrelationId { get; init; }
    public required string Timestamp { get; init; }
    public required string RawJson { get; init; }
}

public class IpcErrorEventArgs : EventArgs
{
    public required string Title { get; init; }
    public required string Message { get; init; }
    public Exception? Exception { get; init; }
}

/// <summary>
/// Service interface for bidirectional typed JSON communication and virtual host mapping
/// between the C# WPF host and the Chromium WebView2 React frontend.
/// </summary>
public interface IIpcBridgeService : IDisposable
{
    /// <summary>Whether CoreWebView2 is currently attached and active.</summary>
    bool IsAttached { get; }

    /// <summary>Currently active mapped pack root directory, if any.</summary>
    string? CurrentPackRoot { get; }

    /// <summary>Attaches the bridge to an initialized CoreWebView2 instance and WPF Dispatcher.</summary>
    void Attach(CoreWebView2 coreWebView2, Dispatcher dispatcher);

    /// <summary>Detaches the bridge, unhooks event listeners, and releases references.</summary>
    void Detach();

    /// <summary>Maps or updates the virtual host "https://pack.local/" to the active pack root folder.</summary>
    void SetPackVirtualHost(string? packRoot);

    /// <summary>Maps the virtual host "https://vanilla.local/" to the vanilla reference cache directory.</summary>
    void SetVanillaVirtualHost(string? vanillaCacheDir = null);

    /// <summary>Maps the virtual host "https://app.local/" to the production frontend bundle directory.</summary>
    void SetAppVirtualHost(string distPath);

    /// <summary>Dispatches a typed message envelope to the web runtime asynchronously from any thread.</summary>
    Task PostMessageAsync<T>(string type, T payload, string? correlationId = null);

    /// <summary>Dispatches a typed message envelope to the web runtime (fire-and-forget) from any thread.</summary>
    void PostMessage<T>(string type, T payload, string? correlationId = null);

    /// <summary>Convenience: pushes full pack state to web.</summary>
    void PushPackState(PackStatePayload state);

    /// <summary>Convenience: pushes scan progress update to web.</summary>
    void PushScanProgress(string stage, int current, int total, string message);

    /// <summary>Convenience: pushes single texture update to web.</summary>
    void PushTextureUpdated(string aliasKey, string newStatus, string fullPath, string? imageUrl = null);

    /// <summary>Convenience: pushes app theme/debug configuration to web.</summary>
    void PushAppConfig(int tintOpacity, int tintBrightness, string tintHex, bool debugMode, string windowTitle = "McTextureGhost");

    /// <summary>Convenience: pushes an error notification to web.</summary>
    void PushError(string title, string message, string severity = "error");

    /// <summary>Registers an asynchronous handler for an incoming command type with typed payload.</summary>
    void RegisterHandler<TPayload>(string commandType, Func<TPayload, string?, Task> handler);

    /// <summary>Registers a synchronous handler for an incoming command type with typed payload.</summary>
    void RegisterHandler<TPayload>(string commandType, Action<TPayload, string?> handler);

    /// <summary>Registers a raw JsonElement handler for an incoming command type.</summary>
    void RegisterHandler(string commandType, Func<JsonElement, string?, Task> handler);

    /// <summary>Unregisters a previously registered command handler.</summary>
    void UnregisterHandler(string commandType);

    /// <summary>Fired on every valid incoming message received from web.</summary>
    event EventHandler<IpcMessageEventArgs>? RawMessageReceived;

    /// <summary>Fired when an IPC deserialization, dispatch, or handler error occurs.</summary>
    event EventHandler<IpcErrorEventArgs>? BridgeError;
}

#endregion

#region Implementation

/// <summary>
/// High-performance, thread-safe bidirectional JSON IPC bridge and virtual host manager.
/// Ensures non-blocking background thread serialization while enforcing UI-thread affinity
/// for all CoreWebView2 native COM calls.
/// </summary>
public sealed class IpcBridgeService : IIpcBridgeService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    private CoreWebView2? _coreWebView2;
    private Dispatcher? _dispatcher;
    private readonly ConcurrentDictionary<string, Func<JsonElement, string?, Task>> _handlers =
        new(StringComparer.OrdinalIgnoreCase);

    private string? _currentPackRoot;
    public string? CurrentPackRoot => _currentPackRoot;

    public bool IsAttached => _coreWebView2 != null && _dispatcher != null;

    public event EventHandler<IpcMessageEventArgs>? RawMessageReceived;
    public event EventHandler<IpcErrorEventArgs>? BridgeError;

    public IpcBridgeService()
    {
    }

    public IpcBridgeService(CoreWebView2 coreWebView2, Dispatcher dispatcher)
    {
        Attach(coreWebView2, dispatcher);
    }

    public void Attach(CoreWebView2 coreWebView2, Dispatcher dispatcher)
    {
        ArgumentNullException.ThrowIfNull(coreWebView2);
        ArgumentNullException.ThrowIfNull(dispatcher);

        if (_coreWebView2 != null)
        {
            Detach();
        }

        _coreWebView2 = coreWebView2;
        _dispatcher = dispatcher;

        _coreWebView2.AddWebResourceRequestedFilter("https://pack.local/*", CoreWebView2WebResourceContext.All);
        _coreWebView2.AddWebResourceRequestedFilter("http://pack.local/*", CoreWebView2WebResourceContext.All);
        _coreWebView2.AddWebResourceRequestedFilter("https://vanilla.local/*", CoreWebView2WebResourceContext.All);
        _coreWebView2.AddWebResourceRequestedFilter("http://vanilla.local/*", CoreWebView2WebResourceContext.All);
        _coreWebView2.WebResourceRequested += OnWebResourceRequested;

        _coreWebView2.WebMessageReceived += OnWebMessageReceived;
    }

    public void Detach()
    {
        if (_coreWebView2 != null)
        {
            try
            {
                _coreWebView2.WebResourceRequested -= OnWebResourceRequested;
                _coreWebView2.WebMessageReceived -= OnWebMessageReceived;
            }
            catch { /* Ignore COM exception if WebView2 already terminated */ }
            _coreWebView2 = null;
        }

        _dispatcher = null;
    }

    #region Virtual Host Mapping (pack.local, vanilla.local, app.local)

    public void SetPackVirtualHost(string? packRoot)
    {
        if (_coreWebView2 == null || _dispatcher == null) return;

        if (!_dispatcher.CheckAccess())
        {
            _dispatcher.Invoke(() => SetPackVirtualHost(packRoot));
            return;
        }

        try
        {
            if (!string.IsNullOrWhiteSpace(packRoot) && Directory.Exists(packRoot))
            {
                _coreWebView2.SetVirtualHostNameToFolderMapping(
                    "pack.local",
                    Path.GetFullPath(packRoot),
                    CoreWebView2HostResourceAccessKind.Allow
                );
                _currentPackRoot = packRoot;
                Debug.WriteLine($"[IPC Bridge] Mapped 'https://pack.local/' to '{packRoot}'");
            }
            else
            {
                try
                {
                    _coreWebView2.ClearVirtualHostNameToFolderMapping("pack.local");
                }
                catch { /* Ignore if not mapped */ }
                _currentPackRoot = null;
                Debug.WriteLine("[IPC Bridge] Cleared mapping for 'pack.local'");
            }
        }
        catch (Exception ex)
        {
            RaiseError("Virtual Host Error", $"Failed to map pack.local: {ex.Message}", ex);
        }
    }

    public void SetVanillaVirtualHost(string? vanillaCacheDir = null)
    {
        if (_coreWebView2 == null || _dispatcher == null) return;

        if (!_dispatcher.CheckAccess())
        {
            _dispatcher.Invoke(() => SetVanillaVirtualHost(vanillaCacheDir));
            return;
        }

        try
        {
            var cachePath = vanillaCacheDir ?? VanillaDataService.CacheDirectory;
            if (!Directory.Exists(cachePath))
            {
                Directory.CreateDirectory(cachePath);
            }

            _coreWebView2.SetVirtualHostNameToFolderMapping(
                "vanilla.local",
                Path.GetFullPath(cachePath),
                CoreWebView2HostResourceAccessKind.Allow
            );
            Debug.WriteLine($"[IPC Bridge] Mapped 'https://vanilla.local/' to '{cachePath}'");
        }
        catch (Exception ex)
        {
            RaiseError("Virtual Host Error", $"Failed to map vanilla.local: {ex.Message}", ex);
        }
    }

    public void SetAppVirtualHost(string distPath)
    {
        if (_coreWebView2 == null || _dispatcher == null) return;

        if (!_dispatcher.CheckAccess())
        {
            _dispatcher.Invoke(() => SetAppVirtualHost(distPath));
            return;
        }

        try
        {
            if (!string.IsNullOrWhiteSpace(distPath) && Directory.Exists(distPath))
            {
                _coreWebView2.SetVirtualHostNameToFolderMapping(
                    "app.local",
                    Path.GetFullPath(distPath),
                    CoreWebView2HostResourceAccessKind.Allow
                );
                Debug.WriteLine($"[IPC Bridge] Mapped 'https://app.local/' to '{distPath}'");
            }
            else
            {
                RaiseError("Virtual Host Warning", $"App dist directory does not exist: {distPath}");
            }
        }
        catch (Exception ex)
        {
            RaiseError("Virtual Host Error", $"Failed to map app.local: {ex.Message}", ex);
        }
    }

    private void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        try
        {
            var uri = new Uri(e.Request.Uri);
            string? targetFolder = null;

            if (uri.Host.Equals("pack.local", StringComparison.OrdinalIgnoreCase))
            {
                targetFolder = _currentPackRoot;
            }
            else if (uri.Host.Equals("vanilla.local", StringComparison.OrdinalIgnoreCase))
            {
                targetFolder = VanillaDataService.CacheDirectory;
            }

            if (!string.IsNullOrEmpty(targetFolder) && Directory.Exists(targetFolder))
            {
                var relPath = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'));
                var fullPath = Path.Combine(targetFolder, relPath.Replace('/', Path.DirectorySeparatorChar));

                if (!File.Exists(fullPath) && !Path.HasExtension(fullPath))
                {
                    fullPath += ".png";
                }

                // If still not found, check if it was missing the "textures" prefix
                if (!File.Exists(fullPath) && !relPath.StartsWith("textures", StringComparison.OrdinalIgnoreCase))
                {
                    var altPath = Path.Combine(targetFolder, "textures", relPath.Replace('/', Path.DirectorySeparatorChar));
                    if (!Path.HasExtension(altPath)) altPath += ".png";
                    if (File.Exists(altPath)) fullPath = altPath;
                }

                if (File.Exists(fullPath))
                {
                    var ext = Path.GetExtension(fullPath).ToLowerInvariant();
                    var mime = ext switch
                    {
                        ".png" => "image/png",
                        ".tga" => "image/x-tga",
                        ".jpg" or ".jpeg" => "image/jpeg",
                        ".json" => "application/json",
                        _ => "application/octet-stream"
                    };

                    var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                    var response = _coreWebView2!.Environment.CreateWebResourceResponse(
                        stream,
                        200,
                        "OK",
                        $"Content-Type: {mime}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store, no-cache, must-revalidate\r\n"
                    );
                    e.Response = response;
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[IPC Bridge] WebResourceRequested Error: {ex.Message}");
        }
    }

    #endregion


    #region Outgoing Message Dispatching (Thread-Safe)

    public void PostMessage<T>(string type, T payload, string? correlationId = null)
    {
        if (_coreWebView2 == null || _dispatcher == null) return;

        // Perform JSON serialization on caller thread (zero UI-thread blocking for heavy objects)
        var envelope = IpcEnvelope.Create(type, payload, correlationId);
        string json = JsonSerializer.Serialize(envelope, JsonOptions);

        if (_dispatcher.CheckAccess())
        {
            SendJsonDirect(json);
        }
        else
        {
            _dispatcher.BeginInvoke(DispatcherPriority.Normal, () => SendJsonDirect(json));
        }
    }

    public async Task PostMessageAsync<T>(string type, T payload, string? correlationId = null)
    {
        if (_coreWebView2 == null || _dispatcher == null) return;

        var envelope = IpcEnvelope.Create(type, payload, correlationId);
        string json = JsonSerializer.Serialize(envelope, JsonOptions);

        if (_dispatcher.CheckAccess())
        {
            SendJsonDirect(json);
        }
        else
        {
            await _dispatcher.InvokeAsync(() => SendJsonDirect(json), DispatcherPriority.Normal);
        }
    }

    private void SendJsonDirect(string json)
    {
        try
        {
            _coreWebView2?.PostWebMessageAsJson(json);
        }
        catch (Exception ex)
        {
            RaiseError("IPC Dispatch Error", $"Failed to post message to web runtime: {ex.Message}", ex);
        }
    }

    public void PushPackState(PackStatePayload state) =>
        PostMessage(IpcMessageTypes.PackStateChanged, state);

    public void PushScanProgress(string stage, int current, int total, string message) =>
        PostMessage(IpcMessageTypes.ScanProgress, new ScanProgressPayload(stage, current, total, message));

    public void PushTextureUpdated(string aliasKey, string newStatus, string fullPath, string? imageUrl = null) =>
        PostMessage(IpcMessageTypes.TextureUpdated, new TextureUpdatedPayload(aliasKey, newStatus, fullPath, imageUrl));

    public void PushAppConfig(int tintOpacity, int tintBrightness, string tintHex, bool debugMode, string windowTitle = "McTextureGhost") =>
        PostMessage(IpcMessageTypes.AppConfig, new AppConfigPayload(tintOpacity, tintBrightness, tintHex, debugMode, windowTitle));

    public void PushError(string title, string message, string severity = "error") =>
        PostMessage(IpcMessageTypes.ErrorNotify, new ErrorPayload(title, message, severity));

    #endregion

    #region Incoming Message Handling (Web -> C#)

    public void RegisterHandler<TPayload>(string commandType, Func<TPayload, string?, Task> handler)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(commandType);
        ArgumentNullException.ThrowIfNull(handler);

        _handlers[commandType] = async (jsonElem, corrId) =>
        {
            var typedPayload = jsonElem.Deserialize<TPayload>(JsonOptions);
            if (typedPayload == null)
            {
                throw new JsonException($"Failed to deserialize payload for command '{commandType}' to {typeof(TPayload).Name}");
            }
            await handler(typedPayload, corrId);
        };
    }

    public void RegisterHandler<TPayload>(string commandType, Action<TPayload, string?> handler)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(commandType);
        ArgumentNullException.ThrowIfNull(handler);

        _handlers[commandType] = (jsonElem, corrId) =>
        {
            var typedPayload = jsonElem.Deserialize<TPayload>(JsonOptions);
            if (typedPayload == null)
            {
                throw new JsonException($"Failed to deserialize payload for command '{commandType}' to {typeof(TPayload).Name}");
            }
            handler(typedPayload, corrId);
            return Task.CompletedTask;
        };
    }

    public void RegisterHandler(string commandType, Func<JsonElement, string?, Task> handler)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(commandType);
        ArgumentNullException.ThrowIfNull(handler);
        _handlers[commandType] = handler;
    }

    public void UnregisterHandler(string commandType)
    {
        _handlers.TryRemove(commandType, out _);
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string rawJson = string.Empty;
        try
        {
            try
            {
                rawJson = e.TryGetWebMessageAsString();
            }
            catch
            {
                rawJson = null!;
            }

            if (string.IsNullOrWhiteSpace(rawJson))
            {
                rawJson = e.WebMessageAsJson;
            }

            if (string.IsNullOrWhiteSpace(rawJson)) return;

            using var doc = JsonDocument.Parse(rawJson);
            var root = doc.RootElement;

            // If the message was stringified before postMessage, unwrap the inner JSON
            if (root.ValueKind == JsonValueKind.String)
            {
                var inner = root.GetString();
                if (string.IsNullOrWhiteSpace(inner)) return;
                using var innerDoc = JsonDocument.Parse(inner);
                DispatchMessageElement(innerDoc.RootElement, inner);
                return;
            }

            DispatchMessageElement(root, rawJson);
        }
        catch (JsonException jex)
        {
            Debug.WriteLine($"[IPC Bridge] JSON Parse Error: {jex.Message}\nRaw: {rawJson}");
            RaiseError("IPC Parse Error", $"Failed to parse incoming JSON: {jex.Message}\nRaw: {rawJson}", jex);
            PushError("IPC Protocol Error", "Malformed JSON message received from frontend.", "warning");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[IPC Bridge] Error processing message: {ex}");
            RaiseError("IPC Error", ex.Message, ex);
        }
    }

    private void DispatchMessageElement(JsonElement root, string sourceJson)
    {
        if (root.ValueKind != JsonValueKind.Object ||
            !root.TryGetProperty("type", out var typeProp) ||
            typeProp.ValueKind != JsonValueKind.String)
        {
            RaiseError("Invalid IPC Message", "Incoming web message missing 'type' property.", null);
            return;
        }

        string type = typeProp.GetString()!;
        string? correlationId = root.TryGetProperty("correlationId", out var corrProp) ? corrProp.GetString() : null;
        string timestamp = root.TryGetProperty("timestamp", out var tsProp) ? tsProp.GetString() ?? "" : "";

        JsonElement payload = root.TryGetProperty("payload", out var plProp) ? plProp.Clone() : default;

        // Raise raw message event
        RawMessageReceived?.Invoke(this, new IpcMessageEventArgs
        {
            Type = type,
            Payload = payload,
            CorrelationId = correlationId,
            Timestamp = timestamp,
            RawJson = sourceJson
        });

        // Route to registered handler
        if (_handlers.TryGetValue(type, out var handler))
        {
            // Asynchronously execute handler to prevent UI thread lock
            _ = Task.Run(async () =>
            {
                try
                {
                    await handler(payload, correlationId);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[IPC Bridge] Error in handler for '{type}': {ex}");
                    RaiseError($"Command Handler Failed ({type})", ex.Message, ex);
                    PushError($"Action Failed: {type}", ex.Message, "error");
                }
            });
        }
        else
        {
            Debug.WriteLine($"[IPC Bridge] Unhandled command received: {type}");
        }
    }

    private void RaiseError(string title, string message, Exception? ex = null)
    {
        BridgeError?.Invoke(this, new IpcErrorEventArgs
        {
            Title = title,
            Message = message,
            Exception = ex
        });
    }

    #endregion

    public void Dispose()
    {
        Detach();
        _handlers.Clear();
    }
}

#endregion
