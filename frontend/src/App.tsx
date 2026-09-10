// frontend/src/App.tsx
import React, { useEffect, useState } from 'react';
import { Sparkles, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { usePackStore } from './store/packStore';
import { useIpc } from './hooks/useIpc';
import { IpcMessageTypes, ErrorPayload } from './types/ipc';
import { applyTintTokens, DEFAULT_TINT } from './styles/themeEngine';
import { WelcomeView } from './components/welcome/WelcomeView';
import { Sidebar } from './components/sidebar/Sidebar';
import { Toolbar } from './components/toolbar/Toolbar';
import { PackGrid } from './components/grid/PackGrid';
import { BlockWorkspace } from './components/workspace/BlockWorkspace';
import { CatalogDrawer } from './components/catalog/CatalogDrawer';
import { MenuBar } from './components/menus/MenuBar';
import { IconMinus, IconMaximize, IconX } from './components/common/TablerWindowIcons';
import styles from './App.module.css';

export const App: React.FC = () => {
  const { subscribe, windowAction, postCommand } = useIpc();
  const packRoot = usePackStore((s) => s.packRoot);
  const windowTitle = usePackStore((s) => s.windowTitle);
  const activeView = usePackStore((s) => s.activeView);
  const setPackState = usePackStore((s) => s.setPackState);
  const updateTexture = usePackStore((s) => s.updateTexture);
  const setScanProgress = usePackStore((s) => s.setScanProgress);
  const setAppConfig = usePackStore((s) => s.setAppConfig);
  const isCatalogOpen = usePackStore((s) => s.isCatalogOpen);
  const setIsCatalogOpen = usePackStore((s) => s.setIsCatalogOpen);


  const [activeToast, setActiveToast] = useState<ErrorPayload | null>(null);

  const packFolderName = packRoot?.split(/[\\/]/).filter(Boolean).pop() || 'Resource Pack';
  const activeFolderSuffix = usePackStore((s) => s.selectedFolderPath)
    ?.split(/[\\/]/)
    .filter(Boolean)
    .join('/');
  const packLocationLabel = activeFolderSuffix
    ? `${packFolderName}/${activeFolderSuffix}`
    : packFolderName;

  const handleTitleBarMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('button')) {
      windowAction('drag');
    }
  };

  const handleTitleBarDoubleClick = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('button')) {
      windowAction('maximize');
    }
  };

  // Initialize theme tokens & wire bidirectional IPC event subscribers on mount
  useEffect(() => {
    applyTintTokens(DEFAULT_TINT);

    // Notify host that frontend is mounted and ready to receive state
    postCommand('APP:READY', {});

    // 1. PACK:STATE_CHANGED
    const unsubPackState = subscribe(IpcMessageTypes.PackStateChanged, (payload) => {
      setPackState(payload);
    });


    // 2. SCAN:PROGRESS
    const unsubScanProgress = subscribe(IpcMessageTypes.ScanProgress, (payload) => {
      setScanProgress(payload);
    });

    // 3. TEXTURE:UPDATED
    const unsubTextureUpdated = subscribe(IpcMessageTypes.TextureUpdated, (payload) => {
      updateTexture(payload.aliasKey, payload.newStatus, payload.fullPath, payload.imageUrl);
    });

    // 4. APP:CONFIG
    const unsubAppConfig = subscribe(IpcMessageTypes.AppConfig, (payload) => {
      setAppConfig(payload);
      applyTintTokens(payload);
    });

    // 5. ERROR:NOTIFY
    const unsubError = subscribe(IpcMessageTypes.ErrorNotify, (payload) => {
      setActiveToast(payload);
      const timer = setTimeout(() => setActiveToast(null), 5000);
      return () => clearTimeout(timer);
    });

    return () => {
      unsubPackState();
      unsubScanProgress();
      unsubTextureUpdated();
      unsubAppConfig();
      unsubError();
    };
  }, [subscribe, setPackState, updateTexture, setScanProgress, setAppConfig]);

  return (
    <div className={styles.appContainer} data-testid="app-shell">
      {/* Top Custom Window Title Bar */}
      <header
        className={styles.titleBar}
        onMouseDown={handleTitleBarMouseDown}
        onDoubleClick={handleTitleBarDoubleClick}
      >
        <div className={styles.titleBarLeft}>
          <Sparkles className={styles.appIcon} />
          <span className={styles.appTitle}>
            {windowTitle || 'McTextureGhost'}
          </span>

          {/* File / Dev Menus */}
          <MenuBar />

          {packRoot && (
            <span className={styles.packBadge} data-testid="pack-badge">
              {packLocationLabel}
            </span>
          )}
        </div>

        {/* Window Chrome Caption Controls */}
        <div className={styles.titleBarControls}>
          <button
            type="button"
            className={styles.captionButton}
            onClick={() => windowAction('minimize')}
            aria-label="Minimize Window"
            title="Minimize"
          >
            <IconMinus className={styles.captionIcon} />
          </button>
          <button
            type="button"
            className={styles.captionButton}
            onClick={() => windowAction('maximize')}
            aria-label="Maximize Window"
            title="Maximize"
          >
            <IconMaximize className={styles.captionIcon} />
          </button>
          <button
            type="button"
            className={`${styles.captionButton} ${styles.captionButtonClose}`}
            onClick={() => windowAction('close')}
            aria-label="Close Window"
            title="Close"
          >
            <IconX className={styles.captionIcon} />
          </button>
        </div>
      </header>

      {/* Main Viewport Routing */}
      <main className={styles.mainViewport}>
        {!packRoot ? (
          <WelcomeView />
        ) : (
          <div data-testid="workspace-container" className={styles.workspaceContainer}>
            <Sidebar />
            <div className={styles.workspaceContentArea}>
              <Toolbar />
              {activeView === 'workspace' ? <BlockWorkspace /> : <PackGrid />}
            </div>
          </div>
        )}
      </main>

      {/* Vanilla Bedrock Reference Catalog Drawer (Milestone 3: R3) */}
      <CatalogDrawer
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
      />

      {/* Error / Notification Toast */}
      {activeToast && (
        <aside
          className={styles.notificationToast}
          role="alert"
          data-testid="error-toast"
        >
          {activeToast.severity === 'error' && (
            <AlertCircle className={styles.toastIconError} />
          )}
          {activeToast.severity === 'warning' && (
            <AlertTriangle className={styles.toastIconWarning} />
          )}
          {activeToast.severity === 'info' && (
            <Info className={styles.toastIconInfo} />
          )}

          <div className={styles.toastContent}>
            <h4 className={styles.toastTitle}>{activeToast.title}</h4>
            <p className={styles.toastMessage}>{activeToast.message}</p>
          </div>

          <button
            type="button"
            className={styles.toastCloseButton}
            onClick={() => setActiveToast(null)}
            aria-label="Dismiss Notification"
          >
            <X className={styles.captionIcon} />
          </button>
        </aside>
      )}
    </div>
  );
};
