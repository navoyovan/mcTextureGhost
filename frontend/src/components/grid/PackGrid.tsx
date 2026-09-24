import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { usePackStore, packStoreActions, pathMatchesFolder } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { TextureAliasDto, OpenWithAppDto, TileDragData } from '../../types/ipc';
import { FlipbookThumbnail } from '../common/FlipbookThumbnail';
import { TextureContextMenu } from '../common/TextureContextMenu';
import { TileHoverMorphPortal, TileHoverMorphTarget } from './TileHoverMorphPortal';
import { TextureDropConfirm } from './TextureDropConfirm';
import { PackGridSkeleton } from './PackGridSkeleton';
import { Badge } from '../common/Badge';
import styles from './PackGrid.module.css';

interface PackGridTileProps {
  alias: TextureAliasDto;
  uniqueKey: string;
  isExiting?: boolean;
  onTileClick: (domEl: HTMLElement, alias: TextureAliasDto, key: string) => void;
  onContextMenu: (e: React.MouseEvent, alias: TextureAliasDto, key: string) => void;
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
  isExiting,
  onTileClick,
  onContextMenu,
}) => {
  const isGhost = alias.status === 'GHOST';
  const packRoot = usePackStore((s) => s.packRoot);
  const { dropImportTexture, copyTextureFile } = useIpc();

  // Local drag & drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<
    | { type: 'file'; file: File; objectUrl: string }
    | { type: 'tile'; source: TileDragData }
    | null
  >(null);
  const dragCounterRef = useRef(0);

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

  // Process dropped file to base64 and dispatch IPC
  const processImport = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result as string;
        if (!base64Data) return;

        const targetFullPath =
          alias.fullPath ||
          (packRoot && alias.relativePath
            ? `${packRoot.replace(/[/\\]+$/, '')}\\textures\\${alias.relativePath.replace(/^[/\\]+/, '')}`
            : '');

        if (!targetFullPath) return;

        dropImportTexture({
          aliasKey: alias.alias,
          fullPath: targetFullPath,
          base64Data,
          relativePath: alias.relativePath,
          category: alias.category,
          fileName: file.name,
        });
      };
      reader.readAsDataURL(file);
    },
    [alias, packRoot, dropImportTexture]
  );

  // Process copying texture from another tile
  const executeTileCopy = useCallback(
    (sourceData: TileDragData, targetFullPath: string) => {
      if (sourceData.fullPath) {
        copyTextureFile({
          sourceFullPath: sourceData.fullPath,
          targetFullPath,
          targetAliasKey: alias.alias,
          targetRelativePath: alias.relativePath,
        });
      } else if (sourceData.imageUrl) {
        fetch(sourceData.imageUrl)
          .then((res) => res.blob())
          .then((blob) => {
            const reader = new FileReader();
            reader.onload = () => {
              const base64Data = reader.result as string;
              if (base64Data) {
                dropImportTexture({
                  aliasKey: alias.alias,
                  fullPath: targetFullPath,
                  base64Data,
                  relativePath: alias.relativePath,
                  category: alias.category,
                  fileName: `${sourceData.aliasKey}.png`,
                });
              }
            };
            reader.readAsDataURL(blob);
          })
          .catch((err) => console.error('[PackGrid] Failed to fetch source texture blob:', err));
      }
    },
    [alias, copyTextureFile, dropImportTexture]
  );

  // Drag start handler (this tile as drag source)
  const handleDragStart = (e: React.DragEvent) => {
    if (isGhost) {
      e.preventDefault();
      return;
    }
    const dragData: TileDragData = {
      aliasKey: alias.alias,
      fullPath: alias.fullPath,
      relativePath: alias.relativePath,
      imageUrl: alias.imageUrl,
      displayName: alias.displayName || alias.alias,
      category: alias.category,
      isGhost: false,
      sourceType: 'grid',
    };
    e.dataTransfer.setData('application/x-mctg-tile', JSON.stringify(dragData));
    if (alias.fullPath) {
      e.dataTransfer.setData('text/plain', alias.fullPath);
    }
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Drag event handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.items?.length || e.dataTransfer?.types?.length) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      setIsDragOver(false);
      dragCounterRef.current = 0;
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    // 1. Check for internal tile drag-and-drop
    const tileJson = e.dataTransfer?.getData('application/x-mctg-tile');
    if (tileJson) {
      try {
        const sourceData: TileDragData = JSON.parse(tileJson);
        // If dropped onto self, do nothing
        if (sourceData.aliasKey === alias.alias && sourceData.fullPath === alias.fullPath) {
          return;
        }

        const targetFullPath =
          alias.fullPath ||
          (packRoot && alias.relativePath
            ? `${packRoot.replace(/[/\\]+$/, '')}\\textures\\${alias.relativePath.replace(/^[/\\]+/, '')}`
            : '');

        if (!targetFullPath) return;

        if (isGhost) {
          executeTileCopy(sourceData, targetFullPath);
        } else {
          setPendingDrop({ type: 'tile', source: sourceData });
        }
        return;
      } catch (err) {
        console.error('[PackGrid] Error parsing tile drag data:', err);
      }
    }

    // 2. Check for OS file drop
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file) return;

    const validExtensions = ['.png', '.tga', '.jpg', '.jpeg', '.webp'];
    const lowerName = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => lowerName.endsWith(ext));

    if (!isValid) {
      return;
    }

    if (isGhost) {
      // Immediate write for ghost tiles
      processImport(file);
    } else {
      // Show confirmation modal for existing textures
      const objectUrl = URL.createObjectURL(file);
      setPendingDrop({ type: 'file', file, objectUrl });
    }
  };

  const handleConfirmOverwrite = useCallback(() => {
    if (!pendingDrop) return;
    if (pendingDrop.type === 'file') {
      const { file, objectUrl } = pendingDrop;
      processImport(file);
      URL.revokeObjectURL(objectUrl);
    } else if (pendingDrop.type === 'tile') {
      const targetFullPath =
        alias.fullPath ||
        (packRoot && alias.relativePath
          ? `${packRoot.replace(/[/\\]+$/, '')}\\textures\\${alias.relativePath.replace(/^[/\\]+/, '')}`
          : '');
      if (targetFullPath) {
        executeTileCopy(pendingDrop.source, targetFullPath);
      }
    }
    setPendingDrop(null);
  }, [pendingDrop, processImport, alias, packRoot, executeTileCopy]);

  const handleCancelOverwrite = useCallback(() => {
    if (pendingDrop) {
      if (pendingDrop.type === 'file') {
        URL.revokeObjectURL(pendingDrop.objectUrl);
      }
      setPendingDrop(null);
    }
  }, [pendingDrop]);

  // Clean up objectUrl if component unmounts while modal is active
  useEffect(() => {
    return () => {
      if (pendingDrop && pendingDrop.type === 'file') {
        URL.revokeObjectURL(pendingDrop.objectUrl);
      }
    };
  }, [pendingDrop]);

  const isDraggable = !isGhost && Boolean(alias.imageUrl || alias.fullPath);

  return (
    <div
      className={`${styles.tileCard} ${isDragOver ? styles.tileCardDragOver : ''} ${isExiting ? styles.tileCardExiting : ''}`}
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onClick={(e) => onTileClick(e.currentTarget, alias, uniqueKey)}
      onContextMenu={(e) => onContextMenu(e, alias, uniqueKey)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      title={`${fullFileName}\nAlias: ${alias.alias}\nStatus: ${alias.status}\nPath: ${alias.relativePath}`}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragOver && (
        <div className={styles.dropOverlay}>
          <span className={styles.dropOverlayIcon}>{isGhost ? '✨' : '📥'}</span>
          <span className={styles.dropOverlayBadge}>
            {isGhost ? 'Drop to Copy' : 'Drop to Replace'}
          </span>
        </div>
      )}

      {pendingDrop && (
        <TextureDropConfirm
          alias={alias}
          incomingObjectUrl={
            pendingDrop.type === 'file'
              ? pendingDrop.objectUrl
              : (pendingDrop.source.imageUrl || '')
          }
          incomingFileName={
            pendingDrop.type === 'file'
              ? pendingDrop.file.name
              : (pendingDrop.source.displayName || pendingDrop.source.aliasKey || 'Source Texture')
          }
          onConfirm={handleConfirmOverwrite}
          onCancel={handleCancelOverwrite}
        />
      )}

      {/* Thumbnail Container - 100% clean texture display without overlays */}
      <div
        className={`${styles.tileThumbnailWrapper} ${!isGhost ? styles.tileThumbnailAdded : ''}`}
      >
        {!isGhost && alias.imageUrl ? (
          <FlipbookThumbnail
            src={alias.imageUrl}
            atlasSrc={
              alias.atlasFullPath
                ? packRoot && alias.atlasFullPath.startsWith(packRoot)
                  ? `https://pack.local/${alias.atlasFullPath.slice(packRoot.length).replace(/^[/\\]+/, '').replace(/\\/g, '/')}`
                  : alias.imageUrl.replace(/[^/?#]+(\?.*)?$/, `${alias.atlasFullPath.split(/[/\\]/).pop()}$1`)
                : null
            }
            alt={alias.alias}
            aliasKey={alias.alias}
            className={styles.tileThumbnail}
            isFlipbook={alias.isFlipbook || Boolean(alias.hasAtlas)}
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
            <Badge variant="mers" size="sm" title={`PBR MERS layer exists: ${alias.mersFullPath}`}>
              MERS
            </Badge>
          )}
          {alias.hasAtlas && (
            <Badge variant="atlas" size="sm" title={`Item Atlas companion exists: ${alias.atlasFullPath || 'Linked Atlas'}`}>
              ATLAS
            </Badge>
          )}
          {alias.isFlipbook && (
            <Badge variant="anim" size="sm" title="Animated flipbook sprite-sheet">
              ANIM
            </Badge>
          )}
        </div>
        <div className={styles.tileSubRow}>
          <span className={`${styles.statusDot} ${getStatusDotClass(alias.status)}`} />
          <span className={styles.tileSubtitle}>
            {alias.subtitleCaption || alias.relativePath || alias.category}
          </span>
        </div>
      </div>

      {/* Overwrite Confirmation Modal (mounted via Portal) */}
      {pendingDrop && (
        <TextureDropConfirm
          alias={alias}
          incomingObjectUrl={pendingDrop.type === 'file' ? pendingDrop.objectUrl : pendingDrop.source.imageUrl}
          incomingFileName={pendingDrop.type === 'file' ? pendingDrop.file.name : `${pendingDrop.source.displayName || pendingDrop.source.aliasKey}.png`}
          onConfirm={handleConfirmOverwrite}
          onCancel={handleCancelOverwrite}
        />
      )}
    </div>
  );
});

PackGridTile.displayName = 'PackGridTile';

export const PackGrid: React.FC = () => {
  const aliases = usePackStore((s) => s.aliases);
  const isScanning = usePackStore((s) => s.isScanning);
  const isGridLoading = usePackStore((s) => s.isGridLoading);
  const activeTab = usePackStore((s) => s.activeTab);
  const searchQuery = usePackStore((s) => s.searchQuery);
  const statusFilter = usePackStore((s) => s.statusFilter);
  const activeFilters = usePackStore((s) => s.activeFilters);
  const selectedFolderPath = usePackStore((s) => s.selectedFolderPath);
  const tileZoom = usePackStore((s) => s.tileZoom);
  const packAliases = usePackStore((s) => s.aliases);
  const packFolders = usePackStore((s) => s.packFolders);
  const { editTexture, deleteTextureFile, deleteTextureEntries, openInExplorer, scaffoldTextureVariation, deleteTextureVariation } = useIpc();

  const hasTerrainTextureJson = React.useMemo(() => {
    function check(items: any[]): boolean {
      if (!items) return false;
      for (const item of items) {
        const p = (item.relativePath || item.name || '').replace(/[/\\]+/g, '/').toLowerCase();
        if ((p === 'textures/terrain_texture.json' || p.endsWith('/terrain_texture.json') || p === 'terrain_texture.json') && !item.isMissing) return true;
        if (item.subFolders?.length && check(item.subFolders)) return true;
      }
      return false;
    }
    return check(packFolders || []);
  }, [packFolders]);


  // Single active context menu target (prevents full-grid re-renders on menu toggle)
  const [contextMenuTarget, setContextMenuTarget] = useState<{
    alias: TextureAliasDto;
    anchor: { x?: number; y?: number; top?: number; bottom?: number; left?: number; right?: number };
    key: string;
  } | null>(null);

  // Set of tile keys currently playing their exit shrink animation
  const [exitingTileKeys, setExitingTileKeys] = useState<Set<string>>(new Set());

  // Morphing Portal target (opened on tile click)
  const [hoverMorphTarget, setHoverMorphTarget] = useState<TileHoverMorphTarget | null>(null);

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
          (f) => f === 'mers' || f === 'atlas' || f === 'flipbook' || f === 'variations' || f === 'blockstates' || f === 'variation'
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
          const isAtlas = Boolean(alias.hasAtlas || alias.atlasFullPath);
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
            (effectiveFilters.includes('atlas') && isAtlas) ||
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

  const handleTileClick = React.useCallback((domEl: HTMLElement, alias: TextureAliasDto, key: string) => {
    setContextMenuTarget(null);
    const rect = domEl.getBoundingClientRect();
    setHoverMorphTarget({
      alias,
      key,
      originRect: rect,
      domElement: domEl,
    });
  }, []);

  const handleContextMenu = React.useCallback((e: React.MouseEvent, alias: TextureAliasDto, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    setHoverMorphTarget(null);
    setContextMenuTarget({
      alias,
      key,
      anchor: { x: e.clientX, y: e.clientY },
    });
  }, []);

  return (
    <div className={styles.gridContainer}>
      {isGridLoading || (isScanning && filteredAliases.length === 0) ? (
        <PackGridSkeleton tileZoom={tileZoom} />
      ) : filteredAliases.length === 0 ? (
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
            const isExiting = exitingTileKeys.has(uniqueKey) || exitingTileKeys.has(alias.alias);

            return (
              <PackGridTile
                key={uniqueKey}
                alias={alias}
                uniqueKey={uniqueKey}
                isExiting={isExiting}
                onTileClick={handleTileClick}
                onContextMenu={handleContextMenu}
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
              const fullPath = contextMenuTarget.alias.fullPath;
              const aliasKey = contextMenuTarget.alias.alias;
              packStoreActions.optimisticDeleteTexture(fullPath, aliasKey);
              deleteTextureFile(fullPath, aliasKey);
            }
          }}
          onDeleteEntries={() => {
            setHoverMorphTarget(null);
            const aliasKey = contextMenuTarget.alias.alias;
            const category = contextMenuTarget.alias.category;
            const relPath = contextMenuTarget.alias.relativePath;
            const targetKey = contextMenuTarget.key;

            setExitingTileKeys((prev) => new Set(prev).add(targetKey).add(aliasKey));
            setTimeout(() => {
              packStoreActions.optimisticDeleteEntries(aliasKey, category, relPath);
              deleteTextureEntries(aliasKey, category, relPath);
              setExitingTileKeys((prev) => {
                const next = new Set(prev);
                next.delete(targetKey);
                next.delete(aliasKey);
                return next;
              });
            }, 180);
          }}
          onEditMers={() => {
            setHoverMorphTarget(null);
            if (contextMenuTarget.alias.mersFullPath) {
              editTexture(contextMenuTarget.alias.alias + '_mers', contextMenuTarget.alias.mersFullPath, false);
            }
          }}
          onEditAtlas={() => {
            setHoverMorphTarget(null);
            if (contextMenuTarget.alias.atlasFullPath) {
              editTexture(contextMenuTarget.alias.alias + '_atlas', contextMenuTarget.alias.atlasFullPath, false);
            }
          }}
          onAddVariation={
            hasTerrainTextureJson &&
            contextMenuTarget.alias.category === 'block' &&
            packAliases.some(
              (a) =>
                a.alias.toLowerCase() === contextMenuTarget.alias.alias.toLowerCase() &&
                a.category === 'block' &&
                a.status !== 'ORPHAN' &&
                a.isUserDefined !== false
            )
              ? async (count = 1) => {
                  setHoverMorphTarget(null);
                  packStoreActions.optimisticAddVariation(
                    contextMenuTarget.alias.alias,
                    contextMenuTarget.alias.blockVariantIndex ?? null,
                    count
                  );
                  for (let i = 0; i < count; i++) {
                    await scaffoldTextureVariation(
                      contextMenuTarget.alias.alias,
                      contextMenuTarget.alias.blockVariantIndex ?? null,
                      contextMenuTarget.alias.relativePath ?? null
                    );
                  }
                }
              : undefined
          }
          onDeleteVariation={
            hasTerrainTextureJson &&
            contextMenuTarget.alias.category === 'block' &&
            contextMenuTarget.alias.textureVariantIndex != null &&
            contextMenuTarget.alias.relativePath
              ? () => {
                  setHoverMorphTarget(null);
                  packStoreActions.optimisticDeleteVariation(
                    contextMenuTarget.alias.alias,
                    contextMenuTarget.alias.relativePath!
                  );
                  deleteTextureVariation(contextMenuTarget.alias.alias, contextMenuTarget.alias.relativePath!);
                }
              : undefined
          }
        />
      )}

      {/* 2nd Hover State Morphing Portal Preview (photobooth-vendor-portal inspired) */}
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
    </div>
  );
};
