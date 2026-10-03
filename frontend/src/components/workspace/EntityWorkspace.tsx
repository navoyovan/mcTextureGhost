import React, { useState, useMemo, useCallback, useRef, useEffect, startTransition } from 'react';
import { PawPrint, ArrowRight, Shield, MoreVertical, Trash2 } from 'lucide-react';
import { usePackStore, packStoreActions } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { BlockGroupNodeDto, CatalogLeafDto, TextureAliasDto, OpenWithAppDto } from '../../types/ipc';
import { Entity3DViewer, EntitySlotOption, EntitySlotVariationOption } from './Entity3DViewer';
import { EntityEntryTree } from './EntityEntryTree';
import { WorkspaceTileCard } from './WorkspaceTileCard';
import { WorkspaceShell } from './WorkspaceShell';
import { TileHoverMorphPortal, TileHoverMorphTarget } from '../grid/TileHoverMorphPortal';
import { TextureContextMenu } from '../common/TextureContextMenu';
import { WorkspaceSkeleton } from './WorkspaceSkeleton';
import { Badge } from '../common/Badge';
import { leafToAliasDto, groupLeavesByVariantSlot } from '../../utils/leafTransforms';
import styles from './BlockWorkspace.module.css';

interface EntitySidebarItemProps {
  entityId: string;
  displayName: string;
  isCustom: boolean;
  isActive: boolean;
  isAttachable: boolean;
  ghostCount: number;
  onSelect: (id: string) => void;
}

const EntitySidebarItem: React.FC<EntitySidebarItemProps> = React.memo(({
  entityId,
  displayName,
  isCustom,
  isActive,
  isAttachable,
  ghostCount,
  onSelect,
}) => {
  return (
    <button
      data-entity-id={entityId}
      type="button"
      className={`${styles.blockItem} ${isActive ? styles.blockItemActive : ''} ${!isCustom ? styles.blockItemVanilla : ''}`}
      onClick={() => {
        if (!isActive) {
          onSelect(entityId);
        }
      }}
    >
      <div className={styles.blockItemLeft}>
        {isAttachable ? (
          <Shield size={14} className={!isCustom ? styles.blockIconMuted : undefined} />
        ) : (
          <PawPrint size={14} className={!isCustom ? styles.blockIconMuted : undefined} />
        )}
        <span className={styles.blockItemName}>{displayName || entityId}</span>
      </div>
      <div className={styles.blockItemBadges}>
        {isAttachable && (
          <Badge variant="category-attachable" size="sm">attachable</Badge>
        )}
        {!isCustom && (
          <Badge variant="fallback" size="sm" title="Inferred from vanilla entity definition">fallback</Badge>
        )}
        {ghostCount > 0 && (
          <Badge variant="ghost" size="counter">{ghostCount}</Badge>
        )}
      </div>
    </button>
  );
});

export const EntityWorkspace: React.FC = () => {
  const entityWorkspaceTree = usePackStore((s) => s.entityWorkspaceTree);
  const isScanning = usePackStore((s) => s.isScanning);
  const isWorkspaceLoading = usePackStore((s) => s.isWorkspaceLoading);
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
  const setIsListDrawerOpen = usePackStore((s) => s.setIsWorkspaceDrawerOpen);
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

  const lastSelectedEntityRef = useRef<BlockGroupNodeDto | null>(null);
  const lastSelectedIndexRef = useRef<number>(-1);
  const prevSelectedEntityIdRef = useRef<string | null>(null);

  // Filter entity list by toolbar searchQuery and activeFilters/statusFilter
  const filteredEntityWorkspaceTree = useMemo(() => {
    if (!entityWorkspaceTree) return [];
    const query = searchQuery.trim().toLowerCase();

    const effectiveFilters = activeFilters.length > 0
      ? activeFilters
      : (statusFilter !== 'all' ? [statusFilter as any] : []);

    const filtered = entityWorkspaceTree.filter((entity) => {
      const allLeaves = entity.aliasGroups?.flatMap((ag) => ag.leaves ?? []) ?? [];
      const isCurrentlySelected = Boolean(selectedEntityId && entity.blockId === selectedEntityId);

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
          if (!statusMatch && !isCurrentlySelected) return false;
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
          if (!featureMatch && !isCurrentlySelected) return false;
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

    const norm = (id?: string | null) => (id || '').toLowerCase().replace(/^minecraft:/, '');

    // Reset or update selected index tracking when switching entities
    if (selectedEntityId !== prevSelectedEntityIdRef.current) {
      prevSelectedEntityIdRef.current = selectedEntityId ?? null;
      lastSelectedIndexRef.current = -1;
    }

    // If currently selected entity is no longer in filtered list or shifted position (e.g. live update),
    // retain it in the list at its existing pinned index so the user remains on the entity until manually navigating away
    let resultList = filtered;
    if (selectedEntityId) {
      const normSelected = norm(selectedEntityId);
      const existingIdx = resultList.findIndex((e) => norm(e.blockId) === normSelected);

      // If this entity was not yet pinned, record its current index
      if (lastSelectedIndexRef.current < 0 && existingIdx !== -1) {
        lastSelectedIndexRef.current = existingIdx;
      }

      if (existingIdx !== -1) {
        // If pack live update re-ordered this entity, pull it out and re-pin it at its established index
        if (lastSelectedIndexRef.current >= 0 && existingIdx !== lastSelectedIndexRef.current) {
          const item = resultList[existingIdx];
          if (item) {
            const withoutItem = [...resultList.slice(0, existingIdx), ...resultList.slice(existingIdx + 1)];
            const targetIdx = Math.min(Math.max(0, lastSelectedIndexRef.current), withoutItem.length);
            resultList = [
              ...withoutItem.slice(0, targetIdx),
              item,
              ...withoutItem.slice(targetIdx),
            ];
          }
        }
      } else {
        const fullMatch = entityWorkspaceTree.find((e) => norm(e.blockId) === normSelected);
        const snapshotMatch =
          lastSelectedEntityRef.current && norm(lastSelectedEntityRef.current.blockId) === normSelected
            ? lastSelectedEntityRef.current
            : null;
        const fallbackItem = fullMatch || snapshotMatch;
        if (fallbackItem) {
          let targetIdx = lastSelectedIndexRef.current;
          if (targetIdx < 0 || targetIdx > resultList.length) {
            const targetName = (fallbackItem.displayName || fallbackItem.blockId || '').toLowerCase();
            targetIdx = resultList.findIndex(
              (e) => (e.displayName || e.blockId || '').toLowerCase().localeCompare(targetName) > 0
            );
            if (targetIdx === -1) {
              targetIdx = resultList.length;
            }
            lastSelectedIndexRef.current = targetIdx;
          }
          targetIdx = Math.min(Math.max(0, targetIdx), resultList.length);
          resultList = [
            ...resultList.slice(0, targetIdx),
            fallbackItem,
            ...resultList.slice(targetIdx),
          ];
        }
      }
    }

    // Deduplicate by blockId to ensure uniqueness in tree and avoid duplicate React keys
    const seen = new Map<string, BlockGroupNodeDto>();
    for (const e of resultList) {
      const key = norm(e.blockId);
      if (!seen.has(key)) {
        seen.set(key, e);
      } else {
        const existing = seen.get(key)!;
        if (e.isUserDefined !== false && existing.isUserDefined === false) {
          seen.set(key, e);
        } else if ((e.ghostCount || 0) > (existing.ghostCount || 0)) {
          seen.set(key, e);
        }
      }
    }

    return Array.from(seen.values());
  }, [entityWorkspaceTree, searchQuery, statusFilter, activeFilters, selectedEntityId]);

  // Keep selectedEntity pointed to a valid entity: first check filtered list, then full tree if currently selected, then fallback to last snapshot, then fallback to first filtered
  const selectedEntity = useMemo<BlockGroupNodeDto | null>(() => {
    if (selectedEntityId) {
      const normSelected = (selectedEntityId || '').toLowerCase().replace(/^minecraft:/, '');
      const foundInFiltered = filteredEntityWorkspaceTree.find((e) => (e.blockId || '').toLowerCase().replace(/^minecraft:/, '') === normSelected);
      if (foundInFiltered) {
        lastSelectedEntityRef.current = foundInFiltered;
        return foundInFiltered;
      }
      const foundInFull = entityWorkspaceTree?.find((e) => (e.blockId || '').toLowerCase().replace(/^minecraft:/, '') === normSelected);
      if (foundInFull) {
        lastSelectedEntityRef.current = foundInFull;
        return foundInFull;
      }
      if (lastSelectedEntityRef.current && (lastSelectedEntityRef.current.blockId || '').toLowerCase().replace(/^minecraft:/, '') === normSelected) {
        return lastSelectedEntityRef.current;
      }
    }
    const fallback = filteredEntityWorkspaceTree[0] ?? null;
    lastSelectedEntityRef.current = fallback;
    return fallback;
  }, [filteredEntityWorkspaceTree, entityWorkspaceTree, selectedEntityId]);

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
        startTransition(() => {
          setSelectedEntityId(nextEntity.blockId);
        });
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
          const isPackUrl = leaf.imageUrl?.startsWith('https://pack.local');
          const isPackFilePresent = leaf.status === 'OK' || leaf.status === 'OVERRIDE' || !!leaf.fullPath;
          const safeImageUrl = (!isPackUrl || isPackFilePresent) ? leaf.imageUrl : null;
          variations.push({
            index: vIdx++,
            label: leaf.displayName || leaf.relativePath || `Variation ${vIdx}`,
            leaf,
            imageUrl: safeImageUrl,
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
      alias: leafToAliasDto(leaf, 'entity'),
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
    packStoreActions.optimisticDeleteTexture(path, alias);
    deleteTextureFile(path, alias);
  }, [deleteTextureFile]);

  const handleDeleteTextureEntries = useCallback((alias: string, relativePath?: string | null) => {
    packStoreActions.optimisticDeleteEntries(alias, 'entity', relativePath ?? undefined);
    deleteTextureEntries(alias, 'entity', relativePath ?? undefined);
  }, [deleteTextureEntries]);

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMoreMenuOpen(false);
  }, [selectedEntityId]);

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMoreMenuOpen]);

  const handleDeleteEntityDefinition = useCallback(() => {
    if (!selectedEntity) return;
    packStoreActions.optimisticDeleteEntityEntry(selectedEntity.blockId);
    deleteTextureEntries(selectedEntity.blockId, 'entity');
    setIsMoreMenuOpen(false);
  }, [selectedEntity, deleteTextureEntries]);

  const handleSelectEntity = useCallback((id: string) => {
    startTransition(() => {
      setSelectedEntityId(id);
    });
    setIsListDrawerOpen(false);
  }, [setSelectedEntityId, setIsListDrawerOpen]);

  const selectedEntityDisplayName = selectedEntity?.displayName || selectedEntity?.blockId || '';

  if (isWorkspaceLoading || (isScanning && (!entityWorkspaceTree || entityWorkspaceTree.length === 0))) {
    return <WorkspaceSkeleton isEntity />;
  }

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
    <>
      <WorkspaceShell
        listAriaLabel="Entities List"
        listHeader={
          <>
            Pack Entities ({filteredEntityWorkspaceTree.length}
            {filteredEntityWorkspaceTree.length !== entityWorkspaceTree.length ? ` / ${entityWorkspaceTree.length}` : ''})
          </>
        }
        sidebarContent={
          filteredEntityWorkspaceTree.length > 0 ? (
            filteredEntityWorkspaceTree.map((entity) => (
              <EntitySidebarItem
                key={entity.blockId}
                entityId={entity.blockId}
                displayName={entity.displayName || entity.blockId}
                isCustom={entity.isUserDefined !== false}
                isActive={selectedEntity?.blockId === entity.blockId}
                isAttachable={Boolean(entity.aliasGroups?.some((ag) => ag.isAttachable || ag.leaves?.some((l) => l.isAttachable)))}
                ghostCount={entity.ghostCount || 0}
                onSelect={handleSelectEntity}
              />
            ))
          ) : (
            <div className={styles.noMatches}>
              <span>No entities match your search or filter</span>
            </div>
          )
        }
        hasSelection={Boolean(selectedEntity)}
        emptySelectionText="Select an entity to inspect"
        detailAriaLabel="Entity Hierarchy & 3D Preview"
        title={selectedEntity?.displayName}
        hasLangName={selectedEntity?.hasLangName}
        titleBadge={
          selectedEntity && (
            <>
              {isAttachableEntity && (
                <Badge variant="category-attachable" size="sm">
                  Attachable / Armor
                </Badge>
              )}
              {selectedEntity.isUserDefined === false && (
                <Badge variant="fallback" size="sm" title="Using vanilla entity definition">
                  Fallback
                </Badge>
              )}
              {selectedEntity.ghostCount > 0 && (
                <Badge variant="ghost" size="sm">
                  {selectedEntity.ghostCount} {selectedEntity.ghostCount === 1 ? 'ghost' : 'ghosts'}
                </Badge>
              )}
            </>
          )
        }
        subtitle={selectedEntity?.blockId}
        headerActions={
          selectedEntity && (
            <div className={styles.moreMenuWrapper} ref={moreMenuRef}>
              <button
                type="button"
                className={styles.moreBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMoreMenuOpen((v) => !v);
                }}
                title="Entity options"
                aria-label="Entity options"
              >
                <MoreVertical size={16} />
              </button>
              {isMoreMenuOpen && (
                <div className={styles.moreDropdown}>
                  <button
                    type="button"
                    className={styles.moreDropdownItemDanger}
                    disabled={selectedEntity.isUserDefined === false}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteEntityDefinition();
                    }}
                    title={
                      selectedEntity.isUserDefined === false
                        ? "This entity is using vanilla fallback and not declared in pack entity definitions"
                        : `Delete "${selectedEntity.blockId}" definition JSON from pack`
                    }
                  >
                    <Trash2 size={13} />
                    <span>Delete entity definition JSON</span>
                  </button>
                </div>
              )}
            </div>
          )
        }
        show3DPreview={Boolean(selectedEntity)}
        previewTitle="3D Preview"
        previewContent={
          selectedEntity ? (
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
          ) : null
        }
      >
        {selectedEntity && (
          <EntityEntryTree
            entity={selectedEntity}
            onTileClick={handleTileClick}
          />
        )}

        {/* Slots & Texture Variations Hierarchy */}
        {selectedEntity && (
          <div className={styles.hierarchySection} ref={menuRef}>
            {selectedEntity.aliasGroups?.map((ag, agIndex) => {
              const isVanillaFallback = selectedEntity.isUserDefined === false || ag.isUserDefined === false;
              return (
                <div
                  key={`${selectedEntity.blockId}-${ag.alias}-${agIndex}`}
                  className={`${styles.aliasGroupCard} ${isVanillaFallback ? styles.aliasGroupCardFallback : ''}`}
                >
                  <div className={styles.aliasHeader}>
                    <PawPrint size={14} />
                    <span>Slot: {ag.alias}</span>
                    {isVanillaFallback && (
                      <Badge variant="fallback" size="sm" title="Using vanilla entity definition">
                        Fallback
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
                          onDeleteTextureEntries={!isVanillaFallback ? handleDeleteTextureEntries : undefined}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </WorkspaceShell>

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
          onDeleteEntries={
            (contextMenuTarget.alias as any).isUserDefined !== false
              ? () => {
                  deleteTextureEntries(contextMenuTarget.alias.alias, contextMenuTarget.alias.category || 'entity');
                }
              : undefined
          }
          onEditMers={() => {
            if (contextMenuTarget.alias.mersFullPath) {
              editTexture(contextMenuTarget.alias.alias, contextMenuTarget.alias.mersFullPath, false);
            }
          }}
        />
      )}
    </>
  );
};
