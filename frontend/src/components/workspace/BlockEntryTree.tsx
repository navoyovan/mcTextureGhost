import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { BlockGroupNodeDto, CatalogLeafDto } from '../../types/ipc';
import { Badge } from '../common/Badge';
import styles from './BlockEntryTree.module.css';

export interface BlockEntryTreeProps {
  block: BlockGroupNodeDto;
  onTileClick?: (domEl: HTMLElement, leaf: CatalogLeafDto, key: string) => void;
}

export const BlockEntryTree: React.FC<BlockEntryTreeProps> = ({ block, onTileClick }) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [isMinimized, setIsMinimized] = useState<boolean>(true);

  const toggleMinimize = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsMinimized((prev) => !prev);
  };

  const packAliases = usePackStore((s) => s.aliases);
  const packFolders = usePackStore((s) => s.packFolders);
  const catalogTree = usePackStore((s) => s.catalogTree);

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

  const toggleNode = (nodeId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCollapsedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const isBlockUserDefined = hasBlocksJson && block.isUserDefined !== false;

  // 1. Aliases declared in blocks.json
  const declaredAliases = useMemo(() => {
    return block.aliasGroups || [];
  }, [block]);

  // 2. All terrain_texture.json aliases relevant to this block
  // (both declared in blocks.json AND any terrain aliases associated with this block)
  const terrainAliases = useMemo(() => {
    const list: Array<{
      alias: string;
      ag?: (typeof declaredAliases)[0];
      leaves: CatalogLeafDto[];
      isDeclaredInPackTerrain: boolean;
      isDeclaredInVanillaTerrain: boolean;
      isOrphan: boolean;
    }> = [];

    const processedAliasKeys = new Set<string>();

    // Add declared aliases from blocks.json first
    for (const ag of declaredAliases) {
      const aliasKey = ag.alias.toLowerCase();
      processedAliasKeys.add(aliasKey);

      const isDeclaredInPackTerrain =
        hasTerrainTextureJson &&
        packAliases.some(
          (a) =>
            a.alias.toLowerCase() === aliasKey &&
            a.category.toLowerCase() === 'block' &&
            a.status !== 'ORPHAN' &&
            a.isUserDefined !== false
        );

      // An alias is missing if any of its leaves explicitly indicate missing declaration
      const hasMissingDeclarationLeaf = ag.leaves?.some(
        (l) => l.subtitleCaption?.toLowerCase() === 'missing declaration'
      ) || ag.faceNodes?.some((fn) =>
        fn.leaves?.some((l) => l.subtitleCaption?.toLowerCase() === 'missing declaration')
      );

      // An alias is in vanilla terrain_texture.json if it exists in the vanilla catalog database or pack's vanilla-defined aliases
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
                a.category.toLowerCase() === 'block' &&
                (a as any).isUserDefined === false
            ));

      const rawLeaves = [
        ...(ag.leaves ?? []),
        ...(ag.faceNodes ? ag.faceNodes.flatMap((fn) => fn.leaves ?? []) : []),
      ];
      const seenLeaves = new Set<string>();
      const uniqueLeaves: CatalogLeafDto[] = [];
      for (const leaf of rawLeaves) {
        const lKey = `${leaf.relativePath || leaf.alias}:${leaf.blockVariantIndex ?? ''}:${leaf.textureVariantIndex ?? ''}`;
        if (!seenLeaves.has(lKey)) {
          seenLeaves.add(lKey);
          uniqueLeaves.push(leaf);
        }
      }

      list.push({
        alias: ag.alias,
        ag,
        leaves: uniqueLeaves,
        isDeclaredInPackTerrain,
        isDeclaredInVanillaTerrain,
        isOrphan: false,
      });
    }

    // Add any pack terrain aliases associated with this block that are NOT declared in current blocks.json (Orphans)
    for (const pa of packAliases) {
      if (pa.category.toLowerCase() !== 'block') continue;
      const aliasKey = pa.alias.toLowerCase();
      if (processedAliasKeys.has(aliasKey)) continue;

      const isUsedByBlock =
        pa.usedByBlocks?.some((b) => b.toLowerCase() === block.blockId.toLowerCase()) ||
        pa.blockFaces?.some((bf) => bf.blockId.toLowerCase() === block.blockId.toLowerCase()) ||
        pa.alias.toLowerCase().startsWith(block.blockId.toLowerCase());

      if (isUsedByBlock) {
        processedAliasKeys.add(aliasKey);
        const orphanLeaf: CatalogLeafDto = {
          alias: pa.alias,
          displayName: pa.displayName || pa.alias,
          relativePath: pa.relativePath || `textures/blocks/${pa.alias}`,
          fullPath: pa.fullPath || '',
          category: 'block',
          status: (pa.status === 'NEW' ? 'OK' : pa.status) || (pa.exists ? 'OK' : 'GHOST'),
          imageUrl: pa.imageUrl || '',
          subtitleCaption: pa.subtitleCaption || '',
          primaryFaceBadgeText: '',
          isFlipbook: pa.isFlipbook || false,
        };

        list.push({
          alias: pa.alias,
          leaves: [orphanLeaf],
          isDeclaredInPackTerrain: pa.isUserDefined !== false,
          isDeclaredInVanillaTerrain: false,
          isOrphan: true,
        });
      }
    }

    return list;
  }, [declaredAliases, packAliases, hasTerrainTextureJson, catalogTree, block.blockId]);

  // Calculate total visible lines across blocks.json and terrain_texture.json
  const visibleLines = useMemo(() => {
    let count = 1; // Level 1: blocks.json
    if (!collapsedNodes['root_blocks_json']) {
      count += declaredAliases.length; // declared alias lines
    }
    // terrain_texture.json nodes (parallel)
    for (const item of terrainAliases) {
      count += 1; // terrain_texture.json line
      const ttKey = `tt_${item.alias}`;
      if (!collapsedNodes[ttKey]) {
        count += item.leaves.length;
      }
    }
    return count;
  }, [declaredAliases, terrainAliases, collapsedNodes]);

  // Target lines = visibleLines + 1, with a minimum clamp of 5 lines (~200px) and max of 340px
  const autoHeight = useMemo(() => {
    const targetLines = Math.max(5, visibleLines + 1);
    const calculated = 64 + targetLines * 28;
    return Math.min(340, Math.max(200, calculated));
  }, [visibleLines]);

  return (
    <div
      className={`${styles.treeContainer} ${isMinimized ? styles.treeContainerCollapsed : ''}`}
      style={!isMinimized ? ({ '--tree-auto-height': `${autoHeight}px` } as React.CSSProperties) : undefined}
    >
      <div
        className={styles.treeHeader}
        onClick={toggleMinimize}
        title={isMinimized ? 'Click to expand tree' : 'Click to minimize tree'}
      >
        <div className={styles.treeHeaderLeft}>
          <span className={styles.treeHeaderTitle}>JSON Hierarchy</span>
        </div>
        <div className={styles.treeHeaderActions}>
          <button
            type="button"
            className={styles.treeToggleBtn}
            onClick={toggleMinimize}
            title={isMinimized ? 'Expand tree panel' : 'Minimize tree panel'}
          >
            <ChevronDown size={12} className={`${styles.treeToggleChevron} ${!isMinimized ? styles.treeToggleChevronExpanded : ''}`} />
            <span>{isMinimized ? 'Expand' : 'Minimize'}</span>
          </button>
        </div>
      </div>

      <div className={`${styles.treeContentWrapper} ${isMinimized ? styles.treeContentWrapperCollapsed : ''}`}>
        <div className={styles.treeContentInner}>
          <div className={styles.treeContent}>
            {/* Level 1: blocks.json Entry */}
            <div className={styles.treeNode}>
              <div
                className={`${styles.treeRow} ${isBlockUserDefined ? styles.normalWeight : styles.dimmedWeight}`}
                onClick={() => toggleNode('root_blocks_json')}
              >
                <div className={styles.treeRowMain}>
                  <button
                    type="button"
                    className={styles.chevronBtn}
                    onClick={(e) => toggleNode('root_blocks_json', e)}
                  >
                    <ChevronRight size={13} className={`${styles.chevronIcon} ${!collapsedNodes['root_blocks_json'] ? styles.chevronIconExpanded : ''}`} />
                  </button>
                  <span className={styles.nodeKey}>blocks.json</span>
                  <span className={styles.nodeValue}>➔ &quot;{block.blockId}&quot;</span>
                  <span className={styles.nodeSub}>({block.displayName})</span>
                </div>

                {isBlockUserDefined ? (
                  <Badge variant="added" size="sm" title="Defined in pack blocks.json">
                    added
                  </Badge>
                ) : (
                  <Badge variant="fallback" size="sm" title="Inferred from vanilla blocks.json">
                    fallback
                  </Badge>
                )}
              </div>

              <div className={`${styles.treeChildrenWrapper} ${!collapsedNodes['root_blocks_json'] ? styles.treeChildrenExpanded : ''}`}>
                <div className={styles.treeChildrenInner}>
                  <div className={styles.treeChildren}>
                    {/* Level 2: Declared alias mappings from blocks.json */}
                    {declaredAliases.map((ag) => {
                      return (
                        <div key={ag.alias} className={styles.treeNode}>
                          <div className={`${styles.treeRow} ${isBlockUserDefined ? styles.normalWeight : styles.dimmedWeight}`}>
                            <div className={styles.treeRowMain}>
                              <div className={styles.chevronPlaceholder} />
                              <span className={styles.nodeKey}>textures{ag.faceSummary ? `.${ag.faceSummary}` : ''}</span>
                              <span className={styles.nodeValue}>➔ &quot;{ag.alias}&quot;</span>
                              {ag.faceSummary && (
                                <span className={styles.nodeSub}>({ag.faceSummary})</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Level 1 (Parallel): terrain_texture.json Entries for each alias */}
            {terrainAliases.map((item) => {
              const ttKey = `tt_${item.alias}`;
              const isTtCollapsed = Boolean(collapsedNodes[ttKey]);

              return (
                <div key={`tt_node_${item.alias}`} className={styles.treeNode}>
                  <div
                    className={`${styles.treeRow} ${item.isDeclaredInPackTerrain ? styles.normalWeight : styles.dimmedWeight}`}
                    onClick={() => toggleNode(ttKey)}
                  >
                    <div className={styles.treeRowMain}>
                      <button
                        type="button"
                        className={styles.chevronBtn}
                        onClick={(e) => toggleNode(ttKey, e)}
                      >
                        <ChevronRight
                          size={13}
                          className={`${styles.chevronIcon} ${!isTtCollapsed ? styles.chevronIconExpanded : ''}`}
                        />
                      </button>
                      <span className={styles.nodeKey}>terrain_texture.json</span>
                      <span className={styles.nodeValue}>➔ &quot;{item.alias}&quot;</span>
                    </div>

                    {item.isOrphan ? (
                      <Badge variant="orphan" size="sm" title="Declared in terrain_texture.json but not referenced in blocks.json">
                        orphan
                      </Badge>
                    ) : item.isDeclaredInPackTerrain ? (
                      <Badge variant="added" size="sm" title="Declared in pack terrain_texture.json">
                        added
                      </Badge>
                    ) : item.isDeclaredInVanillaTerrain ? (
                      <Badge variant="fallback" size="sm" title="Inferred from vanilla terrain_texture.json">
                        fallback
                      </Badge>
                    ) : (
                      <Badge variant="missing" size="sm" title="Missing declaration in terrain_texture.json">
                        missing entry
                      </Badge>
                    )}
                  </div>

                  {/* Declared texture paths nested inside terrain_texture.json */}
                  <div className={`${styles.treeChildrenWrapper} ${!isTtCollapsed ? styles.treeChildrenExpanded : ''}`}>
                    <div className={styles.treeChildrenInner}>
                      <div className={styles.treeChildren}>
                        {item.leaves.map((leaf, lIdx) => (
                          <TextureLeafRow
                            key={`${leaf.relativePath || leaf.alias}-${lIdx}`}
                            leaf={leaf}
                            onTileClick={onTileClick}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

interface TextureLeafRowProps {
  leaf: CatalogLeafDto;
  onTileClick?: (domEl: HTMLElement, leaf: CatalogLeafDto, key: string) => void;
}

const TextureLeafRow: React.FC<TextureLeafRowProps> = ({ leaf, onTileClick }) => {
  const isVanilla = leaf.status === 'VANILLA';
  const isGhost = leaf.status === 'GHOST';
  const isOk = leaf.status === 'OK' || leaf.status === 'OVERRIDE';

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onTileClick) {
      onTileClick(e.currentTarget, leaf, leaf.alias);
    }
  };

  const getStatusBadge = () => {
    if (isVanilla) {
      return <Badge variant="fallback" size="sm">fallback</Badge>;
    }
    if (isGhost) {
      return <Badge variant="ghost" size="sm">ghost</Badge>;
    }
    if (leaf.status === 'ORPHAN') {
      return <Badge variant="orphan" size="sm">orphan</Badge>;
    }
    return <Badge variant="ok" size="sm">ok</Badge>;
  };

  return (
    <div
      className={`${styles.treeRow} ${isOk ? styles.normalWeight : styles.dimmedWeight}`}
      onClick={handleClick}
      title={isVanilla ? 'Vanilla fallback texture' : isGhost ? 'Missing texture file (Ghost)' : 'Existing texture file'}
    >
      <div className={styles.treeRowMain}>
        <div className={styles.chevronPlaceholder} />

        {leaf.imageUrl && (
          <img src={leaf.imageUrl} alt="" className={styles.thumbPreview} loading="lazy" />
        )}

        <span className={styles.nodeLabel}>
          {leaf.relativePath ? `${leaf.relativePath}.png` : leaf.displayName || leaf.alias}
        </span>

        {leaf.variantKind && leaf.variantKind !== 'None' && (
          <span className={styles.nodeSub}>({leaf.variantKind})</span>
        )}
      </div>

      {getStatusBadge()}
    </div>
  );
};
