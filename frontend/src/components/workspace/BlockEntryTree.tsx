import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
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

  // Flatten and group alias mappings
  const aliases = useMemo(() => {
    return block.aliasGroups || [];
  }, [block]);

  // Calculate total visible lines
  const visibleLines = useMemo(() => {
    let count = 1; // root blocks.json
    if (!collapsedNodes['root_blocks_json']) {
      for (const ag of aliases) {
        count += 1; // alias line
        const aliasKey = `alias_${ag.alias}`;
        if (!collapsedNodes[aliasKey]) {
          const seenLeaves = new Set<string>();
          const rawLeaves = [
            ...(ag.leaves ?? []),
            ...(ag.faceNodes ? ag.faceNodes.flatMap((fn) => fn.leaves ?? []) : []),
          ];
          for (const leaf of rawLeaves) {
            const leafKey = `${leaf.relativePath || leaf.alias}:${leaf.blockVariantIndex ?? ''}:${leaf.textureVariantIndex ?? ''}`;
            if (!seenLeaves.has(leafKey)) {
              seenLeaves.add(leafKey);
              count += 1;
            }
          }
        }
      }
    }
    return count;
  }, [aliases, collapsedNodes]);

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
            {isMinimized ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            <span>{isMinimized ? 'Expand' : 'Minimize'}</span>
          </button>
        </div>
      </div>

      {!isMinimized && (
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
                {collapsedNodes['root_blocks_json'] ? (
                  <ChevronRight size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
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
                vanilla fallback
              </Badge>
            )}
          </div>

          {!collapsedNodes['root_blocks_json'] && (
            <div className={styles.treeChildren}>
              {/* Level 2: terrain_texture.json entries per alias */}
              {aliases.map((ag) => {
                const aliasKey = `alias_${ag.alias}`;
                const isAliasCollapsed = Boolean(collapsedNodes[aliasKey]);
                const isDeclaredInTerrainTexture =
                  isBlockUserDefined &&
                  hasTerrainTextureJson &&
                  packAliases.some(
                    (a) =>
                      a.alias.toLowerCase() === ag.alias.toLowerCase() &&
                      a.category === 'block' &&
                      a.status !== 'ORPHAN'
                  );

                // Deduplicate unique texture leaves for this alias
                const seenLeaves = new Set<string>();
                const uniqueLeaves: CatalogLeafDto[] = [];
                const rawLeaves = [
                  ...(ag.leaves ?? []),
                  ...(ag.faceNodes ? ag.faceNodes.flatMap((fn) => fn.leaves ?? []) : []),
                ];
                for (const leaf of rawLeaves) {
                  const leafKey = `${leaf.relativePath || leaf.alias}:${leaf.blockVariantIndex ?? ''}:${leaf.textureVariantIndex ?? ''}`;
                  if (!seenLeaves.has(leafKey)) {
                    seenLeaves.add(leafKey);
                    uniqueLeaves.push(leaf);
                  }
                }

                return (
                  <div key={ag.alias} className={styles.treeNode}>
                    <div
                      className={`${styles.treeRow} ${isDeclaredInTerrainTexture ? styles.normalWeight : styles.dimmedWeight}`}
                      onClick={() => toggleNode(aliasKey)}
                    >
                      <div className={styles.treeRowMain}>
                        <button
                          type="button"
                          className={styles.chevronBtn}
                          onClick={(e) => toggleNode(aliasKey, e)}
                        >
                          {isAliasCollapsed ? (
                            <ChevronRight size={13} />
                          ) : (
                            <ChevronDown size={13} />
                          )}
                        </button>
                        <span className={styles.nodeKey}>terrain_texture.json</span>
                        <span className={styles.nodeValue}>➔ &quot;{ag.alias}&quot;</span>
                        {ag.faceSummary && (
                          <span className={styles.nodeSub}>[face: {ag.faceSummary}]</span>
                        )}
                      </div>

                      {isDeclaredInTerrainTexture ? (
                        <Badge variant="added" size="sm" title="Texture alias declared in user terrain_texture.json">
                          added
                        </Badge>
                      ) : (
                        <Badge variant="fallback" size="sm" title="Inferred from vanilla terrain_texture.json">
                          vanilla fallback
                        </Badge>
                      )}
                    </div>

                    {!isAliasCollapsed && (
                      <div className={styles.treeChildren}>
                        {uniqueLeaves.map((leaf, lIdx) => (
                          <TextureLeafRow
                            key={`${leaf.relativePath || leaf.alias}-${lIdx}`}
                            leaf={leaf}
                            onTileClick={onTileClick}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}
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
      return <Badge variant="fallback" size="sm">vanilla</Badge>;
    }
    if (isGhost) {
      return <Badge variant="ghost" size="sm">ghost</Badge>;
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
