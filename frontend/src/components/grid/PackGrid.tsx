import React, { useMemo, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { usePackStore, pathMatchesFolder } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { TextureAliasDto, OpenWithAppDto } from '../../types/ipc';
import { FlipbookThumbnail } from '../common/FlipbookThumbnail';
import { TextureContextMenu } from '../common/TextureContextMenu';
import { TileHoverMorphPortal, TileHoverMorphTarget } from './TileHoverMorphPortal';
import styles from './PackGrid.module.css';

interface PackGridTileProps {
  alias: TextureAliasDto;
  uniqueKey: string;
  isMenuOpen: boolean;
  onTileClick: (alias: TextureAliasDto) => void;
  onContextMenu: (e: React.MouseEvent, alias: TextureAliasDto, key: string) => void;
  onOpenMenu: (e: React.MouseEvent, alias: TextureAliasDto, key: string) => void;
  onMouseEnterTile: (domEl: HTMLElement, alias: TextureAliasDto, key: string) => void;
  onMouseLeaveTile: () => void;
}

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

const PackGridTile = React.memo<PackGridTileProps>(({
  alias,
  uniqueKey,
  isMenuOpen,
  onTileClick,
  onContextMenu,
  onOpenMenu,
  onMouseEnterTile,
  onMouseLeaveTile,
}) => {
  const isGhost = alias.status === 'GHOST';

  // Show file name including extension with matching font size and muted weight
  const rawFileName = alias.relativePath
    ? (alias.relativePath.split(/[/\\]/).pop() ?? alias.displayName ?? alias.alias)
    : (alias.displayName ?? alias.alias);
  const sourceForExt = alias.fullPath || alias.relativePath || alias.imageUrl || rawFileName;
  const dotIdx = sourceForExt.lastIndexOf('.');
  const cleanExt = dotIdx > 0 ? (sourceForExt.substring(dotIdx).split('?')[0] ?? '').split('#')[0] ?? '' : '';
  const fileExt = cleanExt && cleanExt.length <= 5 ? cleanExt : '.png';
  const rawDotIdx = rawFileName.lastIndexOf('.');
  const fileBase = rawDotIdx > 0 ? rawFileName.substring(0, rawDotIdx) : rawFileName;
  const fullFileName = `${fileBase}${fileExt}`;

  return (
    <div
      className={styles.tileCard}
      onClick={() => onTileClick(alias)}
      onMouseEnter={(e) => onMouseEnterTile(e.currentTarget, alias, uniqueKey)}
      onMouseLeave={onMouseLeaveTile}
      onContextMenu={(e) => onContextMenu(e, alias, uniqueKey)}
      title={`${fullFileName}\nAlias: ${alias.alias}\nStatus: ${alias.status}\nPath: ${alias.relativePath}`}
    >
      {/* 3-Dots Hover Menu Trigger */}
      <button
        type="button"
        className={`${styles.moreButton} ${isMenuOpen ? styles.moreButtonActive : ''}`}
        onClick={(e) => onOpenMenu(e, alias, uniqueKey)}
        title="Texture options"
        aria-label="Texture options"
      >
        <MoreVertical size={14} />
      </button>

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

      {/* Tile Metadata with Status Dot placed under the filename row */}
      <div className={styles.tileMeta}>
        <div className={styles.tileHeaderRow}>
          <span className={styles.tileTitle} title={fullFileName}>
            <span>{fileBase}</span>
            <span className={styles.fileExt}>{fileExt}</span>
          </span>
          {alias.hasMers && (
            <span className={styles.mersBadge} title={`PBR MERS layer exists: ${alias.mersFullPath}`}>
              MERS
            </span>
          )}
          {alias.isFlipbook && (
            <span className={styles.animBadge} title="Animated flipbook sprite-sheet">
              ANIM
            </span>
          )}
        </div>
        <div className={styles.tileSubRow}>
          <span className={`${styles.statusDot} ${getStatusDotClass(alias.status)}`} />
          <span className={styles.tileSubtitle}>
            {alias.subtitleCaption || alias.relativePath || alias.category}
          </span>
        </div>
      </div>
    </div>
  );
});

PackGridTile.displayName = 'PackGridTile';

export const PackGrid: React.FC = () => {
  const aliases = usePackStore((s) => s.aliases);
  const activeTab = usePackStore((s) => s.activeTab);
  const searchQuery = usePackStore((s) => s.searchQuery);
  const statusFilter = usePackStore((s) => s.statusFilter);
  const activeFilters = usePackStore((s) => s.activeFilters);
  const selectedFolderPath = usePackStore((s) => s.selectedFolderPath);
  const tileZoom = usePackStore((s) => s.tileZoom);
  const { editTexture, deleteTextureFile, deleteTextureEntries, openInExplorer } = useIpc();

  // Single active context menu target (prevents full-grid re-renders on menu toggle)
  const [contextMenuTarget, setContextMenuTarget] = useState<{
    alias: TextureAliasDto;
    anchor: { x?: number; y?: number; top?: number; bottom?: number; left?: number; right?: number };
    key: string;
  } | null>(null);

  // 2nd Hover State Morphing Portal target
  const [hoverMorphTarget, setHoverMorphTarget] = useState<TileHoverMorphTarget | null>(null);
  const hoverTimerRef = React.useRef<number | null>(null);

  const filteredAliases = useMemo(() => {
    if (!aliases || !Array.isArray(aliases)) return [];

    const effectiveFilters = activeFilters.length > 0
      ? activeFilters
      : (statusFilter !== 'all' ? [statusFilter as any] : []);

    return aliases.filter((alias) => {
      // 1. Category Filter
      if (activeTab === 'blocks' && alias.category !== 'block') return false;
      if (activeTab === 'items' && alias.category !== 'item') return false;
      if (activeTab === 'entities' && alias.category !== 'entity') return false;

      // 2. Active Filters (Checklist)
      if (effectiveFilters.length > 0) {
        const hasStatusFilter = effectiveFilters.some((f) => f === 'ghosts' || f === 'added' || f === 'orphans');
        const hasFeatureFilter = effectiveFilters.some(
          (f) => f === 'mers' || f === 'flipbook' || f === 'variations' || f === 'blockstates' || f === 'variation'
        );

        if (hasStatusFilter) {
          const statusMatch =
            (effectiveFilters.includes('ghosts') && alias.status === 'GHOST') ||
            (effectiveFilters.includes('added') && (alias.status === 'OK' || alias.status === 'OVERRIDE')) ||
            (effectiveFilters.includes('orphans') && alias.status === 'ORPHAN');
          if (!statusMatch) return false;
        }

        if (hasFeatureFilter) {
          const isMers = Boolean(alias.hasMers || alias.mersFullPath);
          const isFlipbook = Boolean(alias.isFlipbook || alias.flipbook);
          const isTextureVariation = Boolean(
            (alias.totalTextureVariants && alias.totalTextureVariants > 1) ||
            alias.variantKind === 'TextureVariant' ||
            alias.variantKind === 'NestedVariant' ||
            alias.textureVariantIndex != null
          );
          const isBlockstate = Boolean(
            (alias.totalBlockVariants && alias.totalBlockVariants > 1) ||
            alias.variantKind === 'BlockVariant' ||
            alias.variantKind === 'NestedVariant' ||
            alias.blockVariantIndex != null
          );
          const isMergedVariation = isTextureVariation || isBlockstate;

          const featureMatch =
            (effectiveFilters.includes('mers') && isMers) ||
            (effectiveFilters.includes('flipbook') && isFlipbook) ||
            (effectiveFilters.includes('variations') && isTextureVariation) ||
            (effectiveFilters.includes('blockstates') && isBlockstate) ||
            (effectiveFilters.includes('variation') && isMergedVariation);
          if (!featureMatch) return false;
        }
      }

      // 3. Search Query Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const aliasName = (alias.alias || '').toLowerCase();
        const dispName = (alias.displayName || '').toLowerCase();
        const relPath = (alias.relativePath || '').toLowerCase();
        const entId = (alias.entityId || '').toLowerCase();
        const texKey = (alias.textureKey || '').toLowerCase();
        if (
          !aliasName.includes(query) &&
          !dispName.includes(query) &&
          !relPath.includes(query) &&
          !entId.includes(query) &&
          !texKey.includes(query)
        ) {
          return false;
        }
      }

      // 4. Folder Filter Scoping
      if (selectedFolderPath && !pathMatchesFolder(alias.relativePath, selectedFolderPath)) {
        return false;
      }

      return true;
    });
  }, [aliases, activeTab, searchQuery, statusFilter, activeFilters, selectedFolderPath]);

  const handleTileClick = React.useCallback((alias: TextureAliasDto) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverMorphTarget(null);
    editTexture(alias.alias, alias.fullPath, alias.status === 'GHOST');
  }, [editTexture]);

  const handleMouseEnterTile = React.useCallback((domEl: HTMLElement, alias: TextureAliasDto, key: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setContextMenuTarget((currentMenu) => {
      if (!currentMenu) {
        hoverTimerRef.current = window.setTimeout(() => {
          if (domEl && document.body.contains(domEl)) {
            const rect = domEl.getBoundingClientRect();
            setHoverMorphTarget({
              alias,
              key,
              originRect: rect,
              domElement: domEl,
            });
          }
        }, 1200);
      }
      return currentMenu;
    });
  }, []);

  const handleMouseLeaveTile = React.useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const handleContextMenu = React.useCallback((e: React.MouseEvent, alias: TextureAliasDto, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverMorphTarget(null);
    setContextMenuTarget({
      alias,
      key,
      anchor: { x: e.clientX, y: e.clientY },
    });
  }, []);

  const handleOpenMenu = React.useCallback((e: React.MouseEvent, alias: TextureAliasDto, key: string) => {
    e.stopPropagation();
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverMorphTarget(null);
    setContextMenuTarget((current) => {
      if (current?.key === key) {
        return null;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      return {
        alias,
        key,
        anchor: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        },
      };
    });
  }, []);

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
            const uniqueKey = `${alias.category}:${alias.alias}:${alias.relativePath || ''}:${alias.textureVariantIndex ?? ''}:${alias.blockVariantIndex ?? ''}:${index}`;
            const isMenuOpen = contextMenuTarget?.key === uniqueKey;

            return (
              <PackGridTile
                key={uniqueKey}
                alias={alias}
                uniqueKey={uniqueKey}
                isMenuOpen={isMenuOpen}
                onTileClick={handleTileClick}
                onContextMenu={handleContextMenu}
                onOpenMenu={handleOpenMenu}
                onMouseEnterTile={handleMouseEnterTile}
                onMouseLeaveTile={handleMouseLeaveTile}
              />
            );
          })}
        </div>
      )}

      {/* Singleton Context Menu mounted outside loop */}
      {contextMenuTarget && (
        <TextureContextMenu
          item={contextMenuTarget.alias}
          anchor={contextMenuTarget.anchor}
          onClose={() => setContextMenuTarget(null)}
          onEdit={(app?: OpenWithAppDto) => {
            editTexture(contextMenuTarget.alias.alias, contextMenuTarget.alias.fullPath, contextMenuTarget.alias.status === 'GHOST', app?.exePath, false);
          }}
          onOpenWithDialog={() => {
            editTexture(contextMenuTarget.alias.alias, contextMenuTarget.alias.fullPath, contextMenuTarget.alias.status === 'GHOST', null, true);
          }}
          onRevealInExplorer={() => {
            if (contextMenuTarget.alias.fullPath) {
              openInExplorer(contextMenuTarget.alias.fullPath, true);
            }
          }}
          onDeleteTexture={() => {
            if (contextMenuTarget.alias.fullPath) {
              deleteTextureFile(contextMenuTarget.alias.fullPath, contextMenuTarget.alias.alias);
            }
          }}
          onDeleteEntries={() => {
            deleteTextureEntries(contextMenuTarget.alias.alias, contextMenuTarget.alias.category, contextMenuTarget.alias.relativePath);
          }}
          onEditMers={() => {
            if (contextMenuTarget.alias.mersFullPath) {
              editTexture(contextMenuTarget.alias.alias + '_mers', contextMenuTarget.alias.mersFullPath, false);
            }
          }}
        />
      )}

      {/* 2nd Hover State Morphing Portal Preview (photobooth-vendor-portal inspired) */}
      {hoverMorphTarget && !contextMenuTarget && (
        <TileHoverMorphPortal
          target={hoverMorphTarget}
          onClose={() => setHoverMorphTarget(null)}
          onEdit={(alias) => {
            setHoverMorphTarget(null);
            editTexture(alias.alias, alias.fullPath, alias.status === 'GHOST');
          }}
          onOpenContextMenu={(alias, anchor) => {
            setHoverMorphTarget(null);
            setContextMenuTarget({
              alias,
              key: hoverMorphTarget.key,
              anchor,
            });
          }}
          onRevealInExplorer={(fullPath) => {
            openInExplorer(fullPath, true);
          }}
        />
      )}
    </div>
  );
};
