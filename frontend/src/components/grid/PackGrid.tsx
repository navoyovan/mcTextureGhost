// frontend/src/components/grid/PackGrid.tsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { MoreVertical, Edit3, Trash2, FileX } from 'lucide-react';
import { usePackStore, pathMatchesFolder } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { TextureAliasDto } from '../../types/ipc';
import { FlipbookThumbnail } from '../common/FlipbookThumbnail';
import styles from './PackGrid.module.css';

export const PackGrid: React.FC = () => {
  const aliases = usePackStore((s) => s.aliases);
  const activeTab = usePackStore((s) => s.activeTab);
  const searchQuery = usePackStore((s) => s.searchQuery);
  const statusFilter = usePackStore((s) => s.statusFilter);
  const selectedFolderPath = usePackStore((s) => s.selectedFolderPath);
  const tileZoom = usePackStore((s) => s.tileZoom);
  const { editTexture, deleteTextureFile, deleteTextureEntries } = useIpc();

  // Tracks active open menu by tile uniqueKey
  const [activeMenuKey, setActiveMenuKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuKey(null);
      }
    };
    if (activeMenuKey) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenuKey]);

  const filteredAliases = useMemo(() => {
    if (!aliases || !Array.isArray(aliases)) return [];

    return aliases.filter((alias) => {
      // 1. Category Filter
      if (activeTab === 'blocks' && alias.category !== 'block') return false;
      if (activeTab === 'items' && alias.category !== 'item') return false;

      // 2. Status Filter
      if (statusFilter === 'ghosts' && alias.status !== 'GHOST') return false;
      if (statusFilter === 'added' && alias.status !== 'OK') return false;
      if (statusFilter === 'orphans' && alias.status !== 'ORPHAN') return false;

      // 3. Search Query Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const aliasName = (alias.alias || '').toLowerCase();
        const dispName = (alias.displayName || '').toLowerCase();
        const relPath = (alias.relativePath || '').toLowerCase();
        if (!aliasName.includes(query) && !dispName.includes(query) && !relPath.includes(query)) {
          return false;
        }
      }

      // 4. Folder Filter Scoping
      if (selectedFolderPath && !pathMatchesFolder(alias.relativePath, selectedFolderPath)) {
        return false;
      }

      return true;
    });
  }, [aliases, activeTab, searchQuery, statusFilter, selectedFolderPath]);

  const handleTileClick = (alias: TextureAliasDto) => {
    editTexture(alias.alias, alias.fullPath, alias.status === 'GHOST');
  };

  const getStatusDotClass = (status: string) => {
    switch (status) {
      case 'OK':
        return styles.statusDotOk;
      case 'GHOST':
        return styles.statusDotGhost;
      case 'ORPHAN':
        return styles.statusDotOrphan;
      case 'OVERRIDE':
        return styles.statusDotOverride;
      default:
        return styles.statusDotOk;
    }
  };

  return (
    <div className={styles.gridContainer}>
      {filteredAliases.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🔍</span>
          <span className={styles.emptyText}>No textures match the current filter</span>
        </div>
      ) : (
        <div
          className={styles.tileGrid}
          style={{
            '--tile-zoom': `${tileZoom}px`,
            '--tile-card-width': `${tileZoom + 40}px`,
          } as React.CSSProperties}
        >
          {filteredAliases.map((alias, index) => {
            const isGhost = alias.status === 'GHOST';
            const uniqueKey = `${alias.category}:${alias.alias}:${alias.relativePath || ''}:${alias.textureVariantIndex ?? ''}:${alias.blockVariantIndex ?? ''}:${index}`;

            // Always show file name including extension with lower visual weight on extension
            const rawFileName = alias.relativePath
              ? (alias.relativePath.split(/[/\\]/).pop() ?? alias.displayName ?? alias.alias)
              : (alias.displayName ?? alias.alias);
            const dotIdx = rawFileName.lastIndexOf('.');
            const fileBase = dotIdx > 0 ? rawFileName.substring(0, dotIdx) : rawFileName;
            const fileExt = dotIdx > 0 ? rawFileName.substring(dotIdx) : '.png';
            const fullFileName = `${fileBase}${fileExt}`;

            return (
              <div
                key={uniqueKey}
                className={styles.tileCard}
                onClick={() => handleTileClick(alias)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveMenuKey(uniqueKey);
                }}
                title={`${fullFileName}\nAlias: ${alias.alias}\nStatus: ${alias.status}\nPath: ${alias.relativePath}`}
              >
                {/* 3-Dots Hover Menu Trigger */}
                <button
                  type="button"
                  className={`${styles.moreButton} ${activeMenuKey === uniqueKey ? styles.moreButtonActive : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenuKey((prev) => (prev === uniqueKey ? null : uniqueKey));
                  }}
                  title="Texture options"
                  aria-label="Texture options"
                >
                  <MoreVertical size={14} />
                </button>

                {/* Dropdown Menu */}
                {activeMenuKey === uniqueKey && (
                  <div
                    ref={menuRef}
                    className={styles.dropdownMenu}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={styles.menuItem}
                      onClick={() => {
                        setActiveMenuKey(null);
                        handleTileClick(alias);
                      }}
                    >
                      <Edit3 size={13} className={styles.menuIcon} />
                      <span>Edit Texture</span>
                    </button>

                    <button
                      type="button"
                      className={`${styles.menuItem} ${styles.menuItemDanger}`}
                      disabled={isGhost || !alias.fullPath}
                      onClick={() => {
                        setActiveMenuKey(null);
                        if (alias.fullPath) {
                          deleteTextureFile(alias.fullPath, alias.alias);
                        }
                      }}
                      title={isGhost ? 'Texture file does not exist on disk' : 'Delete PNG file from disk'}
                    >
                      <Trash2 size={13} className={styles.menuIcon} />
                      <span>Delete Texture</span>
                    </button>

                    <button
                      type="button"
                      className={`${styles.menuItem} ${styles.menuItemDanger}`}
                      disabled={alias.status === 'ORPHAN'}
                      onClick={() => {
                        setActiveMenuKey(null);
                        deleteTextureEntries(alias.alias, alias.category, alias.relativePath);
                      }}
                      title={alias.status === 'ORPHAN' ? 'Orphan has no JSON declarations' : 'Remove declarations from JSON schemas'}
                    >
                      <FileX size={13} className={styles.menuIcon} />
                      <span>Delete Entries</span>
                    </button>
                  </div>
                )}

                {/* Thumbnail Container - 100% clean texture display without overlays */}
                <div
                  className={`${styles.tileThumbnailWrapper} ${!isGhost ? styles.tileThumbnailAdded : ''}`}
                >
                  {!isGhost && alias.imageUrl ? (
                    <FlipbookThumbnail
                      src={alias.imageUrl}
                      alt={alias.alias}
                      className={styles.tileThumbnail}
                      isFlipbook={alias.isFlipbook}
                      flipbook={alias.flipbook}
                      loading="lazy"
                    />
                  ) : (
                    <span className={styles.placeholderGhost}>?</span>
                  )}
                </div>

                {/* Tile Metadata with Status Dot and Badges separated from artwork */}
                <div className={styles.tileMeta}>
                  <div className={styles.tileHeaderRow}>
                    <span className={`${styles.statusDot} ${getStatusDotClass(alias.status)}`} />
                    <span className={styles.tileTitle} title={fullFileName}>
                      <span>{fileBase}</span>
                      <span className={styles.fileExt}>{fileExt}</span>
                    </span>
                    {alias.isFlipbook && (
                      <span className={styles.animBadge} title="Animated flipbook sprite-sheet">
                        ANIM
                      </span>
                    )}
                  </div>
                  <span className={styles.tileSubtitle}>
                    {alias.subtitleCaption || alias.relativePath || alias.category}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
