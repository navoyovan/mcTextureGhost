import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BookOpen, X } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { IpcMessageTypes, TextureAliasDto, OpenWithAppDto } from '../../types/ipc';
import { TileHoverMorphPortal, TileHoverMorphTarget } from '../grid/TileHoverMorphPortal';
import { TextureContextMenu, ContextMenuAnchor } from '../common/TextureContextMenu';
import { DirectoryTree } from './DirectoryTree';
import { Badge } from '../common/Badge';
import styles from './Sidebar.module.css';

function formatPackPath(path: string | null): string {
  if (!path) return '';
  if (path.length <= 26) return path;
  return `${path.slice(0, 9)}...${path.slice(-14)}`;
}

export const Sidebar: React.FC = () => {
  const {
    postCommand,
    editTexture,
    openInExplorer,
    deleteTextureFile,
    deleteTextureEntries,
  } = useIpc();

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
  const isSidebarCollapsed = usePackStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = usePackStore((s) => s.toggleSidebar);
  const referencePacks = usePackStore((s) => s.referencePacks);
  const activeReferenceId = usePackStore((s) => s.activeReferenceId);
  const setActiveReferenceId = usePackStore((s) => s.setActiveReferenceId);
  const [packIconLoadError, setPackIconLoadError] = useState<boolean>(false);
  const [catalogIconLoadError, setCatalogIconLoadError] = useState<boolean>(false);

  // Morphing Portal & Context Menu states for Pack Icon
  const [hoverMorphTarget, setHoverMorphTarget] = useState<TileHoverMorphTarget | null>(null);
  const [contextMenuTarget, setContextMenuTarget] = useState<{
    alias: TextureAliasDto;
    anchor: ContextMenuAnchor;
    key: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [btnRect, setBtnRect] = useState<DOMRect | null>(null);
  const [shouldPortal, setShouldPortal] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPackIconLoadError(false);
  }, [packIconUrl, packRoot]);

  useEffect(() => {
    if (isHovered && !isCatalogOpen) {
      setShouldPortal(true);
    } else {
      const timer = setTimeout(() => {
        setShouldPortal(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isHovered, isCatalogOpen]);

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 150);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    setIsHovered(false);
  };

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

  const showPackArtworkImage = Boolean(hasPackIcon && packIconUrl && !packIconLoadError);

  const packIconAlias: TextureAliasDto = useMemo(() => {
    const iconPath = packRoot ? `${packRoot}\\pack_icon.png` : '';
    const effectiveImageUrl = showPackArtworkImage
      ? (packIconUrl || `https://pack.local/pack_icon.png?t=${Date.now()}`)
      : '';

    return {
      alias: 'pack_icon',
      displayName: 'pack_icon.png',
      relativePath: 'pack_icon.png',
      fullPath: iconPath,
      category: 'item' as const,
      status: hasPackIcon ? 'OK' : 'GHOST',
      exists: Boolean(hasPackIcon),
      imageUrl: effectiveImageUrl,
      blockFaces: [],
      usedByBlocks: [],
      variantKind: 'None',
      isFlipbook: false,
      primaryFaceBadgeText: hasPackIcon ? 'OK' : 'GHOST',
      subtitleCaption: 'pack_icon.png',
      key: 'pack_icon',
    };
  }, [packRoot, hasPackIcon, showPackArtworkImage, packIconUrl]);

  const handlePackIconClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!packRoot) return;
    setContextMenuTarget(null);
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverMorphTarget({
      alias: packIconAlias,
      key: 'pack_icon',
      originRect: rect,
      domElement: e.currentTarget,
    });
  };

  const handlePackIconContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!packRoot) return;
    setHoverMorphTarget(null);
    setContextMenuTarget({
      alias: packIconAlias,
      key: 'pack_icon',
      anchor: { x: e.clientX, y: e.clientY },
    });
  };

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
    } : (shouldPortal && !isCatalogOpen) ? {
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
                <Badge variant="mono" size="sm">1.21.x</Badge>
              </div>
              <span className={styles.catalogCardSubtitle}>
                {activeReferenceId === 'vanilla' ? 'Active reference' : 'Click to select vanilla'}
              </span>
            </div>
            {activeReferenceId === 'vanilla' && (
              <span className={styles.floatingCardCheck}>✓</span>
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
                    <Badge variant="mono" size="sm">{customReference.version}</Badge>
                  </div>
                  <span className={styles.catalogCardSubtitle}>
                    {activeReferenceId === customReference.id ? 'Active custom pack' : 'Click to select custom'}
                  </span>
                </div>
                {activeReferenceId === customReference.id && (
                  <span className={styles.floatingCardCheck}>✓</span>
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
              className={`${styles.sidebarFloatingCard} ${styles.sidebarFloatingCardEmpty} ${styles.sidebarFloatingCardDisabled}`}
              title="Custom Reference packs are coming soon"
              aria-label="Custom Reference Coming Soon"
              disabled
            >
              <div className={styles.floatingCardEmptyIconWrapper}>
                <span>+</span>
              </div>
              <div className={styles.catalogCardMeta}>
                <span className={styles.catalogCardTitle}>Custom Reference</span>
                <span className={styles.catalogCardSubtitle}>Coming Soon</span>
              </div>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {!isSidebarCollapsed && (
        <div
          className={styles.sidebarBackdrop}
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}
      <aside
        className={`${styles.sidebar} ${isSidebarCollapsed ? styles.sidebarCollapsed : ''}`}
        aria-label="Pack Explorer Sidebar"
        aria-hidden={isSidebarCollapsed}
      >
      {/* 1. Active Pack Identity Card */}
      <div className={styles.packCard}>
        <div className={styles.packIdentityRow}>
          <button
            type="button"
            className={styles.packIconWrapper96}
            onClick={handlePackIconClick}
            onContextMenu={handlePackIconContextMenu}
            title={hasPackIcon ? 'Preview pack_icon.png (Right-click for options)' : 'Preview or create pack_icon.png (Right-click for options)'}
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

          {/* Status Badge Pills on the side */}
          <div className={styles.statusPillsRow}>
            <Badge variant="neutral" size="normal" icon={<span style={{ fontWeight: 800, fontSize: '11px' }}>Σ</span>} title="Total declared textures">
              {stats.totalCount || stats.total || 0} total
            </Badge>
            <Badge variant="ok" size="normal" icon={<span style={{ fontWeight: 800 }}>✓</span>} title="Textures with valid artwork on disk (done)">
              {stats.okCount || stats.done || 0} done
            </Badge>
            <Badge variant="ghost" size="normal" icon="👻" title="Missing texture artwork (Ghosts)">
              {stats.ghostCount || stats.ghosts || 0}
            </Badge>
            <Badge variant="orphan" size="normal" icon="◈" title="Unlinked/orphan textures">
              {stats.orphanCount || stats.orphans || 0} orphan
            </Badge>
          </div>
        </div>

        {/* Pack name and directory under the icon */}
        <div className={styles.packMeta}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={styles.packTitle} title={packName || 'Resource Pack'}>
              {packName || 'Resource Pack'}
            </span>
            {usePackStore((s) => s.isScanning) && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--accent-primary, #8ceb1f)',
                  boxShadow: '0 0 8px rgba(140, 235, 31, 0.8)',
                  display: 'inline-block',
                }}
                title="Scanning in background..."
              />
            )}
          </div>
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
            onClick={() => setSelectedFolderPath('manifest.json')}
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
            onOpenManifest={() => setSelectedFolderPath('manifest.json')}
          />
        </div>
      </div>

      {/* 4. Catalog Button — bare, sticks to sidebar bottom */}
      {renderCatalogButton(false)}
      {shouldPortal && !isCatalogOpen && btnRect && createPortal(renderCatalogButton(true), document.body)}

      {/* Singleton Context Menu for Pack Icon */}
      {contextMenuTarget && (
        <TextureContextMenu
          item={contextMenuTarget.alias}
          anchor={contextMenuTarget.anchor}
          onClose={() => setContextMenuTarget(null)}
          onEdit={(app?: OpenWithAppDto) => {
            setHoverMorphTarget(null);
            editTexture(contextMenuTarget.alias.alias, contextMenuTarget.alias.fullPath, contextMenuTarget.alias.status === 'GHOST', app?.exePath, false);
          }}
          onOpenWithDialog={() => {
            setHoverMorphTarget(null);
            editTexture(contextMenuTarget.alias.alias, contextMenuTarget.alias.fullPath, contextMenuTarget.alias.status === 'GHOST', null, true);
          }}
          onRevealInExplorer={() => {
            if (contextMenuTarget.alias.fullPath) {
              openInExplorer(contextMenuTarget.alias.fullPath, true);
            }
          }}
          onDeleteTexture={() => {
            setHoverMorphTarget(null);
            if (contextMenuTarget.alias.fullPath) {
              deleteTextureFile(contextMenuTarget.alias.fullPath, contextMenuTarget.alias.alias);
            }
          }}
          onDeleteEntries={() => {
            setHoverMorphTarget(null);
            deleteTextureEntries(contextMenuTarget.alias.alias, contextMenuTarget.alias.category, contextMenuTarget.alias.relativePath);
          }}
        />
      )}

      {/* Morphing Portal Preview for Pack Icon */}
      {hoverMorphTarget && (
        <TileHoverMorphPortal
          target={hoverMorphTarget}
          isMenuOpen={Boolean(contextMenuTarget)}
          onClose={() => setHoverMorphTarget(null)}
          onEdit={(alias) => {
            setHoverMorphTarget(null);
            editTexture(alias.alias, alias.fullPath, alias.status === 'GHOST');
          }}
          onOpenContextMenu={(alias, anchor) => {
            setContextMenuTarget({
              alias,
              key: hoverMorphTarget.key,
              anchor,
            });
          }}
        />
      )}
    </aside>
    </>
  );
};

