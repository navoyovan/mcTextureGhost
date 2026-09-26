// frontend/src/utils/pathUtils.ts

/**
 * Normalizes any Windows or POSIX path to use forward slashes.
 * Optionally converts to lowercase for case-insensitive Minecraft path comparisons.
 */
export function normalizePath(path: string, lower = false): string {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/');
  return lower ? normalized.toLowerCase() : normalized;
}

/**
 * Extracts the file name (including extension) from a path.
 */
export function getFileName(path: string): string {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop() || '';
}

/**
 * Extracts the file stem (name without extension) from a path.
 */
export function getFileStem(path: string): string {
  const fileName = getFileName(path);
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
}

/**
 * Checks whether a path ends with any of the specified extensions (case-insensitive).
 */
export function hasExtension(path: string, ...extensions: string[]): boolean {
  if (!path) return false;
  const lowerPath = path.toLowerCase();
  return extensions.some((ext) => {
    const formattedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return lowerPath.endsWith(formattedExt);
  });
}
