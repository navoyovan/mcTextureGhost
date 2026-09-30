// frontend/src/components/catalog/CatalogDrawer.tsx
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import {
  X,
  BookOpen,
  Search,
  RotateCw,
  Settings,
  Layers,
} from 'lucide-react';
import { usePackStore, packStoreActions } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { Badge } from '../common/Badge';
import { ReferencePackManagerModal } from './ReferencePackManagerModal';
import {
  hasTerrainTextureJson as checkTerrainTextureJson,
  hasItemTextureJson as checkItemTextureJson,
  hasBlocksJson as checkBlocksJson,
} from '../../utils/packFileUtils';
import { CatalogBlockGroup } from './CatalogItemCard';
import { CatalogToolbar, CatalogFloatingCluster, CatalogCategory } from './CatalogToolbar';
import styles from './CatalogDrawer.module.css';

export interface CatalogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

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

  const hasTerrainTextureJson = useMemo(() => checkTerrainTextureJson(packFolders), [packFolders]);
  const hasItemTextureJson = useMemo(() => checkItemTextureJson(packFolders), [packFolders]);
  const hasBlocksJson = useMemo(() => checkBlocksJson(packFolders), [packFolders]);

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
    (alias: string, category: string, _parentBlockId?: string): boolean => {
      const cat = category.toLowerCase();
      if (cat === 'block') {
        if (!hasTerrainTextureJson) return false;
        // Check pack aliases directly — alias is declared if it exists in terrain_texture.json user data
        // (status Ghost/Ok), regardless of whether its parent block is user-defined or vanilla fallback.
        // This fixes cases like glowing_obsidian where blockId is glowingobsidian (no underscore)
        // but alias is glowing_obsidian and block is vanilla fallback (isUserDefined false).
        if (!hasTerrainTextureJson) return false;
        // Declared check must be via pack aliases with IsUserDefined, not workspace tree.
        // Workspace tree contains vanilla fallback aliasGroups even when terrain has no entry
        // (e.g. bamboo_mosaic slab fallback), which previously made isAliasDeclared true
        // even after deletion (terrain_texture.json entry removed, only orphan PNG remains).
        return aliases.some(
          (a) =>
            a.alias.toLowerCase() === alias.toLowerCase() &&
            a.category.toLowerCase() === 'block' &&
            a.status !== 'ORPHAN' &&
            a.isUserDefined !== false
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
  const [categoryFilter, setCategoryFilter] = useState<CatalogCategory>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [optimisticAddedIds, setOptimisticAddedIds] = useState<Set<string>>(new Set());
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isReferenceManagerOpen, setIsReferenceManagerOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const animationRef = useRef<gsap.core.Timeline | null>(null);

  // Optimistic added IDs persist during drawer session so UI transitions smoothly
  const isOptimisticBlockAdded = useCallback((blockId: string): boolean => {
    return optimisticAddedIds.has(`block:${blockId.toLowerCase()}`) ||
      optimisticAddedIds.has(`item:${blockId.toLowerCase()}`) ||
      optimisticAddedIds.has(`entity:${blockId.toLowerCase()}`);
  }, [optimisticAddedIds]);

  const isOptimisticAliasAdded = useCallback((alias: string): boolean => {
    return optimisticAddedIds.has(`alias:${alias.toLowerCase()}`);
  }, [optimisticAddedIds]);

  // Sync optimistic added IDs when pack aliases update so deleted entries reset their Add button
  useEffect(() => {
    setOptimisticAddedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const id of prev) {
        if (id.startsWith('alias:')) {
          const aliasKey = id.slice(6);
          const stillExists = aliases.some(
            (a) => a.alias.toLowerCase() === aliasKey && a.status !== 'ORPHAN' && a.isUserDefined !== false
          );
          if (stillExists) next.add(id);
        } else if (id.startsWith('block:')) {
          const blockId = id.slice(6);
          const stillExists = isBlockUserDefined(blockId);
          if (stillExists) next.add(id);
        } else if (id.startsWith('item:')) {
          const itemId = id.slice(5);
          const stillExists = aliases.some(
            (a) => a.alias.toLowerCase() === itemId && a.category === 'item' && a.status !== 'ORPHAN'
          );
          if (stillExists) next.add(id);
        } else if (id.startsWith('entity:')) {
          const entityId = id.slice(7);
          const stillExists = isEntityInWorkspace(entityId);
          if (stillExists) next.add(id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [aliases, isBlockUserDefined, isEntityInWorkspace]);

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
      // Set initial state before animation
      gsap.set(overlay, { autoAlpha: 0, pointerEvents: 'none' });
      gsap.set(drawer, { xPercent: 100 });

      animationRef.current = gsap
        .timeline({ defaults: { overwrite: 'auto' } })
        .to(overlay, {
          autoAlpha: 1,
          duration: 0.2,
          ease: 'power1.out',
          onStart: () => {
            gsap.set(overlay, { pointerEvents: 'auto' });
          },
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
        onComplete: () => {
          setIsMounted(false);
          gsap.set(overlay, { pointerEvents: 'none' });
        },
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
    (id: string, category: string, alias?: string) => {
      const cat = category.toLowerCase();
      const blockNode = catalogTree?.find(
        (b) => b.blockId.toLowerCase() === id.toLowerCase() && (b.category || '').toLowerCase() === cat
      );
      setOptimisticAddedIds((prev) => {
        const next = new Set(prev);
        if (alias) {
          next.add(`alias:${alias.toLowerCase()}`);
        } else {
          next.add(`${cat}:${id.toLowerCase()}`);
          // Also optimistically mark every alias inside this block as added so the
          // inner “Add Alias” button flips to “Added” instantly together with “Add to Pack”.
          blockNode?.aliasGroups?.forEach((ag) => {
            if (ag.alias) next.add(`alias:${ag.alias.toLowerCase()}`);
          });
        }
        return next;
      });

      // Optimistic workspace + pack grid insert — shows new block/tile instantly without waiting for scan
      try {
        packStoreActions.optimisticAddVanillaEntry(id, category, alias, blockNode ?? null);
      } catch {}

      postCommand('VANILLA:ADD', {
        id,
        category: cat as any,
        ...(alias ? { alias } : {}),
      });
    },
    [postCommand, catalogTree]
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
        <CatalogFloatingCluster
          categoryFilter={categoryFilter}
          onSelectCategory={setCategoryFilter}
        />

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
        <CatalogToolbar
          searchText={searchText}
          onSearchChange={setSearchText}
          categoryFilter={categoryFilter}
          onSelectCategory={setCategoryFilter}
          isOpen={isOpen}
        />

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
                    isOptimisticBlockAdded={isOptimisticBlockAdded}
                    isOptimisticAliasAdded={isOptimisticAliasAdded}
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
