// frontend/src/components/workspace/EntityWorkspace.tsx
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { PawPrint, ArrowRight, Shield } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { BlockGroupNodeDto, CatalogLeafDto, TextureAliasDto, OpenWithAppDto } from '../../types/ipc';
import { Entity3DViewer, EntitySlotOption, EntitySlotVariationOption } from './Entity3DViewer';
import { EntityEntryTree } from './EntityEntryTree';
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
    category: (leaf.category as any) || 'entity',
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
  const activeFilters = usePackStore((s) => s.activeFilters);
  const tileZoom = usePackStore((s) => s.tileZoom);
  const { editTexture, deleteTextureFile, deleteTextureEntries, openInExplorer } = useIpc();

  const selectedEntityId = usePackStore((s) => s.entityWorkspaceSelectedId);
  const setSelectedEntityId = usePackStore((s) => s.setEntityWorkspaceSelectedId);
  const activeLeafKey = usePackStore((s) => s.entityWorkspaceActiveLeafKey);
  const setActiveLeafKey = usePackStore((s) => s.setEntityWorkspaceActiveLeafKey);
  const activeSlotIndex = usePackStore((s) => s.entityWorkspaceActiveSlotIndex);
  const setActiveSlotIndex = usePackStore((s) => s.setEntityWorkspaceActiveSlotIndex);
  const activeVariationIndex = usePackStore((s) => s.entityWorkspaceActiveVariationIndex);
  const setActiveVariationIndex = usePackStore((s) => s.setEntityWorkspaceActiveVariationIndex);
  const [activeMenuKey, setActiveMenuKey] = useState<string | null>(null);
  const isListDrawerOpen = usePackStore((s) => s.isWorkspaceDrawerOpen);
  const setIsListDrawerOpen = usePackStore((s) => s.setIsWorkspaceDrawerOpen);
  const disable3DView = usePackStore((s) => s.disable3DView);
  const [hoverMorphTarget, setHoverMorphTarget] = useState<TileHoverMorphTarget | null>(null);
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

  // Filter entity list by toolbar searchQuery and activeFilters/statusFilter
  const filteredEntityWorkspaceTree = useMemo(() => {
    if (!entityWorkspaceTree) return [];
    const query = searchQuery.trim().toLowerCase();

    const effectiveFilters = activeFilters.length > 0
      ? activeFilters
      : (statusFilter !== 'all' ? [statusFilter as any] : []);

    return entityWorkspaceTree.filter((entity) => {
      const allLeaves = entity.aliasGroups?.flatMap((ag) => ag.leaves ?? []) ?? [];

      // 1. Active Filters (Checklist)
      if (effectiveFilters.length > 0) {
        const hasStatusFilter = effectiveFilters.some((f) => f === 'ghosts' || f === 'added' || f === 'orphans');
        const hasFeatureFilter = effectiveFilters.some(
          (f) => f === 'mers' || f === 'atlas' || f === 'flipbook' || f === 'variations' || f === 'blockstates' || f === 'variation'
        );

        if (hasStatusFilter) {
          const statusMatch =
            (effectiveFilters.includes('ghosts') && (entity.ghostCount ?? 0) > 0) ||
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
            (entity.totalVariants && entity.totalVariants > 1) ||
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
  }, [entityWorkspaceTree, searchQuery, statusFilter, activeFilters]);

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

  // Reset active leaf/slot on entity switch (preserve when restoring from inactive view)
  const prevEntityIdRef = useRef<string | null>(null);
  useEffect(() => {
    const curId = selectedEntity?.blockId ?? null;
    if (curId && prevEntityIdRef.current !== null && prevEntityIdRef.current !== curId) {
      setActiveLeafKey(null);
      setActiveSlotIndex(0);
      setActiveVariationIndex(0);
    }
    prevEntityIdRef.current = curId;
  }, [selectedEntity?.blockId, setActiveLeafKey, setActiveSlotIndex, setActiveVariationIndex]);

  // Compute all available slots and their variations
  const slotOptions = useMemo<EntitySlotOption[]>(() => {
    if (!selectedEntity || !selectedEntity.aliasGroups) return [];
    return selectedEntity.aliasGroups.map((ag, sIdx) => {
      const variantGroups = groupLeavesByVariantSlot(ag.leaves ?? []);
      const variations: EntitySlotVariationOption[] = [];

      let vIdx = 0;
      for (const grp of variantGroups) {
        for (const leaf of grp.leaves) {
          variations.push({
            index: vIdx++,
            label: leaf.displayName || leaf.relativePath || `Variation ${vIdx}`,
            leaf,
            imageUrl: leaf.imageUrl,
            isGhost: leaf.status === 'GHOST',
          });
        }
      }

      if (variations.length === 0) {
        variations.push({
          index: 0,
          label: ag.faceSummary || ag.alias,
          leaf: {} as CatalogLeafDto,
          imageUrl: null,
          isGhost: false,
        });
      }

      return {
        index: sIdx,
        label: ag.geometryId || ag.alias,
        alias: ag.alias,
        geometryId: ag.geometryId,
        variations,
      };
    });
  }, [selectedEntity]);

  const activeSlot = slotOptions[activeSlotIndex] ?? slotOptions[0];
  const activeVariation = activeSlot?.variations?.[activeVariationIndex] ?? activeSlot?.variations?.[0];

  const primaryGeometryId = useMemo<string | null>(() => {
    if (activeSlot?.geometryId) return activeSlot.geometryId;
    if (!selectedEntity || !selectedEntity.aliasGroups) return null;
    if (activeLeaf?.geometryId) return activeLeaf.geometryId;
    for (const ag of selectedEntity.aliasGroups) {
      if (ag.geometryId) return ag.geometryId;
      const leafGeo = ag.leaves?.find((l) => l.geometryId)?.geometryId;
      if (leafGeo) return leafGeo;
    }
    return null;
  }, [selectedEntity, activeLeaf, activeSlot]);

  const isAttachableEntity = useMemo<boolean>(() => {
    if (!selectedEntity || !selectedEntity.aliasGroups) return false;
    return selectedEntity.aliasGroups.some((ag) => ag.isAttachable || ag.leaves?.some((l) => l.isAttachable));
  }, [selectedEntity]);

  const activeTextureUrl = activeVariation?.imageUrl ?? activeLeaf?.imageUrl;
  const activeIsGhost = activeVariation ? activeVariation.isGhost : (activeLeaf?.status === 'GHOST');

  const handleTileClick = useCallback((domEl: HTMLElement, leaf: CatalogLeafDto, key: string, targetType: 'card' | 'image' = 'image') => {
    setActiveLeafKey(`${leaf.alias}-${leaf.relativePath}`);
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
        aria-label="Entities List"
      >
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
                onClick={() => {
                  setSelectedEntityId(entity.blockId);
                  setIsListDrawerOpen(false);
                }}
              >
                <div className={styles.blockItemLeft}>
                  {isAttachable ? (
                    <Shield size={14} className={!isCustom ? styles.blockIconMuted : undefined} />
                  ) : (
                    <PawPrint size={14} className={!isCustom ? styles.blockIconMuted : undefined} />
                  )}
                  <span className={styles.blockItemName}>{entity.displayName || entity.blockId}</span>
                </div>
                <div className={styles.blockItemBadges}>
                  {isAttachable && (
                    <Badge variant="category-attachable" size="sm">attachable</Badge>
                  )}
                  {!isCustom && (
                    <Badge variant="fallback" size="sm" title="Inferred from vanilla entity definition">fallback</Badge>
                  )}
                  {entity.ghostCount > 0 && (
                    <Badge variant="ghost" size="counter">{entity.ghostCount}</Badge>
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
                  <Badge variant="category-attachable" size="sm">
                    Attachable / Armor
                  </Badge>
                )}
              </div>
              <span className={styles.blockIdSub}>
                {selectedEntity.blockId}
              </span>
            </div>
            <div className={styles.detailHeaderActions}>
              {selectedEntity.isUserDefined === false && (
                <Badge variant="fallback" size="sm" title="Using vanilla entity definition">
                  Vanilla Fallback
                </Badge>
              )}
              {selectedEntity.ghostCount > 0 && (
                <Badge variant="ghost" size="sm">
                  {selectedEntity.ghostCount} {selectedEntity.ghostCount === 1 ? 'ghost' : 'ghosts'}
                </Badge>
              )}
            </div>
          </div>

          {/* 3D Entity Model Viewer */}
          {!disable3DView && (
            <div className={styles.previewSection}>
              <Entity3DViewer
                entityId={selectedEntity.blockId}
                geometryId={primaryGeometryId}
                textureUrl={activeTextureUrl}
                isGhost={activeIsGhost}
                isAttachable={isAttachableEntity}
                slots={slotOptions}
                activeSlotIndex={activeSlotIndex}
                onSelectSlotIndex={(idx) => {
                  setActiveSlotIndex(idx);
                  setActiveVariationIndex(0);
                }}
                activeVariationIndex={activeVariationIndex}
                onSelectVariationIndex={setActiveVariationIndex}
              />
            </div>
          )}

          <EntityEntryTree
            entity={selectedEntity}
            onTileClick={handleTileClick}
          />

          {/* Slots & Texture Variations Hierarchy */}
          <div className={styles.hierarchySection} ref={menuRef}>
            {selectedEntity.aliasGroups?.map((ag, agIndex) => (
              <div key={`${selectedEntity.blockId}-${ag.alias}-${agIndex}`} className={styles.aliasGroupCard}>
                <div className={styles.aliasHeader}>
                  <PawPrint size={14} />
                  <span>Slot: {ag.alias}</span>
                  {selectedEntity.isUserDefined === false && (
                    <Badge variant="fallback" size="sm" title="Using vanilla entity definition">
                      Vanilla Fallback
                    </Badge>
                  )}
                </div>

                <div className={styles.faceRow}>
                  {ag.geometryId && (
                    <Badge variant="neutral" size="sm" icon={<ArrowRight size={10} />}>
                      Geo: {ag.geometryId}
                    </Badge>
                  )}

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
                          onTileClick={handleTileClick}
                          onDeleteTextureFile={handleDeleteTextureFile}
                          onDeleteTextureEntries={handleDeleteTextureEntries}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className={styles.emptySelection}>Select an entity to inspect</div>
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
            deleteTextureEntries(contextMenuTarget.alias.alias, contextMenuTarget.alias.category || 'entity');
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
