// frontend/src/components/grid/PackGrid.tsx
import React, { useMemo } from 'react';
import { usePackStore, pathMatchesFolder } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { TextureAliasDto } from '../../types/ipc';
import styles from './PackGrid.module.css';

export const PackGrid: React.FC = () => {
  const aliases = usePackStore((s) => s.aliases);
  const activeTab = usePackStore((s) => s.activeTab);
  const searchQuery = usePackStore((s) => s.searchQuery);
  const statusFilter = usePackStore((s) => s.statusFilter);
  const selectedFolderPath = usePackStore((s) => s.selectedFolderPath);
  const tileZoom = usePackStore((s) => s.tileZoom);
  const { editTexture } = useIpc();

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

  if (filteredAliases.length === 0) {
    return (
      <div className={styles.gridContainer}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🔍</span>
          <span className={styles.emptyText}>No textures match the current filter</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.gridContainer}>
      <div
        className={styles.tileGrid}
        style={{
          '--tile-zoom': `${tileZoom}px`,
          '--tile-card-width': `${tileZoom + 40}px`,
        } as React.CSSProperties}
      >
        {filteredAliases.map((alias) => {
          const isGhost = alias.status === 'GHOST';
          return (
            <div
              key={alias.alias + (alias.relativePath || '')}
              className={styles.tileCard}
              onClick={() => handleTileClick(alias)}
              title={`${alias.displayName || alias.alias}\nStatus: ${alias.status}\nPath: ${alias.relativePath}`}
            >
              {/* Thumbnail Container */}
              <div className={styles.tileThumbnailWrapper}>
                <span className={`${styles.statusDot} ${getStatusDotClass(alias.status)}`} />

                {!isGhost && alias.imageUrl ? (
                  <img
                    src={alias.imageUrl}
                    alt={alias.alias}
                    className={styles.tileThumbnail}
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className={styles.placeholderGhost}>?</span>
                )}

                {alias.isFlipbook && (
                  <span className={styles.animBadge} title="Animated flipbook sprite-sheet">
                    ANIM
                  </span>
                )}
              </div>

              {/* Tile Metadata */}
              <div className={styles.tileMeta}>
                <span className={styles.tileTitle}>{alias.displayName || alias.alias}</span>
                <span className={styles.tileSubtitle}>
                  {alias.subtitleCaption || alias.relativePath || alias.category}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
