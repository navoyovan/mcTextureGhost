// frontend/src/utils/leafTransforms.ts
import { CatalogLeafDto, TextureAliasDto } from '../types/ipc';

export interface VariantTileGroup {
  key: string;
  alias: string;
  leaves: CatalogLeafDto[];
}

/**
 * Converts a CatalogLeafDto into a TextureAliasDto for tile card rendering and context menus.
 */
export function leafToAliasDto(
  leaf: CatalogLeafDto,
  defaultCategory: 'block' | 'item' | 'entity' = 'block'
): TextureAliasDto {
  return {
    alias: leaf.alias,
    displayName: leaf.displayName,
    relativePath: leaf.relativePath,
    fullPath: leaf.fullPath,
    category: (leaf.category as any) || defaultCategory,
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

/**
 * Group a flat leaf array by alias + variant slot.
 * Leaves in the same group are texture variations of the same state slot.
 */
export function groupLeavesByVariantSlot(leaves: CatalogLeafDto[]): VariantTileGroup[] {
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
