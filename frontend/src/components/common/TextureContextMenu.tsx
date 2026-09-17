// frontend/src/components/common/TextureContextMenu.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Edit3,
  ExternalLink,
  FolderOpen,
  Copy,
  Check,
  FileCode,
  Sparkles,
  Trash2,
  FileX,
  ChevronRight,
  AppWindow,
  Plus,
  Star,
  X,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { OpenWithAppDto } from '../../types/ipc';
import styles from './TextureContextMenu.module.css';

export interface TextureContextItemData {
  alias: string;
  fullPath?: string;
  relativePath?: string;
  status: string;
  category?: string;
  hasMers?: boolean;
  mersFullPath?: string | null;
}

export interface ContextMenuAnchor {
  x?: number;
  y?: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

interface TextureContextMenuProps {
  item: TextureContextItemData;
  anchor?: ContextMenuAnchor | null;
  onClose: () => void;
  onEdit: (app?: OpenWithAppDto) => void;
  onOpenWithDialog: () => void;
  onRevealInExplorer: () => void;
  onDeleteTexture: () => void;
  onDeleteEntries: () => void;
  onEditMers?: () => void;
}

function computeMenuPosition(anchor?: ContextMenuAnchor | null): { top: number; left: number } {
  if (!anchor) return { top: 100, left: 100 };
  const menuWidth = 190;
  const menuHeight = 250;

  let targetX = 100;
  let targetY = 100;

  if (anchor.right !== undefined && anchor.bottom !== undefined) {
    targetX = anchor.right - menuWidth;
    targetY = anchor.bottom + 4;
  } else if (anchor.x !== undefined && anchor.y !== undefined) {
    targetX = anchor.x;
    targetY = anchor.y;
  }

  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  if (targetX + menuWidth > winWidth - 10) {
    targetX = winWidth - menuWidth - 10;
  }
  if (targetX < 10) targetX = 10;
  if (targetY + menuHeight > winHeight - 10) {
    targetY = Math.max(10, (anchor.top ?? targetY) - menuHeight - 4);
  }
  if (targetY < 10) targetY = 10;

  return { top: targetY, left: targetX };
}

export const TextureContextMenu: React.FC<TextureContextMenuProps> = ({
  item,
  anchor,
  onClose,
  onEdit,
  onOpenWithDialog,
  onRevealInExplorer,
  onDeleteTexture,
  onDeleteEntries,
  onEditMers,
}) => {
  const openWithApps = usePackStore((s) => s.openWithApps);
  const { addCustomEditor, removeCustomEditor, setDefaultEditor } = useIpc();
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'full' | 'rel' | null>(null);

  const defaultApp = openWithApps?.find((a) => a.isDefault);

  const initialPos = useRef<{ top: number; left: number } | null>(null);
  if (!initialPos.current) {
    initialPos.current = computeMenuPosition(anchor);
  }
  const [menuPos] = useState<{ top: number; left: number }>(initialPos.current);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGhost = item.status === 'GHOST';
  const isOrphan = item.status === 'ORPHAN';

  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const flipLeft = menuPos.left + 190 + 200 > winWidth;

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
    // 800ms grace period before closing submenu
    closeTimerRef.current = setTimeout(() => {
      setIsSubmenuOpen(false);
    }, 800);
  }, [clearCloseTimer]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  // Global escape dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopyPath = useCallback(
    (type: 'full' | 'rel') => {
      const textToCopy = type === 'full' ? item.fullPath : item.relativePath;
      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy);
        setCopiedKey(type);
        setTimeout(() => setCopiedKey(null), 1500);
      }
    },
    [item.fullPath, item.relativePath]
  );

  return createPortal(
    <div className={styles.dropdownPortalBackdrop} onMouseDown={onClose}>
      <div
        className={styles.contextMenuPortal}
        style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 1. Default Edit Texture (Uses default app icon/name if configured) */}
        <button
          type="button"
          className={styles.menuItem}
          disabled={isGhost}
          onClick={() => {
            onClose();
            onEdit(defaultApp);
          }}
          title={isGhost ? 'Texture file does not exist on disk' : defaultApp ? `Edit with ${defaultApp.name} (${defaultApp.exePath})` : 'Edit with default image editor'}
        >
          {defaultApp?.iconDataUrl ? (
            <img src={defaultApp.iconDataUrl} alt={defaultApp.name} className={styles.appIconImg} />
          ) : defaultApp ? (
            <AppWindow size={13} className={styles.menuIcon} />
          ) : (
            <Edit3 size={13} className={styles.menuIcon} />
          )}
          <span className={styles.menuLabel}>
            {defaultApp ? `Edit with ${defaultApp.name}` : 'Edit Texture'}
          </span>
        </button>

        {/* 2. Open With Submenu Trigger & Flyout */}
        <div
          className={styles.hasSubmenu}
          onMouseEnter={!isGhost ? handleSubmenuEnter : undefined}
          onMouseLeave={!isGhost ? handleSubmenuLeave : undefined}
        >
          <button
            type="button"
            className={styles.menuItem}
            disabled={isGhost}
            title={isGhost ? 'Texture file does not exist on disk' : undefined}
            onClick={(e) => {
              if (isGhost) return;
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
              {openWithApps && openWithApps.length > 0 ? (
                openWithApps.map((app) => (
                  <div
                    key={app.id}
                    className={styles.appRow}
                    onClick={() => {
                      clearCloseTimer();
                      onClose();
                      onEdit(app);
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
                        onClick={() => setDefaultEditor(app.isDefault ? null : app.id)}
                      >
                        <Star size={11} fill={app.isDefault ? '#fbbf24' : 'none'} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionIconBtn} ${styles.actionIconBtnDanger}`}
                        title="Remove editor from list"
                        onClick={() => removeCustomEditor(app.id)}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyEditorsNotice}>
                  No custom editors added yet
                </div>
              )}

              <div className={styles.menuDivider} />

              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  clearCloseTimer();
                  onClose();
                  addCustomEditor(null);
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
                  onOpenWithDialog();
                }}
              >
                <ExternalLink size={13} className={styles.menuIcon} />
                <span className={styles.menuLabel}>Windows Open with...</span>
              </button>
            </div>
          )}
        </div>

        <div className={styles.menuDivider} />

        {/* 3. Reveal in File Explorer */}
        <button
          type="button"
          className={styles.menuItem}
          disabled={isGhost || !item.fullPath}
          onClick={() => {
            onClose();
            onRevealInExplorer();
          }}
          title={isGhost ? 'Texture file does not exist on disk' : 'Locate file in Windows File Explorer'}
        >
          <FolderOpen size={13} className={styles.menuIcon} />
          <span className={styles.menuLabel}>Reveal in Explorer</span>
        </button>

        {/* 4. Copy Full Path */}
        <button
          type="button"
          className={styles.menuItem}
          disabled={!item.fullPath}
          onClick={() => handleCopyPath('full')}
        >
          {copiedKey === 'full' ? (
            <Check size={13} className={styles.menuIcon} style={{ color: '#4ade80' }} />
          ) : (
            <Copy size={13} className={styles.menuIcon} />
          )}
          <span className={styles.menuLabel}>Copy Path</span>
          {copiedKey === 'full' && <span className={styles.copiedBadge}>Copied!</span>}
        </button>

        {/* 5. Copy Relative Path */}
        <button
          type="button"
          className={styles.menuItem}
          disabled={!item.relativePath}
          onClick={() => handleCopyPath('rel')}
        >
          {copiedKey === 'rel' ? (
            <Check size={13} className={styles.menuIcon} style={{ color: '#4ade80' }} />
          ) : (
            <FileCode size={13} className={styles.menuIcon} />
          )}
          <span className={styles.menuLabel}>Copy Relative Path</span>
          {copiedKey === 'rel' && <span className={styles.copiedBadge}>Copied!</span>}
        </button>

        {/* 6. Edit MERS (if available) */}
        {item.hasMers && item.mersFullPath && (
          <>
            <div className={styles.menuDivider} />
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                onClose();
                if (onEditMers) onEditMers();
              }}
              title={`Edit PBR MERS map: ${item.mersFullPath}`}
            >
              <Sparkles size={13} className={styles.menuIcon} />
              <span className={styles.menuLabel}>Edit MERS</span>
            </button>
          </>
        )}

        <div className={styles.menuDivider} />

        {/* 7. Delete Texture (danger) */}
        <button
          type="button"
          className={`${styles.menuItem} ${styles.menuItemDanger}`}
          disabled={isGhost || !item.fullPath}
          onClick={() => {
            onClose();
            onDeleteTexture();
          }}
          title={isGhost ? 'Texture file does not exist on disk' : 'Delete PNG file from disk'}
        >
          <Trash2 size={13} className={styles.menuIcon} />
          <span className={styles.menuLabel}>Delete Texture</span>
        </button>

        {/* 8. Delete Entries (danger) */}
        <button
          type="button"
          className={`${styles.menuItem} ${styles.menuItemDanger}`}
          disabled={isOrphan}
          onClick={() => {
            onClose();
            onDeleteEntries();
          }}
          title={isOrphan ? 'Orphan has no JSON declarations' : 'Remove declarations from JSON schemas'}
        >
          <FileX size={13} className={styles.menuIcon} />
          <span className={styles.menuLabel}>Delete Entries</span>
        </button>
      </div>
    </div>,
    document.body
  );
};
