import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { BlockGroupNodeDto, CatalogLeafDto } from '../../types/ipc';
import { Badge } from '../common/Badge';
import styles from './BlockEntryTree.module.css';

export interface EntityEntryTreeProps {
  entity: BlockGroupNodeDto;
  onTileClick?: (domEl: HTMLElement, leaf: CatalogLeafDto, key: string) => void;
}

export const EntityEntryTree: React.FC<EntityEntryTreeProps> = ({ entity, onTileClick }) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [isMinimized, setIsMinimized] = useState<boolean>(true);

  const toggleMinimize = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsMinimized((prev) => !prev);
  };

  const packFolders = usePackStore((s) => s.packFolders);

  const cleanId = useMemo(() => {
    return entity.blockId.startsWith('minecraft:')
      ? entity.blockId.substring(10)
      : entity.blockId;
  }, [entity.blockId]);

  const hasEntityJson = useMemo(() => {
    function check(items: any[]): boolean {
      if (!items) return false;
      for (const item of items) {
        const p = (item.relativePath || item.name || '').replace(/\\/g, '/').toLowerCase();
        if (
          (p === `entity/${cleanId}.entity.json` ||
           p.endsWith(`/${cleanId}.entity.json`) ||
           p === `attachables/${cleanId}.json` ||
           p.endsWith(`/${cleanId}.json`)) &&
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
  }, [packFolders, cleanId]);

  const isEntityUserDefined = (hasEntityJson || entity.isUserDefined !== false) && entity.isUserDefined === true;

  const toggleNode = (nodeId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCollapsedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const aliases = useMemo(() => {
    return entity.aliasGroups || [];
  }, [entity]);

  const fileLabel = useMemo(() => {
    const isAttachable = aliases.some((ag) => ag.isAttachable);
    return isAttachable ? `attachables/${cleanId}.json` : `entity/${cleanId}.entity.json`;
  }, [aliases, cleanId]);

  // Calculate total visible lines
  const visibleLines = useMemo(() => {
    let count = 1; // root entity json
    if (!collapsedNodes['root_entity_json']) {
      for (const ag of aliases) {
        count += 1; // slot line
        const aliasKey = `slot_${ag.alias}`;
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
            <ChevronDown size={12} className={`${styles.treeToggleChevron} ${!isMinimized ? styles.treeToggleChevronExpanded : ''}`} />
            <span>{isMinimized ? 'Expand' : 'Minimize'}</span>
          </button>
        </div>
      </div>

      <div className={`${styles.treeContentWrapper} ${isMinimized ? styles.treeContentWrapperCollapsed : ''}`}>
        <div className={styles.treeContentInner}>
          <div className={styles.treeContent}>
            {/* Level 1: Entity JSON Entry */}
            <div className={styles.treeNode}>
              <div
                className={`${styles.treeRow} ${isEntityUserDefined ? styles.normalWeight : styles.dimmedWeight}`}
                onClick={() => toggleNode('root_entity_json')}
              >
                <div className={styles.treeRowMain}>
                  <button
                    type="button"
                    className={styles.chevronBtn}
                    onClick={(e) => toggleNode('root_entity_json', e)}
                  >
                    <ChevronRight size={13} className={`${styles.chevronIcon} ${!collapsedNodes['root_entity_json'] ? styles.chevronIconExpanded : ''}`} />
                  </button>
                  <span className={styles.nodeKey}>{fileLabel}</span>
                  <span className={styles.nodeValue}>➔ &quot;{entity.blockId}&quot;</span>
                  <span className={styles.nodeSub}>({entity.displayName})</span>
                </div>

                {isEntityUserDefined ? (
                  <Badge variant="added" size="sm" title="Defined in pack entity definition">
                    added
                  </Badge>
                ) : (
                  <Badge variant="fallback" size="sm" title="Inferred from vanilla entity definition">
                    fallback
                  </Badge>
                )}
              </div>

              <div className={`${styles.treeChildrenWrapper} ${!collapsedNodes['root_entity_json'] ? styles.treeChildrenExpanded : ''}`}>
                <div className={styles.treeChildrenInner}>
                  <div className={styles.treeChildren}>
                    {/* Level 2: Slots per alias group */}
                    {aliases.map((ag) => {
                      const aliasKey = `slot_${ag.alias}`;
                      const isAliasCollapsed = Boolean(collapsedNodes[aliasKey]);

                      // Deduplicate unique texture leaves for this slot
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
                            className={`${styles.treeRow} ${isEntityUserDefined ? styles.normalWeight : styles.dimmedWeight}`}
                            onClick={() => toggleNode(aliasKey)}
                          >
                            <div className={styles.treeRowMain}>
                              <button
                                type="button"
                                className={styles.chevronBtn}
                                onClick={(e) => toggleNode(aliasKey, e)}
                              >
                                <ChevronRight size={13} className={`${styles.chevronIcon} ${!isAliasCollapsed ? styles.chevronIconExpanded : ''}`} />
                              </button>
                              <span className={styles.nodeKey}>slot</span>
                              <span className={styles.nodeValue}>➔ &quot;{ag.alias}&quot;</span>
                              {ag.geometryId && (
                                <span className={styles.nodeSub}>[{ag.geometryId}]</span>
                              )}
                            </div>

                            {isEntityUserDefined ? (
                              <Badge variant="added" size="sm" title="Slot declared in user entity definition">
                                added
                              </Badge>
                            ) : (
                              <Badge variant="fallback" size="sm" title="Inferred from vanilla entity definition">
                                fallback
                              </Badge>
                            )}
                          </div>

                          <div className={`${styles.treeChildrenWrapper} ${!isAliasCollapsed ? styles.treeChildrenExpanded : ''}`}>
                            <div className={styles.treeChildrenInner}>
                              <div className={styles.treeChildren}>
                                {uniqueLeaves.map((leaf, lIdx) => (
                                  <EntityTextureLeafRow
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
          </div>
        </div>
      </div>
    </div>
  );
};

interface EntityTextureLeafRowProps {
  leaf: CatalogLeafDto;
  onTileClick?: (domEl: HTMLElement, leaf: CatalogLeafDto, key: string) => void;
}

const EntityTextureLeafRow: React.FC<EntityTextureLeafRowProps> = ({ leaf, onTileClick }) => {
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
