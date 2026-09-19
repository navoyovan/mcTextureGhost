import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Box, Layers, ArrowRight } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { BlockGroupNodeDto, CatalogLeafDto, TextureAliasDto, OpenWithAppDto } from '../../types/ipc';
import { Block3DViewer } from './Block3DViewer';
import { BlockEntryTree } from './BlockEntryTree';
import { WorkspaceTileCard, VariantTileGroup } from './WorkspaceTileCard';
import { TileHoverMorphPortal, TileHoverMorphTarget } from '../grid/TileHoverMorphPortal';
import { TextureContextMenu } from '../common/TextureContextMenu';
import { Badge } from '../common/Badge';
import styles from './BlockWorkspace.module.css';

function leafToAliasDto(leaf: CatalogLeafDto): TextureAliasDto {
  return {
    alias: leaf.alias,
    displayName: leaf.displayName,
    relativePath: leaf.relativePath,
    fullPath: leaf.fullPath,
    category: (leaf.category as any) || 'block',
    entityId: leaf.entityId,
    textureKey: leaf.textureKey,
    geometryId: leaf.geometryId,
    isAttachable: leaf.isAttachable,
    status: (leaf.status === 'VANILLA' ? 'OK' : leaf.status) as any,
    exists: leaf.status !== 'GHOST',
    imageUrl: leaf.imageUrl,
    blockFaces: [],
    usedByBlocks: [],
    variantKind: leaf.variantKind || 'None',
    blockVariantIndex: leaf.blockVariantIndex,
    totalBlockVariants: leaf.totalBlockVariants,
    textureVariantIndex: leaf.textureVariantIndex,
    totalTextureVariants: leaf.totalTextureVariants,
    weight: leaf.weight,
    isFlipbook: leaf.isFlipbook,
    flipbook: leaf.flipbook,
    primaryFaceBadgeText: leaf.primaryFaceBadgeText || '',
    subtitleCaption: leaf.subtitleCaption || '',
    hasMers: (leaf as any).hasMers,
    mersFullPath: (leaf as any).mersFullPath,
    key: leaf.alias,
  };
}

// Group a flat leaf array by alias + block variant slot.
// Leaves in the same group are texture variations ("variations": [ ... ]) of the same block state slot.
// Distinct block variants ("textures": [ ... ]) have different blockVariantIndex and form separate tiles.
function groupLeavesByVariantSlot(leaves: CatalogLeafDto[]): VariantTileGroup[] {
  const map = new Map<string, VariantTileGroup>();
  for (const leaf of leaves) {
    const isTexVar = Boolean(
      (leaf.totalTextureVariants && leaf.totalTextureVariants > 1) ||
      leaf.variantKind === 'TextureVariant' ||
      leaf.variantKind === 'NestedVariant'
    );

    const slotKey = isTexVar
      ? `${leaf.alias}__bv_${leaf.blockVariantIndex ?? 'none'}`
      : `${leaf.alias}__bv_${leaf.blockVariantIndex ?? 'none'}__rp_${leaf.relativePath || 'def'}`;

    const existing = map.get(slotKey);
    if (existing) {
      const exists = existing.leaves.some(
        (l) =>
          l.relativePath === leaf.relativePath &&
          l.textureVariantIndex === leaf.textureVariantIndex
      );
      if (!exists) {
        existing.leaves.push(leaf);
      }
    } else {
      map.set(slotKey, {
        key: slotKey,
        alias: leaf.alias,
        leaves: [leaf],
      });
    }
  }
  return Array.from(map.values());
}

export const BlockWorkspace: React.FC = () => {
  const blockWorkspaceTree = usePackStore((s) => s.blockWorkspaceTree);
  const searchQuery = usePackStore((s) => s.searchQuery);
  const statusFilter = usePackStore((s) => s.statusFilter);
  const activeFilters = usePackStore((s) => s.activeFilters);
  const packFolders = usePackStore((s) => s.packFolders);
  const packAliases = usePackStore((s) => s.aliases ?? []);
  const { editTexture, deleteTextureFile, deleteTextureEntries, openInExplorer } = useIpc();

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

  const [activeMenuKey, setActiveMenuKey] = useState<string | null>(null);
  const isListDrawerOpen = usePackStore((s) => s.isWorkspaceDrawerOpen);
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

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Keep selectedBlock pointed to a valid block in the filtered list
  const selectedBlock = useMemo<BlockGroupNodeDto | null>(() => {
    if (!filteredBlockWorkspaceTree || filteredBlockWorkspaceTree.length === 0) return null;
    return (
      filteredBlockWorkspaceTree.find((b) => b.blockId === selectedBlockId) ??
      filteredBlockWorkspaceTree[0] ??
      null
    );
  }, [filteredBlockWorkspaceTree, selectedBlockId]);

  const [activeBlockStateIndex, setActiveBlockStateIndex] = useState<number>(0);
  const [activeVariationIndex, setActiveVariationIndex] = useState<number>(0);

  // Reset active indices when switching block
  useEffect(() => {
    setActiveBlockStateIndex(0);
    setActiveVariationIndex(0);
  }, [selectedBlock?.blockId]);

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
    deleteTextureFile(path, alias);
  }, [deleteTextureFile]);

  const handleDeleteTextureEntries = useCallback((alias: string, relativePath?: string | null) => {
    deleteTextureEntries(alias, 'block', relativePath ?? undefined);
  }, [deleteTextureEntries]);

  const tileZoom = usePackStore((s) => s.tileZoom);
  const selectedBlockDisplayName = selectedBlock?.displayName || selectedBlock?.blockId || '';

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
    <div className={styles.workspaceContainer}>
      {/* Backdrop for compact viewports */}
      {isListDrawerOpen && (
        <div
          className={styles.blockListBackdrop}
          onClick={() => setIsListDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left List */}
      <aside
        className={`${styles.blockListPane} ${isListDrawerOpen ? styles.blockListPaneOpen : ''}`}
        aria-label="Blocks List"
      >
        <div className={styles.blockListHeader}>
          Pack Blocks ({filteredBlockWorkspaceTree.length}
          {filteredBlockWorkspaceTree.length !== blockWorkspaceTree.length ? ` / ${blockWorkspaceTree.length}` : ''})
        </div>
        {filteredBlockWorkspaceTree.length > 0 ? (
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
        )}
      </aside>

      {/* Right Detail Pane */}
      {selectedBlock ? (
        <section className={styles.detailPane} aria-label="Block Hierarchy & 3D Preview">
          <div className={styles.detailHeader}>
            <div className={styles.blockTitleGroup}>
              <div className={styles.blockHeaderTitleRow}>
                <h2 className={styles.blockDisplayName}>{selectedBlock.displayName}</h2>
              </div>
              <span className={styles.blockIdSub}>
                {selectedBlock.blockId === 'uncategorized' || selectedBlock.blockId.includes(':')
                  ? selectedBlock.blockId
                  : `minecraft:${selectedBlock.blockId}`}
              </span>
            </div>
            <div className={styles.detailHeaderActions}>
              {selectedBlock.isUserDefined === false && selectedBlock.blockId !== 'uncategorized' && (
                <Badge variant="fallback" size="sm" title="Using vanilla blocks.json definition">
                  Vanilla Fallback
                </Badge>
              )}
              {selectedBlock.ghostCount > 0 && (
                <Badge variant="ghost" size="sm">{selectedBlock.ghostCount} ghosts</Badge>
              )}
            </div>
          </div>

          {selectedBlock.blockId !== 'uncategorized' && (
            <div className={styles.previewSection}>
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
            </div>
          )}

          <BlockEntryTree
            block={selectedBlock}
            onTileClick={handleTileClick}
          />

          <div className={styles.hierarchySection}>
            {selectedBlock.aliasGroups?.map((ag) => {
              const isBlockUserDefined = hasBlocksJson && selectedBlock.isUserDefined !== false;
              const isDeclaredInTerrainTexture =
                isBlockUserDefined &&
                hasTerrainTextureJson &&
                packAliases.some(
                  (a: TextureAliasDto) =>
                    a.alias.toLowerCase() === ag.alias.toLowerCase() &&
                    a.category === 'block' &&
                    a.status !== 'ORPHAN'
                );

              return (
                <div key={ag.alias} className={styles.aliasGroupCard}>
                  <div className={styles.aliasHeader}>
                    <Layers size={14} />
                    <span>Alias: {ag.alias}</span>
                    {!isDeclaredInTerrainTexture && (
                      <Badge variant="fallback" size="sm" title="Using vanilla terrain_texture.json definition">
                        Vanilla Fallback
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
                                  onDeleteTextureEntries={handleDeleteTextureEntries}
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
                          onDeleteTextureEntries={handleDeleteTextureEntries}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </section>
      ) : (
        <div className={styles.emptySelection}>Select a block to inspect</div>
      )}

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
              deleteTextureFile(contextMenuTarget.alias.fullPath);
            }
          }}
          onDeleteEntries={() => {
            deleteTextureEntries(contextMenuTarget.alias.alias, contextMenuTarget.alias.category || 'block');
          }}
          onEditMers={() => {
            if (contextMenuTarget.alias.mersFullPath) {
              editTexture(contextMenuTarget.alias.alias, contextMenuTarget.alias.mersFullPath, false);
            }
          }}
        />
      )}
    </div>
  );
};
