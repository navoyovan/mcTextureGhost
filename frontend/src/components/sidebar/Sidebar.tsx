import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { TextureAliasDto, OpenWithAppDto } from '../../types/ipc';
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
  const isSidebarCollapsed = usePackStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = usePackStore((s) => s.toggleSidebar);
  const [packIconLoadError, setPackIconLoadError] = useState<boolean>(false);

  // Morphing Portal & Context Menu states for Pack Icon
  const [hoverMorphTarget, setHoverMorphTarget] = useState<TileHoverMorphTarget | null>(null);
  const [contextMenuTarget, setContextMenuTarget] = useState<{
    alias: TextureAliasDto;
    anchor: ContextMenuAnchor;
    key: string;
  } | null>(null);

  useEffect(() => {
    setPackIconLoadError(false);
  }, [packIconUrl, packRoot]);

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

