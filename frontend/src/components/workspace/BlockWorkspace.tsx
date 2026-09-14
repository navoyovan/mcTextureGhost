import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Box, Layers, ArrowRight } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { BlockGroupNodeDto, CatalogLeafDto } from '../../types/ipc';
import { Block3DViewer } from './Block3DViewer';
import { WorkspaceTileCard, VariantTileGroup } from './WorkspaceTileCard';
import styles from './BlockWorkspace.module.css';

// Group a flat leaf array by alias + block variant slot.
// Leaves in the same group are texture variations ("variations": [ ... ]) of the same block state slot.
// Distinct block variants ("textures": [ ... ]) have different blockVariantIndex and form separate tiles.
function groupLeavesByVariantSlot(leaves: CatalogLeafDto[]): VariantTileGroup[] {
  const map = new Map<string, VariantTileGroup>();
  for (const leaf of leaves) {
    // A tile is a texture variation if totalTextureVariants > 1 or variantKind is TextureVariant/NestedVariant
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
      // Deduplicate leaves that point to the exact same relativePath & indices
      const exists = existing.leaves.some(
        (l) =>
          l.relativePath === leaf.relativePath &&
          l.textureVariantIndex === leaf.textureVariantIndex &&
          l.blockVariantIndex === leaf.blockVariantIndex
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
  const { editTexture, deleteTextureFile, deleteTextureEntries } = useIpc();

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

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(() => {
    return blockWorkspaceTree && blockWorkspaceTree.length > 0
      ? blockWorkspaceTree[0]?.blockId ?? null
      : null;
  });

  const selectedBlock = useMemo<BlockGroupNodeDto | null>(() => {
    if (!blockWorkspaceTree || blockWorkspaceTree.length === 0) return null;
    return (
      blockWorkspaceTree.find((b) => b.blockId === selectedBlockId) ??
      blockWorkspaceTree[0] ??
      null
    );
  }, [blockWorkspaceTree, selectedBlockId]);

  const [activeBlockStateIndex, setActiveBlockStateIndex] = useState<number>(0);
  const [activeVariationIndex, setActiveVariationIndex] = useState<number>(0);

  // Reset active indices when switching block
  useEffect(() => {
    setActiveBlockStateIndex(0);
    setActiveVariationIndex(0);
  }, [selectedBlockId]);

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
        label: `State ${i + 1}`,
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

  const handleLeafClick = useCallback((leaf: CatalogLeafDto) => {
    editTexture(leaf.alias, leaf.fullPath, leaf.status === 'GHOST');
  }, [editTexture]);

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
      {/* Left List */}
      <aside className={styles.blockListPane} aria-label="Blocks List">
        <div className={styles.blockListHeader}>Pack Blocks ({blockWorkspaceTree.length})</div>
        {blockWorkspaceTree.map((block) => {
          const isActive = selectedBlock?.blockId === block.blockId;
          const isCustom = block.isUserDefined !== false;
          return (
            <button
              key={block.blockId}
              type="button"
              className={`${styles.blockItem} ${isActive ? styles.blockItemActive : ''} ${!isCustom ? styles.blockItemVanilla : ''}`}
              onClick={() => setSelectedBlockId(block.blockId)}
            >
              <div className={styles.blockItemLeft}>
                <Box size={14} className={!isCustom ? styles.blockIconMuted : undefined} />
                <span className={styles.blockItemName}>{block.displayName || block.blockId}</span>
              </div>
              <div className={styles.blockItemBadges}>
                {!isCustom && block.blockId !== 'uncategorized' && (
                  <span className={styles.vanillaTag} title="Inferred from vanilla blocks.json">vanilla</span>
                )}
                {block.ghostCount > 0 && (
                  <span className={styles.ghostBadge}>👻 {block.ghostCount}</span>
                )}
              </div>
            </button>
          );
        })}
      </aside>

      {/* Right Detail Pane */}
      {selectedBlock ? (
        <section className={styles.detailPane} aria-label="Block Hierarchy & 3D Preview">
          <div className={styles.detailHeader}>
            <div className={styles.blockTitleGroup}>
              <div className={styles.blockHeaderTitleRow}>
                <h2 className={styles.blockDisplayName}>{selectedBlock.displayName}</h2>
                {selectedBlock.isUserDefined === false && selectedBlock.blockId !== 'uncategorized' && (
                  <span className={styles.vanillaHeaderBadge} title="Using vanilla blocks.json definition">
                    Vanilla Fallback
                  </span>
                )}
              </div>
              <span className={styles.blockIdSub}>{selectedBlock.blockId}</span>
            </div>
            {selectedBlock.ghostCount > 0 && (
              <span className={styles.ghostBadge}>👻 {selectedBlock.ghostCount} ghosts</span>
            )}
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

          <div className={styles.hierarchySection}>
            {selectedBlock.aliasGroups?.map((ag) => (
              <div key={ag.alias} className={styles.aliasGroupCard}>
                <div className={styles.aliasHeader}>
                  <Layers size={14} />
                  <span>Alias: {ag.alias}</span>
                </div>

                <div className={styles.faceNodeGroup}>
                  {ag.faceNodes && ag.faceNodes.length > 0 ? (
                    ag.faceNodes.map((fn) => {
                      const groups = groupLeavesByVariantSlot(fn.leaves ?? []);
                      return (
                        <div key={fn.faceLabel} className={styles.faceRow}>
                          <div className={styles.faceLabelBadge}>
                            <ArrowRight size={10} />
                            <span>Face: {fn.faceLabel}</span>
                            {fn.ghostCount > 0 && (
                              <span className={styles.faceGhostCount}>• 👻 {fn.ghostCount}</span>
                            )}
                          </div>
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
                                  onEditTexture={handleLeafClick}
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
                          onEditTexture={handleLeafClick}
                          onDeleteTextureFile={handleDeleteTextureFile}
                          onDeleteTextureEntries={handleDeleteTextureEntries}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className={styles.emptySelection}>Select a block to inspect</div>
      )}
    </div>
  );
};
