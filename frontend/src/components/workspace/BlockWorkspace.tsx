import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Box, Layers, ArrowRight, MoreVertical, Edit3, Trash2, FileX } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { BlockGroupNodeDto, CatalogLeafDto } from '../../types/ipc';
import { FlipbookThumbnail } from '../common/FlipbookThumbnail';
import { Block3DViewer } from './Block3DViewer';
import styles from './BlockWorkspace.module.css';

interface TooltipState {
  content: string;
  x: number;
  y: number;
}

// Group a flat leaf array by alias + block variant slot.
// Leaves in the same group are texture variations ("variations": [ ... ]) of the same block state slot.
// Distinct block variants ("textures": [ ... ]) have different blockVariantIndex and form separate tiles.
interface VariantTileGroup {
  key: string;
  alias: string;
  leaves: CatalogLeafDto[];
}

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

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
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

  const showTooltip = useCallback((content: string, e: React.MouseEvent) => {
    setTooltip({ content, x: e.clientX, y: e.clientY });
  }, []);

  const moveTooltip = useCallback((e: React.MouseEvent) => {
    setTooltip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
  }, []);

  const hideTooltip = useCallback(() => setTooltip(null), []);

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

  const handleLeafClick = (leaf: CatalogLeafDto) => {
    editTexture(leaf.alias, leaf.fullPath, leaf.status === 'GHOST');
  };

  const getStatusDotClass = (status: string) => {
    switch (status) {
      case 'OK':       return styles.statusDotOk;
      case 'GHOST':    return styles.statusDotGhost;
      case 'ORPHAN':   return styles.statusDotOrphan;
      case 'OVERRIDE': return styles.statusDotOverride;
      default:         return styles.statusDotNew;
    }
  };

  const tileZoom = usePackStore((s) => s.tileZoom);

  /**
   * Renders one card for a block variant slot.
   * If this slot has multiple texture variations ("variations": [...]), they are
   * displayed side-by-side inside this tile, expanding horizontally.
   */
  const renderTileCard = (group: VariantTileGroup, cardKey: string) => {
    const { alias, leaves } = group;
    const primary = leaves[0];
    if (!primary) return null;
    const numVariations = leaves.length;
    const hasTexVariants = numVariations > 1;

    const getLeafTitle = (l: CatalogLeafDto) => {
      if (l.relativePath) {
        return l.relativePath.split(/[/\\]/).pop() ?? l.displayName ?? alias;
      }
      return l.displayName ?? alias;
    };

    const parseFileName = (l: CatalogLeafDto) => {
      const raw = getLeafTitle(l);
      const sourceForExt = l.fullPath || l.relativePath || l.imageUrl || raw;
      const dotIdx = sourceForExt.lastIndexOf('.');
      const cleanExt = dotIdx > 0 ? (sourceForExt.substring(dotIdx).split('?')[0] ?? '').split('#')[0] ?? '' : '';
      const fileExt = cleanExt && cleanExt.length <= 5 ? cleanExt : '.png';
      const rawDotIdx = raw.lastIndexOf('.');
      const fileBase = rawDotIdx > 0 ? raw.substring(0, rawDotIdx) : raw;
      return { fileBase, fileExt, fullFileName: `${fileBase}${fileExt}` };
    };

    const primaryFile = parseFileName(primary);

    const blockVariantSuffix = primary.blockVariantIndex && primary.totalBlockVariants
      ? ` (block state ${primary.blockVariantIndex}/${primary.totalBlockVariants})`
      : '';

    const tooltipLines = [
      (selectedBlock?.displayName || selectedBlock?.blockId) + blockVariantSuffix,
      `terrain textures: ${alias}`,
      numVariations === 1
        ? `path: ${primary.relativePath}`
        : `path: ${leaves.map(l => l.relativePath).join(', ')}`,
      hasTexVariants ? `${numVariations} texture variations (side-by-side)` : '',
    ].filter(Boolean);

    // Dynamic width calculation: each slot has width = tileZoom.
    // Card padding is 10px on each side (20px total) + 2px for left/right card borders.
    // Plus 8px gap between each variation.
    const cardWidth = hasTexVariants
      ? 22 + numVariations * tileZoom + (numVariations - 1) * 8
      : tileZoom + 22;

    const cardStyle = {
      '--tile-zoom': `${tileZoom}px`,
      width: `${cardWidth}px`,
    } as React.CSSProperties;

    const isGhost = primary.status === 'GHOST';

    return (
      <div
        key={cardKey}
        className={`${styles.leafCard} ${hasTexVariants ? styles.leafCardWithVariants : ''}`}
        style={cardStyle}
        onMouseEnter={(e) => showTooltip(tooltipLines.join('\n'), e)}
        onMouseMove={moveTooltip}
        onMouseLeave={hideTooltip}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          hideTooltip();
          setActiveMenuKey(cardKey);
        }}
      >
        {/* 3-Dots Hover Menu Trigger */}
        <button
          type="button"
          className={`${styles.moreButton} ${activeMenuKey === cardKey ? styles.moreButtonActive : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            hideTooltip();
            setActiveMenuKey((prev) => (prev === cardKey ? null : cardKey));
          }}
          title="Texture options"
          aria-label="Texture options"
        >
          <MoreVertical size={14} />
        </button>

        {/* Dropdown Menu */}
        {activeMenuKey === cardKey && (
          <div
            ref={menuRef}
            className={styles.dropdownMenu}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setActiveMenuKey(null);
                handleLeafClick(primary);
              }}
            >
              <Edit3 size={13} className={styles.menuIcon} />
              <span>Edit Texture</span>
            </button>

            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              disabled={isGhost || !primary.fullPath}
              onClick={() => {
                setActiveMenuKey(null);
                if (primary.fullPath) {
                  deleteTextureFile(primary.fullPath, primary.alias);
                }
              }}
              title={isGhost ? 'Texture file does not exist on disk' : 'Delete PNG file from disk'}
            >
              <Trash2 size={13} className={styles.menuIcon} />
              <span>Delete Texture</span>
            </button>

            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              disabled={primary.status === 'ORPHAN'}
              onClick={() => {
                setActiveMenuKey(null);
                deleteTextureEntries(primary.alias, 'block', primary.relativePath);
              }}
              title={primary.status === 'ORPHAN' ? 'Orphan has no JSON declarations' : 'Remove declarations from JSON schemas'}
            >
              <FileX size={13} className={styles.menuIcon} />
              <span>Delete Entries</span>
            </button>
          </div>
        )}

        {/* Thumbnail area: single thumb or side-by-side texture variations with dividers */}
        <div
          className={`${hasTexVariants ? styles.texVariantThumbRow : styles.leafThumbWrapper} ${!isGhost ? styles.leafThumbWrapperAdded : ''}`}
        >
          {leaves.map((leaf, i) => {
            const leafName = getLeafTitle(leaf);
            const isLeafGhost = leaf.status === 'GHOST';
            return (
              <React.Fragment key={`${leaf.relativePath}-${i}`}>
                {i > 0 && <div className={styles.texVarDivider} />}
                <div
                  className={`${hasTexVariants ? styles.texVarThumbSlot : styles.leafThumbInner} ${!isLeafGhost ? styles.texVarThumbSlotAdded : ''}`}
                  onClick={() => handleLeafClick(leaf)}
                  title={leafName}
                >
                  {!isLeafGhost && leaf.imageUrl ? (
                    <FlipbookThumbnail
                      src={leaf.imageUrl}
                      alt={leafName}
                      className={styles.leafThumb}
                      isFlipbook={leaf.isFlipbook}
                      flipbook={leaf.flipbook}
                      loading="lazy"
                    />
                  ) : (
                    <span className={styles.leafGhost}>?</span>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Meta / Names Area */}
        {hasTexVariants ? (
          <div className={styles.texVariantMetaRow}>
            {leaves.map((leaf, i) => {
              const file = parseFileName(leaf);
              return (
                <React.Fragment key={`meta-${leaf.relativePath}-${i}`}>
                  {i > 0 && <div className={styles.texVarMetaDivider} />}
                  <div className={styles.texVarMetaCol} style={{ width: `${tileZoom}px` }}>
                    <div className={styles.leafHeaderRow}>
                      <span className={styles.leafName} title={file.fullFileName}>
                        <span>{file.fileBase}</span>
                        <span className={styles.fileExt}>{file.fileExt}</span>
                      </span>
                    </div>
                    <div className={styles.leafSubRow}>
                      <span className={`${styles.leafStatusDot} ${getStatusDotClass(leaf.status)}`} />
                      <span className={styles.leafSubtitle}>
                        {leaf.relativePath || leaf.alias}
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          <div className={styles.leafMeta}>
            <div className={styles.leafHeaderRow}>
              <span className={styles.leafName} title={primaryFile.fullFileName}>
                <span>{primaryFile.fileBase}</span>
                <span className={styles.fileExt}>{primaryFile.fileExt}</span>
              </span>
            </div>
            <div className={styles.leafSubRow}>
              <span className={`${styles.leafStatusDot} ${getStatusDotClass(primary.status)}`} />
              <span className={styles.leafSubtitle}>
                {primary.relativePath || primary.alias}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };


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
      {tooltip && (
        <div
          className={styles.floatingTooltip}
          style={{ left: tooltip.x + 14, top: tooltip.y - 8 }}
        >
          {tooltip.content}
        </div>
      )}

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
                            {groups.map((grp) =>
                              renderTileCard(
                                grp,
                                `${grp.key}-${fn.faceLabel}`,
                              )
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.variantStrip}>
                      {groupLeavesByVariantSlot(ag.leaves ?? []).map(
                        (grp) =>
                          renderTileCard(grp, grp.key),
                      )}
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
