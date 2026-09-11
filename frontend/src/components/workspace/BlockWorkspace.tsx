// frontend/src/components/workspace/BlockWorkspace.tsx
import React, { useState, useMemo, useCallback } from 'react';
import { Box, Layers, ArrowRight } from 'lucide-react';
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
    // If it's a block variant slot from "textures": [...], blockVariantIndex distinguishes it (1, 2, 3...)
    // Texture variants within the same slot share the same blockVariantIndex (or undefined if not a block variant)
    const slotKey = `${leaf.alias}__bv_${leaf.blockVariantIndex ?? 'none'}`;
    const existing = map.get(slotKey);
    if (existing) {
      existing.leaves.push(leaf);
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
  const { editTexture } = useIpc();

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

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

    for (const ag of selectedBlock.aliasGroups) {
      if (ag.faceNodes) {
        for (const fn of ag.faceNodes) {
          const label = (fn.faceLabel || '').toLowerCase();
          const firstLeaf = fn.leaves && fn.leaves.length > 0 ? fn.leaves[0] : null;
          if (firstLeaf && firstLeaf.imageUrl) {
            textures[label] = firstLeaf.imageUrl;
            if (label === 'side') {
              textures.north = textures.north ?? firstLeaf.imageUrl;
              textures.south = textures.south ?? firstLeaf.imageUrl;
              textures.east = textures.east ?? firstLeaf.imageUrl;
              textures.west = textures.west ?? firstLeaf.imageUrl;
            }
          }
        }
      } else if (ag.leaves && ag.leaves.length > 0) {
        const first = ag.leaves[0];
        if (first && first.imageUrl) textures.all = first.imageUrl;
      }
    }
    return textures;
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

  /**
   * Renders one card for a block variant slot.
   * If this slot has multiple texture variations ("variations": [...]), they are
   * displayed side-by-side inside this tile, expanding horizontally.
   */
  const renderTileCard = (group: VariantTileGroup, cardKey: string) => {
    const { alias, leaves } = group;
    const primary = leaves[0];
    const numVariations = leaves.length;
    const hasTexVariants = numVariations > 1;

    // Display title: use file name or variant caption
    const getLeafTitle = (l: CatalogLeafDto) => {
      if (l.relativePath) {
        return l.relativePath.split(/[/\\]/).pop() ?? l.displayName ?? alias;
      }
      return l.displayName ?? alias;
    };

    const primaryFileName = getLeafTitle(primary);

    const blockVariantSuffix = primary.blockVariantIndex && primary.totalBlockVariants
      ? ` (block ${primary.blockVariantIndex}/${primary.totalBlockVariants})`
      : '';

    const tooltipLines = [
      (selectedBlock?.displayName || selectedBlock?.blockId) + blockVariantSuffix,
      `terrain textures: ${alias}`,
      numVariations === 1
        ? `path: ${primary.relativePath}`
        : `path: ${leaves.map(l => l.relativePath).join(', ')}`,
      hasTexVariants ? `${numVariations} texture variations (side-by-side)` : '',
    ].filter(Boolean);

    // Dynamic width calculation based on number of variations:
    // Base tile is 96px with an 80px thumbnail.
    // Each additional variation adds an 80px thumb + gap (4px), expanding horizontally.
    const cardStyle = hasTexVariants
      ? { width: `${96 + (numVariations - 1) * 84}px` }
      : undefined;

    return (
      <div
        key={cardKey}
        className={`${styles.leafCard} ${hasTexVariants ? styles.leafCardWithVariants : ''}`}
        style={cardStyle}
        onMouseEnter={(e) => showTooltip(tooltipLines.join('\n'), e)}
        onMouseMove={moveTooltip}
        onMouseLeave={hideTooltip}
      >
        {/* Thumbnail area: single thumb or side-by-side texture variations */}
        <div className={hasTexVariants ? styles.texVariantThumbRow : styles.leafThumbWrapper}>
          {leaves.map((leaf, i) => {
            const leafName = getLeafTitle(leaf);
            return (
              <div
                key={`${leaf.relativePath}-${i}`}
                className={hasTexVariants ? styles.texVarThumbSlot : styles.leafThumbInner}
                onClick={() => handleLeafClick(leaf)}
                title={leafName}
              >
                {leaf.status !== 'GHOST' && leaf.imageUrl ? (
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
              {primaryFileName}
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
            <Block3DViewer faceTextures={faceTextures} />
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
