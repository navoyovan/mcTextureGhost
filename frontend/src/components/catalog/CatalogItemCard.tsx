// frontend/src/components/catalog/CatalogItemCard.tsx
import React, { useState } from 'react';
import {
  ChevronRight,
  Zap,
  PawPrint,
  ArrowRight,
  Box,
  Sword,
  Check,
  Plus,
  Minus,
} from 'lucide-react';
import {
  BlockGroupNodeDto,
  AliasGroupNodeDto,
  CatalogLeafDto,
  TileDragData,
} from '../../types/ipc';
import { FlipbookThumbnail } from '../common/FlipbookThumbnail';
import { Badge } from '../common/Badge';
import styles from './CatalogDrawer.module.css';

/**
 * Thumbnail component for a catalog leaf texture.
 * Defaults to '?' placeholder since vanilla reference textures are JSON declarations
 * rather than raw image files on disk, avoiding hundreds of 404 ERR_FILE_NOT_FOUND errors.
 */
export const LeafThumbnail: React.FC<{ leaf: CatalogLeafDto }> = ({ leaf }) => {
  const [hasError, setHasError] = useState(false);
  const src = leaf.imageUrl;
  // Vanilla reference textures and ghost textures do not exist as image files on disk yet.
  // Only attempt loading when status is not GHOST/VANILLA, not vanilla.local, and valid file exists.
  const canLoadImage =
    !hasError &&
    Boolean(src) &&
    leaf.status !== 'GHOST' &&
    leaf.status !== 'VANILLA' &&
    !src.includes('vanilla.local');

  const getFallbackStatusClass = (status: string) => {
    switch (status) {
      case 'OK':
        return styles.leafThumbFallbackOk;
      case 'GHOST':
        return styles.leafThumbFallbackGhost;
      case 'OVERRIDE':
        return styles.leafThumbFallbackOverride;
      case 'ORPHAN':
        return styles.leafThumbFallbackOrphan;
      case 'VANILLA':
      default:
        return styles.leafThumbFallbackVanilla;
    }
  };

  return (
    <div className={styles.leafThumbWrapper}>
      {canLoadImage ? (
        <FlipbookThumbnail
          src={src}
          alt={leaf.alias}
          className={styles.leafThumbImg}
          isFlipbook={leaf.isFlipbook}
          flipbook={leaf.flipbook}
          onError={() => setHasError(true)}
          loading="lazy"
        />
      ) : (
        <span className={`${styles.leafThumbFallback} ${getFallbackStatusClass(leaf.status)}`}>
          ?
        </span>
      )}
    </div>
  );
};

/**
 * Tier 3: Leaf Row Component
 */
export const CatalogLeafRow: React.FC<{
  leaf: CatalogLeafDto;
  blockDisplayName?: string;
}> = ({ leaf, blockDisplayName }) => {
  const isAdded = leaf.status !== 'VANILLA';

  const getCheckStatusClass = (status: string) => {
    switch (status) {
      case 'OK':
        return styles.leafCheckOk;
      case 'GHOST':
        return styles.leafCheckGhost;
      case 'OVERRIDE':
        return styles.leafCheckOverride;
      case 'ORPHAN':
        return styles.leafCheckOrphan;
      case 'VANILLA':
      default:
        return styles.leafCheckGhost;
    }
  };

  const isEntity = (leaf.category || '').toLowerCase() === 'entity';
  const blockVariantSuffix = leaf.blockVariantIndex && leaf.totalBlockVariants
    ? ` (block state ${leaf.blockVariantIndex}/${leaf.totalBlockVariants})`
    : '';

  const tooltipText = [
    (blockDisplayName || leaf.displayName || leaf.alias) + blockVariantSuffix,
    isEntity ? (leaf.geometryId ? `geometry: ${leaf.geometryId}` : `slot: ${leaf.alias}`) : `terrain textures: ${leaf.alias}`,
    `path: ${leaf.relativePath}`,
    leaf.isAttachable ? 'attachable: true' : '',
    leaf.subtitleCaption ? `info: ${leaf.subtitleCaption}` : '',
  ].filter(Boolean).join('\n');

  const handleDragStart = (e: React.DragEvent) => {
    if (!leaf.imageUrl && !leaf.fullPath) return;
    const dragData: TileDragData = {
      aliasKey: leaf.alias,
      fullPath: leaf.fullPath,
      relativePath: leaf.relativePath,
      imageUrl: leaf.imageUrl,
      displayName: blockDisplayName || leaf.displayName || leaf.alias,
      category: (leaf.category as string) || 'block',
      isGhost: false,
      sourceType: 'catalog',
    };
    e.dataTransfer.setData('application/x-mctg-tile', JSON.stringify(dragData));
    if (leaf.fullPath) {
      e.dataTransfer.setData('text/plain', leaf.fullPath);
    }
    e.dataTransfer.effectAllowed = 'copy';
  };

  const isDraggable = Boolean(leaf.imageUrl || leaf.fullPath);

  return (
    <div
      className={styles.leafRow}
      data-testid={`leaf-row-${leaf.alias}`}
      title={tooltipText}
      draggable={isDraggable}
      onDragStart={handleDragStart}
      style={{ cursor: isDraggable ? 'grab' : undefined }}
    >
      <div className={styles.leafLeft}>
        <LeafThumbnail leaf={leaf} />
        <div className={styles.leafMeta}>
          <div className={styles.leafPathRow}>
            <span className={styles.leafPathSub} title={leaf.relativePath}>
              {leaf.relativePath}
            </span>
            {leaf.subtitleCaption && (
              <span className={styles.leafSubtitle} title={leaf.subtitleCaption}>
                • {leaf.subtitleCaption}
              </span>
            )}
            {leaf.totalTextureVariants && leaf.totalTextureVariants > 1 && (
              <Badge variant="override" size="sm">
                {leaf.totalTextureVariants}v
              </Badge>
            )}
            {leaf.isFlipbook && (
              <Badge variant="anim" size="sm" title="Animated flipbook texture">
                ANIM
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className={styles.leafRight}>
        {isAdded && (
          <span
            className={`${styles.leafAddedCheck} ${getCheckStatusClass(leaf.status)}`}
            title={`Added (${leaf.status})`}
            aria-label={`Added (${leaf.status})`}
          >
            {leaf.status === 'GHOST' ? <Minus size={11} strokeWidth={2.5} /> : <Check size={11} strokeWidth={2.5} />}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Tier 2: Alias Group Component
 */
export const CatalogAliasGroup: React.FC<{
  aliasGroup: AliasGroupNodeDto;
  category: string;
  blockDisplayName?: string;
  parentBlockId?: string;
  onAdd: (id: string, category: string, alias?: string) => void;
  isAliasDeclaredInPack: (alias: string, category: string, parentBlockId?: string) => boolean;
  isOptimisticAdded?: boolean;
}> = ({ aliasGroup, category, blockDisplayName, parentBlockId, onAdd, isAliasDeclaredInPack, isOptimisticAdded }) => {
  const isEntity = (aliasGroup.category || category).toLowerCase() === 'entity';
  const slotName = aliasGroup.geometryId || aliasGroup.alias;
  const isAttachable = isEntity && (aliasGroup.isAttachable || aliasGroup.leaves?.some((l) => l.isAttachable));
  const hasNotAdded = aliasGroup.notAddedCount > 0 || Boolean(aliasGroup.leaves?.some((l) => l.status === 'VANILLA'));
  const allLeavesAreOrphan = Boolean(aliasGroup.leaves?.length && aliasGroup.leaves.every((l) => l.status === 'ORPHAN'));
  const isAdded = Boolean(isOptimisticAdded) || (isEntity
    ? false
    : !hasNotAdded && !allLeavesAreOrphan && isAliasDeclaredInPack(aliasGroup.alias, aliasGroup.category || category, parentBlockId));

  return (
    <div className={styles.aliasGroupCard} data-testid={`alias-group-${aliasGroup.alias}`}>
      <div className={styles.aliasGroupHeader}>
        <div className={styles.aliasHeaderLeft}>
          {isEntity ? (
            <PawPrint size={13} className={styles.aliasIcon} />
          ) : (
            <Box size={13} className={styles.aliasIcon} />
          )}
          <span className={styles.aliasNameText} title={slotName}>
            {isEntity ? `Slot: ${slotName}` : `Alias: ${aliasGroup.alias}`}
          </span>
          {isAttachable && (
            <Badge variant="category-attachable" size="sm" title="Attachable entity definition">
              Attachable
            </Badge>
          )}
          {!isEntity && aliasGroup.faceSummary && (
            <Badge
              variant="neutral"
              size="sm"
              icon={<ArrowRight size={9} />}
              title={`Face mapping: ${aliasGroup.faceSummary}`}
            >
              Face: {aliasGroup.faceSummary}
            </Badge>
          )}
          {aliasGroup.ghostCount > 0 && (
            <Badge variant="ghost" size="counter" title={`${aliasGroup.ghostCount} ghost textures`}>
              {aliasGroup.ghostCount}
            </Badge>
          )}
        </div>

        {!isEntity && (
          isAdded ? (
            <Badge variant="added" size="sm" icon={<Check size={11} />} title="This item is already in your pack">
              Added
            </Badge>
          ) : (
            <button
              type="button"
              className={styles.addAliasBtn}
              onClick={() => onAdd(aliasGroup.alias, aliasGroup.category || category, aliasGroup.alias)}
              title={`Add alias '${aliasGroup.alias}' to pack`}
              aria-label={`Add alias ${aliasGroup.alias}`}
            >
              <Plus size={11} />
              <span>Add Alias</span>
            </button>
          )
        )}
      </div>

      {aliasGroup.leaves && aliasGroup.leaves.length > 0 && (
        <div className={styles.leavesList}>
          {aliasGroup.leaves.map((leaf, index) => (
            <CatalogLeafRow
              key={`${leaf.relativePath || aliasGroup.alias}:${leaf.blockVariantIndex ?? ''}:${leaf.textureVariantIndex ?? ''}:${index}`}
              leaf={leaf}
              blockDisplayName={blockDisplayName}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export interface CatalogBlockGroupProps {
  block: BlockGroupNodeDto;
  blockKey: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAdd: (id: string, category: string, alias?: string) => void;
  isBlockUserDefined: (blockId: string) => boolean;
  isEntityInWorkspace: (entityId: string) => boolean;
  isAliasDeclaredInPack: (alias: string, category: string, parentBlockId?: string) => boolean;
  isOptimisticBlockAdded?: (blockId: string) => boolean;
  isOptimisticAliasAdded?: (alias: string) => boolean;
}

/**
 * Tier 1: Block/Item/Entity Group Component
 */
export const CatalogBlockGroup: React.FC<CatalogBlockGroupProps> = ({
  block,
  blockKey,
  isExpanded,
  onToggleExpand,
  onAdd,
  isBlockUserDefined,
  isEntityInWorkspace,
  isAliasDeclaredInPack,
  isOptimisticBlockAdded,
  isOptimisticAliasAdded,
}) => {
  const cat = (block.category || 'block').toLowerCase();
  const isItem = cat === 'item';
  const isEntity = cat === 'entity';

  const isAdded = Boolean(isOptimisticBlockAdded?.(block.blockId)) || (isEntity
    ? isEntityInWorkspace(block.blockId)
    : isItem
    ? isAliasDeclaredInPack(block.blockId, 'item')
    : isBlockUserDefined(block.blockId));

  return (
    <div className={styles.blockGroupCard} data-testid={`block-group-${block.blockId}`}>
      <div
        className={styles.blockGroupHeader}
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        aria-expanded={isExpanded}
      >
        <div className={styles.blockMetaLeft}>
          <button
            type="button"
            className={styles.chevronButton}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-label={isExpanded ? 'Collapse item' : 'Expand item'}
          >
            <ChevronRight size={14} className={`${styles.chevronIcon} ${isExpanded ? styles.chevronIconExpanded : ''}`} />
          </button>

          <div className={styles.blockTitleGroup}>
            <span className={styles.blockDisplayName} title={block.displayName}>
              {block.displayName}
            </span>
            <span className={styles.blockIdText} title={block.blockId}>
              {block.blockId === 'uncategorized' || block.blockId.includes(':')
                ? block.blockId
                : `minecraft:${block.blockId}`}
            </span>
          </div>
        </div>

        <div className={styles.blockBadgesAndActions}>
          <Badge
            variant={isEntity ? 'category-entity' : isItem ? 'category-item' : 'category-block'}
            size="sm"
            icon={isEntity ? <PawPrint size={11} /> : isItem ? <Sword size={11} /> : <Box size={11} />}
            title={block.category}
          >
            {isEntity ? 'ENTITY' : isItem ? 'ITEM' : 'BLOCK'}
          </Badge>

          {block.ghostCount > 0 && (
            <Badge variant="ghost" size="counter" title={`${block.ghostCount} ghost textures`}>
              {block.ghostCount}
            </Badge>
          )}

          {block.totalVariants > 0 && (
            <Badge variant="neutral" size="counter" title={`${block.totalVariants} total variants`}>
              {block.totalVariants}
            </Badge>
          )}

          {isAdded ? (
            <Badge variant="added" size="sm" icon={<Check size={11} />} title="This item is already in your pack">
              Added
            </Badge>
          ) : (
            <button
              type="button"
              className={styles.addBlockBtn}
              onClick={(e) => {
                e.stopPropagation();
                onAdd(block.blockId, block.category);
              }}
              title={`Add ${block.displayName} to pack`}
              aria-label={`Add ${block.displayName} to pack`}
            >
              <Zap size={11} />
              <span>Add to Pack</span>
            </button>
          )}
        </div>
      </div>

      <div className={`${styles.aliasGroupListWrapper} ${isExpanded ? styles.expanded : styles.collapsed}`}>
        <div className={styles.aliasGroupListInner}>
          {block.aliasGroups && block.aliasGroups.length > 0 && (
            <div className={styles.aliasGroupList}>
              {block.aliasGroups.map((aliasGroup, agIndex) => (
                <CatalogAliasGroup
                  key={`${blockKey}:${aliasGroup.alias || agIndex}`}
                  aliasGroup={aliasGroup}
                  category={block.category}
                  blockDisplayName={block.displayName}
                  parentBlockId={block.blockId}
                  onAdd={(id, cat, alias) => {
                    if (isEntity) {
                      onAdd(block.blockId, 'entity');
                    } else {
                      onAdd(id, cat, alias ?? id);
                    }
                  }}
                  isAliasDeclaredInPack={isAliasDeclaredInPack}
                  isOptimisticAdded={Boolean(aliasGroup.alias && isOptimisticAliasAdded?.(aliasGroup.alias))}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
