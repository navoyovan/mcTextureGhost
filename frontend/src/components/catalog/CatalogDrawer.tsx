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
  Layers,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { BlockGroupNodeDto, AliasGroupNodeDto, CatalogLeafDto } from '../../types/ipc';
import { FlipbookThumbnail } from '../common/FlipbookThumbnail';
import styles from './CatalogDrawer.module.css';

export interface CatalogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Thumbnail component for a catalog leaf texture with fallback error handling.
 */
const LeafThumbnail: React.FC<{ leaf: CatalogLeafDto }> = ({ leaf }) => {
  const [hasError, setHasError] = useState(false);
  const src = leaf.imageUrl || `https://vanilla.local/${leaf.relativePath}.png`;

  return (
    <div className={styles.leafThumbWrapper}>
      {!hasError ? (
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
        <span className={styles.leafThumbFallback}>
          {leaf.status === 'GHOST' ? '👻' : '📦'}
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
}> = ({ leaf }) => {
  const isAdded = leaf.status !== 'VANILLA';

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'OK':
        return styles.statusOk;
      case 'GHOST':
        return styles.statusGhost;
      case 'OVERRIDE':
        return styles.statusOverride;
      case 'ORPHAN':
        return styles.statusOrphan;
      case 'VANILLA':
      default:
        return styles.statusVanilla;
    }
  };

  return (
    <div className={styles.leafRow} data-testid={`leaf-row-${leaf.alias}`}>
      <div className={styles.leafLeft}>
        <LeafThumbnail leaf={leaf} />
        <div className={styles.leafMeta}>
          <div className={styles.leafPathRow}>
            <span className={styles.leafPath} title={leaf.relativePath}>
              {leaf.relativePath}
            </span>
            {leaf.isFlipbook && (
              <span className={styles.animBadge} title="Animated flipbook texture">
                ANIM
              </span>
            )}
          </div>
          {leaf.subtitleCaption && (
            <span className={styles.leafSubtitle} title={leaf.subtitleCaption}>
              {leaf.subtitleCaption}
            </span>
          )}
        </div>
      </div>

      <div className={styles.leafRight}>
        <span
          className={`${styles.statusPill} ${getStatusClass(leaf.status)}`}
          data-testid={`status-pill-${leaf.status.toLowerCase()}`}
        >
          {leaf.status === 'GHOST' ? '👻 GHOST' : leaf.status}
        </span>
        {isAdded && (
          <span className={styles.addedBadge} title="This texture is already in your pack">
            ✓ Added
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
  onAdd: (id: string, category: string) => void;
}> = ({ aliasGroup, category, onAdd }) => {
  const isAdded =
    (aliasGroup.notAddedCount ?? 0) === 0 &&
    (aliasGroup.leaves?.length ?? 0) > 0 &&
    aliasGroup.leaves.every((l) => l.status !== 'VANILLA');

  return (
    <div className={styles.aliasGroupCard} data-testid={`alias-group-${aliasGroup.alias}`}>
      <div className={styles.aliasGroupHeader}>
        <div className={styles.aliasHeaderLeft}>
          <span className={styles.aliasNameText} title={aliasGroup.alias}>
            {aliasGroup.alias}
          </span>
          {aliasGroup.faceSummary && (
            <span
              className={styles.faceSummaryBadge}
              title={`Face mapping: ${aliasGroup.faceSummary}`}
            >
              {aliasGroup.faceSummary}
            </span>
          )}
          {aliasGroup.ghostCount > 0 && (
            <span className={styles.ghostBadge}>
              👻 {aliasGroup.ghostCount}
            </span>
          )}
        </div>

        {isAdded ? (
          <span className={styles.addedBadge} title="This alias is already in your pack">
            ✓ Added
          </span>
        ) : (
          <button
            type="button"
            className={styles.addAliasBtn}
            onClick={() => onAdd(aliasGroup.alias, aliasGroup.category || category)}
            title={`Add alias '${aliasGroup.alias}' to pack`}
            aria-label={`Add alias ${aliasGroup.alias}`}
          >
            + Add Alias
          </button>
        )}
      </div>

      {aliasGroup.leaves && aliasGroup.leaves.length > 0 && (
        <div className={styles.leavesList}>
          {aliasGroup.leaves.map((leaf, index) => (
            <CatalogLeafRow
              key={leaf.relativePath || `${aliasGroup.alias}-${index}`}
              leaf={leaf}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Tier 1: Block/Item Group Component
 */
const CatalogBlockGroup: React.FC<{
  block: BlockGroupNodeDto;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAdd: (id: string, category: string) => void;
  isBlockInWorkspace: (blockId: string) => boolean;
}> = ({ block, isExpanded, onToggleExpand, onAdd, isBlockInWorkspace }) => {
  const isItem = block.category.toLowerCase() === 'item';

  const allAliasesAdded =
    (block.aliasGroups?.length ?? 0) > 0 &&
    block.aliasGroups.every(
      (ag) =>
        (ag.notAddedCount ?? 0) === 0 &&
        (ag.leaves?.length ?? 0) > 0 &&
        ag.leaves.every((l) => l.status !== 'VANILLA')
    );

  const isAdded = isItem ? allAliasesAdded : (isBlockInWorkspace(block.blockId) && allAliasesAdded);

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
            aria-label={isExpanded ? 'Collapse block' : 'Expand block'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          <div className={styles.blockTitleGroup}>
            <span className={styles.blockDisplayName} title={block.displayName}>
              {block.displayName}
            </span>
            <span className={styles.blockIdText} title={block.blockId}>
              ({block.blockId})
            </span>
          </div>
        </div>

        <div className={styles.blockBadgesAndActions}>
          <span
            className={`${styles.categoryBadge} ${isItem ? styles.categoryBadgeItem : ''}`}
          >
            {block.category}
          </span>

          {block.ghostCount > 0 && (
            <span className={styles.ghostBadge} title={`${block.ghostCount} ghost textures`}>
              👻 {block.ghostCount}
            </span>
          )}

          {block.totalVariants > 0 && (
            <span className={styles.variantsBadge} title={`${block.totalVariants} total variants`}>
              {block.totalVariants} var
            </span>
          )}

          {isAdded ? (
            <span className={styles.addedBadge} title="This block is already in your pack">
              ✓ Added
            </span>
          ) : (
            <button
              type="button"
              className={styles.addBlockBtn}
              onClick={(e) => {
                e.stopPropagation();
                onAdd(block.blockId, block.category);
              }}
              title={`Add all textures for ${block.displayName} to pack`}
              aria-label={`Add all textures for ${block.displayName} to pack`}
            >
              <Zap size={11} />
              <span>Add to Pack</span>
            </button>
          )}
        </div>
      </div>

      {isExpanded && block.aliasGroups && block.aliasGroups.length > 0 && (
        <div className={styles.aliasGroupList}>
          {block.aliasGroups.map((aliasGroup) => (
            <CatalogAliasGroup
              key={aliasGroup.alias}
              aliasGroup={aliasGroup}
              category={block.category}
              onAdd={onAdd}
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
  const { postCommand, loadCatalog } = useIpc();

  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'block' | 'item'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isMounted, setIsMounted] = useState(isOpen);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const animationRef = useRef<gsap.core.Timeline | null>(null);

  const isBlockInWorkspace = useCallback(
    (blockId: string): boolean => {
      if (!blockWorkspaceTree || !Array.isArray(blockWorkspaceTree)) return false;
      return blockWorkspaceTree.some(
        (b) => b.blockId.toLowerCase() === blockId.toLowerCase()
      );
    },
    [blockWorkspaceTree]
  );

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

  // Reset display limit when query or filter changes
  useEffect(() => {
    setDisplayLimit(100);
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

  // Auto-expand all matching blocks if searching
  const isBlockExpanded = useCallback(
    (blockId: string) => {
      if (searchText.trim().length > 0) {
        return true;
      }
      return expandedIds.has(blockId);
    },
    [searchText, expandedIds]
  );

  const toggleExpand = useCallback((blockId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  const handleAdd = useCallback(
    (id: string, category: string) => {
      postCommand('VANILLA:ADD', {
        id,
        category: category.toLowerCase() === 'item' ? 'item' : 'block',
      });
    },
    [postCommand]
  );

  const handleManualSync = useCallback(() => {
    if (loadCatalog) {
      loadCatalog();
    } else {
      postCommand('VANILLA:LOAD_CATALOG', {});
    }
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
        aria-label="Vanilla Bedrock Reference Catalog"
      >
        {/* Drawer Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIconBadge}>
              <BookOpen size={17} />
            </div>
            <div className={styles.headerTextGroup}>
              <h2 className={styles.headerTitle}>Vanilla Bedrock Reference Catalog</h2>
              <span className={styles.headerSubtitle}>
                Mojang bedrock-samples offline reference database
              </span>
            </div>
          </div>

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

        {/* Search & Category Filter Toolbar */}
        <div className={styles.searchToolbar}>
          <div className={styles.searchInputRow}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search vanilla blocks, items, or aliases (e.g. sea_lantern, sword, door)..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              data-testid="catalog-search-input"
              autoFocus
            />
            {searchText && (
              <button
                type="button"
                className={styles.clearSearchBtn}
                onClick={() => setSearchText('')}
                title="Clear search query"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className={styles.filterControlsRow}>
            <div className={styles.categoryToggleGroup} role="group" aria-label="Category filter">
              <button
                type="button"
                className={`${styles.categoryToggleBtn} ${categoryFilter === 'all' ? styles.categoryToggleBtnActive : ''}`}
                onClick={() => setCategoryFilter('all')}
                data-testid="category-filter-all"
              >
                All
              </button>
              <button
                type="button"
                className={`${styles.categoryToggleBtn} ${categoryFilter === 'block' ? styles.categoryToggleBtnActive : ''}`}
                onClick={() => setCategoryFilter('block')}
                data-testid="category-filter-blocks"
              >
                Blocks
              </button>
              <button
                type="button"
                className={`${styles.categoryToggleBtn} ${categoryFilter === 'item' ? styles.categoryToggleBtnActive : ''}`}
                onClick={() => setCategoryFilter('item')}
                data-testid="category-filter-items"
              >
                Items
              </button>
            </div>

            <span className={styles.resultCountBadge} data-testid="result-count-badge">
              {isSearching
                ? `SHOWING ${visibleBlocks.length} OF ${filteredBlocks.length}`
                : `SHOWING ${visibleBlocks.length} OF ${totalCatalogCount}`}
            </span>
          </div>
        </div>

        {/* Scrollable Catalog Tree */}
        <div
          className={styles.catalogTreeScroll}
          onScroll={handleScroll}
          data-testid="catalog-tree-scroll"
        >
          {visibleBlocks.length > 0 ? (
            <>
              {visibleBlocks.map((block) => (
                <CatalogBlockGroup
                  key={block.blockId}
                  block={block}
                  isExpanded={isBlockExpanded(block.blockId)}
                  onToggleExpand={() => toggleExpand(block.blockId)}
                  onAdd={handleAdd}
                  isBlockInWorkspace={isBlockInWorkspace}
                />
              ))}
              {displayLimit < filteredBlocks.length && (
                <div className={styles.loadMoreTrigger}>
                  <button
                    type="button"
                    className={styles.loadMoreBtn}
                    onClick={() =>
                      setDisplayLimit((prev) => Math.min(prev + 100, filteredBlocks.length))
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
    </div>,
    document.body
  );
};
