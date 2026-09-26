// frontend/src/utils/packFileUtils.ts
import { PackFolderItemDto } from '../types/ipc';
import { normalizePath } from './pathUtils';

/**
 * Recursively checks if any folder item matches a target path predicate or exact suffix.
 */
export function hasPackFile(
  folders: PackFolderItemDto[] | null | undefined,
  matcher: (normalizedPath: string, item: PackFolderItemDto) => boolean
): boolean {
  if (!folders || !Array.isArray(folders)) return false;

  for (const item of folders) {
    const p = normalizePath(item.relativePath || item.name || '', true);
    if (!item.isMissing && matcher(p, item)) {
      return true;
    }
    if (item.subFolders && item.subFolders.length > 0) {
      if (hasPackFile(item.subFolders, matcher)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks whether terrain_texture.json exists in the pack folders tree and is not marked missing.
 */
export function hasTerrainTextureJson(folders: PackFolderItemDto[] | null | undefined): boolean {
  return hasPackFile(folders, (p) =>
    p === 'textures/terrain_texture.json' ||
    p.endsWith('/terrain_texture.json') ||
    p === 'terrain_texture.json'
  );
}

/**
 * Checks whether item_texture.json exists in the pack folders tree and is not marked missing.
 */
export function hasItemTextureJson(folders: PackFolderItemDto[] | null | undefined): boolean {
  return hasPackFile(folders, (p) =>
    p === 'textures/item_texture.json' ||
    p.endsWith('/item_texture.json') ||
    p === 'item_texture.json'
  );
}

/**
 * Checks whether blocks.json exists in the pack folders tree and is not marked missing.
 */
export function hasBlocksJson(folders: PackFolderItemDto[] | null | undefined): boolean {
  return hasPackFile(folders, (p) =>
    p === 'blocks.json' || p.endsWith('/blocks.json')
  );
}
