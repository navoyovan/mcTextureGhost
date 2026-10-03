import React, { useState, useMemo, useCallback, useRef, useEffect, startTransition } from 'react';
import { Box, Layers, ArrowRight, MoreVertical, Trash2 } from 'lucide-react';
import { usePackStore, packStoreActions } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { BlockGroupNodeDto, CatalogLeafDto, TextureAliasDto, OpenWithAppDto } from '../../types/ipc';
import { Block3DViewer } from './Block3DViewer';
import { BlockEntryTree } from './BlockEntryTree';
import { WorkspaceTileCard } from './WorkspaceTileCard';
import { WorkspaceShell } from './WorkspaceShell';
import { TileHoverMorphPortal, TileHoverMorphTarget } from '../grid/TileHoverMorphPortal';
import { TextureContextMenu } from '../common/TextureContextMenu';
import { WorkspaceSkeleton } from './WorkspaceSkeleton';
import { Badge } from '../common/Badge';
import {
  hasTerrainTextureJson as checkTerrainTextureJson,
  hasBlocksJson as checkBlocksJson,
} from '../../utils/packFileUtils';
import { leafToAliasDto, groupLeavesByVariantSlot } from '../../utils/leafTransforms';
import { useVirtualList } from '../../hooks/useVirtualList';
import styles from './BlockWorkspace.module.css';

const AliasLoadingOverlay: React.FC<{ op: 'deleting' | 'adding' }> = React.memo(({ op }) => (
  <div className={styles.aliasLoadingOverlay}>
    <div className={styles.aliasLoadingSpinner} />
    <span>{op === 'deleting' ? 'Removing alias entries…' : 'Adding variation…'}</span>
  </div>
));

interface BlockSidebarItemProps {
  blockId: string;
  displayName: string;
  isCustom: boolean;
  isActive: boolean;
  ghostCount: number;
  onSelect: (id: string) => void;
}

const BlockSidebarItem: React.FC<BlockSidebarItemProps> = React.memo(({
  blockId,
  displayName,
  isCustom,
  isActive,
  ghostCount,
  onSelect,
}) => {
  return (
    <button
      data-block-id={blockId}
      type="button"
      className={`${styles.blockItem} ${isActive ? styles.blockItemActive : ''} ${!isCustom ? styles.blockItemVanilla : ''}`}
      onClick={() => {
        if (!isActive) {
          onSelect(blockId);
        }
      }}
    >
      <div className={styles.blockItemLeft}>
        <Box size={14} className={!isCustom ? styles.blockIconMuted : undefined} />
        <span className={styles.blockItemName}>{displayName || blockId}</span>
      </div>
      <div className={styles.blockItemBadges}>
        {!isCustom && blockId !== 'uncategorized' && (
          <Badge variant="fallback" size="sm" title="Inferred from vanilla blocks.json">fallback</Badge>
        )}
        {ghostCount > 0 && (
          <Badge variant="ghost" size="counter">{ghostCount}</Badge>
        )}
      </div>
    </button>
  );
});

export const BlockWorkspace: React.FC = () => {
  const blockWorkspaceTree = usePackStore((s) => s.blockWorkspaceTree);
  const blocksById = usePackStore((s) => s.blocksById);
  const isScanning = usePackStore((s) => s.isScanning);
  const isWorkspaceLoading = usePackStore((s) => s.isWorkspaceLoading);
  const searchQuery = usePackStore((s) => s.searchQuery);
  const statusFilter = usePackStore((s) => s.statusFilter);
  const activeFilters = usePackStore((s) => s.activeFilters);
  const packFolders = usePackStore((s) => s.packFolders);
  const packAliases = usePackStore((s) => s.aliases ?? []);
  const catalogTree = usePackStore((s) => s.catalogTree);
  const selectedBlockId = usePackStore((s) => s.blockWorkspaceSelectedId);
  const setSelectedBlockId = usePackStore((s) => s.setBlockWorkspaceSelectedId);
  const pendingAliasOps = usePackStore((s) => s.pendingAliasOps);
  const { editTexture, deleteTextureFile, deleteTextureEntries, deleteTextureVariation, deleteBlockEntry, openInExplorer, scaffoldTextureVariation } = useIpc();

  const hasTerrainTextureJson = useMemo(() => checkTerrainTextureJson(packFolders), [packFolders]);
  const hasBlocksJson = useMemo(() => checkBlocksJson(packFolders), [packFolders]);

  const [activeMenuKey, setActiveMenuKey] = useState<string | null>(null);
  const setIsListDrawerOpen = usePackStore((s) => s.setIsWorkspaceDrawerOpen);
  const [contextMenuTarget, setContextMenuTarget] = useState<{
    alias: TextureAliasDto;
    key: string;
    anchor?: { top?: number; bottom?: number; left?: number; right?: number; x?: number; y?: number };
  } | null>(null);
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

  const lastSelectedBlockRef = useRef<BlockGroupNodeDto | null>(null);
  const lastSelectedIndexRef = useRef<number>(-1);
  const prevSelectedBlockIdRef = useRef<string | null>(null);

  // Filter block list by toolbar searchQuery and activeFilters/statusFilter
  const filteredBlockWorkspaceTree = useMemo(() => {
    if (!blockWorkspaceTree) return [];
    const query = searchQuery.trim().toLowerCase();

    const effectiveFilters = activeFilters.length > 0
      ? activeFilters
      : (statusFilter !== 'all' ? [statusFilter as any] : []);

    const filtered = blockWorkspaceTree.filter((block) => {
      const allLeaves = [
        ...(block.aliasGroups?.flatMap((ag) => ag.leaves ?? []) ?? []),
        ...(block.aliasGroups?.flatMap((ag) => ag.faceNodes?.flatMap((fn) => fn.leaves ?? []) ?? []) ?? []),
      ];

      // 0. Base pack presence: exclude untouched vanilla blocks that have no pack content
      const hasPackTexture = allLeaves.some(
        (l) => l.status === 'OK' || l.status === 'OVERRIDE' || l.status === 'ORPHAN'
      );
      const hasPackTerrainDeclaration =
        hasTerrainTextureJson &&
        block.aliasGroups?.some((ag) => {
          const aliasKey = ag.alias.toLowerCase();
          return packAliases.some(
            (a: TextureAliasDto) =>
              a.alias.toLowerCase() === aliasKey &&
              a.category === 'block' &&
              a.status !== 'ORPHAN' &&
              (a as any).isUserDefined !== false
          );
        });
      const isCustomBlock =
        (block.blockId.includes(':') && !block.blockId.startsWith('minecraft:')) ||
        (catalogTree && catalogTree.length > 0
          ? !catalogTree.some((b) => b.blockId.toLowerCase() === block.blockId.toLowerCase())
          : false);
      const isUncategorized = block.blockId === 'uncategorized';

      const hasPackPresence = hasPackTexture || hasPackTerrainDeclaration || isCustomBlock || isUncategorized;
      const isCurrentlySelected = Boolean(selectedBlockId && block.blockId === selectedBlockId);
      if (!hasPackPresence && !isCurrentlySelected) return false;

      // 1. Active Filters (Checklist)
      if (effectiveFilters.length > 0) {
        const hasStatusFilter = effectiveFilters.some((f) => f === 'ghosts' || f === 'added' || f === 'orphans');
        const hasFeatureFilter = effectiveFilters.some(
          (f) => f === 'mers' || f === 'atlas' || f === 'flipbook' || f === 'variations' || f === 'blockstates' || f === 'variation'
        );

        if (hasStatusFilter) {
          const statusMatch =
            (effectiveFilters.includes('ghosts') && (block.ghostCount ?? 0) > 0) ||
            (effectiveFilters.includes('added') && allLeaves.some((l) => l.status === 'OK' || l.status === 'OVERRIDE')) ||
            (effectiveFilters.includes('orphans') && allLeaves.some((l) => l.status === 'ORPHAN'));
          if (!statusMatch && !isCurrentlySelected) return false;
        }

        if (hasFeatureFilter) {
          const hasMers = allLeaves.some((l) => (l as any).hasMers || (l as any).mersFullPath);
          const hasAtlas = allLeaves.some((l) => (l as any).hasAtlas || (l as any).atlasFullPath);
          const hasFlipbook = allLeaves.some((l) => l.isFlipbook || Boolean(l.flipbook));
          const hasTextureVariation = allLeaves.some(
            (l) =>
              (l.totalTextureVariants && l.totalTextureVariants > 1) ||
              l.variantKind === 'TextureVariant' ||
              l.variantKind === 'NestedVariant' ||
              l.textureVariantIndex != null
          );
          const hasBlockstate =
            (block.totalVariants && block.totalVariants > 1) ||
            allLeaves.some(
              (l) =>
                (l.totalBlockVariants && l.totalBlockVariants > 1) ||
                l.variantKind === 'BlockVariant' ||
                l.variantKind === 'NestedVariant' ||
                l.blockVariantIndex != null
            );
          const hasMergedVariation = hasTextureVariation || hasBlockstate;

          const featureMatch =
            (effectiveFilters.includes('mers') && hasMers) ||
            (effectiveFilters.includes('atlas') && hasAtlas) ||
            (effectiveFilters.includes('flipbook') && hasFlipbook) ||
            (effectiveFilters.includes('variations') && hasTextureVariation) ||
            (effectiveFilters.includes('blockstates') && hasBlockstate) ||
            (effectiveFilters.includes('variation') && hasMergedVariation);
          if (!featureMatch && !isCurrentlySelected) return false;
        }
      }

      // 2. Search query filter
      if (!query) return true;

      const blockIdMatches = (block.blockId || '').toLowerCase().includes(query);
      const dispNameMatches = (block.displayName || '').toLowerCase().includes(query);
      if (blockIdMatches || dispNameMatches) return true;

      // Check inner aliases, paths, or leaf display names
      return block.aliasGroups?.some((ag) => {
        if ((ag.alias || '').toLowerCase().includes(query)) return true;
        return allLeaves.some(
          (l) =>
            (l.relativePath || '').toLowerCase().includes(query) ||
            (l.displayName || '').toLowerCase().includes(query) ||
            (l.alias || '').toLowerCase().includes(query)
        );
      });
    });

    const norm = (id?: string | null) => (id || '').toLowerCase().replace(/^minecraft:/, '');

    // Reset or update selected index tracking when switching blocks
    if (selectedBlockId !== prevSelectedBlockIdRef.current) {
      prevSelectedBlockIdRef.current = selectedBlockId ?? null;
      lastSelectedIndexRef.current = -1;
    }

    // If currently selected block is no longer in filtered list or shifted position (e.g. live update),
    // retain it in the list at its existing pinned index so the user remains on the block until manually navigating away
    let resultList = filtered;
    if (selectedBlockId) {
      const normSelected = norm(selectedBlockId);
      const existingIdx = resultList.findIndex((b) => norm(b.blockId) === normSelected);

      // If this block was not yet pinned, record its current index
      if (lastSelectedIndexRef.current < 0 && existingIdx !== -1) {
        lastSelectedIndexRef.current = existingIdx;
      }

      if (existingIdx !== -1) {
        // If pack live update re-categorized this block (e.g. from user blocks to fallback section),
        // pull it out of its new offset and re-pin it back at its established index!
        if (lastSelectedIndexRef.current >= 0 && existingIdx !== lastSelectedIndexRef.current) {
          const item = resultList[existingIdx];
          if (item) {
            const withoutItem = [...resultList.slice(0, existingIdx), ...resultList.slice(existingIdx + 1)];
            const targetIdx = Math.min(Math.max(0, lastSelectedIndexRef.current), withoutItem.length);
            resultList = [
              ...withoutItem.slice(0, targetIdx),
              item,
              ...withoutItem.slice(targetIdx),
            ];
          }
        }
      } else {
        const fullMatch = blocksById?.get(normSelected) || blockWorkspaceTree.find((b) => norm(b.blockId) === normSelected);
        const catalogMatch = catalogTree?.find((b) => norm(b.blockId) === normSelected);
        const snapshotMatch =
          lastSelectedBlockRef.current && norm(lastSelectedBlockRef.current.blockId) === normSelected
            ? lastSelectedBlockRef.current
            : null;
        const fallbackItem =
          fullMatch ||
          (catalogMatch ? ({ ...catalogMatch, isUserDefined: false } as BlockGroupNodeDto) : null) ||
          snapshotMatch;
        if (fallbackItem) {
          let targetIdx = lastSelectedIndexRef.current;
          if (targetIdx < 0 || targetIdx > resultList.length) {
            const targetName = (fallbackItem.displayName || fallbackItem.blockId || '').toLowerCase();
            targetIdx = resultList.findIndex(
              (b) => (b.displayName || b.blockId || '').toLowerCase().localeCompare(targetName) > 0
            );
            if (targetIdx === -1) {
              targetIdx = resultList.length;
            }
            lastSelectedIndexRef.current = targetIdx;
          }
          targetIdx = Math.min(Math.max(0, targetIdx), resultList.length);
          resultList = [
            ...resultList.slice(0, targetIdx),
            fallbackItem,
            ...resultList.slice(targetIdx),
          ];
        }
      }
    }

    // Deduplicate by blockId to ensure uniqueness in tree and avoid duplicate React keys
    const seen = new Map<string, BlockGroupNodeDto>();
    for (const b of resultList) {
      const key = norm(b.blockId);
      if (!seen.has(key)) {
        seen.set(key, b);
      } else {
        const existing = seen.get(key)!;
        if (b.isUserDefined !== false && existing.isUserDefined === false) {
          seen.set(key, b);
        } else if ((b.ghostCount || 0) > (existing.ghostCount || 0)) {
          seen.set(key, b);
        }
      }
    }

    return Array.from(seen.values());
  }, [blockWorkspaceTree, searchQuery, statusFilter, activeFilters, hasTerrainTextureJson, packAliases, catalogTree, selectedBlockId]);

  const activeBlockStateIndex = usePackStore((s) => s.blockWorkspaceActiveStateIndex);
  const setActiveBlockStateIndex = usePackStore((s) => s.setBlockWorkspaceActiveStateIndex);
  const activeVariationIndex = usePackStore((s) => s.blockWorkspaceActiveVariationIndex);
  const setActiveVariationIndex = usePackStore((s) => s.setBlockWorkspaceActiveVariationIndex);

  // Keep selectedBlock pointed to a valid block: first check filtered list, then full tree if currently selected, then catalogTree fallback, then last known snapshot, then fallback to first filtered
  const selectedBlock = useMemo<BlockGroupNodeDto | null>(() => {
    if (selectedBlockId) {
      const normSelected = (selectedBlockId || '').toLowerCase().replace(/^minecraft:/, '');
      const foundInFiltered = filteredBlockWorkspaceTree.find((b) => (b.blockId || '').toLowerCase().replace(/^minecraft:/, '') === normSelected);
      if (foundInFiltered) {
        lastSelectedBlockRef.current = foundInFiltered;
        return foundInFiltered;
      }
      const foundInFull = blocksById?.get(normSelected) || blockWorkspaceTree?.find((b) => (b.blockId || '').toLowerCase().replace(/^minecraft:/, '') === normSelected);
      if (foundInFull) {
        lastSelectedBlockRef.current = foundInFull;
        return foundInFull;
      }
      if (catalogTree && catalogTree.length > 0) {
        const foundInCatalog = catalogTree.find((b) => (b.blockId || '').toLowerCase().replace(/^minecraft:/, '') === normSelected);
        if (foundInCatalog) {
          const fallbackNode: BlockGroupNodeDto = {
            ...foundInCatalog,
            isUserDefined: false,
          };
          lastSelectedBlockRef.current = fallbackNode;
          return fallbackNode;
        }
      }
      if (lastSelectedBlockRef.current && (lastSelectedBlockRef.current.blockId || '').toLowerCase().replace(/^minecraft:/, '') === normSelected) {
        return lastSelectedBlockRef.current;
      }
    }
    const fallback = filteredBlockWorkspaceTree[0] ?? null;
    lastSelectedBlockRef.current = fallback;
    return fallback;
  }, [filteredBlockWorkspaceTree, blockWorkspaceTree, catalogTree, selectedBlockId]);

  // Reset active indices when switching block (but preserve when merely restoring from inactive view)
  const prevBlockIdRef = useRef<string | null>(null);
  useEffect(() => {
    const curId = selectedBlock?.blockId ?? null;
    if (curId && prevBlockIdRef.current !== null && prevBlockIdRef.current !== curId) {
      setActiveBlockStateIndex(0);
      setActiveVariationIndex(0);
    }
    prevBlockIdRef.current = curId;
  }, [selectedBlock?.blockId, setActiveBlockStateIndex, setActiveVariationIndex]);

  const {
    containerRef: sidebarScrollRef,
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
    scrollToIndex,
  } = useVirtualList({
    itemCount: filteredBlockWorkspaceTree.length,
    itemHeight: 37,
    headerHeight: 41,
    overscan: 6,
  });

  const visibleBlocks = useMemo(
    () => filteredBlockWorkspaceTree.slice(startIndex, endIndex),
    [filteredBlockWorkspaceTree, startIndex, endIndex]
  );

  // Keyboard arrow navigation (Up / Down) through blocks list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }

      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

      if (!filteredBlockWorkspaceTree || filteredBlockWorkspaceTree.length === 0) return;

      e.preventDefault();

      const currentId = selectedBlock?.blockId || selectedBlockId;
      const currentIndex = filteredBlockWorkspaceTree.findIndex(
        (b) => b.blockId === currentId
      );

      let nextIndex = 0;
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex >= 0 && currentIndex < filteredBlockWorkspaceTree.length - 1 ? currentIndex + 1 : 0;
      } else if (e.key === 'ArrowUp') {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : filteredBlockWorkspaceTree.length - 1;
      }

      const nextBlock = filteredBlockWorkspaceTree[nextIndex];
      if (nextBlock) {
        startTransition(() => {
          setSelectedBlockId(nextBlock.blockId);
        });
        scrollToIndex(nextIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredBlockWorkspaceTree, selectedBlock?.blockId, selectedBlockId, scrollToIndex]);

  // Reset activeVariationIndex when switching blockstate
  useEffect(() => {
    setActiveVariationIndex(0);
  }, [activeBlockStateIndex]);

  // Compute all available blockstates and their texture variations for this block
  const blockStates = useMemo(() => {
    if (!selectedBlock || !selectedBlock.aliasGroups) return [];

    // Determine max block variants in this block
    let totalBV = 1;
    for (const ag of selectedBlock.aliasGroups) {
      const allLeaves = [
        ...(ag.leaves ?? []),
        ...(ag.faceNodes ? ag.faceNodes.flatMap((fn) => fn.leaves ?? []) : []),
      ];
      for (const l of allLeaves) {
        if (l.totalBlockVariants && l.totalBlockVariants > totalBV) {
          totalBV = l.totalBlockVariants;
        }
      }
    }

    const stateList: Array<{
      index: number;
      label: string;
      badgeNumber?: number;
      textures: Record<string, string | null>;
      flipbooks: Record<string, any>;
      variations: Array<{
        index: number;
        label: string;
        badgeNumber?: number;
        textures: Record<string, string | null>;
        flipbooks: Record<string, any>;
      }>;
    }> = [];

    for (let i = 0; i < totalBV; i++) {
      // Find maximum variations across faces for this specific blockstate slot
      let maxVariations = 1;
      for (const ag of selectedBlock.aliasGroups) {
        if (ag.faceNodes) {
          for (const fn of ag.faceNodes) {
            const groups = groupLeavesByVariantSlot(fn.leaves ?? []);
            const g = groups[i] ?? groups[0];
            if (g && g.leaves.length > maxVariations) {
              maxVariations = g.leaves.length;
            }
          }
        } else if (ag.leaves && ag.leaves.length > 0) {
          const groups = groupLeavesByVariantSlot(ag.leaves);
          const g = groups[i] ?? groups[0];
          if (g && g.leaves.length > maxVariations) {
            maxVariations = g.leaves.length;
          }
        }
      }

      // Build each variation for this blockstate
      const variations = [];
      for (let v = 0; v < maxVariations; v++) {
        const textures: Record<string, string | null> = {
          up: null, down: null, north: null, south: null, east: null, west: null, all: null,
        };
        const flipbooks: Record<string, any> = {
          up: null, down: null, north: null, south: null, east: null, west: null, all: null,
        };

        for (const ag of selectedBlock.aliasGroups) {
          if (ag.faceNodes) {
            for (const fn of ag.faceNodes) {
              const label = (fn.faceLabel || '').toLowerCase();
              const groups = groupLeavesByVariantSlot(fn.leaves ?? []);
              const g = groups[i] ?? groups[0];
              if (g) {
                const leaf = g.leaves[v] ?? g.leaves[0];
                if (leaf && leaf.status !== 'GHOST' && leaf.imageUrl) {
                  const isPackUrl = leaf.imageUrl.startsWith('https://pack.local');
                  const isPackFilePresent = leaf.status === 'OK' || leaf.status === 'OVERRIDE' || !!leaf.fullPath;
                  if (!isPackUrl || isPackFilePresent) {
                    textures[label] = leaf.imageUrl;
                    flipbooks[label] = leaf.flipbook ?? null;
                    if (label === 'side') {
                      textures.north = textures.north ?? leaf.imageUrl;
                      textures.south = textures.south ?? leaf.imageUrl;
                      textures.east = textures.east ?? leaf.imageUrl;
                      textures.west = textures.west ?? leaf.imageUrl;
                      flipbooks.north = flipbooks.north ?? leaf.flipbook ?? null;
                      flipbooks.south = flipbooks.south ?? leaf.flipbook ?? null;
                      flipbooks.east = flipbooks.east ?? leaf.flipbook ?? null;
                      flipbooks.west = flipbooks.west ?? leaf.flipbook ?? null;
                    }
                  }
                }
              }
            }
          } else if (ag.leaves && ag.leaves.length > 0) {
            const groups = groupLeavesByVariantSlot(ag.leaves);
            const g = groups[i] ?? groups[0];
            if (g) {
              const leaf = g.leaves[v] ?? g.leaves[0];
              if (leaf && leaf.status !== 'GHOST' && leaf.imageUrl) {
                const isPackUrl = leaf.imageUrl.startsWith('https://pack.local');
                const isPackFilePresent = leaf.status === 'OK' || leaf.status === 'OVERRIDE' || !!leaf.fullPath;
                if (!isPackUrl || isPackFilePresent) {
                  textures.all = leaf.imageUrl;
                  flipbooks.all = leaf.flipbook ?? null;
                }
              }
            }
          }
        }

        variations.push({
          index: v,
          label: `Variation ${v + 1}`,
          badgeNumber: v + 1,
          textures,
          flipbooks,
        });
      }

      stateList.push({
        index: i,
        label: `Blockstate ${i + 1}`,
        badgeNumber: i + 1,
        textures: variations[0]?.textures ?? {},
        flipbooks: variations[0]?.flipbooks ?? {},
        variations,
      });
    }

    return stateList;
  }, [selectedBlock]);

  const activeState = blockStates[activeBlockStateIndex] ?? blockStates[0];
  const activeVariation = activeState?.variations?.[activeVariationIndex] ?? activeState?.variations?.[0];

  const faceTextures = useMemo(() => {
    if (activeVariation) {
      return {
        textures: activeVariation.textures,
        flipbooks: activeVariation.flipbooks,
      };
    }
    if (activeState) {
      return {
        textures: activeState.textures,
        flipbooks: activeState.flipbooks,
      };
    }
    return { textures: {}, flipbooks: {} };
  }, [activeState, activeVariation]);

  const [hoverMorphTarget, setHoverMorphTarget] = useState<TileHoverMorphTarget | null>(null);

  const handleSelectBlock = useCallback((id: string) => {
    startTransition(() => {
      setSelectedBlockId(id);
    });
    setIsListDrawerOpen(false);
  }, [setSelectedBlockId, setIsListDrawerOpen]);

  const handleTileClick = useCallback((domEl: HTMLElement, leaf: CatalogLeafDto, key: string, targetType: 'card' | 'image' = 'image') => {
    const rect = domEl.getBoundingClientRect();
    setHoverMorphTarget({
      alias: leafToAliasDto(leaf),
      key,
      originRect: rect,
      domElement: domEl,
      targetType,
    });
  }, []);

  const handleToggleMenu = useCallback((cardKey: string) => {
    setActiveMenuKey((prev) => (prev === cardKey ? null : cardKey));
  }, []);

  const handleDeleteTextureFile = useCallback((path: string, alias: string) => {
    packStoreActions.setPendingTileOp(path, 'deleting');
    deleteTextureFile(path, alias);
  }, [deleteTextureFile]);

  const handleDeleteTextureEntries = useCallback((alias: string, relativePath?: string | null) => {
    packStoreActions.setPendingAliasOp(alias, 'deleting');
    deleteTextureEntries(alias, 'block', relativePath ?? undefined);
  }, [deleteTextureEntries]);

  const handleAddVariation = useCallback(async (leaf: CatalogLeafDto, count = 1) => {
    packStoreActions.setPendingAliasOp(leaf.alias, 'adding');
    for (let i = 0; i < count; i++) {
      await scaffoldTextureVariation(leaf.alias, leaf.blockVariantIndex ?? null, leaf.relativePath ?? null);
    }
  }, [scaffoldTextureVariation]);

  const handleDeleteVariation = useCallback((leaf: CatalogLeafDto) => {
    if (leaf.relativePath) {
      packStoreActions.optimisticDeleteVariation(leaf.alias, leaf.relativePath);
      deleteTextureVariation(leaf.alias, leaf.relativePath);
    }
  }, [deleteTextureVariation]);

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [openAliasMenu, setOpenAliasMenu] = useState<string | null>(null);

  useEffect(() => {
    setIsMoreMenuOpen(false);
    setOpenAliasMenu(null);
  }, [selectedBlockId]);

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMoreMenuOpen]);

  useEffect(() => {
    if (!openAliasMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.moreMenuWrapper}`)) {
        setOpenAliasMenu(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [openAliasMenu]);

  const handleDeleteBlockEntry = useCallback(() => {
    if (!selectedBlock || selectedBlock.blockId === 'uncategorized') return;
    packStoreActions.optimisticDeleteBlockEntry(selectedBlock.blockId);
    deleteBlockEntry(selectedBlock.blockId);
    setIsMoreMenuOpen(false);
  }, [selectedBlock, deleteBlockEntry]);

  // Distinct aliases belonging to this block that are declared in pack's terrain_texture.json
  const declaredTerrainAliases = useMemo(() => {
    if (!selectedBlock?.aliasGroups || !hasTerrainTextureJson) return [];
    const packAliasNames = new Set(
      packAliases
        .filter((a) => a.category === 'block' && a.status !== 'ORPHAN' && (a as any).isUserDefined !== false)
        .map((a) => a.alias.toLowerCase())
    );
    return selectedBlock.aliasGroups
      .map((ag) => ag.alias)
      .filter((alias) => packAliasNames.has(alias.toLowerCase()));
  }, [selectedBlock, hasTerrainTextureJson, packAliases]);

  const handleDeleteBlockAndTerrainEntries = useCallback(async () => {
    if (!selectedBlock || selectedBlock.blockId === 'uncategorized') return;

    if (selectedBlock.isUserDefined !== false) {
      packStoreActions.optimisticDeleteBlockEntry(selectedBlock.blockId);
      await deleteBlockEntry(selectedBlock.blockId);
    }

    if (declaredTerrainAliases.length > 0) {
      for (const alias of declaredTerrainAliases) {
        packStoreActions.setPendingAliasOp(alias, 'deleting');
        await deleteTextureEntries(alias, 'block');
      }
    }

    setIsMoreMenuOpen(false);
  }, [selectedBlock, declaredTerrainAliases, deleteBlockEntry, deleteTextureEntries]);

  const handleDeleteAliasEntry = useCallback((alias: string) => {
    packStoreActions.setPendingAliasOp(alias, 'deleting');
    deleteTextureEntries(alias, 'block');
    setOpenAliasMenu(null);
  }, [deleteTextureEntries]);

  const tileZoom = usePackStore((s) => s.tileZoom);
  const selectedBlockDisplayName = selectedBlock?.displayName || selectedBlock?.blockId || '';

  if (isWorkspaceLoading || (isScanning && (!blockWorkspaceTree || blockWorkspaceTree.length === 0))) {
    return <WorkspaceSkeleton />;
  }

  if (!blockWorkspaceTree || blockWorkspaceTree.length === 0) {
    return (
      <div className={styles.workspaceContainer}>
        <div className={styles.emptySelection}>
          <span>No user blocks defined in blocks.json</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <WorkspaceShell
        listAriaLabel="Blocks List"
        sidebarRef={sidebarScrollRef as any}
        listHeader={
          <>
            Pack Blocks ({filteredBlockWorkspaceTree.length}
            {filteredBlockWorkspaceTree.length !== blockWorkspaceTree.length ? ` / ${blockWorkspaceTree.length}` : ''})
          </>
        }
        sidebarContent={
          filteredBlockWorkspaceTree.length > 0 ? (
            <div style={{ paddingTop: `${paddingTop}px`, paddingBottom: `${paddingBottom}px` }}>
              {visibleBlocks.map((block) => (
                <BlockSidebarItem
                  key={block.blockId}
                  blockId={block.blockId}
                  displayName={block.displayName || block.blockId}
                  isCustom={block.isUserDefined !== false}
                  isActive={selectedBlock?.blockId === block.blockId}
                  ghostCount={block.ghostCount || 0}
                  onSelect={handleSelectBlock}
                />
              ))}
            </div>
          ) : (
            <div className={styles.noMatches}>
              <span>No blocks match your search or filter</span>
            </div>
          )
        }
        hasSelection={Boolean(selectedBlock)}
        emptySelectionText="Select a block to inspect"
        detailAriaLabel="Block Hierarchy & 3D Preview"
        title={selectedBlock?.displayName}
        hasLangName={selectedBlock?.hasLangName}
        titleBadge={
          selectedBlock && (
            <>
              {selectedBlock.isUserDefined === false && selectedBlock.blockId !== 'uncategorized' && (
                <Badge variant="fallback" size="sm" title="Using vanilla blocks.json definition">
                  Fallback
                </Badge>
              )}
              {selectedBlock.ghostCount > 0 && (
                <Badge variant="ghost" size="sm">{selectedBlock.ghostCount} ghosts</Badge>
              )}
            </>
          )
        }
        subtitle={
          selectedBlock
            ? (selectedBlock.blockId === 'uncategorized' || selectedBlock.blockId.includes(':')
                ? selectedBlock.blockId
                : `minecraft:${selectedBlock.blockId}`)
            : undefined
        }
        headerActions={
          selectedBlock && selectedBlock.blockId !== 'uncategorized' && (
            <div className={styles.moreMenuWrapper} ref={moreMenuRef}>
              <button
                type="button"
                className={styles.moreBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMoreMenuOpen((v) => !v);
                }}
                title="Block options"
                aria-label="Block options"
              >
                <MoreVertical size={16} />
              </button>
              {isMoreMenuOpen && (
                <div className={styles.moreDropdown}>
                  <button
                    type="button"
                    className={styles.moreDropdownItemDanger}
                    disabled={selectedBlock.isUserDefined === false}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBlockEntry();
                    }}
                    title={
                      selectedBlock.isUserDefined === false
                        ? "This block is using vanilla fallback and not declared in blocks.json"
                        : `Delete "${selectedBlock.blockId}" from blocks.json`
                    }
                  >
                    <Trash2 size={13} />
                    <span>Delete blocks.json entries</span>
                  </button>

                  <button
                    type="button"
                    className={styles.moreDropdownItemDanger}
                    disabled={selectedBlock.isUserDefined === false && declaredTerrainAliases.length === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBlockAndTerrainEntries();
                    }}
                    title={
                      selectedBlock.isUserDefined === false && declaredTerrainAliases.length === 0
                        ? "This block has no pack blocks.json or terrain_texture.json declarations"
                        : `Delete "${selectedBlock.blockId}" from both blocks.json and terrain_texture.json`
                    }
                  >
                    <Trash2 size={13} />
                    <span>Delete blocks and terrain texture</span>
                  </button>
                </div>
              )}
            </div>
          )
        }
        show3DPreview={Boolean(selectedBlock && selectedBlock.blockId !== 'uncategorized')}
        previewTitle="3D Preview"
        previewContent={
          selectedBlock && selectedBlock.blockId !== 'uncategorized' ? (
            <Block3DViewer
              blockId={selectedBlock.blockId}
              faceTextures={faceTextures.textures}
              faceFlipbooks={faceTextures.flipbooks}
              blockStates={blockStates}
              activeStateIndex={activeBlockStateIndex}
              onSelectStateIndex={(idx) => {
                setActiveBlockStateIndex(idx);
                setActiveVariationIndex(0);
              }}
              activeVariationIndex={activeVariationIndex}
              onSelectVariationIndex={setActiveVariationIndex}
            />
          ) : null
        }
      >
        {/* (Uncategorized) holds true orphans with no blocks.json entry, so no JSON hierarchy applies */}
        {selectedBlock && selectedBlock.blockId !== 'uncategorized' && (
          <BlockEntryTree
            block={selectedBlock}
            onTileClick={handleTileClick}
          />
        )}

        {selectedBlock && (
          <div className={styles.hierarchySection}>
            {(() => {
              const visibleAliasGroups = (selectedBlock.aliasGroups ?? []).filter((ag) => {
                const aliasKey = ag.alias.toLowerCase();
                const isDeclaredInPackTerrain =
                  hasTerrainTextureJson &&
                  packAliases.some(
                    (a: TextureAliasDto) =>
                      a.alias.toLowerCase() === aliasKey &&
                      a.category === 'block' &&
                      a.status !== 'ORPHAN' &&
                      (a as any).isUserDefined !== false
                  );
                const isVanillaFallback = !isDeclaredInPackTerrain && selectedBlock.blockId !== 'uncategorized';
                if (!isVanillaFallback) return true;

                // For vanilla fallback, only show the alias container if it contains pack textures (OK or OVERRIDE)
                const hasPackLeaves = ag.faceNodes && ag.faceNodes.length > 0
                  ? ag.faceNodes.some((fn) => (fn.leaves ?? []).some((l) => l.status === 'OK' || l.status === 'OVERRIDE'))
                  : (ag.leaves ?? []).some((l) => l.status === 'OK' || l.status === 'OVERRIDE');
                return hasPackLeaves;
              });

              if (visibleAliasGroups.length === 0) {
                return (
                  <div className={styles.emptySelection} style={{ padding: '32px 16px', color: '#71717a' }}>
                    No texture aliases configured for this block in the pack
                  </div>
                );
              }

              return visibleAliasGroups.map((ag) => {
                const isBlockUserDefined = hasBlocksJson && selectedBlock.isUserDefined !== false;
                const aliasKey = ag.alias.toLowerCase();

                const isDeclaredInPackTerrain =
                  hasTerrainTextureJson &&
                  packAliases.some(
                    (a: TextureAliasDto) =>
                      a.alias.toLowerCase() === aliasKey &&
                      a.category === 'block' &&
                      a.status !== 'ORPHAN' &&
                      (a as any).isUserDefined !== false
                  );

                const hasMissingDeclarationLeaf = ag.leaves?.some(
                  (l) => l.subtitleCaption?.toLowerCase() === 'missing declaration'
                ) || ag.faceNodes?.some((fn) =>
                  fn.leaves?.some((l) => l.subtitleCaption?.toLowerCase() === 'missing declaration')
                );

                const isDeclaredInVanillaTerrain =
                  !isDeclaredInPackTerrain &&
                  !hasMissingDeclarationLeaf &&
                  (catalogTree && catalogTree.length > 0
                    ? catalogTree.some((cb) =>
                        cb.aliasGroups?.some((ca) => ca.alias.toLowerCase() === aliasKey && !ca.leaves?.some(l => l.subtitleCaption?.toLowerCase() === 'missing declaration'))
                      )
                    : packAliases.some(
                        (a) =>
                          a.alias.toLowerCase() === aliasKey &&
                          a.category === 'block' &&
                          (a as any).isUserDefined === false
                      ));

                const isVanillaFallback = !isDeclaredInPackTerrain && selectedBlock.blockId !== 'uncategorized';
                const isUncategorized = selectedBlock.blockId === 'uncategorized';
                const isTrueOrphan = isUncategorized && !isDeclaredInPackTerrain;
                const pendingOp = pendingAliasOps[aliasKey] ?? null;

                return (
                  <div
                    key={ag.alias}
                    className={`${styles.aliasGroupCard} ${isVanillaFallback ? styles.aliasGroupCardFallback : ''} ${pendingOp === 'deleting' ? styles.aliasCardDeleting : ''} ${pendingOp === 'adding' ? styles.aliasCardAdding : ''}`}
                  >
                    <div className={styles.aliasHeader}>
                      <Layers size={14} />
                      <span>{isTrueOrphan ? '(No alias)' : `Alias: ${ag.alias}`}</span>
                      {isTrueOrphan && (
                        <Badge variant="orphan" size="sm" title="Texture file on disk not declared in any JSON">
                          orphan
                        </Badge>
                      )}
                      {isVanillaFallback && (
                        isDeclaredInVanillaTerrain ? (
                          <Badge
                            variant="fallback"
                            size="sm"
                            title={
                              isBlockUserDefined
                                ? "Vanilla fallback, missing in pack terrain_texture.json"
                                : "Using vanilla terrain_texture.json definition"
                            }
                          >
                            {isBlockUserDefined ? 'missing entry' : 'fallback'}
                          </Badge>
                        ) : (
                          <Badge variant="missing" size="sm" title="Missing declaration in terrain_texture.json">
                            missing entry
                          </Badge>
                        )
                      )}
                      {!isTrueOrphan && (
                        <div className={styles.aliasHeaderRight}>
                          <div className={styles.moreMenuWrapper}>
                            <button
                              type="button"
                              className={styles.moreBtn}
                              disabled={Boolean(pendingOp)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenAliasMenu((cur) => (cur === ag.alias ? null : ag.alias));
                              }}
                              title={`Alias "${ag.alias}" options`}
                              aria-label={`Alias "${ag.alias}" options`}
                            >
                              <MoreVertical size={14} />
                            </button>
                            {openAliasMenu === ag.alias && (
                              <div className={styles.moreDropdown}>
                                <button
                                  type="button"
                                  className={styles.moreDropdownItemDanger}
                                  disabled={!isDeclaredInPackTerrain || Boolean(pendingOp)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteAliasEntry(ag.alias);
                                  }}
                                  title={
                                    !isDeclaredInPackTerrain
                                      ? "This alias is using vanilla fallback and not declared in terrain_texture.json"
                                      : `Delete "${ag.alias}" from terrain_texture.json`
                                  }
                                >
                                  <Trash2 size={13} />
                                  <span>Delete terrain_texture.json entries</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {pendingOp ? (
                      <AliasLoadingOverlay op={pendingOp} />
                    ) : (
                      <div className={styles.faceNodeGroup}>
                        {ag.faceNodes && ag.faceNodes.length > 0 ? (
                          ag.faceNodes.map((fn) => {
                            const effectiveLeaves = isVanillaFallback
                              ? (fn.leaves ?? []).filter((l) => l.status === 'OK' || l.status === 'OVERRIDE')
                              : (fn.leaves ?? []);
                            if (isVanillaFallback && effectiveLeaves.length === 0) return null;
                            const groups = groupLeavesByVariantSlot(effectiveLeaves);
                            return (
                              <div key={fn.faceLabel} className={styles.faceRow}>
                                <Badge variant="neutral" size="sm" icon={<ArrowRight size={10} />}>
                                  Face: {fn.faceLabel}
                                  {!isVanillaFallback && fn.ghostCount > 0 && ` • ${fn.ghostCount}`}
                                </Badge>
                                <div className={styles.variantStrip}>
                                  {groups.map((grp) => {
                                    const cardKey = `${grp.key}-${fn.faceLabel}`;
                                    return (
                                      <WorkspaceTileCard
                                        key={cardKey}
                                        grp={grp}
                                        cardKey={cardKey}
                                        tileZoom={tileZoom}
                                        selectedBlockName={selectedBlockDisplayName}
                                        isMenuOpen={activeMenuKey === cardKey}
                                        onToggleMenu={handleToggleMenu}
                                        onTileClick={handleTileClick}
                                        onDeleteTextureFile={handleDeleteTextureFile}
                                        onDeleteTextureEntries={isDeclaredInPackTerrain ? handleDeleteTextureEntries : undefined}
                                        onAddVariation={isDeclaredInPackTerrain ? handleAddVariation : undefined}
                                        onDeleteVariation={isDeclaredInPackTerrain ? handleDeleteVariation : undefined}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          (() => {
                            const effectiveLeaves = isVanillaFallback
                              ? (ag.leaves ?? []).filter((l) => l.status === 'OK' || l.status === 'OVERRIDE')
                              : (ag.leaves ?? []);
                            if (isVanillaFallback && effectiveLeaves.length === 0) return null;
                            return (
                              <div className={styles.variantStrip}>
                                {groupLeavesByVariantSlot(effectiveLeaves).map((grp) => (
                                  <WorkspaceTileCard
                                    key={grp.key}
                                    grp={grp}
                                    cardKey={grp.key}
                                    tileZoom={tileZoom}
                                    selectedBlockName={selectedBlockDisplayName}
                                    isMenuOpen={activeMenuKey === grp.key}
                                    onToggleMenu={handleToggleMenu}
                                    onTileClick={handleTileClick}
                                    onDeleteTextureFile={handleDeleteTextureFile}
                                    onDeleteTextureEntries={isDeclaredInPackTerrain ? handleDeleteTextureEntries : undefined}
                                    onAddVariation={isDeclaredInPackTerrain ? handleAddVariation : undefined}
                                    onDeleteVariation={isDeclaredInPackTerrain ? handleDeleteVariation : undefined}
                                  />
                                ))}
                              </div>
                            );
                          })()
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </WorkspaceShell>

      {/* Morphing Portal Preview (opened on tile click) */}
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

      {/* Standalone Context Menu triggered from morph or tiles */}
      {contextMenuTarget && (
        <TextureContextMenu
          item={contextMenuTarget.alias}
          anchor={contextMenuTarget.anchor}
          onClose={() => setContextMenuTarget(null)}
          onAddVariation={
            hasTerrainTextureJson &&
            packAliases.some(
              (a: TextureAliasDto) =>
                a.alias.toLowerCase() === contextMenuTarget.alias.alias.toLowerCase() &&
                a.category === 'block' &&
                a.status !== 'ORPHAN'
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
            contextMenuTarget.alias.textureVariantIndex != null &&
            contextMenuTarget.alias.relativePath &&
            packAliases.some(
              (a: TextureAliasDto) =>
                a.alias.toLowerCase() === contextMenuTarget.alias.alias.toLowerCase() &&
                a.category === 'block' &&
                a.status !== 'ORPHAN'
            )
              ? () => {
                  setHoverMorphTarget(null);
                  packStoreActions.optimisticDeleteVariation(
                    contextMenuTarget.alias.alias,
                    contextMenuTarget.alias.relativePath!
                  );
                  deleteTextureVariation(
                    contextMenuTarget.alias.alias,
                    contextMenuTarget.alias.relativePath!
                  );
                }
              : undefined
          }
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
            if (contextMenuTarget.alias.fullPath) {
              const fullPath = contextMenuTarget.alias.fullPath;
              const aliasKey = contextMenuTarget.alias.alias;
              packStoreActions.optimisticDeleteTexture(fullPath, aliasKey);
              deleteTextureFile(fullPath, aliasKey);
            }
          }}
          onDeleteEntries={
            hasTerrainTextureJson &&
            packAliases.some(
              (a: TextureAliasDto) =>
                a.alias.toLowerCase() === contextMenuTarget.alias.alias.toLowerCase() &&
                a.category === (contextMenuTarget.alias.category || 'block') &&
                a.status !== 'ORPHAN' &&
                (a as any).isUserDefined !== false
            )
              ? () => {
                  const aliasKey = contextMenuTarget.alias.alias;
                  const cat = contextMenuTarget.alias.category || 'block';
                  const relPath = contextMenuTarget.alias.relativePath;
                  packStoreActions.optimisticDeleteEntries(aliasKey, cat, relPath);
                  deleteTextureEntries(aliasKey, cat, relPath);
                }
              : undefined
          }
          onEditMers={() => {
            if (contextMenuTarget.alias.mersFullPath) {
              editTexture(contextMenuTarget.alias.alias, contextMenuTarget.alias.mersFullPath, false);
            }
          }}
        />
      )}
    </>
  );
};
