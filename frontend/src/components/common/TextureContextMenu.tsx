// frontend/src/components/common/TextureContextMenu.tsx
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
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
  Compass,
  Shuffle,
  Scale,
  Tag,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { OpenWithAppDto } from '../../types/ipc';
import styles from './TextureContextMenu.module.css';

export interface TextureContextItemData {
  alias: string;
  displayName?: string;
  fullPath?: string;
  relativePath?: string;
  status: string;
  category?: string;
  variantKind?: string | null;
  blockVariantIndex?: number | null;
  textureVariantIndex?: number | null;
  totalTextureVariants?: number | null;
  weight?: number | null;
  hasMers?: boolean;
  mersFullPath?: string | null;
  hasAtlas?: boolean;
  atlasFullPath?: string | null;
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
  onDeleteEntries?: () => void;
  onEditMers?: () => void;
  onEditAtlas?: () => void;
  /** Blocks-only: scaffold N new texture variation entries for this tile's blockstate slot */
  onAddVariation?: (count: number) => void;
  /** Blocks-only: delete this tile's texture variation entry (file on disk is kept) */
  onDeleteVariation?: () => void;
  /** Blocks-only: update variation weight */
  onUpdateWeight?: (weight: number) => void;
  /** Blocks-only: rename variation relative path / label */
  onRenameVariation?: (newLabel: string) => void;
}

function computeMenuPosition(anchor?: ContextMenuAnchor | null, measuredWidth = 240, measuredHeight = 260): { top: number; left: number } {
  if (!anchor) return { top: 100, left: 100 };
  const menuWidth = measuredWidth;
  const menuHeight = measuredHeight;
  const padding = 10;

  let targetX = 100;
  let targetY = 100;

  if (anchor.right !== undefined && anchor.bottom !== undefined) {
    targetX = anchor.right - menuWidth;
    targetY = anchor.bottom + 4;
  } else if (anchor.x !== undefined && anchor.y !== undefined) {
    targetX = anchor.x;
    targetY = anchor.y;
  } else if (anchor.left !== undefined && anchor.top !== undefined) {
    targetX = anchor.left;
    targetY = anchor.top;
  }

  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  if (targetX + menuWidth > winWidth - padding) {
    targetX = Math.max(padding, winWidth - menuWidth - padding);
  }
  if (targetX < padding) targetX = padding;
  if (targetY + menuHeight > winHeight - padding) {
    const fallbackTop = anchor.top ?? anchor.y ?? targetY;
    targetY = Math.max(padding, fallbackTop - menuHeight - 4);
  }
  if (targetY < padding) targetY = padding;

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
  onEditAtlas,
  onAddVariation,
  onDeleteVariation,
  onUpdateWeight,
  onRenameVariation,
}) => {
  const openWithApps = usePackStore((s) => s.openWithApps);
  const { addCustomEditor, removeCustomEditor, setDefaultEditor } = useIpc();
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'full' | 'rel' | null>(null);
  const [varCount, setVarCount] = useState(1);
  const initialWeight = item.weight ?? 1;
  const [customWeight, setCustomWeight] = useState<number>(initialWeight);
  const isVarCountDirty = varCount !== 1;
  const isWeightDirty = customWeight !== initialWeight;
  const [customLabel, setCustomLabel] = useState<string>(() => {
    if (item.relativePath) {
      const parts = item.relativePath.split(/[/\\]/);
      const fileName = parts.pop() ?? '';
      return fileName.replace(/\.[^/.]+$/, '');
    }
    return item.displayName ?? item.alias;
  });
  const [isEditingLabel, setIsEditingLabel] = useState(false);

  const defaultApp = openWithApps?.find((a) => a.isDefault);

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
      const fallbackTop = anchor?.top ?? anchor?.y ?? menuPos.top;
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

  const isGhost = item.status === 'GHOST';
  const isOrphan = item.status === 'ORPHAN';

  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const currentMenuWidth = menuRef.current?.offsetWidth || 240;
  const flipLeft = menuPos.left + currentMenuWidth + 200 > winWidth;
  const flipFloatingRight = menuPos.left + currentMenuWidth + 40 > winWidth;

  const isTextureVariation = Boolean(
    (item.totalTextureVariants != null && item.totalTextureVariants > 1) ||
    item.textureVariantIndex != null ||
    item.weight != null ||
    item.variantKind === 'TextureVariant' ||
    item.variantKind === 'NestedVariant'
  );

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

  const rawFileName = item.relativePath
    ? (item.relativePath.split(/[/\\]/).pop() ?? item.displayName ?? item.alias)
    : (item.displayName ?? item.alias);
  const sourceForExt = item.fullPath || item.relativePath || item.alias || rawFileName;
  const dotIdx = sourceForExt.lastIndexOf('.');
  const cleanExt = dotIdx > 0 ? (sourceForExt.substring(dotIdx).split('?')[0] ?? '').split('#')[0] ?? '' : '';
  const fileExt = cleanExt && cleanExt.length <= 5 ? cleanExt : '.png';
  const rawDotIdx = rawFileName.lastIndexOf('.');
  const fileBase = rawDotIdx > 0 && cleanExt ? rawFileName.substring(0, rawDotIdx) : rawFileName;
  const fullDisplayName = `${fileBase}${fileExt}`;

  return createPortal(
    <div className={styles.dropdownPortalBackdrop} onMouseDown={onClose}>
      <div
        ref={menuRef}
        className={styles.contextMenuPortal}
        style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header Displaying Texture Name (Single Line) */}
        <div className={styles.menuHeader} title={item.relativePath || fullDisplayName}>
          <div className={styles.headerTitleRow}>
            <span className={styles.headerFileName}>{fileBase}</span>
            {fileExt && <span className={styles.headerFileExt}>{fileExt}</span>}
          </div>
        </div>

        <div className={styles.menuDivider} />

        {/* 1. Default Edit/Open Texture (Uses default app icon/name if configured) */}
        <button
          type="button"
          className={styles.menuItem}
          disabled={isGhost}
          onClick={() => {
            onClose();
            onEdit(defaultApp);
          }}
          title={isGhost ? 'Texture file does not exist on disk' : defaultApp ? `Edit with ${defaultApp.name} (${defaultApp.exePath})` : 'Open in default editor'}
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

        {/* 6b. Edit Atlas (if available) */}
        {item.hasAtlas && item.atlasFullPath && (
          <>
            <div className={styles.menuDivider} />
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                onClose();
                if (onEditAtlas) onEditAtlas();
              }}
              title={`Edit item atlas texture: ${item.atlasFullPath}`}
            >
              <Compass size={13} className={styles.menuIcon} />
              <span className={styles.menuLabel}>Edit Atlas</span>
            </button>
          </>
        )}

        {/* 6c. Add Variation (blocks workspace only) */}
        {onAddVariation && (
          <>
            <div className={styles.menuDivider} />
            <div className={styles.addVariationRow}>
              <Shuffle size={13} className={styles.menuIcon} />
              <span className={styles.menuLabel}>Add variation</span>
              <div className={styles.varStepper}>
                <button
                  type="button"
                  className={styles.varStepBtn}
                  onClick={(e) => { e.stopPropagation(); setVarCount((n) => Math.max(1, n - 1)); }}
                  tabIndex={-1}
                  title="Decrease count"
                >−</button>
                <input
                  type="number"
                  id="variation-count-input"
                  name="variationCount"
                  className={styles.varCountInput}
                  value={varCount}
                  min={1}
                  max={16}
                  onChange={(e) => setVarCount(Math.max(1, Math.min(16, parseInt(e.target.value) || 1)))}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      onClose();
                      onAddVariation(varCount);
                    }
                  }}
                />
                <button
                  type="button"
                  className={styles.varStepBtn}
                  onClick={(e) => { e.stopPropagation(); setVarCount((n) => Math.min(16, n + 1)); }}
                  tabIndex={-1}
                  title="Increase count"
                >+</button>
              </div>
              <button
                type="button"
                className={`${styles.varConfirmBtn} ${styles.floatingSaveBtn} ${flipFloatingRight ? styles.floatingSaveBtnLeft : ''} ${isVarCountDirty ? styles.varConfirmBtnSolid : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                  onAddVariation(varCount);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title={`Add ${varCount} variation${varCount > 1 ? 's' : ''} for '${item.alias}'`}
              >
                <Check size={11} strokeWidth={isVarCountDirty ? 2.5 : 2} />
              </button>
            </div>
          </>
        )}

        {/* 6d. Variation Weight (Texture variations only) */}
        {onUpdateWeight && isTextureVariation && (
          <div className={styles.addVariationRow}>
            <Scale size={13} className={styles.menuIcon} />
            <span className={styles.menuLabel}>Weight</span>
            <div className={styles.varStepper}>
              <button
                type="button"
                className={styles.varStepBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = Math.max(1, customWeight - 1);
                  setCustomWeight(next);
                }}
                tabIndex={-1}
                title="Decrease weight"
              >−</button>
              <input
                type="number"
                id="custom-weight-input"
                name="customWeight"
                className={styles.varCountInput}
                value={customWeight}
                min={1}
                max={999}
                onChange={(e) => {
                  const next = Math.max(1, Math.min(999, parseInt(e.target.value) || 1));
                  setCustomWeight(next);
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    onClose();
                    onUpdateWeight(customWeight);
                  }
                }}
              />
              <button
                type="button"
                className={styles.varStepBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = Math.min(999, customWeight + 1);
                  setCustomWeight(next);
                }}
                tabIndex={-1}
                title="Increase weight"
              >+</button>
            </div>
            <button
              type="button"
              className={`${styles.varConfirmBtn} ${styles.floatingSaveBtn} ${flipFloatingRight ? styles.floatingSaveBtnLeft : ''} ${isWeightDirty ? styles.varConfirmBtnSolid : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
                onUpdateWeight(customWeight);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title={`Save weight (${customWeight}) for '${item.alias}'`}
            >
              <Check size={11} strokeWidth={isWeightDirty ? 2.5 : 2} />
            </button>
          </div>
        )}

        {/* 6e. Variation Rename / Custom Label (Texture variations only) */}
        {onRenameVariation && (
          <div className={styles.addVariationRow}>
            <Tag size={13} className={styles.menuIcon} />
            <span className={styles.menuLabel}>Label</span>
            {isEditingLabel ? (
              <input
                type="text"
                id="custom-label-input"
                name="customLabel"
                autoFocus
                className={styles.varCountInput}
                style={{ width: '90px', textAlign: 'left', padding: '0 4px', borderRadius: '4px' }}
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    setIsEditingLabel(false);
                    if (customLabel.trim()) onRenameVariation(customLabel.trim());
                  } else if (e.key === 'Escape') {
                    setIsEditingLabel(false);
                  }
                }}
                onBlur={() => {
                  setIsEditingLabel(false);
                  if (customLabel.trim()) onRenameVariation(customLabel.trim());
                }}
              />
            ) : (
              <button
                type="button"
                className={styles.varConfirmBtn}
                style={{ width: 'auto', padding: '0 6px', fontSize: '10px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary, #a1a1aa)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingLabel(true);
                }}
                title="Edit variation label"
              >
                Edit
              </button>
            )}
          </div>
        )}

        {/* 6f. Delete Variation (blocks workspace only, file on disk is kept) */}
        {onDeleteVariation && (
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              onClose();
              onDeleteVariation();
            }}
            title={`Remove this variation entry for '${item.alias}' from terrain_texture.json (file on disk is kept)`}
          >
            <FileX size={13} className={styles.menuIcon} />
            <span className={styles.menuLabel}>Delete variation</span>
          </button>
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
        {onDeleteEntries && (
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
        )}
      </div>
    </div>,
    document.body
  );
};
