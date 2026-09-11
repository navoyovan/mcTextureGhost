// frontend/src/components/workspace/BlockWorkspace.tsx
import React, { useState, useMemo } from 'react';
import { Box, Layers, ArrowRight } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { BlockGroupNodeDto, CatalogLeafDto } from '../../types/ipc';
import { FlipbookThumbnail } from '../common/FlipbookThumbnail';
import { Block3DViewer } from './Block3DViewer';
import styles from './BlockWorkspace.module.css';

export const BlockWorkspace: React.FC = () => {
  const blockWorkspaceTree = usePackStore((s) => s.blockWorkspaceTree);
  const { editTexture } = useIpc();

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

  // Extract resolved face textures for the 3D rotating viewer
  const faceTextures = useMemo(() => {
    if (!selectedBlock || !selectedBlock.aliasGroups) return {};

    const textures: Record<string, string | null> = {
      up: null,
      down: null,
      north: null,
      south: null,
      east: null,
      west: null,
      all: null,
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
        // Fallback for flat leaves
        const first = ag.leaves[0];
        if (first && first.imageUrl) {
          textures.all = first.imageUrl;
        }
      }
    }

    return textures;
  }, [selectedBlock]);

  const handleLeafClick = (leaf: CatalogLeafDto) => {
    editTexture(leaf.alias, leaf.fullPath, leaf.status === 'GHOST');
  };

  const getStatusDotClass = (status: string) => {
    switch (status) {
      case 'OK':
        return styles.statusDotOk;
      case 'GHOST':
        return styles.statusDotGhost;
      case 'ORPHAN':
        return styles.statusDotOrphan;
      case 'OVERRIDE':
        return styles.statusDotOverride;
      default:
        return styles.statusDotNew;
    }
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
      {/* Left List of User Pack Blocks */}
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
                  <span className={styles.vanillaTag} title="Inferred from vanilla blocks.json (not in custom blocks.json)">
                    vanilla
                  </span>
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
          {/* Header */}
          <div className={styles.detailHeader}>
            <div className={styles.blockTitleGroup}>
              <div className={styles.blockHeaderTitleRow}>
                <h2 className={styles.blockDisplayName}>{selectedBlock.displayName}</h2>
                {selectedBlock.isUserDefined === false && selectedBlock.blockId !== 'uncategorized' && (
                  <span className={styles.vanillaHeaderBadge} title="Using vanilla blocks.json definition (not in custom blocks.json)">
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

          {/* Interactive 3D Orbit Cube */}
          <div className={styles.previewSection}>
            <Block3DViewer faceTextures={faceTextures} />
          </div>

          {/* 4-Tier Hierarchy & Horizontal Variant Strips */}
          <div className={styles.hierarchySection}>
            {selectedBlock.aliasGroups?.map((ag) => (
              <div key={ag.alias} className={styles.aliasGroupCard}>
                <div className={styles.aliasHeader}>
                  <Layers size={14} />
                  <span>Alias: {ag.alias}</span>
                </div>

                <div className={styles.faceNodeGroup}>
                  {ag.faceNodes && ag.faceNodes.length > 0 ? (
                    ag.faceNodes.map((fn) => (
                      <div key={fn.faceLabel} className={styles.faceRow}>
                        <div className={styles.faceLabelBadge}>
                          <ArrowRight size={10} />
                          <span>Face: {fn.faceLabel}</span>
                          {fn.ghostCount > 0 && (
                            <span className={styles.faceGhostCount}>• 👻 {fn.ghostCount}</span>
                          )}
                        </div>

                        {/* Horizontal Variant Strip (sketch2.png layout) */}
                        <div className={styles.variantStrip}>
                          {fn.leaves?.map((leaf, idx) => (
                            <div
                              key={`${leaf.alias}-${leaf.relativePath}-${fn.faceLabel}-${idx}`}
                              className={styles.leafCard}
                              onClick={() => handleLeafClick(leaf)}
                              title={`${leaf.displayName || leaf.alias}\nStatus: ${leaf.status}\nClick to edit`}
                            >
                              <div className={styles.leafThumbWrapper}>
                                {leaf.status !== 'GHOST' && leaf.imageUrl ? (
                                  <FlipbookThumbnail
                                    src={leaf.imageUrl}
                                    alt={leaf.alias}
                                    className={styles.leafThumb}
                                    isFlipbook={leaf.isFlipbook}
                                    flipbook={leaf.flipbook}
                                    loading="lazy"
                                  />
                                ) : (
                                  <span className={styles.leafGhost}>?</span>
                                )}
                              </div>
                              <div className={styles.leafMeta}>
                                <div className={styles.leafHeaderRow}>
                                  <span
                                    className={`${styles.leafStatusDot} ${getStatusDotClass(leaf.status)}`}
                                  />
                                  <span className={styles.leafName}>
                                    {leaf.displayName || leaf.alias}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    // Flat leaves fallback
                    <div className={styles.variantStrip}>
                      {ag.leaves?.map((leaf) => (
                        <div
                          key={leaf.alias + leaf.relativePath}
                          className={styles.leafCard}
                          onClick={() => handleLeafClick(leaf)}
                          title={`${leaf.displayName || leaf.alias}\nStatus: ${leaf.status}`}
                        >
                          <div className={styles.leafThumbWrapper}>
                            {leaf.status !== 'GHOST' && leaf.imageUrl ? (
                              <FlipbookThumbnail
                                src={leaf.imageUrl}
                                alt={leaf.alias}
                                className={styles.leafThumb}
                                isFlipbook={leaf.isFlipbook}
                                flipbook={leaf.flipbook}
                                loading="lazy"
                              />
                            ) : (
                              <span className={styles.leafGhost}>?</span>
                            )}
                          </div>
                          <div className={styles.leafMeta}>
                            <div className={styles.leafHeaderRow}>
                              <span
                                className={`${styles.leafStatusDot} ${getStatusDotClass(leaf.status)}`}
                              />
                              <span className={styles.leafName}>
                                {leaf.displayName || leaf.alias}
                              </span>
                            </div>
                          </div>
                        </div>
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
