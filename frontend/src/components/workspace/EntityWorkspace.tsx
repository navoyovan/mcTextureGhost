// frontend/src/components/workspace/EntityWorkspace.tsx
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Box, Layers, Shield } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { BlockGroupNodeDto, CatalogLeafDto } from '../../types/ipc';
import { Entity3DViewer } from './Entity3DViewer';
import { WorkspaceTileCard, VariantTileGroup } from './WorkspaceTileCard';
import styles from './BlockWorkspace.module.css';

// Group entity leaves by alias slot
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

export const EntityWorkspace: React.FC = () => {
  const entityWorkspaceTree = usePackStore((s) => s.entityWorkspaceTree);
  const searchQuery = usePackStore((s) => s.searchQuery);
  const statusFilter = usePackStore((s) => s.statusFilter);
  const tileZoom = usePackStore((s) => s.tileZoom);
  const { editTexture, deleteTextureFile, deleteTextureEntries } = useIpc();

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeLeafKey, setActiveLeafKey] = useState<string | null>(null);
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

  // Filter entity list by toolbar searchQuery and statusFilter
  const filteredEntityWorkspaceTree = useMemo(() => {
    if (!entityWorkspaceTree) return [];
    const query = searchQuery.trim().toLowerCase();

    return entityWorkspaceTree.filter((entity) => {
      // 1. Status filter
      if (statusFilter === 'ghosts' && (entity.ghostCount ?? 0) <= 0) {
        return false;
      }
      if (statusFilter === 'added') {
        const hasAdded = entity.aliasGroups?.some((ag) =>
          ag.leaves?.some((l) => l.status === 'OK' || l.status === 'OVERRIDE')
        );
        if (!hasAdded) return false;
      }
      if (statusFilter === 'orphans') {
        const hasOrphan = entity.aliasGroups?.some((ag) =>
          ag.leaves?.some((l) => l.status === 'ORPHAN')
        );
        if (!hasOrphan) return false;
      }

      // 2. Search query filter
      if (!query) return true;

      const entityIdMatches = (entity.blockId || '').toLowerCase().includes(query);
      const dispNameMatches = (entity.displayName || '').toLowerCase().includes(query);
      if (entityIdMatches || dispNameMatches) return true;

      return entity.aliasGroups?.some((ag) => {
        if ((ag.alias || '').toLowerCase().includes(query)) return true;
        if ((ag.geometryId || '').toLowerCase().includes(query)) return true;
        return ag.leaves?.some(
          (l) =>
            (l.relativePath || '').toLowerCase().includes(query) ||
            (l.displayName || '').toLowerCase().includes(query) ||
            (l.alias || '').toLowerCase().includes(query)
        );
      });
    });
  }, [entityWorkspaceTree, searchQuery, statusFilter]);

  // Keep selectedEntity pointed to a valid entity in the filtered list
  const selectedEntity = useMemo<BlockGroupNodeDto | null>(() => {
    if (!filteredEntityWorkspaceTree || filteredEntityWorkspaceTree.length === 0) return null;
    return (
      filteredEntityWorkspaceTree.find((e) => e.blockId === selectedEntityId) ??
      filteredEntityWorkspaceTree[0] ??
      null
    );
  }, [filteredEntityWorkspaceTree, selectedEntityId]);

  // Keyboard arrow navigation (Up / Down) through entity list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input / textarea / search bar
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }

      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

      if (!filteredEntityWorkspaceTree || filteredEntityWorkspaceTree.length === 0) return;

      e.preventDefault();

      const currentId = selectedEntity?.blockId || selectedEntityId;
      const currentIndex = filteredEntityWorkspaceTree.findIndex(
        (ent) => ent.blockId === currentId
      );

      let nextIndex = 0;
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex >= 0 && currentIndex < filteredEntityWorkspaceTree.length - 1 ? currentIndex + 1 : 0;
      } else if (e.key === 'ArrowUp') {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : filteredEntityWorkspaceTree.length - 1;
      }

      const nextEntity = filteredEntityWorkspaceTree[nextIndex];
      if (nextEntity) {
        setSelectedEntityId(nextEntity.blockId);
        const btn = document.querySelector(`[data-entity-id="${nextEntity.blockId}"]`);
        if (btn) {
          btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredEntityWorkspaceTree, selectedEntity?.blockId, selectedEntityId]);

  // Collect all leaves for selected entity
  const allLeaves = useMemo<CatalogLeafDto[]>(() => {
    if (!selectedEntity || !selectedEntity.aliasGroups) return [];
    return selectedEntity.aliasGroups.flatMap((ag) => ag.leaves ?? []);
  }, [selectedEntity]);

  // Active leaf for 3D Viewer texturing
  const activeLeaf = useMemo<CatalogLeafDto | null>(() => {
    if (!allLeaves || allLeaves.length === 0) return null;
    if (activeLeafKey) {
      const found = allLeaves.find((l) => `${l.alias}-${l.relativePath}` === activeLeafKey);
      if (found) return found;
    }
    const firstOk = allLeaves.find((l) => l.status === 'OK' || l.status === 'OVERRIDE');
    return firstOk || allLeaves[0] || null;
  }, [allLeaves, activeLeafKey]);

  // Reset active leaf on entity switch
  useEffect(() => {
    setActiveLeafKey(null);
  }, [selectedEntity?.blockId]);

  const primaryGeometryId = useMemo<string | null>(() => {
    if (!selectedEntity || !selectedEntity.aliasGroups) return null;
    if (activeLeaf?.geometryId) return activeLeaf.geometryId;
    for (const ag of selectedEntity.aliasGroups) {
      if (ag.geometryId) return ag.geometryId;
      const leafGeo = ag.leaves?.find((l) => l.geometryId)?.geometryId;
      if (leafGeo) return leafGeo;
    }
    return null;
  }, [selectedEntity, activeLeaf]);

  const isAttachableEntity = useMemo<boolean>(() => {
    if (!selectedEntity || !selectedEntity.aliasGroups) return false;
    return selectedEntity.aliasGroups.some((ag) => ag.isAttachable || ag.leaves?.some((l) => l.isAttachable));
  }, [selectedEntity]);

  const handleLeafClick = useCallback((leaf: CatalogLeafDto) => {
    setActiveLeafKey(`${leaf.alias}-${leaf.relativePath}`);
    editTexture(leaf.alias, leaf.fullPath, leaf.status === 'GHOST');
  }, [editTexture]);

  const handleToggleMenu = useCallback((cardKey: string) => {
    setActiveMenuKey((prev) => (prev === cardKey ? null : cardKey));
  }, []);

  const handleDeleteTextureFile = useCallback((path: string, alias: string) => {
    deleteTextureFile(path, alias);
  }, [deleteTextureFile]);

  const handleDeleteTextureEntries = useCallback((alias: string, relativePath?: string | null) => {
    deleteTextureEntries(alias, 'entity', relativePath ?? undefined);
  }, [deleteTextureEntries]);

  const selectedEntityDisplayName = selectedEntity?.displayName || selectedEntity?.blockId || '';

  if (!entityWorkspaceTree || entityWorkspaceTree.length === 0) {
    return (
      <div className={styles.workspaceContainer}>
        <div className={styles.emptySelection}>
          <span>No entities found in pack or vanilla reference</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.workspaceContainer}>
      {/* Left List */}
      <aside className={styles.blockListPane} aria-label="Entities List">
        <div className={styles.blockListHeader}>
          Pack Entities ({filteredEntityWorkspaceTree.length}
          {filteredEntityWorkspaceTree.length !== entityWorkspaceTree.length ? ` / ${entityWorkspaceTree.length}` : ''})
        </div>

        {filteredEntityWorkspaceTree.length > 0 ? (
          filteredEntityWorkspaceTree.map((entity) => {
            const isActive = selectedEntity?.blockId === entity.blockId;
            const isCustom = entity.isUserDefined !== false;
            const isAttachable = entity.aliasGroups?.some((ag) => ag.isAttachable || ag.leaves?.some((l) => l.isAttachable));

            return (
              <button
                key={entity.blockId}
                data-entity-id={entity.blockId}
                type="button"
                className={`${styles.blockItem} ${isActive ? styles.blockItemActive : ''} ${!isCustom ? styles.blockItemVanilla : ''}`}
                onClick={() => setSelectedEntityId(entity.blockId)}
              >
                <div className={styles.blockItemLeft}>
                  {isAttachable ? (
                    <Shield size={14} className={!isCustom ? styles.blockIconMuted : undefined} />
                  ) : (
                    <Box size={14} className={!isCustom ? styles.blockIconMuted : undefined} />
                  )}
                  <span className={styles.blockItemName}>{entity.displayName || entity.blockId}</span>
                </div>
                <div className={styles.blockItemBadges}>
                  {isAttachable && (
                    <span className={styles.attachableTag}>attachable</span>
                  )}
                  {!isCustom && (
                    <span className={styles.vanillaTag} title="Vanilla Bedrock Reference">vanilla</span>
                  )}
                  {entity.ghostCount > 0 && (
                    <span className={styles.ghostBadge}>{entity.ghostCount}</span>
                  )}
                </div>
              </button>
            );
          })
        ) : (
          <div className={styles.noMatches}>
            <span>No entities match your search or filter</span>
          </div>
        )}
      </aside>

      {/* Right Detail Pane */}
      {selectedEntity ? (
        <section
          key={selectedEntity.blockId}
          className={styles.detailPane}
          aria-label="Entity Hierarchy & 3D Preview"
        >
          <div className={styles.detailHeader}>
            <div className={styles.blockTitleGroup}>
              <div className={styles.blockHeaderTitleRow}>
                <h2 className={styles.blockDisplayName}>{selectedEntity.displayName}</h2>
                {isAttachableEntity && (
                  <span className={styles.attachableTag} style={{ fontSize: '9px', padding: '2px 6px' }}>
                    Attachable / Armor
                  </span>
                )}
                {selectedEntity.isUserDefined === false && (
                  <span className={styles.vanillaHeaderBadge} title="Using vanilla entity reference definition">
                    Vanilla Reference
                  </span>
                )}
              </div>
              <span className={styles.blockIdSub}>
                {selectedEntity.blockId}
                {primaryGeometryId && ` • Geo: ${primaryGeometryId}`}
              </span>
            </div>
            {selectedEntity.ghostCount > 0 && (
              <span className={styles.ghostBadge}>{selectedEntity.ghostCount} missing</span>
            )}
          </div>

          {/* 3D Entity Model Viewer */}
          <div className={styles.previewSection}>
            <Entity3DViewer
              entityId={selectedEntity.blockId}
              geometryId={primaryGeometryId}
              textureUrl={activeLeaf?.imageUrl}
              isGhost={activeLeaf?.status === 'GHOST'}
              isAttachable={isAttachableEntity}
            />
          </div>

          {/* Slots & Texture Variations Hierarchy */}
          <div className={styles.hierarchySection} ref={menuRef}>
            {selectedEntity.aliasGroups?.map((ag, agIndex) => (
              <div key={`${selectedEntity.blockId}-${ag.alias}-${agIndex}`} className={styles.aliasGroupCard}>
                <div className={styles.aliasHeader}>
                  <Layers size={14} />
                  <span>Slot: {ag.alias}</span>
                  {ag.geometryId && (
                    <span className={styles.vanillaTag} style={{ marginLeft: 'auto' }}>
                      {ag.geometryId}
                    </span>
                  )}
                </div>

                <div className={styles.variantStrip}>
                  {groupLeavesByVariantSlot(ag.leaves ?? []).map((grp, grpIndex) => {
                    const cardKey = `${selectedEntity.blockId}-${ag.alias}-${grp.key}-${grpIndex}`;
                    return (
                      <WorkspaceTileCard
                        key={cardKey}
                        grp={grp}
                        cardKey={cardKey}
                        tileZoom={tileZoom}
                        selectedBlockName={selectedEntityDisplayName}
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
            ))}
          </div>
        </section>
      ) : (
        <div className={styles.emptySelection}>Select an entity to inspect</div>
      )}
    </div>
  );
};

