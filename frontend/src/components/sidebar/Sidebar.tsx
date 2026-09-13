// frontend/src/components/sidebar/Sidebar.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BookOpen, X } from 'lucide-react';
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
  const referencePacks = usePackStore((s) => s.referencePacks);
  const activeReferenceId = usePackStore((s) => s.activeReferenceId);
  const setActiveReferenceId = usePackStore((s) => s.setActiveReferenceId);
  const [packIconLoadError, setPackIconLoadError] = useState<boolean>(false);
  const [catalogIconLoadError, setCatalogIconLoadError] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [btnRect, setBtnRect] = useState<DOMRect | null>(null);
  const [shouldPortal, setShouldPortal] = useState<boolean>(false);

  useEffect(() => {
    setPackIconLoadError(false);
  }, [packIconUrl, packRoot]);

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

  const [isHovered, setIsHovered] = useState<boolean>(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      setIsHovered(false);
      hoverTimerRef.current = null;
    }, 800);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateRect = () => {
      if (containerRef.current) {
        setBtnRect(containerRef.current.getBoundingClientRect());
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

  const showPackArtworkImage = Boolean(hasPackIcon && packIconUrl && !packIconLoadError);

  const vanillaPackIconLocal = 'https://vanilla.local/pack_icon.png';
  const vanillaPackIconRemote = 'https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/pack_icon.png';
  const [vanillaIconSrc, setVanillaIconSrc] = useState<string>(vanillaPackIconLocal);

  const activeReference = useMemo(() => {
    return referencePacks?.find((p) => p.id === activeReferenceId) || referencePacks?.[0] || {
      id: 'vanilla',
      name: 'Vanilla Bedrock',
      version: '1.21.x',
      description: 'Mojang bedrock-samples official reference database',
      iconUrl: 'https://vanilla.local/pack_icon.png',
      isVanilla: true,
    };
  }, [referencePacks, activeReferenceId]);

  const customReference = useMemo(() => {
    return referencePacks?.find((p) => !p.isVanilla) || null;
  }, [referencePacks]);

  const handleCatalogIconError = () => {
    if (vanillaIconSrc === vanillaPackIconLocal) {
      setVanillaIconSrc(vanillaPackIconRemote);
    } else {
      setCatalogIconLoadError(true);
    }
  };

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

    const catalogIcon = activeReference.isVanilla ? vanillaIconSrc : activeReference.iconUrl;

    return (
      <div
        ref={!isPortaled ? containerRef : undefined}
        style={customStyle}
        className={`${styles.catalogCardContainer} ${isHovered ? styles.catalogCardContainerHovered : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          type="button"
          className={styles.exploreCatalogCard}
          onClick={() => setIsCatalogOpen(!isCatalogOpen)}
          title={isCatalogOpen ? `Close ${activeReference.name} Catalog` : `Open ${activeReference.name} Catalog`}
        >
          <div className={styles.catalogCardIconWrapper}>
            {!catalogIconLoadError ? (
              <img
                src={catalogIcon}
                alt={`${activeReference.name} Icon`}
                className={styles.catalogCardPackImg}
                onError={handleCatalogIconError}
              />
            ) : (
              <BookOpen size={16} />
            )}
          </div>
          <div className={styles.catalogCardMeta}>
            <span className={styles.catalogCardTitle}>Explore Catalog</span>
            <span className={styles.catalogCardSubtitle}>{activeReference.name}</span>
          </div>
        </button>

        {/* Floating buttons stacked vertically on top of each other like copies of Explore Catalog card */}
        <div className={styles.sidebarFloatingStack}>
          {/* Top Button: Vanilla Bedrock Reference */}
          <button
            type="button"
            className={`${styles.sidebarFloatingCard} ${activeReferenceId === 'vanilla' ? styles.sidebarFloatingCardActive : ''}`}
            title="Vanilla Bedrock Reference Catalog"
            aria-label="Vanilla Bedrock Reference"
            onClick={(e) => {
              e.stopPropagation();
              setActiveReferenceId('vanilla');
              postCommand(IpcMessageTypes.CatalogSetReference, { id: 'vanilla' });
            }}
          >
            <div className={styles.floatingCardIconWrapper}>
              <img
                src={vanillaIconSrc}
                alt="Vanilla Pack Icon"
                style={{ width: '100%', height: '100%', borderRadius: 4, objectFit: 'cover', imageRendering: 'pixelated' }}
                onError={handleCatalogIconError}
              />
            </div>
            <div className={styles.catalogCardMeta}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={styles.catalogCardTitle}>Vanilla Bedrock</span>
                <span className={styles.referenceVersionBadge}>1.21.x</span>
              </div>
              <span className={styles.catalogCardSubtitle}>
                {activeReferenceId === 'vanilla' ? 'Active reference' : 'Click to select vanilla'}
              </span>
            </div>
            {activeReferenceId === 'vanilla' && (
              <span style={{ marginLeft: 'auto', color: '#c4b5fd', fontSize: 12 }}>✓</span>
            )}
          </button>

          {/* Under Button: Custom Reference / Empty State Button (prompts folder picker on click) */}
          {customReference ? (
            <div className={styles.customCardWrapper}>
              <button
                type="button"
                className={`${styles.sidebarFloatingCard} ${activeReferenceId === customReference.id ? styles.sidebarFloatingCardActive : ''}`}
                title={`Custom Reference: ${customReference.name}. Click to select, or right click to change folder.`}
                aria-label="Custom Reference Pack"
                onClick={(e) => {
                  e.stopPropagation();
                  if (activeReferenceId === customReference.id) {
                    // If already selected, clicking allows picking another folder
                    postCommand(IpcMessageTypes.CatalogPickReference, {});
                  } else {
                    setActiveReferenceId(customReference.id);
                    postCommand(IpcMessageTypes.CatalogSetReference, { id: customReference.id });
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  postCommand(IpcMessageTypes.CatalogPickReference, {});
                }}
              >
                <div className={styles.floatingCardIconWrapper}>
                  <img
                    src={customReference.iconUrl}
                    alt={customReference.name}
                    style={{ width: '100%', height: '100%', borderRadius: 4, objectFit: 'cover', imageRendering: 'pixelated' }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = 'https://vanilla.local/pack_icon.png';
                    }}
                  />
                </div>
                <div className={styles.catalogCardMeta}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={styles.catalogCardTitle}>{customReference.name}</span>
                    <span className={styles.referenceVersionBadge}>{customReference.version}</span>
                  </div>
                  <span className={styles.catalogCardSubtitle}>
                    {activeReferenceId === customReference.id ? 'Active custom pack' : 'Click to select custom'}
                  </span>
                </div>
                {activeReferenceId === customReference.id && (
                  <span style={{ marginLeft: 'auto', color: '#c4b5fd', fontSize: 12 }}>✓</span>
                )}
              </button>

              <button
                type="button"
                className={styles.removeReferenceBtn}
                title="Remove custom reference pack"
                aria-label="Remove Custom Reference Pack"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveReferenceId('vanilla');
                  postCommand(IpcMessageTypes.CatalogRemoveReference, { id: customReference.id });
                }}
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`${styles.sidebarFloatingCard} ${styles.sidebarFloatingCardEmpty}`}
              title="Click to select a resource pack folder or manifest to use as reference"
              aria-label="Pick Reference Pack Folder"
              onClick={(e) => {
                e.stopPropagation();
                postCommand(IpcMessageTypes.CatalogPickReference, {});
              }}
            >
              <div className={styles.floatingCardEmptyIconWrapper}>
                <span>+</span>
              </div>
              <div className={styles.catalogCardMeta}>
                <span className={styles.catalogCardTitle}>Custom Reference</span>
                <span className={styles.catalogCardSubtitle}>Click to pick pack folder...</span>
              </div>
            </button>
          )}
        </div>
      </div>
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
            {showPackArtworkImage ? (
              <img
                key={packIconUrl || packRoot || 'icon'}
                src={packIconUrl || ''}
                alt="Pack Icon"
                className={styles.packIconImg96}
                onError={() => setPackIconLoadError(true)}
              />
            ) : (
              <div className={styles.packIconPlaceholder}>
                <span className={styles.packIconPlaceholderGhost}>👻</span>
                <span className={styles.packIconPlaceholderText}>+ ICON</span>
              </div>
            )}
          </button>

          {/* Retro Status Badge Pills on the side */}
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

        {/* Pack name and directory under the icon */}
        <div className={styles.packMeta}>
          <span className={styles.packTitle} title={packName || 'Resource Pack'}>
            {packName || 'Resource Pack'}
          </span>
          <span className={styles.packPath} title={packRoot || ''}>
            {formatPackPath(packRoot)}
          </span>
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

