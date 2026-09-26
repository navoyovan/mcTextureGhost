import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Box, Layers, ArrowRight } from 'lucide-react';
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
import { hasTerrainTextureJson as checkTerrainTextureJson } from '../../utils/packFileUtils';
import { leafToAliasDto, groupLeavesByVariantSlot } from '../../utils/leafTransforms';
import styles from './BlockWorkspace.module.css';

export const BlockWorkspace: React.FC = () => {
  const blockWorkspaceTree = usePackStore((s) => s.blockWorkspaceTree);
  const isScanning = usePackStore((s) => s.isScanning);
  const isWorkspaceLoading = usePackStore((s) => s.isWorkspaceLoading);
  const searchQuery = usePackStore((s) => s.searchQuery);
  const statusFilter = usePackStore((s) => s.statusFilter);
  const activeFilters = usePackStore((s) => s.activeFilters);
  const packFolders = usePackStore((s) => s.packFolders);
  const packAliases = usePackStore((s) => s.aliases ?? []);
  const { editTexture, deleteTextureFile, deleteTextureEntries, deleteTextureVariation, openInExplorer, scaffoldTextureVariation } = useIpc();

  const hasTerrainTextureJson = useMemo(() => checkTerrainTextureJson(packFolders), [packFolders]);

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

  // Filter block list by toolbar searchQuery and activeFilters/statusFilter
  const filteredBlockWorkspaceTree = useMemo(() => {
    if (!blockWorkspaceTree) return [];
    const query = searchQuery.trim().toLowerCase();

    const effectiveFilters = activeFilters.length > 0
      ? activeFilters
      : (statusFilter !== 'all' ? [statusFilter as any] : []);

    return blockWorkspaceTree.filter((block) => {
      const allLeaves = [
        ...(block.aliasGroups?.flatMap((ag) => ag.leaves ?? []) ?? []),
        ...(block.aliasGroups?.flatMap((ag) => ag.faceNodes?.flatMap((fn) => fn.leaves ?? []) ?? []) ?? []),
      ];

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
          if (!statusMatch) return false;
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
          if (!featureMatch) return false;
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
  }, [blockWorkspaceTree, searchQuery, statusFilter, activeFilters]);

  const selectedBlockId = usePackStore((s) => s.blockWorkspaceSelectedId);
  const setSelectedBlockId = usePackStore((s) => s.setBlockWorkspaceSelectedId);
  const activeBlockStateIndex = usePackStore((s) => s.blockWorkspaceActiveStateIndex);
  const setActiveBlockStateIndex = usePackStore((s) => s.setBlockWorkspaceActiveStateIndex);
  const activeVariationIndex = usePackStore((s) => s.blockWorkspaceActiveVariationIndex);
  const setActiveVariationIndex = usePackStore((s) => s.setBlockWorkspaceActiveVariationIndex);

  // Keep selectedBlock pointed to a valid block in the filtered list
  const selectedBlock = useMemo<BlockGroupNodeDto | null>(() => {
    if (!filteredBlockWorkspaceTree || filteredBlockWorkspaceTree.length === 0) return null;
    return (
      filteredBlockWorkspaceTree.find((b) => b.blockId === selectedBlockId) ??
      filteredBlockWorkspaceTree[0] ??
      null
    );
  }, [filteredBlockWorkspaceTree, selectedBlockId]);

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
        setSelectedBlockId(nextBlock.blockId);
        const btn = document.querySelector(`[data-block-id="${nextBlock.blockId}"]`);
        if (btn) {
          btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredBlockWorkspaceTree, selectedBlock?.blockId, selectedBlockId]);

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
          } else if (ag.leaves && ag.leaves.length > 0) {
            const groups = groupLeavesByVariantSlot(ag.leaves);
            const g = groups[i] ?? groups[0];
            if (g) {
              const leaf = g.leaves[v] ?? g.leaves[0];
              if (leaf && leaf.status !== 'GHOST' && leaf.imageUrl) {
                textures.all = leaf.imageUrl;
                flipbooks.all = leaf.flipbook ?? null;
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
    packStoreActions.optimisticDeleteTexture(path, alias);
    deleteTextureFile(path, alias);
  }, [deleteTextureFile]);

  const handleDeleteTextureEntries = useCallback((alias: string, relativePath?: string | null) => {
    packStoreActions.optimisticDeleteEntries(alias, 'block', relativePath ?? undefined);
    deleteTextureEntries(alias, 'block', relativePath ?? undefined);
  }, [deleteTextureEntries]);

  const handleAddVariation = useCallback(async (leaf: CatalogLeafDto, count = 1) => {
    packStoreActions.optimisticAddVariation(leaf.alias, leaf.blockVariantIndex ?? null, count);
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
        listHeader={
          <>
            Pack Blocks ({filteredBlockWorkspaceTree.length}
            {filteredBlockWorkspaceTree.length !== blockWorkspaceTree.length ? ` / ${blockWorkspaceTree.length}` : ''})
          </>
        }
        sidebarContent={
          filteredBlockWorkspaceTree.length > 0 ? (
            filteredBlockWorkspaceTree.map((block) => {
              const isActive = selectedBlock?.blockId === block.blockId;
              const isCustom = block.isUserDefined !== false;
              return (
                <button
                  key={block.blockId}
                  data-block-id={block.blockId}
                  type="button"
                  className={`${styles.blockItem} ${isActive ? styles.blockItemActive : ''} ${!isCustom ? styles.blockItemVanilla : ''}`}
                  onClick={() => {
                    setSelectedBlockId(block.blockId);
                    setIsListDrawerOpen(false);
                  }}
                >
                  <div className={styles.blockItemLeft}>
                    <Box size={14} className={!isCustom ? styles.blockIconMuted : undefined} />
                    <span className={styles.blockItemName}>{block.displayName || block.blockId}</span>
                  </div>
                  <div className={styles.blockItemBadges}>
                    {!isCustom && block.blockId !== 'uncategorized' && (
                      <Badge variant="fallback" size="sm" title="Inferred from vanilla blocks.json">fallback</Badge>
                    )}
                    {block.ghostCount > 0 && (
                      <Badge variant="ghost" size="counter">{block.ghostCount}</Badge>
                    )}
                  </div>
                </button>
              );
            })
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
        subtitle={
          selectedBlock
            ? (selectedBlock.blockId === 'uncategorized' || selectedBlock.blockId.includes(':')
                ? selectedBlock.blockId
                : `minecraft:${selectedBlock.blockId}`)
            : undefined
        }
        headerActions={
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
            {(!selectedBlock.aliasGroups || selectedBlock.aliasGroups.length === 0) ? (
              <div className={styles.emptySelection} style={{ padding: '32px 16px', color: '#71717a' }}>
                No texture aliases configured for this block
              </div>
            ) : (
              selectedBlock.aliasGroups.map((ag) => {
              const isDeclaredInTerrainTexture =
                hasTerrainTextureJson &&
                packAliases.some(
                  (a: TextureAliasDto) =>
                    a.alias.toLowerCase() === ag.alias.toLowerCase() &&
                    a.category === 'block' &&
                    a.status !== 'ORPHAN' &&
                    (a as any).isUserDefined !== false
                );
              const isVanillaFallback = !isDeclaredInTerrainTexture && selectedBlock.blockId !== 'uncategorized';

              return (
                <div key={ag.alias} className={`${styles.aliasGroupCard} ${isVanillaFallback ? styles.aliasGroupCardFallback : ''}`}>
                  <div className={styles.aliasHeader}>
                    <Layers size={14} />
                    <span>Alias: {ag.alias}</span>
                    {isVanillaFallback && (
                      <Badge variant="fallback" size="sm" title="Using vanilla terrain_texture.json definition">
                        Fallback
                      </Badge>
                    )}
                  </div>

                <div className={styles.faceNodeGroup}>
                  {ag.faceNodes && ag.faceNodes.length > 0 ? (
                    ag.faceNodes.map((fn) => {
                      const groups = groupLeavesByVariantSlot(fn.leaves ?? []);
                      return (
                        <div key={fn.faceLabel} className={styles.faceRow}>
                          <Badge variant="neutral" size="sm" icon={<ArrowRight size={10} />}>
                            Face: {fn.faceLabel}
                            {fn.ghostCount > 0 && ` • ${fn.ghostCount}`}
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
                                  onDeleteTextureEntries={isDeclaredInTerrainTexture ? handleDeleteTextureEntries : undefined}
                                  onAddVariation={isDeclaredInTerrainTexture ? handleAddVariation : undefined}
                                  onDeleteVariation={isDeclaredInTerrainTexture ? handleDeleteVariation : undefined}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.variantStrip}>
                      {groupLeavesByVariantSlot(ag.leaves ?? []).map((grp) => (
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
                          onDeleteTextureEntries={isDeclaredInTerrainTexture ? handleDeleteTextureEntries : undefined}
                          onAddVariation={isDeclaredInTerrainTexture ? handleAddVariation : undefined}
                          onDeleteVariation={isDeclaredInTerrainTexture ? handleDeleteVariation : undefined}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }))}
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
