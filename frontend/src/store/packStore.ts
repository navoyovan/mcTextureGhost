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
  ReferencePackProfile,
  OpenWithAppDto,
} from '../types/ipc';
import {
  computeStats,
  applyOptimisticDeleteTexture,
  applyOptimisticDeleteEntries,
  applyOptimisticDeleteVariation,
  applyOptimisticAddVariation,
  applyOptimisticAddVanillaEntry,
} from './mutations/workspaceTreeMutations';

export type TextureFilterKey = 'ghosts' | 'orphans' | 'added' | 'mers' | 'atlas' | 'flipbook' | 'variations' | 'blockstates' | 'variation';

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
  entityWorkspaceTree: BlockGroupNodeDto[];
  packFolders: PackFolderItemDto[];
  recentPacks: RecentPackItemDto[];
  stats: PackStatsDto;

  // Scan & Domain Loading State
  isScanning: boolean;
  isGridLoading: boolean;
  isWorkspaceLoading: boolean;
  isCatalogLoading: boolean;
  scanProgress: ScanProgressPayload | null;

  // UI & Filter State
  activeTab: 'all' | 'blocks' | 'items' | 'entities';
  searchQuery: string;
  statusFilter: 'all' | 'ghosts' | 'added' | 'orphans' | 'mers' | 'atlas' | 'flipbook' | 'variations' | 'blockstates' | 'variation';
  activeFilters: TextureFilterKey[];
  activeView: 'grid' | 'workspace' | 'entity';
  selectedBlockId: string | null;
  selectedAliasKey: string | null;
  selectedFolderPath: string | null;
  isCatalogOpen: boolean;
  catalogTree: BlockGroupNodeDto[] | null;
  referencePacks: ReferencePackProfile[];
  activeReferenceId: string;
  hasVanillaAssets: boolean;
  simulateNoAssets: boolean;
  /** When true, Block3DViewer and Entity3DViewer are not mounted (saves GPU/CPU power) */
  disable3DView: boolean;
  /** Tile thumbnail size in px: 80 | 120 | 160 | 200 */
  tileZoom: number;
  /** Live stats for the shared-toolbar JSON viewer (matches, line count, formatted size) */
  jsonViewerInfo: { lineCount: number; sizeLabel: string; matchCount: number | null } | null;
  /** Whether the Manifest raw JSON sidebar/drawer is open */
  isManifestJsonDrawerOpen: boolean;
  /** Whether the workspace (Blocks / Entities) list drawer is open on compact viewports */
  isWorkspaceDrawerOpen: boolean;
  /** Whether the whole left sidebar is collapsed */
  isSidebarCollapsed: boolean;

  /** Pack-close transition guard: blocks input while Chromium reloads + IPC re-inits. Survives reload via sessionStorage. */
  isPackClosing: boolean;

  /** Persisted Block Workspace state (restored when navigating back from grid/json) */
  blockWorkspaceSelectedId: string | null;
  blockWorkspaceActiveStateIndex: number;
  blockWorkspaceActiveVariationIndex: number;

  /** Persisted Entity Workspace state */
  entityWorkspaceSelectedId: string | null;
  entityWorkspaceActiveLeafKey: string | null;
  entityWorkspaceActiveSlotIndex: number;
  entityWorkspaceActiveVariationIndex: number;

  // App & Theme Config
  tintOpacity: number;
  tintBrightness: number;
  tintHex: string;
  debugMode: boolean;
  windowTitle: string;
  openWithApps: OpenWithAppDto[];
  jsonOpenWithApps: OpenWithAppDto[];
}

export interface PackStoreActions {
  setPackState: (dto: Partial<PackStatePayload>) => void;
  resetPackState: () => void;
  updateTexture: (aliasKey: string, newStatus: string, fullPath: string, imageUrl?: string | null, relativePath?: string | null) => void;
  optimisticDeleteTexture: (fullPath: string, aliasKey?: string) => void;
  optimisticDeleteEntries: (aliasKey: string, category: string, relativePath?: string) => void;
  optimisticDeleteVariation: (alias: string, relativePath: string) => void;
  optimisticAddVariation: (alias: string, blockVariantIndex?: number | null, count?: number) => void;
  optimisticAddVanillaEntry: (id: string, category: string, alias?: string, catalogNode?: BlockGroupNodeDto | null) => void;
  setScanProgress: (progress: ScanProgressPayload | null) => void;
  setIsScanning: (scanning: boolean) => void;
  startPackLoading: (folderPath: string, packName?: string) => void;
  setIsGridLoading: (loading: boolean) => void;
  setIsWorkspaceLoading: (loading: boolean) => void;
  setIsCatalogLoading: (loading: boolean) => void;
  setActiveTab: (tab: 'all' | 'blocks' | 'items' | 'entities') => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: 'all' | 'ghosts' | 'added' | 'orphans' | 'mers' | 'atlas' | 'flipbook' | 'variations' | 'blockstates' | 'variation') => void;
  setActiveFilters: (filters: TextureFilterKey[]) => void;
  toggleFilter: (filter: TextureFilterKey) => void;
  clearFilters: () => void;
  setActiveView: (view: 'grid' | 'workspace' | 'entity') => void;
  setSelectedBlockId: (id: string | null) => void;
  setSelectedAliasKey: (key: string | null) => void;
  setSelectedFolderPath: (path: string | null) => void;
  setIsCatalogOpen: (open: boolean) => void;
  toggleCatalog: () => void;
  setCatalogTree: (tree: BlockGroupNodeDto[] | null) => void;
  setReferencePacks: (packs: ReferencePackProfile[]) => void;
  setActiveReferenceId: (id: string) => void;
  setHasVanillaAssets: (has: boolean) => void;
  setSimulateNoAssets: (simulate: boolean) => void;
  setDisable3DView: (disabled: boolean) => void;
  setTileZoom: (zoom: number) => void;
  setJsonViewerInfo: (info: { lineCount: number; sizeLabel: string; matchCount: number | null } | null) => void;
  setIsManifestJsonDrawerOpen: (open: boolean) => void;
  toggleManifestJsonDrawer: () => void;
  setIsWorkspaceDrawerOpen: (open: boolean) => void;
  toggleWorkspaceDrawer: () => void;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setPackClosing: (closing: boolean) => void;
  setBlockWorkspaceSelectedId: (id: string | null) => void;
  setBlockWorkspaceActiveStateIndex: (index: number) => void;
  setBlockWorkspaceActiveVariationIndex: (index: number) => void;
  setEntityWorkspaceSelectedId: (id: string | null) => void;
  setEntityWorkspaceActiveLeafKey: (key: string | null) => void;
  setEntityWorkspaceActiveSlotIndex: (index: number) => void;
  setEntityWorkspaceActiveVariationIndex: (index: number) => void;
  setAppConfig: (config: Partial<AppConfigPayload>) => void;
  setOpenWithApps: (apps: OpenWithAppDto[]) => void;
  setJsonOpenWithApps: (apps: OpenWithAppDto[]) => void;
}

export type PackStore = PackStoreState & PackStoreActions;

const initialStats: PackStatsDto = {
  totalCount: 0,
  okCount: 0,
  ghostCount: 0,
  orphanCount: 0,
  blocksCount: 0,
  itemsCount: 0,
  entitiesCount: 0,
  blocksGhostCount: 0,
  itemsGhostCount: 0,
  entitiesGhostCount: 0,
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
  entityWorkspaceTree: [],
  packFolders: [],
  recentPacks: [],
  stats: initialStats,

  isScanning: false,
  isGridLoading: false,
  isWorkspaceLoading: false,
  isCatalogLoading: false,
  scanProgress: null,

  activeTab: 'all',
  searchQuery: '',
  statusFilter: 'all',
  activeFilters: [],
  activeView: 'grid',
  selectedBlockId: null,
  selectedAliasKey: null,
  selectedFolderPath: null,
  isCatalogOpen: false,
  catalogTree: null,
  referencePacks: [
    {
      id: 'vanilla',
      name: 'Bedrock Vanilla (1.21.x)',
      version: '1.21.x',
      description: 'Mojang bedrock-samples official reference database',
      iconUrl: 'https://vanilla.local/pack_icon.png',
      isVanilla: true,
    },
  ],
  activeReferenceId: 'vanilla',
  hasVanillaAssets: false,
  simulateNoAssets: typeof window !== 'undefined' && localStorage.getItem('mctg_simulate_no_assets') === 'true',
  disable3DView: typeof window !== 'undefined' && localStorage.getItem('mctg_disable_3d_view') === 'true',
  tileZoom: 120,
  jsonViewerInfo: null,
  isManifestJsonDrawerOpen: false,
  isWorkspaceDrawerOpen: false,
  isSidebarCollapsed: false,

  blockWorkspaceSelectedId: null,
  blockWorkspaceActiveStateIndex: 0,
  blockWorkspaceActiveVariationIndex: 0,
  entityWorkspaceSelectedId: null,
  entityWorkspaceActiveLeafKey: null,
  entityWorkspaceActiveSlotIndex: 0,
  entityWorkspaceActiveVariationIndex: 0,

  isPackClosing: typeof window !== 'undefined' && sessionStorage.getItem('mctg_pack_closing') === '1',

  tintOpacity: 85,
  tintBrightness: 30,
  tintHex: '#121214',
  debugMode: false,
  windowTitle: 'mcTextureGhost',
  openWithApps: [],
  jsonOpenWithApps: [],
};

// Internal store state
let currentState: PackStoreState = { ...initialState };
const listeners = new Set<() => void>();

// Stable merged snapshot — recreated only when notify() fires
let cachedSnapshot: PackStore | null = null;

function notify(): void {
  cachedSnapshot = null; // invalidate so next getSnapshot builds a fresh one
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
      entityWorkspaceTree: Array.isArray(dto.entityWorkspaceTree) ? dto.entityWorkspaceTree : currentState.entityWorkspaceTree,
      packFolders: Array.isArray(dto.packFolders) ? dto.packFolders : currentState.packFolders,
      recentPacks: Array.isArray(dto.recentPacks) ? dto.recentPacks : currentState.recentPacks,
      catalogTree: Array.isArray(dto.catalogTree) ? dto.catalogTree : currentState.catalogTree,
      referencePacks: Array.isArray(dto.referencePacks) && dto.referencePacks.length > 0 ? dto.referencePacks : currentState.referencePacks,
      activeReferenceId: dto.activeReferenceId ?? currentState.activeReferenceId,
      hasVanillaAssets: dto.hasVanillaAssets !== undefined ? dto.hasVanillaAssets : currentState.hasVanillaAssets,
      selectedFolderPath: dto.packRoot !== undefined && dto.packRoot !== currentState.packRoot ? null : currentState.selectedFolderPath,
      stats,
      isScanning: false,
      isGridLoading: false,
      isWorkspaceLoading: false,
      isCatalogLoading: false,
      scanProgress: null,
    };
    notify();
  },

  resetPackState(): void {
    currentState = {
      ...currentState,
      ...initialState,
      // Retain app config & recent packs
      isPackClosing: currentState.isPackClosing,
      recentPacks: currentState.recentPacks,
      tintOpacity: currentState.tintOpacity,
      tintBrightness: currentState.tintBrightness,
      tintHex: currentState.tintHex,
      debugMode: currentState.debugMode,
      windowTitle: currentState.windowTitle,
    };
    notify();
  },

  updateTexture(aliasKey: string, newStatus: string, fullPath: string, imageUrl?: string | null, relativePath?: string | null): void {
    const norm = (p?: string | null) => (p || '').replace(/[/\\]+/g, '/').toLowerCase();
    const stripExt = (p?: string | null) => (p || '').replace(/[/\\]+/g, '/').toLowerCase().replace(/\.(png|tga|jpg|jpeg|webp)(\?.*)?(#.*)?$/i, '');
    const targetNormFull = norm(fullPath);
    const targetNormRel = stripExt(relativePath);
    const aliasNorm = aliasKey ? aliasKey.toLowerCase() : '';

    // If fullPath or relativePath is specified, match specifically by path so we don't
    // accidentally update all variations or blockstates sharing the same alias!
    const updatedAliases = currentState.aliases.map((alias) => {
      let isMatch = false;

      // 1. Direct fullPath match
      if (targetNormFull && alias.fullPath) {
        if (norm(alias.fullPath) === targetNormFull) {
          isMatch = true;
        }
      }

      // 2. Direct relativePath match (scoped to aliasKey if present)
      if (!isMatch && targetNormRel && alias.relativePath) {
        const aRel = stripExt(alias.relativePath);
        const tRel = targetNormRel;
        if (aRel === tRel && (!aliasNorm || alias.alias.toLowerCase() === aliasNorm)) {
          isMatch = true;
        }
      }

      // 3. Fallback: match by target fullPath ending with alias relativePath
      if (!isMatch && targetNormFull && alias.relativePath) {
        const aRel = stripExt(alias.relativePath);
        if ((targetNormFull.endsWith('/' + aRel + '.png') || targetNormFull.endsWith('/' + aRel + '.tga')) &&
            (!aliasNorm || alias.alias.toLowerCase() === aliasNorm)) {
          isMatch = true;
        }
      }

      // 4. Fallback ONLY if neither fullPath nor relativePath was supplied
      if (!isMatch && !targetNormFull && !targetNormRel) {
        isMatch = alias.alias === aliasKey || alias.key === aliasKey;
      }

      if (!isMatch) return alias;

      return {
        ...alias,
        status: newStatus as any,
        fullPath: fullPath || alias.fullPath,
        imageUrl: imageUrl || alias.imageUrl,
        exists: newStatus === 'OK' || newStatus === 'OVERRIDE',
      };
    });

    const patchWorkspaceLeaves = (tree: BlockGroupNodeDto[]): BlockGroupNodeDto[] => (tree || []).map((block) => ({
      ...block,
      aliasGroups: block.aliasGroups?.map((ag) => ({
        ...ag,
        // Update faceNodes leaves if present
        faceNodes: (ag as any).faceNodes?.map((fn: any) => ({
          ...fn,
          leaves: fn.leaves?.map((leaf: any) => {
            let isMatch = false;
            if (targetNormFull && leaf.fullPath && norm(leaf.fullPath) === targetNormFull) isMatch = true;
            if (!isMatch && targetNormRel && leaf.relativePath && stripExt(leaf.relativePath) === targetNormRel && (!aliasNorm || leaf.alias.toLowerCase() === aliasNorm)) isMatch = true;
            if (!isMatch && targetNormFull && leaf.relativePath && stripExt(leaf.relativePath) && targetNormFull.endsWith('/' + stripExt(leaf.relativePath) + '.png') && (!aliasNorm || leaf.alias.toLowerCase() === aliasNorm)) isMatch = true;
            if (!isMatch && !targetNormFull && !targetNormRel && (leaf.alias === aliasKey)) isMatch = true;
            if (!isMatch) return leaf;
            return {
              ...leaf,
              status: newStatus as any,
              fullPath: fullPath || leaf.fullPath,
              imageUrl: imageUrl || leaf.imageUrl,
            };
          }),
        })),
        leaves: ag.leaves?.map((leaf: any) => {
          let isMatch = false;
          if (targetNormFull && leaf.fullPath && norm(leaf.fullPath) === targetNormFull) isMatch = true;
          if (!isMatch && targetNormRel && leaf.relativePath && stripExt(leaf.relativePath) === targetNormRel && (!aliasNorm || leaf.alias.toLowerCase() === aliasNorm)) isMatch = true;
          if (!isMatch && targetNormFull && leaf.relativePath && targetNormFull.endsWith('/' + stripExt(leaf.relativePath) + '.png') && (!aliasNorm || leaf.alias.toLowerCase() === aliasNorm)) isMatch = true;
          if (!isMatch && !targetNormFull && !targetNormRel && (leaf.alias === aliasKey)) isMatch = true;
          if (!isMatch) return leaf;
          return {
            ...leaf,
            status: newStatus as any,
            fullPath: fullPath || leaf.fullPath,
            imageUrl: imageUrl || leaf.imageUrl,
          };
        }),
      })),
    }));

    const updatedBlockTree = patchWorkspaceLeaves(currentState.blockWorkspaceTree || [] as any);
    const updatedEntityTree = patchWorkspaceLeaves(currentState.entityWorkspaceTree || [] as any);

    currentState = {
      ...currentState,
      aliases: updatedAliases,
      blockWorkspaceTree: updatedBlockTree as any,
      entityWorkspaceTree: updatedEntityTree as any,
      stats: computeStats(updatedAliases),
    };
    notify();
  },

  optimisticDeleteTexture(fullPath: string, aliasKey?: string): void {
    const result = applyOptimisticDeleteTexture(
      currentState.aliases,
      currentState.blockWorkspaceTree || [],
      currentState.entityWorkspaceTree || [],
      fullPath,
      aliasKey
    );
    currentState = {
      ...currentState,
      aliases: result.aliases,
      blockWorkspaceTree: result.blockWorkspaceTree as any,
      entityWorkspaceTree: result.entityWorkspaceTree as any,
      stats: result.stats,
    };
    notify();
  },

  optimisticDeleteEntries(aliasKey: string, category: string, relativePath?: string): void {
    const result = applyOptimisticDeleteEntries(
      currentState.aliases,
      currentState.blockWorkspaceTree || [],
      currentState.entityWorkspaceTree || [],
      currentState.catalogTree,
      aliasKey,
      category,
      relativePath
    );
    currentState = {
      ...currentState,
      aliases: result.aliases,
      blockWorkspaceTree: result.blockWorkspaceTree as any,
      entityWorkspaceTree: result.entityWorkspaceTree as any,
      catalogTree: result.catalogTree as any,
      stats: result.stats,
    };
    notify();
  },

  optimisticDeleteVariation(alias: string, relativePath: string): void {
    const result = applyOptimisticDeleteVariation(
      currentState.aliases,
      currentState.blockWorkspaceTree || [],
      currentState.entityWorkspaceTree || [],
      alias,
      relativePath
    );
    currentState = {
      ...currentState,
      aliases: result.aliases,
      blockWorkspaceTree: result.blockWorkspaceTree as any,
      entityWorkspaceTree: result.entityWorkspaceTree as any,
      stats: result.stats,
    };
    notify();
  },

  optimisticAddVariation(alias: string, blockVariantIndex?: number | null, count = 1): void {
    const result = applyOptimisticAddVariation(
      currentState.aliases,
      currentState.blockWorkspaceTree || [],
      currentState.entityWorkspaceTree || [],
      alias,
      blockVariantIndex,
      count
    );
    currentState = {
      ...currentState,
      aliases: result.aliases,
      blockWorkspaceTree: result.blockWorkspaceTree as any,
      entityWorkspaceTree: result.entityWorkspaceTree as any,
      stats: result.stats,
    };
    notify();
  },

  optimisticAddVanillaEntry(id: string, category: string, alias?: string, catalogNode?: BlockGroupNodeDto | null): void {
    const result = applyOptimisticAddVanillaEntry(
      currentState.aliases,
      currentState.blockWorkspaceTree || [],
      currentState.entityWorkspaceTree || [],
      currentState.catalogTree,
      id,
      category,
      alias,
      catalogNode
    );
    currentState = {
      ...currentState,
      aliases: result.aliases,
      blockWorkspaceTree: result.blockWorkspaceTree as any,
      entityWorkspaceTree: result.entityWorkspaceTree as any,
      catalogTree: result.catalogTree as any,
      stats: result.stats,
    };
    notify();
  },

  startPackLoading(folderPath: string, packName?: string): void {
    const derivedName = packName || folderPath.split(/[\\/]/).filter(Boolean).pop() || 'Resource Pack';
    currentState = {
      ...currentState,
      packRoot: folderPath,
      packName: derivedName,
      isScanning: true,
      isGridLoading: true,
      isWorkspaceLoading: true,
      isCatalogLoading: true,
      scanProgress: {
        stage: 'scan_start',
        current: 1,
        total: 5,
        message: `Opening ${derivedName}...`,
      },
    };
    notify();
  },

  setIsGridLoading(loading: boolean): void {
    currentState = { ...currentState, isGridLoading: loading };
    notify();
  },

  setIsWorkspaceLoading(loading: boolean): void {
    currentState = { ...currentState, isWorkspaceLoading: loading };
    notify();
  },

  setIsCatalogLoading(loading: boolean): void {
    currentState = { ...currentState, isCatalogLoading: loading };
    notify();
  },

  setScanProgress(progress: ScanProgressPayload | null): void {
    const isDone = progress === null || progress.stage === 'scan_done';
    currentState = {
      ...currentState,
      isScanning: !isDone,
      isGridLoading: !isDone && (progress?.stage === 'scan_start' || progress?.stage === 'scanning'),
      isWorkspaceLoading: !isDone && progress?.stage !== 'scan_done',
      isCatalogLoading: !isDone && progress?.stage !== 'scan_done',
      scanProgress: isDone ? null : progress,
    };
    notify();
  },

  setIsScanning(scanning: boolean): void {
    currentState = {
      ...currentState,
      isScanning: scanning,
      isGridLoading: scanning,
      isWorkspaceLoading: scanning,
      isCatalogLoading: scanning,
      scanProgress: scanning ? currentState.scanProgress : null,
    };
    notify();
  },

  setActiveTab(tab: 'all' | 'blocks' | 'items' | 'entities'): void {
    currentState = { ...currentState, activeTab: tab };
    notify();
  },

  setSearchQuery(query: string): void {
    currentState = { ...currentState, searchQuery: query };
    notify();
  },

  setStatusFilter(filter: 'all' | 'ghosts' | 'added' | 'orphans' | 'mers' | 'atlas' | 'flipbook' | 'variations' | 'blockstates' | 'variation'): void {
    const activeFilters: TextureFilterKey[] = filter === 'all' ? [] : [filter as TextureFilterKey];
    currentState = { ...currentState, statusFilter: filter, activeFilters };
    notify();
  },

  setActiveFilters(filters: TextureFilterKey[]): void {
    const statusFilter = filters.length > 0 ? (filters[0] ?? 'all') : 'all';
    currentState = { ...currentState, activeFilters: filters, statusFilter };
    notify();
  },

  toggleFilter(filter: TextureFilterKey): void {
    const current = currentState.activeFilters;
    const next = current.includes(filter)
      ? current.filter((f) => f !== filter)
      : [...current, filter];
    const statusFilter = next.length > 0 ? (next[0] ?? 'all') : 'all';
    currentState = { ...currentState, activeFilters: next, statusFilter };
    notify();
  },

  clearFilters(): void {
    currentState = { ...currentState, activeFilters: [], statusFilter: 'all' };
    notify();
  },

  setActiveView(view: 'grid' | 'workspace' | 'entity'): void {
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

  setReferencePacks(packs: ReferencePackProfile[]): void {
    currentState = { ...currentState, referencePacks: packs };
    notify();
  },

  setActiveReferenceId(id: string): void {
    currentState = { ...currentState, activeReferenceId: id };
    notify();
  },

  setHasVanillaAssets(has: boolean): void {
    currentState = { ...currentState, hasVanillaAssets: has };
    cachedSnapshot = null;
    notify();
  },

  setSimulateNoAssets(simulate: boolean): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mctg_simulate_no_assets', String(simulate));
    }
    currentState = { ...currentState, simulateNoAssets: simulate };
    cachedSnapshot = null;
    notify();
  },

  setDisable3DView(disabled: boolean): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mctg_disable_3d_view', String(disabled));
    }
    currentState = { ...currentState, disable3DView: disabled };
    cachedSnapshot = null;
    notify();
  },

  setTileZoom(zoom: number): void {
    const clamped = Math.max(80, Math.min(200, zoom));
    currentState = { ...currentState, tileZoom: clamped };
    cachedSnapshot = null;
    notify();
  },

  setJsonViewerInfo(info: { lineCount: number; sizeLabel: string; matchCount: number | null } | null): void {
    currentState = { ...currentState, jsonViewerInfo: info };
    cachedSnapshot = null;
    notify();
  },

  setIsManifestJsonDrawerOpen(open: boolean): void {
    currentState = { ...currentState, isManifestJsonDrawerOpen: open };
    cachedSnapshot = null;
    notify();
  },

  toggleManifestJsonDrawer(): void {
    currentState = { ...currentState, isManifestJsonDrawerOpen: !currentState.isManifestJsonDrawerOpen };
    cachedSnapshot = null;
    notify();
  },

  setIsWorkspaceDrawerOpen(open: boolean): void {
    currentState = { ...currentState, isWorkspaceDrawerOpen: open };
    cachedSnapshot = null;
    notify();
  },

  toggleWorkspaceDrawer(): void {
    currentState = { ...currentState, isWorkspaceDrawerOpen: !currentState.isWorkspaceDrawerOpen };
    cachedSnapshot = null;
    notify();
  },

  setIsSidebarCollapsed(collapsed: boolean): void {
    currentState = { ...currentState, isSidebarCollapsed: collapsed };
    cachedSnapshot = null;
    notify();
  },

  toggleSidebar(): void {
    currentState = { ...currentState, isSidebarCollapsed: !currentState.isSidebarCollapsed };
    cachedSnapshot = null;
    notify();
  },

  setBlockWorkspaceSelectedId(id: string | null): void {
    currentState = { ...currentState, blockWorkspaceSelectedId: id };
    cachedSnapshot = null;
    notify();
  },

  setBlockWorkspaceActiveStateIndex(index: number): void {
    currentState = { ...currentState, blockWorkspaceActiveStateIndex: index };
    cachedSnapshot = null;
    notify();
  },

  setBlockWorkspaceActiveVariationIndex(index: number): void {
    currentState = { ...currentState, blockWorkspaceActiveVariationIndex: index };
    cachedSnapshot = null;
    notify();
  },

  setEntityWorkspaceSelectedId(id: string | null): void {
    currentState = { ...currentState, entityWorkspaceSelectedId: id };
    cachedSnapshot = null;
    notify();
  },

  setEntityWorkspaceActiveLeafKey(key: string | null): void {
    currentState = { ...currentState, entityWorkspaceActiveLeafKey: key };
    cachedSnapshot = null;
    notify();
  },

  setEntityWorkspaceActiveSlotIndex(index: number): void {
    currentState = { ...currentState, entityWorkspaceActiveSlotIndex: index };
    cachedSnapshot = null;
    notify();
  },

  setEntityWorkspaceActiveVariationIndex(index: number): void {
    currentState = { ...currentState, entityWorkspaceActiveVariationIndex: index };
    cachedSnapshot = null;
    notify();
  },

  setPackClosing(closing: boolean): void {
    if (typeof window !== 'undefined') {
      if (closing) {
        sessionStorage.setItem('mctg_pack_closing', '1');
      } else {
        sessionStorage.removeItem('mctg_pack_closing');
      }
    }
    currentState = { ...currentState, isPackClosing: closing };
    cachedSnapshot = null;
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
      openWithApps: config.openWithApps ?? currentState.openWithApps,
      jsonOpenWithApps: config.jsonOpenWithApps ?? currentState.jsonOpenWithApps,
    };
    cachedSnapshot = null;
    notify();
  },

  setOpenWithApps(apps: OpenWithAppDto[]): void {
    currentState = { ...currentState, openWithApps: apps };
    cachedSnapshot = null;
    notify();
  },

  setJsonOpenWithApps(apps: OpenWithAppDto[]): void {
    currentState = { ...currentState, jsonOpenWithApps: apps };
    cachedSnapshot = null;
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
  getState: (): PackStore => {
    const effectiveHasVanilla = currentState.simulateNoAssets ? false : currentState.hasVanillaAssets;
    return { ...currentState, hasVanillaAssets: effectiveHasVanilla, ...packStoreActions };
  },
  setState: (updater: (prev: PackStoreState) => Partial<PackStoreState>): void => {
    currentState = { ...currentState, ...updater(currentState) };
    cachedSnapshot = null;
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
  const getSnapshot = (): T => {
    if (!cachedSnapshot) {
      const effectiveHasVanilla = currentState.simulateNoAssets ? false : currentState.hasVanillaAssets;
      cachedSnapshot = { ...currentState, hasVanillaAssets: effectiveHasVanilla, ...packStoreActions };
    }
    return selector ? selector(cachedSnapshot) : (cachedSnapshot as unknown as T);
  };

  return useSyncExternalStore(
    rawPackStore.subscribe,
    getSnapshot,
    getSnapshot
  );
}

usePackStore.getState = (): PackStore => {
  if (!cachedSnapshot) {
    const effectiveHasVanilla = currentState.simulateNoAssets ? false : currentState.hasVanillaAssets;
    cachedSnapshot = { ...currentState, hasVanillaAssets: effectiveHasVanilla, ...packStoreActions };
  }
  return cachedSnapshot;
};
