// frontend/src/components/common/JsonFileContextMenu.tsx
import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ExternalLink,
  FolderOpen,
  Copy,
  Check,
  ChevronRight,
  Plus,
  Star,
  X,
  AppWindow,
  Edit3,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { OpenWithAppDto, IpcMessageTypes } from '../../types/ipc';
import styles from './TextureContextMenu.module.css';

export interface JsonFileContextMenuProps {
  fileName: string;
  relativePath: string;
  fullPath: string;
  anchor: { x: number; y: number } | { top: number; left: number; bottom?: number; right?: number };
  onClose: () => void;
}

function computeMenuPosition(
  anchor: { x: number; y: number } | { top: number; left: number; bottom?: number; right?: number },
  measuredWidth = 240,
  measuredHeight = 240
): { top: number; left: number } {
  const menuWidth = measuredWidth;
  const menuHeight = measuredHeight;
  const padding = 10;

  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  let targetX = 'x' in anchor ? anchor.x : anchor.left;
  let targetY = 'y' in anchor ? anchor.y : ('bottom' in anchor && anchor.bottom ? anchor.bottom : anchor.top);

  if (targetX + menuWidth > winWidth - padding) {
    targetX = Math.max(padding, winWidth - menuWidth - padding);
  }
  if (targetX < padding) targetX = padding;
  if (targetY + menuHeight > winHeight - padding) {
    targetY = Math.max(padding, ('top' in anchor ? anchor.top : targetY) - menuHeight - 4);
  }
  if (targetY < padding) targetY = padding;

  return { top: targetY, left: targetX };
}

export const JsonFileContextMenu: React.FC<JsonFileContextMenuProps> = ({
  fileName,
  relativePath,
  fullPath,
  anchor,
  onClose,
}) => {
  const jsonOpenWithApps = usePackStore((s) => s.jsonOpenWithApps);
  const { addCustomEditor, removeCustomEditor, setDefaultEditor, postCommand } = useIpc();
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'full' | 'rel' | null>(null);

  const defaultApp = jsonOpenWithApps?.find((a) => a.isDefault);

  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>(() =>
    computeMenuPosition(anchor)
  );

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    const padding = 10;

    let adjustedLeft = menuPos.left;
    let adjustedTop = menuPos.top;

    if (rect.right > winWidth - padding) {
      adjustedLeft = Math.max(padding, winWidth - rect.width - padding);
    }
    if (adjustedLeft < padding) {
      adjustedLeft = padding;
    }

    if (rect.bottom > winHeight - padding) {
      const fallbackTop = 'top' in anchor ? anchor.top : ('y' in anchor ? anchor.y : menuPos.top);
      adjustedTop = Math.max(padding, fallbackTop - rect.height - 4);
    }
    if (adjustedTop < padding) {
      adjustedTop = padding;
    }

    if (adjustedLeft !== menuPos.left || adjustedTop !== menuPos.top) {
      setMenuPos({ top: adjustedTop, left: adjustedLeft });
    }
  }, [anchor]);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const currentMenuWidth = menuRef.current?.offsetWidth || 240;
  const flipLeft = menuPos.left + currentMenuWidth + 200 > winWidth;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const handleSubmenuEnter = useCallback(() => {
    clearCloseTimer();
    setIsSubmenuOpen(true);
  }, [clearCloseTimer]);

  const handleSubmenuLeave = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setIsSubmenuOpen(false);
    }, 800);
  }, [clearCloseTimer]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleCopy = (type: 'full' | 'rel') => {
    const textToCopy = type === 'full' ? fullPath : relativePath;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopiedKey(type);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  const handleLaunchApp = (app?: OpenWithAppDto) => {
    postCommand(IpcMessageTypes.TextureEdit, {
      aliasKey: fileName,
      fullPath: fullPath,
      isGhost: false,
      exePath: app?.exePath || null,
    });
  };

  const handleWindowsOpenWith = () => {
    postCommand(IpcMessageTypes.TextureEdit, {
      aliasKey: fileName,
      fullPath: fullPath,
      isGhost: false,
      chooseDialog: true,
    });
  };

  const handleRevealInExplorer = () => {
    postCommand(IpcMessageTypes.OpenInExplorer, {
      targetPath: fullPath,
      selectFile: true,
    });
  };

  const dotIdx = fileName.lastIndexOf('.');
  const baseName = dotIdx !== -1 ? fileName.substring(0, dotIdx) : fileName;
  const fileExt = dotIdx !== -1 ? fileName.substring(dotIdx) : '';

  return createPortal(
    <>
      <div className={styles.dropdownPortalBackdrop} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        ref={menuRef}
        className={styles.contextMenuPortal}
        style={{ top: menuPos.top, left: menuPos.left }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className={styles.menuHeader} title={relativePath || fullPath}>
          <div className={styles.headerTitleRow}>
            <span className={styles.headerFileName} title={fileName}>
              {baseName}
            </span>
            {fileExt && <span className={styles.headerFileExt}>{fileExt}</span>}
          </div>
        </div>

        <div className={styles.menuDivider} />

        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            onClose();
            handleLaunchApp(defaultApp);
          }}
          title={defaultApp ? `Edit with ${defaultApp.name} (${defaultApp.exePath})` : 'Open in default editor'}
        >
          {defaultApp?.iconDataUrl ? (
            <img src={defaultApp.iconDataUrl} alt={defaultApp.name} className={styles.appIconImg} />
          ) : defaultApp ? (
            <AppWindow size={13} className={styles.menuIcon} />
          ) : (
            <Edit3 size={13} className={styles.menuIcon} />
          )}
          <span className={styles.menuLabel}>
            {defaultApp ? `Edit with ${defaultApp.name}` : 'Open'}
          </span>
        </button>

        <div
          className={styles.submenuWrapper}
          onMouseEnter={handleSubmenuEnter}
          onMouseLeave={handleSubmenuLeave}
        >
          <button
            type="button"
            className={styles.menuItem}
            onClick={(e) => {
              e.stopPropagation();
              clearCloseTimer();
              setIsSubmenuOpen((prev) => !prev);
            }}
          >
            <ExternalLink size={13} className={styles.menuIcon} />
            <span className={styles.menuLabel}>Open with</span>
            <ChevronRight size={12} className={styles.chevronIcon} />
          </button>

          {isSubmenuOpen && (
            <div
              className={`${styles.submenu} ${flipLeft ? styles.submenuFlipLeft : ''}`}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={handleSubmenuEnter}
              onMouseLeave={handleSubmenuLeave}
            >
              {jsonOpenWithApps && jsonOpenWithApps.length > 0 ? (
                jsonOpenWithApps.map((app) => (
                  <div
                    key={app.id}
                    className={styles.appRow}
                    onClick={() => {
                      clearCloseTimer();
                      onClose();
                      handleLaunchApp(app);
                    }}
                    title={app.exePath}
                  >
                    {app.iconDataUrl ? (
                      <img src={app.iconDataUrl} alt={app.name} className={styles.appIconImg} />
                    ) : (
                      <AppWindow size={13} className={styles.menuIcon} />
                    )}
                    <span className={styles.menuLabel}>{app.name}</span>
                    <div
                      className={`${styles.appRowActions} ${app.isDefault ? styles.appRowActionsVisible : ''}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={`${styles.actionIconBtn} ${app.isDefault ? styles.actionIconBtnActive : ''}`}
                        title={app.isDefault ? 'Default editor' : 'Set as default editor'}
                        onClick={() => setDefaultEditor(app.isDefault ? null : app.id, 'json')}
                      >
                        <Star size={11} fill={app.isDefault ? '#fbbf24' : 'none'} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionIconBtn} ${styles.actionIconBtnDanger}`}
                        title="Remove editor from list"
                        onClick={() => removeCustomEditor(app.id, 'json')}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyEditorsNotice}>
                  No code editors added yet
                </div>
              )}

              <div className={styles.menuDivider} />

              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  clearCloseTimer();
                  onClose();
                  addCustomEditor(null, 'json');
                }}
              >
                <Plus size={13} className={styles.menuIcon} />
                <span className={styles.menuLabel}>Add Editor / App...</span>
              </button>

              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  clearCloseTimer();
                  onClose();
                  handleWindowsOpenWith();
                }}
              >
                <ExternalLink size={13} className={styles.menuIcon} />
                <span className={styles.menuLabel}>Windows Open with...</span>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            onClose();
            handleRevealInExplorer();
          }}
        >
          <FolderOpen size={13} className={styles.menuIcon} />
          <span className={styles.menuLabel}>Reveal in File Explorer</span>
        </button>

        <div className={styles.menuDivider} />

        <button
          type="button"
          className={styles.menuItem}
          onClick={() => handleCopy('rel')}
        >
          {copiedKey === 'rel' ? (
            <Check size={13} className={styles.menuIconSuccess} />
          ) : (
            <Copy size={13} className={styles.menuIcon} />
          )}
          <span className={styles.menuLabel}>
            {copiedKey === 'rel' ? 'Copied relative path!' : 'Copy relative path'}
          </span>
        </button>

        <button
          type="button"
          className={styles.menuItem}
          onClick={() => handleCopy('full')}
        >
          {copiedKey === 'full' ? (
            <Check size={13} className={styles.menuIconSuccess} />
          ) : (
            <Copy size={13} className={styles.menuIcon} />
          )}
          <span className={styles.menuLabel}>
            {copiedKey === 'full' ? 'Copied absolute path!' : 'Copy full path'}
          </span>
        </button>
      </div>
    </>,
    document.body
  );
};
