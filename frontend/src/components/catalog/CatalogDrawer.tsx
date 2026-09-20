// frontend/src/components/catalog/CatalogDrawer.tsx
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import {
  X,
  BookOpen,
  Search,
  ChevronDown,
  ChevronRight,
  Zap,
  RotateCw,
  Settings,
  Layers,
  PawPrint,
  ArrowRight,
  Box,
  Sword,
  Check,
  Plus,
  Minus,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import {
  BlockGroupNodeDto,
  AliasGroupNodeDto,
  CatalogLeafDto,
  TileDragData,
} from '../../types/ipc';
import { FlipbookThumbnail } from '../common/FlipbookThumbnail';
import { SearchInput } from '../common/SearchInput';
import { Badge } from '../common/Badge';
import { ReferencePackManagerModal } from './ReferencePackManagerModal';
import styles from './CatalogDrawer.module.css';

export interface CatalogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Thumbnail component for a catalog leaf texture.
 * Defaults to '?' placeholder since vanilla reference textures are JSON declarations
 * rather than raw image files on disk, avoiding hundreds of 404 ERR_FILE_NOT_FOUND errors.
 */
const LeafThumbnail: React.FC<{ leaf: CatalogLeafDto }> = ({ leaf }) => {
  const [hasError, setHasError] = useState(false);
  const src = leaf.imageUrl;
  // Vanilla reference textures and ghost textures do not exist as image files on disk yet.
  // Only attempt loading when status is not GHOST/VANILLA, not vanilla.local, and valid file exists.
  const canLoadImage =
    !hasError &&
    Boolean(src) &&
    leaf.status !== 'GHOST' &&
    leaf.status !== 'VANILLA' &&
    !src.includes('vanilla.local');

  const getFallbackStatusClass = (status: string) => {
    switch (status) {
      case 'OK':
        return styles.leafThumbFallbackOk;
      case 'GHOST':
        return styles.leafThumbFallbackGhost;
      case 'OVERRIDE':
        return styles.leafThumbFallbackOverride;
      case 'ORPHAN':
        return styles.leafThumbFallbackOrphan;
      case 'VANILLA':
      default:
        return styles.leafThumbFallbackVanilla;
    }
  };

  return (
    <div className={styles.leafThumbWrapper}>
      {canLoadImage ? (
        <FlipbookThumbnail
          src={src}
          alt={leaf.alias}
          className={styles.leafThumbImg}
          isFlipbook={leaf.isFlipbook}
          flipbook={leaf.flipbook}
          onError={() => setHasError(true)}
          loading="lazy"
        />
      ) : (
        <span className={`${styles.leafThumbFallback} ${getFallbackStatusClass(leaf.status)}`}>
          ?
        </span>
      )}
    </div>
  );
};

/**
 * Tier 3: Leaf Row Component
 */
const CatalogLeafRow: React.FC<{
  leaf: CatalogLeafDto;
  blockDisplayName?: string;
}> = ({ leaf, blockDisplayName }) => {
  const isAdded = leaf.status !== 'VANILLA';

  const getCheckStatusClass = (status: string) => {
    switch (status) {
      case 'OK':
        return styles.leafCheckOk;
      case 'GHOST':
        return styles.leafCheckGhost;
      case 'OVERRIDE':
        return styles.leafCheckOverride;
      case 'ORPHAN':
        return styles.leafCheckOrphan;
      case 'VANILLA':
      default:
        return styles.leafCheckGhost;
    }
  };

  const fileName = leaf.relativePath
    ? (leaf.relativePath.split(/[/\\]/).pop() ?? leaf.displayName ?? leaf.alias)
    : (leaf.displayName ?? leaf.alias);

  const isEntity = (leaf.category || '').toLowerCase() === 'entity';
  const blockVariantSuffix = leaf.blockVariantIndex && leaf.totalBlockVariants
    ? ` (block state ${leaf.blockVariantIndex}/${leaf.totalBlockVariants})`
    : '';

  const tooltipText = [
    (blockDisplayName || leaf.displayName || leaf.alias) + blockVariantSuffix,
    isEntity ? (leaf.geometryId ? `geometry: ${leaf.geometryId}` : `slot: ${leaf.alias}`) : `terrain textures: ${leaf.alias}`,
    `path: ${leaf.relativePath}`,
    leaf.isAttachable ? 'attachable: true' : '',
    leaf.subtitleCaption ? `info: ${leaf.subtitleCaption}` : '',
  ].filter(Boolean).join('\n');

  const handleDragStart = (e: React.DragEvent) => {
    if (!leaf.imageUrl && !leaf.fullPath) return;
    const dragData: TileDragData = {
      aliasKey: leaf.alias,
      fullPath: leaf.fullPath,
      relativePath: leaf.relativePath,
      imageUrl: leaf.imageUrl,
      displayName: blockDisplayName || leaf.displayName || leaf.alias,
      category: (leaf.category as string) || 'block',
      isGhost: false,
      sourceType: 'catalog',
    };
    e.dataTransfer.setData('application/x-mctg-tile', JSON.stringify(dragData));
    if (leaf.fullPath) {
      e.dataTransfer.setData('text/plain', leaf.fullPath);
    }
    e.dataTransfer.effectAllowed = 'copy';
  };

  const isDraggable = Boolean(leaf.imageUrl || leaf.fullPath);

  return (
    <div
      className={styles.leafRow}
      data-testid={`leaf-row-${leaf.alias}`}
      title={tooltipText}
      draggable={isDraggable}
      onDragStart={handleDragStart}
      style={{ cursor: isDraggable ? 'grab' : undefined }}
    >
      <div className={styles.leafLeft}>
        <LeafThumbnail leaf={leaf} />
        <div className={styles.leafMeta}>
          <div className={styles.leafHeaderRow}>
            <span className={styles.leafName} title={fileName}>
              {fileName}
            </span>
            {leaf.totalTextureVariants && leaf.totalTextureVariants > 1 && (
              <Badge variant="override" size="sm">
                {leaf.totalTextureVariants}v
              </Badge>
            )}
            {leaf.isFlipbook && (
              <Badge variant="anim" size="sm" title="Animated flipbook texture">
                ANIM
              </Badge>
            )}
          </div>
          <div className={styles.leafPathRow}>
            <span className={styles.leafPathSub} title={leaf.relativePath}>
              {leaf.relativePath}
            </span>
            {leaf.subtitleCaption && (
              <span className={styles.leafSubtitle} title={leaf.subtitleCaption}>
                • {leaf.subtitleCaption}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.leafRight}>
        {isAdded && (
          <span
            className={`${styles.leafAddedCheck} ${getCheckStatusClass(leaf.status)}`}
            title={`Added (${leaf.status})`}
            aria-label={`Added (${leaf.status})`}
          >
            {leaf.status === 'GHOST' ? <Minus size={11} strokeWidth={2.5} /> : <Check size={11} strokeWidth={2.5} />}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Tier 2: Alias Group Component
 */
const CatalogAliasGroup: React.FC<{
  aliasGroup: AliasGroupNodeDto;
  category: string;
  blockDisplayName?: string;
  parentBlockId?: string;
  onAdd: (id: string, category: string) => void;
  isAliasDeclaredInPack: (alias: string, category: string, parentBlockId?: string) => boolean;
}> = ({ aliasGroup, category, blockDisplayName, parentBlockId, onAdd, isAliasDeclaredInPack }) => {
  const isEntity = (aliasGroup.category || category).toLowerCase() === 'entity';
  const slotName = aliasGroup.geometryId || aliasGroup.alias;
  const isAttachable = isEntity && (aliasGroup.isAttachable || aliasGroup.leaves?.some((l) => l.isAttachable));
  const hasNotAdded = aliasGroup.notAddedCount > 0 || Boolean(aliasGroup.leaves?.some((l) => l.status === 'VANILLA'));
  const isAdded = isEntity
    ? false
    : !hasNotAdded && isAliasDeclaredInPack(aliasGroup.alias, aliasGroup.category || category, parentBlockId);

  return (
    <div className={styles.aliasGroupCard} data-testid={`alias-group-${aliasGroup.alias}`}>
      <div className={styles.aliasGroupHeader}>
        <div className={styles.aliasHeaderLeft}>
          {isEntity ? (
            <PawPrint size={13} className={styles.aliasIcon} />
          ) : (
            <Box size={13} className={styles.aliasIcon} />
          )}
          <span className={styles.aliasNameText} title={slotName}>
            {isEntity ? `Slot: ${slotName}` : `Alias: ${aliasGroup.alias}`}
          </span>
          {isAttachable && (
            <Badge variant="category-attachable" size="sm" title="Attachable entity definition">
              Attachable
            </Badge>
          )}
          {!isEntity && aliasGroup.faceSummary && (
            <Badge
              variant="neutral"
              size="sm"
              icon={<ArrowRight size={9} />}
              title={`Face mapping: ${aliasGroup.faceSummary}`}
            >
              Face: {aliasGroup.faceSummary}
            </Badge>
          )}
          {aliasGroup.ghostCount > 0 && (
            <Badge variant="ghost" size="counter" title={`${aliasGroup.ghostCount} ghost textures`}>
              {aliasGroup.ghostCount}
            </Badge>
          )}
        </div>

        {!isEntity && (
          isAdded ? (
            <Badge variant="added" size="sm" icon={<Check size={11} />} title="This item is already in your pack">
              Added
            </Badge>
          ) : (
            <button
              type="button"
              className={styles.addAliasBtn}
              onClick={() => onAdd(aliasGroup.alias, aliasGroup.category || category)}
              title={`Add alias '${aliasGroup.alias}' to pack`}
              aria-label={`Add alias ${aliasGroup.alias}`}
            >
              <Plus size={11} />
              <span>Add Alias</span>
            </button>
          )
        )}
      </div>

      {aliasGroup.leaves && aliasGroup.leaves.length > 0 && (
        <div className={styles.leavesList}>
          {aliasGroup.leaves.map((leaf, index) => (
            <CatalogLeafRow
              key={`${leaf.relativePath || aliasGroup.alias}:${leaf.blockVariantIndex ?? ''}:${leaf.textureVariantIndex ?? ''}:${index}`}
              leaf={leaf}
              blockDisplayName={blockDisplayName}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Tier 1: Block/Item/Entity Group Component
 */
const CatalogBlockGroup: React.FC<{
  block: BlockGroupNodeDto;
  blockKey: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAdd: (id: string, category: string) => void;
  isBlockUserDefined: (blockId: string) => boolean;
  isEntityInWorkspace: (entityId: string) => boolean;
  isAliasDeclaredInPack: (alias: string, category: string, parentBlockId?: string) => boolean;
}> = ({
  block,
  blockKey,
  isExpanded,
  onToggleExpand,
  onAdd,
  isBlockUserDefined,
  isEntityInWorkspace,
  isAliasDeclaredInPack,
}) => {
  const cat = (block.category || 'block').toLowerCase();
  const isItem = cat === 'item';
  const isEntity = cat === 'entity';

  const isAdded = isEntity
    ? isEntityInWorkspace(block.blockId)
    : isItem
    ? isAliasDeclaredInPack(block.blockId, 'item')
    : isBlockUserDefined(block.blockId);

  return (
    <div className={styles.blockGroupCard} data-testid={`block-group-${block.blockId}`}>
      <div
        className={styles.blockGroupHeader}
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        aria-expanded={isExpanded}
      >
        <div className={styles.blockMetaLeft}>
          <button
            type="button"
            className={styles.chevronButton}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-label={isExpanded ? 'Collapse item' : 'Expand item'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          <div className={styles.blockTitleGroup}>
            <span className={styles.blockDisplayName} title={block.displayName}>
              {block.displayName}
            </span>
            <span className={styles.blockIdText} title={block.blockId}>
              {block.blockId === 'uncategorized' || block.blockId.includes(':')
                ? block.blockId
                : `minecraft:${block.blockId}`}
            </span>
          </div>
        </div>

        <div className={styles.blockBadgesAndActions}>
          <Badge
            variant={isEntity ? 'category-entity' : isItem ? 'category-item' : 'category-block'}
            size="sm"
            icon={isEntity ? <PawPrint size={11} /> : isItem ? <Sword size={11} /> : <Box size={11} />}
            title={block.category}
          >
            {isEntity ? 'ENTITY' : isItem ? 'ITEM' : 'BLOCK'}
          </Badge>

          {block.ghostCount > 0 && (
            <Badge variant="ghost" size="counter" title={`${block.ghostCount} ghost textures`}>
              {block.ghostCount}
            </Badge>
          )}

          {block.totalVariants > 0 && (
            <Badge variant="neutral" size="counter" title={`${block.totalVariants} total variants`}>
              {block.totalVariants}
            </Badge>
          )}

          {isAdded ? (
            <Badge variant="added" size="sm" icon={<Check size={11} />} title="This item is already in your pack">
              Added
            </Badge>
          ) : (
            <button
              type="button"
              className={styles.addBlockBtn}
              onClick={(e) => {
                e.stopPropagation();
                onAdd(block.blockId, block.category);
              }}
              title={`Add ${block.displayName} to pack`}
              aria-label={`Add ${block.displayName} to pack`}
            >
              <Zap size={11} />
              <span>Add to Pack</span>
            </button>
          )}
        </div>
      </div>

      {isExpanded && block.aliasGroups && block.aliasGroups.length > 0 && (
        <div className={styles.aliasGroupList}>
          {block.aliasGroups.map((aliasGroup, agIndex) => (
            <CatalogAliasGroup
              key={`${blockKey}:${aliasGroup.alias || agIndex}`}
              aliasGroup={aliasGroup}
              category={block.category}
              blockDisplayName={block.displayName}
              parentBlockId={block.blockId}
              onAdd={(id, cat) => {
                if (isEntity) {
                  onAdd(block.blockId, 'entity');
                } else {
                  onAdd(id, cat);
                }
              }}
              isAliasDeclaredInPack={isAliasDeclaredInPack}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Vanilla Reference Catalog Flyout / Drawer (Milestone 3: R3)
 */
export const CatalogDrawer: React.FC<CatalogDrawerProps> = ({ isOpen, onClose }) => {
  const catalogTree = usePackStore((s) => s.catalogTree);
  const blockWorkspaceTree = usePackStore((s) => s.blockWorkspaceTree);
  const entityWorkspaceTree = usePackStore((s) => s.entityWorkspaceTree);
  const referencePacks = usePackStore((s) => s.referencePacks);
  const activeReferenceId = usePackStore((s) => s.activeReferenceId);
  const aliases = usePackStore((s) => s.aliases);
  const packFolders = usePackStore((s) => s.packFolders);
  const hasVanillaAssets = usePackStore((s) => s.hasVanillaAssets);
  const simulateNoAssets = usePackStore((s) => s.simulateNoAssets);
  const { postCommand, loadCatalog } = useIpc();

  const hasTerrainTextureJson = useMemo(() => {
    function check(items: any[]): boolean {
      if (!items) return false;
      for (const item of items) {
        const p = (item.relativePath || item.name || '').replace(/\\/g, '/').toLowerCase();
        if (
          (p === 'textures/terrain_texture.json' ||
           p.endsWith('/terrain_texture.json') ||
           p === 'terrain_texture.json') &&
          !item.isMissing
        ) {
          return true;
        }
        if (item.subFolders && item.subFolders.length > 0) {
          if (check(item.subFolders)) return true;
        }
      }
      return false;
    }
    return check(packFolders || []);
  }, [packFolders]);

  const hasItemTextureJson = useMemo(() => {
    function check(items: any[]): boolean {
      if (!items) return false;
      for (const item of items) {
        const p = (item.relativePath || item.name || '').replace(/\\/g, '/').toLowerCase();
        if (
          (p === 'textures/item_texture.json' ||
           p.endsWith('/item_texture.json') ||
           p === 'item_texture.json') &&
          !item.isMissing
        ) {
          return true;
        }
        if (item.subFolders && item.subFolders.length > 0) {
          if (check(item.subFolders)) return true;
        }
      }
      return false;
    }
    return check(packFolders || []);
  }, [packFolders]);

  const hasBlocksJson = useMemo(() => {
    function check(items: any[]): boolean {
      if (!items) return false;
      for (const item of items) {
        const p = (item.relativePath || item.name || '').replace(/\\/g, '/').toLowerCase();
        if ((p === 'blocks.json' || p.endsWith('/blocks.json')) && !item.isMissing) {
          return true;
        }
        if (item.subFolders && item.subFolders.length > 0) {
          if (check(item.subFolders)) return true;
        }
      }
      return false;
    }
    return check(packFolders || []);
  }, [packFolders]);

  const isBlockUserDefined = useCallback(
    (blockId: string): boolean => {
      if (!hasBlocksJson || !blockWorkspaceTree || !Array.isArray(blockWorkspaceTree)) return false;
      return blockWorkspaceTree.some(
        (b) => b.blockId.toLowerCase() === blockId.toLowerCase() && b.isUserDefined !== false
      );
    },
    [hasBlocksJson, blockWorkspaceTree]
  );

  const isAliasDeclaredInPack = useCallback(
    (alias: string, category: string, parentBlockId?: string): boolean => {
      const cat = category.toLowerCase();
      if (cat === 'block') {
        if (!hasTerrainTextureJson || !blockWorkspaceTree || !Array.isArray(blockWorkspaceTree)) return false;
        return blockWorkspaceTree.some(
          (b) =>
            b.isUserDefined !== false &&
            (parentBlockId ? b.blockId.toLowerCase() === parentBlockId.toLowerCase() : true) &&
            b.aliasGroups?.some((ag) => ag.alias.toLowerCase() === alias.toLowerCase())
        );
      }
      if (cat === 'item') {
        if (!hasItemTextureJson) return false;
        return aliases.some(
          (a) =>
            a.alias.toLowerCase() === alias.toLowerCase() &&
            a.category.toLowerCase() === 'item' &&
            a.status !== 'ORPHAN'
        );
      }
      return false;
    },
    [blockWorkspaceTree, hasTerrainTextureJson, hasItemTextureJson, aliases]
  );

  const isEntityInWorkspace = useCallback(
    (entityId: string): boolean => {
      if (!entityWorkspaceTree || !Array.isArray(entityWorkspaceTree)) return false;
      return entityWorkspaceTree.some(
        (e) => e.blockId.toLowerCase() === entityId.toLowerCase() && e.isUserDefined !== false
      );
    },
    [entityWorkspaceTree]
  );

  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'block' | 'item' | 'entity'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isReferenceManagerOpen, setIsReferenceManagerOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const animationRef = useRef<gsap.core.Timeline | null>(null);

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

  // Ask the parent to close; unmount happens after the GSAP exit animation finishes.
  const handleClose = useCallback(() => {
    if (!isOpen) return;
    onClose();
  }, [isOpen, onClose]);

  useEffect(() => {
    animationRef.current?.kill();

    if (isOpen) {
      setIsMounted(true);
    }
  }, [isOpen]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const drawer = drawerRef.current;
    if (!isMounted || !overlay || !drawer) return;

    animationRef.current?.kill();

    if (isOpen) {
      gsap.set(overlay, { autoAlpha: 0 });
      gsap.set(drawer, { xPercent: 100 });

      animationRef.current = gsap
        .timeline({ defaults: { overwrite: 'auto' } })
        .to(overlay, {
          autoAlpha: 1,
          duration: 0.2,
          ease: 'power1.out',
        }, 0)
        .to(drawer, {
          xPercent: 0,
          duration: 0.28,
          ease: 'power2.out',
        }, 0);
      return;
    }

    animationRef.current = gsap
      .timeline({
        defaults: { overwrite: 'auto' },
        onComplete: () => setIsMounted(false),
      })
      .to(overlay, {
        autoAlpha: 0,
        duration: 0.18,
        ease: 'power1.in',
      }, 0)
      .to(drawer, {
        xPercent: 100,
        duration: 0.22,
        ease: 'power2.in',
      }, 0);
  }, [isMounted, isOpen]);

  useEffect(() => {
    return () => {
      animationRef.current?.kill();
    };
  }, []);

  // Load catalog data if empty on open
  useEffect(() => {
    if (isOpen && (!catalogTree || catalogTree.length === 0)) {
      if (loadCatalog) {
        loadCatalog();
      } else {
        postCommand('VANILLA:LOAD_CATALOG', {});
      }
    }
  }, [isOpen, catalogTree, loadCatalog, postCommand]);

  // Handle Escape key to close drawer
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  const [displayLimit, setDisplayLimit] = useState(100);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Reset display limit and collapse items when query or filter changes
  useEffect(() => {
    setDisplayLimit(100);
    setExpandedIds(new Set());
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [searchText, categoryFilter]);

  const filteredBlocks = useMemo(() => {
    if (!catalogTree || !Array.isArray(catalogTree)) return [];
    const query = searchText.toLowerCase().trim();
    let result = catalogTree;

    if (categoryFilter !== 'all') {
      result = result.filter(
        (b) => b.category && b.category.toLowerCase() === categoryFilter
      );
    }

    if (query) {
      result = result.filter(
        (b) =>
          (b.displayName && b.displayName.toLowerCase().includes(query)) ||
          (b.blockId && b.blockId.toLowerCase().includes(query)) ||
          (b.aliasGroups &&
            b.aliasGroups.some((a) => a.alias && a.alias.toLowerCase().includes(query)))
      );
    }

    return result;
  }, [catalogTree, searchText, categoryFilter]);

  const visibleBlocks = useMemo(() => {
    return filteredBlocks.slice(0, displayLimit);
  }, [filteredBlocks, displayLimit]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      if (scrollHeight - scrollTop - clientHeight < 400) {
        setDisplayLimit((prev) => Math.min(prev + 100, filteredBlocks.length));
      }
    },
    [filteredBlocks.length]
  );

  // Search indexes are minimized by default; only items explicitly clicked are expanded
  const isBlockExpanded = useCallback(
    (blockKey: string) => {
      return expandedIds.has(blockKey);
    },
    [expandedIds]
  );

  const toggleExpand = useCallback((blockKey: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockKey)) {
        next.delete(blockKey);
      } else {
        next.add(blockKey);
      }
      return next;
    });
  }, []);

  const handleAdd = useCallback(
    (id: string, category: string) => {
      postCommand('VANILLA:ADD', {
        id,
        category: category.toLowerCase(),
      });
    },
    [postCommand]
  );

  const handleManualSync = useCallback(() => {
    setIsRefreshing(true);
    if (loadCatalog) {
      loadCatalog();
    } else {
      postCommand('VANILLA:LOAD_CATALOG', {});
    }
    setTimeout(() => setIsRefreshing(false), 600);
  }, [loadCatalog, postCommand]);

  if (!isMounted) return null;

  const totalCatalogCount = catalogTree?.length || 0;
  const isSearching = searchText.trim().length > 0 || categoryFilter !== 'all';

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.drawerOverlay}
      onClick={handleClose}
      data-testid="catalog-drawer-overlay"
    >
      <aside
        ref={drawerRef}
        className={styles.drawerContainer}
        onClick={(e) => e.stopPropagation()}
        data-testid="catalog-drawer"
        role="dialog"
        aria-label="Vanilla Catalog"
      >
        {/* Floating Action Cluster: 4 connected buttons detached from drawer on left: All (top), Blocks, Items, Entities */}
        <div className={styles.floatingActionCluster}>
          <button
            type="button"
            className={`${styles.floatingBtn} ${categoryFilter === 'all' ? styles.floatingBtnActive : ''}`}
            title="Show All"
            aria-label="Show All"
            onClick={(e) => {
              e.stopPropagation();
              setCategoryFilter('all');
            }}
          >
            <span className={styles.floatingBtnText}>All</span>
            <span className={styles.floatingBtnTooltip}>Show All</span>
          </button>
          <div className={styles.floatingBtnDivider} />
          <button
            type="button"
            className={`${styles.floatingBtn} ${categoryFilter === 'block' ? styles.floatingBtnActive : ''}`}
            title="Filter Blocks"
            aria-label="Filter Blocks"
            onClick={(e) => {
              e.stopPropagation();
              setCategoryFilter((prev) => (prev === 'block' ? 'all' : 'block'));
            }}
          >
            <span className={styles.floatingBtnIcon}>
              <Box size={16} />
            </span>
            <span className={styles.floatingBtnTooltip}>Filter Blocks</span>
          </button>
          <div className={styles.floatingBtnDivider} />
          <button
            type="button"
            className={`${styles.floatingBtn} ${categoryFilter === 'item' ? styles.floatingBtnActive : ''}`}
            title="Filter Items"
            aria-label="Filter Items"
            onClick={(e) => {
              e.stopPropagation();
              setCategoryFilter((prev) => (prev === 'item' ? 'all' : 'item'));
            }}
          >
            <span className={styles.floatingBtnIcon}>
              <Sword size={16} />
            </span>
            <span className={styles.floatingBtnTooltip}>Filter Items</span>
          </button>
          <div className={styles.floatingBtnDivider} />
          <button
            type="button"
            className={`${styles.floatingBtn} ${categoryFilter === 'entity' ? styles.floatingBtnActive : ''}`}
            title="Filter Entities"
            aria-label="Filter Entities"
            onClick={(e) => {
              e.stopPropagation();
              setCategoryFilter((prev) => (prev === 'entity' ? 'all' : 'entity'));
            }}
          >
            <span className={styles.floatingBtnIcon}>
              <PawPrint size={16} />
            </span>
            <span className={styles.floatingBtnTooltip}>Filter Entities</span>
          </button>
        </div>

        {/* Drawer Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIconBadge}>
              {activeReference.iconUrl ? (
                <img
                  src={activeReference.iconUrl}
                  alt={activeReference.name}
                  style={{ width: '100%', height: '100%', borderRadius: 4, objectFit: 'cover', imageRendering: 'pixelated' }}
                  onError={(e) => {
                    // Fallback to vanilla icon on error
                    (e.currentTarget as HTMLImageElement).src = 'https://vanilla.local/pack_icon.png';
                  }}
                />
              ) : (
                <BookOpen size={17} />
              )}
            </div>
            <div className={styles.headerTextGroup}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h2 className={styles.headerTitle}>{activeReference.name}</h2>
                <Badge variant="mono" size="sm">{activeReference.version}</Badge>
              </div>
              <span className={styles.headerSubtitle}>
                {activeReference.description || (activeReference.isVanilla ? 'Mojang bedrock-samples official reference database' : 'Custom local resource pack reference')}
              </span>
            </div>
          </div>

          <div className={styles.headerRightActions}>
            <Badge variant="neutral" size="sm" data-testid="result-count-badge">
              {isSearching
                ? `${visibleBlocks.length} / ${filteredBlocks.length}`
                : `${visibleBlocks.length} / ${totalCatalogCount}`}
            </Badge>
            {(!simulateNoAssets && (activeReference.isVanilla ? hasVanillaAssets : Boolean(activeReference.packPath))) ? (
              <button
                type="button"
                className={styles.headerIconBtn}
                onClick={() => setIsReferenceManagerOpen(true)}
                title="Catalog Manager & Settings"
                aria-label="Catalog Manager & Settings"
              >
                <Settings size={14} />
              </button>
            ) : (
              <button
                type="button"
                className={styles.headerIconBtn}
                onClick={handleManualSync}
                title="Refresh Vanilla Cache"
                aria-label="Refresh Vanilla Cache"
              >
                <RotateCw size={14} className={isRefreshing ? styles.spinIcon : ''} />
              </button>
            )}
            <button
              type="button"
              className={styles.closeButton}
              onClick={handleClose}
              title="Close drawer (Esc)"
              aria-label="Close catalog drawer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Search Toolbar */}
        <div className={styles.searchToolbar}>
          <SearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder="Search vanilla blocks, items, entities, or aliases..."
            shortcutCue={isOpen ? '/' : null}
            enableSlashShortcut={isOpen}
            autoFocus
            data-testid="catalog-search-input"
          />

          {/* Inline Category Pills for small viewports when floating cluster is hidden */}
          <div className={styles.inlineCategoryPills}>
            <button
              type="button"
              className={`${styles.inlinePillBtn} ${categoryFilter === 'all' ? styles.inlinePillBtnActive : ''}`}
              onClick={() => setCategoryFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`${styles.inlinePillBtn} ${categoryFilter === 'block' ? styles.inlinePillBtnActive : ''}`}
              onClick={() => setCategoryFilter((prev) => (prev === 'block' ? 'all' : 'block'))}
            >
              <Box size={12} />
              <span>Blocks</span>
            </button>
            <button
              type="button"
              className={`${styles.inlinePillBtn} ${categoryFilter === 'item' ? styles.inlinePillBtnActive : ''}`}
              onClick={() => setCategoryFilter((prev) => (prev === 'item' ? 'all' : 'item'))}
            >
              <Sword size={12} />
              <span>Items</span>
            </button>
            <button
              type="button"
              className={`${styles.inlinePillBtn} ${categoryFilter === 'entity' ? styles.inlinePillBtnActive : ''}`}
              onClick={() => setCategoryFilter((prev) => (prev === 'entity' ? 'all' : 'entity'))}
            >
              <PawPrint size={12} />
              <span>Entities</span>
            </button>
          </div>
        </div>

        {/* Scrollable Catalog Tree */}
        <div
          ref={scrollContainerRef}
          className={styles.catalogTreeScroll}
          onScroll={handleScroll}
          data-testid="catalog-tree-scroll"
        >
          {visibleBlocks.length > 0 ? (
            <>
              {visibleBlocks.map((block) => {
                const blockKey = `${block.category}:${block.blockId}`;
                return (
                  <CatalogBlockGroup
                    key={blockKey}
                    blockKey={blockKey}
                    block={block}
                    isExpanded={isBlockExpanded(blockKey)}
                    onToggleExpand={() => toggleExpand(blockKey)}
                    onAdd={handleAdd}
                    isBlockUserDefined={isBlockUserDefined}
                    isEntityInWorkspace={isEntityInWorkspace}
                    isAliasDeclaredInPack={isAliasDeclaredInPack}
                  />
                );
              })}
              {visibleBlocks.length < filteredBlocks.length && (
                <div className={styles.loadMoreRow}>
                  <button
                    type="button"
                    className={styles.loadMoreBtn}
                    onClick={() =>
                      setDisplayLimit((prev) =>
                        Math.min(prev + 100, filteredBlocks.length)
                      )
                    }
                  >
                    Load More ({filteredBlocks.length - displayLimit} remaining)
                  </button>
                </div>
              )}
            </>
          ) : totalCatalogCount === 0 ? (
            <div className={styles.emptyContainer} data-testid="catalog-empty-cache">
              <div className={styles.emptyIconWrapper}>
                <Layers size={24} />
              </div>
              <h3 className={styles.emptyTitle}>Vanilla Catalog Not Loaded</h3>
              <p className={styles.emptyDesc}>
                Reference definitions from Mojang bedrock-samples have not been loaded yet.
              </p>
              <button
                type="button"
                className={styles.loadCatalogBtn}
                onClick={handleManualSync}
              >
                <RotateCw size={13} />
                <span>Load Vanilla Data</span>
              </button>
            </div>
          ) : (
            <div className={styles.emptyContainer} data-testid="catalog-no-results">
              <div className={styles.emptyIconWrapper}>
                <Search size={24} />
              </div>
              <h3 className={styles.emptyTitle}>No Matching Vanilla Textures</h3>
              <p className={styles.emptyDesc}>
                No reference blocks, items, or aliases match &ldquo;{searchText}&rdquo;. Try another
                keyword or clear filters.
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Reference Pack / Catalog Manager Modal */}
      <ReferencePackManagerModal
        isOpen={isReferenceManagerOpen}
        onClose={() => setIsReferenceManagerOpen(false)}
      />
    </div>,
    document.body
  );
};
