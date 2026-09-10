// frontend/src/store/packStore.ts
import { useSyncExternalStore } from 'react';
import {
  PackStatePayload,
  TextureAliasDto,
  BlockGroupNodeDto,
  PackFolderItemDto,
  RecentPackItemDto,
  PackStatsDto,
  ManifestModelDto,
  ScanProgressPayload,
  AppConfigPayload,
} from '../types/ipc';

export interface PackStoreState {
  // Domain Pack State
  packRoot: string | null;
  packName: string | null;
  hasManifest: boolean;
  hasPackIcon: boolean;
  packIconUrl: string | null;
  manifest: ManifestModelDto | null;
  aliases: TextureAliasDto[];
  blockWorkspaceTree: BlockGroupNodeDto[];
  packFolders: PackFolderItemDto[];
  recentPacks: RecentPackItemDto[];
  stats: PackStatsDto;

  // Scan State
  isScanning: boolean;
  scanProgress: ScanProgressPayload | null;

  // UI & Filter State
  activeTab: 'all' | 'blocks' | 'items';
  searchQuery: string;
  statusFilter: 'all' | 'ghosts' | 'added' | 'orphans';
  activeView: 'grid' | 'workspace';
  selectedBlockId: string | null;
  selectedAliasKey: string | null;
  selectedFolderPath: string | null;
  isCatalogOpen: boolean;
  catalogTree: BlockGroupNodeDto[] | null;
  /** Tile thumbnail size in px: 80 | 120 | 160 | 200 */
  tileZoom: number;

  // App & Theme Config
  tintOpacity: number;
  tintBrightness: number;
  tintHex: string;
  debugMode: boolean;
  windowTitle: string;
}

export interface PackStoreActions {
  setPackState: (dto: Partial<PackStatePayload>) => void;
  resetPackState: () => void;
  updateTexture: (aliasKey: string, newStatus: string, fullPath: string, imageUrl?: string | null) => void;
  setScanProgress: (progress: ScanProgressPayload | null) => void;
  setActiveTab: (tab: 'all' | 'blocks' | 'items') => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: 'all' | 'ghosts' | 'added' | 'orphans') => void;
  setActiveView: (view: 'grid' | 'workspace') => void;
  setSelectedBlockId: (id: string | null) => void;
  setSelectedAliasKey: (key: string | null) => void;
  setSelectedFolderPath: (path: string | null) => void;
  setIsCatalogOpen: (open: boolean) => void;
  toggleCatalog: () => void;
  setCatalogTree: (tree: BlockGroupNodeDto[] | null) => void;
  setTileZoom: (zoom: number) => void;
  setAppConfig: (config: Partial<AppConfigPayload>) => void;
}

export type PackStore = PackStoreState & PackStoreActions;

const initialStats: PackStatsDto = {
  totalCount: 0,
  okCount: 0,
  ghostCount: 0,
  orphanCount: 0,
  blocksCount: 0,
  itemsCount: 0,
  blocksGhostCount: 0,
  itemsGhostCount: 0,
  total: 0,
  done: 0,
  ghosts: 0,
  orphans: 0,
};

const initialState: PackStoreState = {
  packRoot: null,
  packName: null,
  hasManifest: false,
  hasPackIcon: false,
  packIconUrl: null,
  manifest: null,
  aliases: [],
  blockWorkspaceTree: [],
  packFolders: [],
  recentPacks: [],
  stats: initialStats,

  isScanning: false,
  scanProgress: null,

  activeTab: 'all',
  searchQuery: '',
  statusFilter: 'all',
  activeView: 'grid',
  selectedBlockId: null,
  selectedAliasKey: null,
  selectedFolderPath: null,
  isCatalogOpen: false,
  catalogTree: null,
  tileZoom: 120,

  tintOpacity: 85,
  tintBrightness: 30,
  tintHex: '#121214',
  debugMode: false,
  windowTitle: 'mcTextureGhost',
};

function computeStats(aliases: TextureAliasDto[]): PackStatsDto {
  const total = aliases.length;
  const done = aliases.filter((a) => a.status === 'OK').length;
  const ghosts = aliases.filter((a) => a.status === 'GHOST').length;
  const orphans = aliases.filter((a) => a.status === 'ORPHAN').length;
  const blocks = aliases.filter((a) => a.category === 'block');
  const items = aliases.filter((a) => a.category === 'item');

  return {
    totalCount: total,
    okCount: done,
    ghostCount: ghosts,
    orphanCount: orphans,
    blocksCount: blocks.length,
    itemsCount: items.length,
    blocksGhostCount: blocks.filter((a) => a.status === 'GHOST').length,
    itemsGhostCount: items.filter((a) => a.status === 'GHOST').length,
    total,
    done,
    ghosts,
    orphans,
  };
}

// Internal store state
let currentState: PackStoreState = { ...initialState };
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export const packStoreActions: PackStoreActions = {
  setPackState(dto: Partial<PackStatePayload>): void {
    const rawAliases = dto.aliases || currentState.aliases || [];
    const sanitizedAliases = Array.isArray(rawAliases) ? rawAliases : [];
    const stats = dto.stats || computeStats(sanitizedAliases);

    currentState = {
      ...currentState,
      packRoot: dto.packRoot ?? currentState.packRoot,
      packName: dto.packName ?? currentState.packName ?? (dto.packRoot ? 'Unnamed Pack' : null),
      hasManifest: dto.hasManifest ?? (dto.manifest !== null && dto.manifest !== undefined),
      hasPackIcon: dto.hasPackIcon ?? Boolean(dto.packIconUrl),
      packIconUrl: dto.packIconUrl ?? currentState.packIconUrl,
      manifest: dto.manifest ?? currentState.manifest,
      aliases: sanitizedAliases,
      blockWorkspaceTree: Array.isArray(dto.blockWorkspaceTree) ? dto.blockWorkspaceTree : currentState.blockWorkspaceTree,
      packFolders: Array.isArray(dto.packFolders) ? dto.packFolders : currentState.packFolders,
      recentPacks: Array.isArray(dto.recentPacks) ? dto.recentPacks : currentState.recentPacks,
      catalogTree: dto.catalogTree !== undefined ? dto.catalogTree : currentState.catalogTree,
      selectedFolderPath: dto.packRoot !== undefined && dto.packRoot !== currentState.packRoot ? null : currentState.selectedFolderPath,
      stats,
      isScanning: false,
    };
    notify();
  },

  resetPackState(): void {
    currentState = {
      ...currentState,
      ...initialState,
      // Retain app config & recent packs
      recentPacks: currentState.recentPacks,
      tintOpacity: currentState.tintOpacity,
      tintBrightness: currentState.tintBrightness,
      tintHex: currentState.tintHex,
      debugMode: currentState.debugMode,
      windowTitle: currentState.windowTitle,
    };
    notify();
  },

  updateTexture(aliasKey: string, newStatus: string, fullPath: string, imageUrl?: string | null): void {
    const updatedAliases = currentState.aliases.map((alias) => {
      const isMatch = alias.alias === aliasKey || alias.key === aliasKey || alias.fullPath === fullPath;
      if (!isMatch) return alias;

      return {
        ...alias,
        status: newStatus as any,
        fullPath: fullPath || alias.fullPath,
        imageUrl: imageUrl || alias.imageUrl,
        exists: newStatus === 'OK' || newStatus === 'OVERRIDE',
      };
    });

    currentState = {
      ...currentState,
      aliases: updatedAliases,
      stats: computeStats(updatedAliases),
    };
    notify();
  },

  setScanProgress(progress: ScanProgressPayload | null): void {
    currentState = {
      ...currentState,
      isScanning: progress !== null,
      scanProgress: progress,
    };
    notify();
  },

  setActiveTab(tab: 'all' | 'blocks' | 'items'): void {
    currentState = { ...currentState, activeTab: tab };
    notify();
  },

  setSearchQuery(query: string): void {
    currentState = { ...currentState, searchQuery: query };
    notify();
  },

  setStatusFilter(filter: 'all' | 'ghosts' | 'added' | 'orphans'): void {
    currentState = { ...currentState, statusFilter: filter };
    notify();
  },

  setActiveView(view: 'grid' | 'workspace'): void {
    currentState = { ...currentState, activeView: view };
    notify();
  },

  setSelectedBlockId(id: string | null): void {
    currentState = { ...currentState, selectedBlockId: id };
    notify();
  },

  setSelectedAliasKey(key: string | null): void {
    currentState = { ...currentState, selectedAliasKey: key };
    notify();
  },

  setSelectedFolderPath(path: string | null): void {
    currentState = { ...currentState, selectedFolderPath: path };
    notify();
  },

  setIsCatalogOpen(open: boolean): void {
    currentState = { ...currentState, isCatalogOpen: open };
    notify();
  },

  toggleCatalog(): void {
    currentState = { ...currentState, isCatalogOpen: !currentState.isCatalogOpen };
    notify();
  },

  setCatalogTree(tree: BlockGroupNodeDto[] | null): void {
    currentState = { ...currentState, catalogTree: tree };
    notify();
  },

  setTileZoom(zoom: number): void {
    const clamped = Math.max(80, Math.min(200, zoom));
    currentState = { ...currentState, tileZoom: clamped };
    notify();
  },

  setAppConfig(config: Partial<AppConfigPayload>): void {
    currentState = {
      ...currentState,
      tintOpacity: config.tintOpacity ?? currentState.tintOpacity,
      tintBrightness: config.tintBrightness ?? currentState.tintBrightness,
      tintHex: config.tintHex ?? currentState.tintHex,
      debugMode: config.debugMode ?? currentState.debugMode,
      windowTitle: config.windowTitle ?? currentState.windowTitle,
    };
    notify();
  },
};

/**
 * Determines whether a texture relative path matches a folder filter path.
 * Ported directly from MainViewModel.cs:PathMatchesFolder.
 */
export function pathMatchesFolder(itemRelPath: string | null | undefined, folderRelPath: string | null | undefined): boolean {
  if (!itemRelPath || !folderRelPath) return false;
  const itemNorm = itemRelPath.replace(/\\/g, '/').toLowerCase();
  const folderNorm = folderRelPath.replace(/\\/g, '/').toLowerCase();
  const prefixNorm = folderNorm.endsWith('/') ? folderNorm : `${folderNorm}/`;

  if (itemNorm === folderNorm || itemNorm.startsWith(prefixNorm)) {
    return true;
  }

  // Handle variations between with / without "textures/" prefix
  if (folderNorm.startsWith('textures/')) {
    const folderWithoutTextures = folderNorm.substring(9);
    const prefixWithoutTextures = folderWithoutTextures.endsWith('/') ? folderWithoutTextures : `${folderWithoutTextures}/`;
    if (itemNorm === folderWithoutTextures || itemNorm.startsWith(prefixWithoutTextures)) {
      return true;
    }
  } else if (itemNorm.startsWith('textures/')) {
    const itemWithoutTextures = itemNorm.substring(9);
    if (itemWithoutTextures === folderNorm || itemWithoutTextures.startsWith(prefixNorm)) {
      return true;
    }
  }

  return false;
}

/**
 * Raw store accessors.
 */
export const rawPackStore = {
  getState: (): PackStore => ({ ...currentState, ...packStoreActions }),
  setState: (updater: (prev: PackStoreState) => Partial<PackStoreState>): void => {
    currentState = { ...currentState, ...updater(currentState) };
    notify();
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * Custom React hook for selecting reactive state from packStore.
 * Compatible with Zustand selector ergonomics with zero external dependencies.
 *
 * Example:
 * const packRoot = usePackStore(s => s.packRoot);
 * const setPackState = usePackStore(s => s.setPackState);
 */
export function usePackStore<T = PackStore>(selector?: (state: PackStore) => T): T {
  const getSnapshot = () => {
    const s = { ...currentState, ...packStoreActions };
    return selector ? selector(s) : (s as unknown as T);
  };

  return useSyncExternalStore(
    rawPackStore.subscribe,
    getSnapshot,
    getSnapshot
  );
}
