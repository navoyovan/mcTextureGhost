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

  const faceTextures = useMemo(() => {
    if (!selectedBlock || !selectedBlock.aliasGroups) return {};

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
          const firstLeaf = fn.leaves && fn.leaves.length > 0 ? fn.leaves[0] : null;
          // Only pass real texture URLs for existing files; ghost/missing textures must not trigger 3D texture fetches
          if (firstLeaf && firstLeaf.status !== 'GHOST' && firstLeaf.imageUrl) {
            textures[label] = firstLeaf.imageUrl;
            flipbooks[label] = firstLeaf.flipbook ?? null;
            if (label === 'side') {
              textures.north = textures.north ?? firstLeaf.imageUrl;
              textures.south = textures.south ?? firstLeaf.imageUrl;
              textures.east = textures.east ?? firstLeaf.imageUrl;
              textures.west = textures.west ?? firstLeaf.imageUrl;
              flipbooks.north = flipbooks.north ?? firstLeaf.flipbook ?? null;
              flipbooks.south = flipbooks.south ?? firstLeaf.flipbook ?? null;
              flipbooks.east = flipbooks.east ?? firstLeaf.flipbook ?? null;
              flipbooks.west = flipbooks.west ?? firstLeaf.flipbook ?? null;
            }
          }
        }
      } else if (ag.leaves && ag.leaves.length > 0) {
        const first = ag.leaves[0];
        if (first && first.status !== 'GHOST' && first.imageUrl) {
          textures.all = first.imageUrl;
          flipbooks.all = first.flipbook ?? null;
        }
      }
    }
    return { textures, flipbooks };
  }, [selectedBlock]);

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

    // Display title: use file name or variant caption with separate base and extension
    const getLeafTitle = (l: CatalogLeafDto) => {
      if (l.relativePath) {
        return l.relativePath.split(/[/\\]/).pop() ?? l.displayName ?? alias;
      }
      return l.displayName ?? alias;
    };

    const rawFileName = getLeafTitle(primary);
    const dotIdx = rawFileName.lastIndexOf('.');
    const fileBase = dotIdx > 0 ? rawFileName.substring(0, dotIdx) : rawFileName;
    const fileExt = dotIdx > 0 ? rawFileName.substring(dotIdx) : '.png';
    const primaryFileName = `${fileBase}${fileExt}`;

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

    // Dynamic width calculation based on tileZoom and number of variations:
    // Base tile matches grid proportions (tileZoom + 40px width, tileZoom thumbnail).
    // Each additional variation adds tileZoom thumb + gap (4px), expanding horizontally.
    const baseCardWidth = tileZoom + 40;
    const cardWidth = hasTexVariants
      ? baseCardWidth + (numVariations - 1) * (tileZoom + 4)
      : baseCardWidth;

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

        {/* Thumbnail area: single thumb or side-by-side texture variations */}
        <div
          className={`${hasTexVariants ? styles.texVariantThumbRow : styles.leafThumbWrapper} ${!isGhost ? styles.leafThumbWrapperAdded : ''}`}
        >
          {leaves.map((leaf, i) => {
            const leafName = getLeafTitle(leaf);
            const isLeafGhost = leaf.status === 'GHOST';
            return (
              <div
                key={`${leaf.relativePath}-${i}`}
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
            );
          })}
        </div>

        {/* Label row */}
        <div className={styles.leafMeta}>
          <div className={styles.leafHeaderRow}>
            <span className={`${styles.leafStatusDot} ${getStatusDotClass(primary.status)}`} />
            <span className={styles.leafName} title={primaryFileName}>
              <span>{fileBase}</span>
              <span className={styles.fileExt}>{fileExt}</span>
            </span>
            {hasTexVariants && (
              <span className={styles.variantCountBadge}>
                {numVariations}v
              </span>
            )}
            {primary.blockVariantIndex && (
              <span className={styles.blockVariantBadge} title={`Block variant ${primary.blockVariantIndex} of ${primary.totalBlockVariants}`}>
                #{primary.blockVariantIndex}
              </span>
            )}
          </div>
        </div>
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
