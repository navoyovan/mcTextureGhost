import { useEffect, useCallback, useState } from 'react';
import {
  IpcEnvelope,
  IpcMessageTypes,
  PackOpenFolderPayload,
  PackCreatePayload,
  TextureEditPayload,
  WindowActionPayload,
  TintSetPayload,
  ManifestModelDto,
} from '../types/ipc';

type IpcHandler<T = any> = (payload: T, envelope: IpcEnvelope<T>) => void;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: any;
}

/**
 * Checks whether Microsoft Edge WebView2 runtime is actively hosting the window.
 */
export function isWebViewAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function')
  );
}

// Global listener registry for demuxing incoming host messages
const globalListeners = new Map<string, Set<IpcHandler>>();
const pendingRequests = new Map<string, PendingRequest>();
let isMessageListenerAttached = false;

function ensureGlobalListenerAttached(): void {
  if (isMessageListenerAttached || !isWebViewAvailable()) return;

  const handleMessage = (event: MessageEvent) => {
    try {
      const rawData = event.data;
      const envelope: IpcEnvelope = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

      if (!envelope || typeof envelope.type !== 'string') {
        return;
      }

      // 1. Resolve correlated request-response if correlationId is tracked
      if (envelope.correlationId && pendingRequests.has(envelope.correlationId)) {
        const pending = pendingRequests.get(envelope.correlationId)!;
        clearTimeout(pending.timer);
        pendingRequests.delete(envelope.correlationId);
        pending.resolve(envelope.payload);
      }

      // 2. Demux by message type to registered subscribers
      const handlers = globalListeners.get(envelope.type);
      if (handlers && handlers.size > 0) {
        handlers.forEach((fn) => {
          try {
            fn(envelope.payload, envelope);
          } catch (err) {
            console.error(`[useIpc] Error in handler for message "${envelope.type}":`, err);
          }
        });
      }
    } catch (err) {
      console.error('[useIpc] Failed to parse or demux incoming IPC message:', err);
    }
  };

  window.chrome!.webview!.addEventListener('message', handleMessage);
  isMessageListenerAttached = true;
}

/**
 * Dispatches an IPC command envelope to the C# backend.
 */
export function postCommand<T = any>(type: string, payload: T, correlationId?: string): IpcEnvelope<T> {
  const envelope: IpcEnvelope<T> = {
    type,
    payload,
    correlationId: correlationId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `corr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    timestamp: new Date().toISOString(),
  };

  // Validate JSON serializability so circular references fail fast with TypeError
  JSON.stringify(envelope);

  if (!isWebViewAvailable()) {
    console.debug(`[useIpc Mock] Dispatching "${type}":`, envelope);
    return envelope;
  }

  try {
    // Post as object directly so WebView2 serializes natively to JSON Object
    window.chrome!.webview!.postMessage(envelope);
  } catch (err) {
    console.error(`[useIpc] Dispatch failure for message "${type}":`, err);
    throw err;
  }


  return envelope;
}

/**
 * Subscribes to an incoming host event by type.
 * Returns an unsubscribe function.
 */
export function subscribeToEvent<T = any>(type: string, handler: IpcHandler<T>): () => void {
  ensureGlobalListenerAttached();

  if (!globalListeners.has(type)) {
    globalListeners.set(type, new Set());
  }
  const set = globalListeners.get(type)!;
  set.add(handler);

  return () => {
    const currentSet = globalListeners.get(type);
    if (currentSet) {
      currentSet.delete(handler);
      if (currentSet.size === 0) {
        globalListeners.delete(type);
      }
    }
  };
}

/**
 * Sends a correlated command and awaits a matching response from the C# host.
 */
export function sendRequest<TReq = any, TRes = any>(
  type: string,
  payload: TReq,
  timeoutMs: number = 5000
): Promise<TRes> {
  ensureGlobalListenerAttached();

  const correlationId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return new Promise<TRes>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(correlationId);
      reject(new Error('IPC_TIMEOUT'));
    }, timeoutMs);

    pendingRequests.set(correlationId, { resolve, reject, timer });

    try {
      postCommand(type, payload, correlationId);
    } catch (err) {
      clearTimeout(timer);
      pendingRequests.delete(correlationId);
      reject(err);
    }
  });
}

/**
 * React hook for interacting with the C# WebView2 IPC Bridge.
 */
export function useIpc() {
  const [isAvailable, setIsAvailable] = useState<boolean>(() => isWebViewAvailable());

  useEffect(() => {
    setIsAvailable(isWebViewAvailable());
    ensureGlobalListenerAttached();
  }, []);

  const subscribe = useCallback(<T = any>(type: string, handler: IpcHandler<T>) => {
    return subscribeToEvent<T>(type, handler);
  }, []);

  const openPackFolder = useCallback((folderPath?: string | null) => {
    return postCommand<PackOpenFolderPayload>(IpcMessageTypes.PackOpenFolder, { folderPath });
  }, []);

  const reloadPack = useCallback(() => {
    return postCommand(IpcMessageTypes.PackReload, {});
  }, []);

  const createPack = useCallback((packName: string, targetDirectory?: string | null) => {
    return postCommand<PackCreatePayload>(IpcMessageTypes.PackCreate, { packName, targetDirectory });
  }, []);

  const editTexture = useCallback((aliasKey: string, fullPath: string, isGhost: boolean = false) => {
    return postCommand<TextureEditPayload>(IpcMessageTypes.TextureEdit, { aliasKey, fullPath, isGhost });
  }, []);

  const windowAction = useCallback((action: 'minimize' | 'maximize' | 'close' | 'drag') => {
    return postCommand<WindowActionPayload>(IpcMessageTypes.WindowAction, { action });
  }, []);

  const setTint = useCallback((opacityPercent: number, brightness: number, hex?: string | null) => {
    return postCommand<TintSetPayload>(IpcMessageTypes.TintSet, { opacityPercent, brightness, hex });
  }, []);

  const openInExplorer = useCallback((targetPath?: string | null, selectFile?: boolean) => {
    return postCommand(IpcMessageTypes.OpenInExplorer, { targetPath, selectFile });
  }, []);

  const closePack = useCallback(() => {
    return postCommand(IpcMessageTypes.PackClose, {});
  }, []);

  const saveManifest = useCallback((manifest: ManifestModelDto) => {
    return postCommand(IpcMessageTypes.ManifestSave, { manifest });
  }, []);

  const addVanillaEntry = useCallback((id: string, category: 'block' | 'item') => {
    return postCommand(IpcMessageTypes.VanillaAdd, { id, category });
  }, []);

  const loadCatalog = useCallback(() => {
    return postCommand(IpcMessageTypes.VanillaLoadCatalog, {});
  }, []);

  return {
    isAvailable,
    postCommand,
    sendRequest,
    subscribe,
    openPackFolder,
    reloadPack,
    createPack,
    editTexture,
    windowAction,
    setTint,
    openInExplorer,
    closePack,
    saveManifest,
    addVanillaEntry,
    loadCatalog,
  };
}
