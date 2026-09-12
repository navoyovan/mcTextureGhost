// frontend/src/components/sidebar/Sidebar.tsx
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BookOpen } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { IpcMessageTypes } from '../../types/ipc';
import { DirectoryTree } from './DirectoryTree';
import styles from './Sidebar.module.css';

function formatPackPath(path: string | null): string {
  if (!path) return '';
  if (path.length <= 26) return path;
  return `${path.slice(0, 9)}...${path.slice(-14)}`;
}

export const Sidebar: React.FC = () => {
  const { postCommand } = useIpc();

  const packName = usePackStore((s) => s.packName);
  const packRoot = usePackStore((s) => s.packRoot);
  const hasManifest = usePackStore((s) => s.hasManifest);
  const hasPackIcon = usePackStore((s) => s.hasPackIcon);
  const packIconUrl = usePackStore((s) => s.packIconUrl);
  const stats = usePackStore((s) => s.stats);
  const packFolders = usePackStore((s) => s.packFolders);
  const selectedFolderPath = usePackStore((s) => s.selectedFolderPath);
  const setSelectedFolderPath = usePackStore((s) => s.setSelectedFolderPath);
  const isCatalogOpen = usePackStore((s) => s.isCatalogOpen);
  const setIsCatalogOpen = usePackStore((s) => s.setIsCatalogOpen);
  const setActiveView = usePackStore((s) => s.setActiveView);
  const [iconLoadError, setIconLoadError] = useState<boolean>(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [btnRect, setBtnRect] = useState<DOMRect | null>(null);
  const [shouldPortal, setShouldPortal] = useState<boolean>(false);

  useEffect(() => {
    setIconLoadError(false);
  }, [packIconUrl]);

  useEffect(() => {
    if (isCatalogOpen) {
      setShouldPortal(true);
    } else {
      const timer = setTimeout(() => {
        setShouldPortal(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isCatalogOpen]);

  useEffect(() => {
    const updateRect = () => {
      if (buttonRef.current) {
        setBtnRect(buttonRef.current.getBoundingClientRect());
      }
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, [isCatalogOpen, shouldPortal]);

  const handlePackIconClick = () => {
    if (!packRoot) return;
    const iconPath = `${packRoot}\\pack_icon.png`;
    postCommand(IpcMessageTypes.TextureEdit, {
      aliasKey: 'pack_icon',
      fullPath: iconPath,
      isGhost: !hasPackIcon,
    });
  };

  const showIconImage = hasPackIcon && packIconUrl && !iconLoadError;

  const renderCatalogButton = (isPortaled: boolean = false) => {
    const customStyle: React.CSSProperties = isPortaled && btnRect ? {
      position: 'fixed',
      top: `${btnRect.top}px`,
      left: `${btnRect.left}px`,
      width: `${btnRect.width}px`,
      height: `${btnRect.height}px`,
      margin: 0,
      zIndex: 1002,
    } : shouldPortal ? {
      visibility: 'hidden',
    } : {};

    return (
      <button
        ref={!isPortaled ? buttonRef : undefined}
        type="button"
        style={customStyle}
        className={styles.exploreCatalogCard}
        onClick={() => setIsCatalogOpen(!isCatalogOpen)}
        title={isCatalogOpen ? 'Close Vanilla Reference Catalog' : 'Open Vanilla Bedrock Reference Catalog'}
      >
        <div className={styles.catalogCardIconWrapper}>
          <BookOpen size={16} />
        </div>
        <div className={styles.catalogCardMeta}>
          <span className={styles.catalogCardTitle}>Explore Catalog</span>
          <span className={styles.catalogCardSubtitle}>Browse vanilla Bedrock textures</span>
        </div>
      </button>
    );
  };

  return (
    <aside className={styles.sidebar} aria-label="Pack Explorer Sidebar">
      {/* 1. Active Pack Identity Card */}
      <div className={styles.packCard}>
        <div className={styles.packIdentityRow}>
          <button
            type="button"
            className={styles.packIconWrapper96}
            onClick={handlePackIconClick}
            title={hasPackIcon ? 'Open pack_icon.png in external editor' : 'Generate placeholder pack_icon.png'}
            aria-label="Pack Icon Artwork"
          >
            {showIconImage ? (
              <img
                src={packIconUrl}
                alt="Pack Icon"
                className={styles.packIconImg96}
                onError={() => setIconLoadError(true)}
              />
            ) : (
              <div className={styles.packIconPlaceholder}>
                <span className={styles.packIconPlaceholderGhost}>👻</span>
                <span className={styles.packIconPlaceholderText}>+ ICON</span>
              </div>
            )}
          </button>

          <div className={styles.packMeta}>
            <span className={styles.packTitle} title={packName || 'Resource Pack'}>
              {packName || 'Resource Pack'}
            </span>
            <span className={styles.packPath} title={packRoot || ''}>
              {formatPackPath(packRoot)}
            </span>

            {/* Retro Status Badge Pills */}
            <div className={styles.statusPillsRow}>
              <span className={styles.pillTotal} title="Total declared textures">
                {stats.totalCount || stats.total || 0} total
              </span>
              <span className={styles.pillOk} title="Textures with valid artwork on disk">
                {stats.okCount || stats.done || 0} done
              </span>
              <span className={styles.pillGhost} title="Missing texture artwork (Ghosts)">
                👻 {stats.ghostCount || stats.ghosts || 0}
              </span>
              <span className={styles.pillOrphan} title="Unlinked/orphan textures">
                ◈ {stats.orphanCount || stats.orphans || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Missing Manifest Quick-Warning Card */}
      {!hasManifest && Boolean(packRoot) && (
        <div className={styles.manifestWarningCard} role="alert">
          <div className={styles.manifestWarningHeader}>
            <AlertTriangle className={styles.warningIcon} size={15} />
            <span className={styles.warningTitle}>Missing manifest.json</span>
          </div>
          <p className={styles.warningDesc}>
            manifest.json not found. Bedrock cannot load this pack without a valid manifest.
          </p>
          <button
            type="button"
            className={styles.generateManifestBtn}
            onClick={() => setActiveView('manifest')}
          >
            ⚡ Open Manifest Editor
          </button>
        </div>
      )}

      {/* 3. Directory Explorer Tree Section */}
      <div className={styles.folderSection}>
        <div className={styles.folderTreeContainer}>
          <DirectoryTree
            folders={packFolders}
            selectedPath={selectedFolderPath}
            onSelect={setSelectedFolderPath}
            onOpenManifest={() => setActiveView('manifest')}
          />
        </div>
      </div>

      {/* 4. Catalog Button — bare, sticks to sidebar bottom */}
      {renderCatalogButton(false)}
      {shouldPortal && btnRect && createPortal(renderCatalogButton(true), document.body)}
    </aside>
  );
};

