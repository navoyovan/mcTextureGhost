// frontend/src/store/packStore.ts
import { useSyncExternalStore } from 'react';
import {
  PackStatePayload,
  PackPatchPayload,
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
  /** Normalized O(1) indexes */
  blocksById: Map<string, BlockGroupNodeDto>;
  entitiesById: Map<string, BlockGroupNodeDto>;
  aliasesByKey: Map<string, TextureAliasDto>;
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

  /** Pending alias and tile ops to prevent flash during background scans */
  pendingAliasOps: Record<string, 'deleting' | 'adding'>;
  pendingTileOps: Record<string, 'deleting' | 'adding'>;
  lastAppliedPatchSeq: number;

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
  applyPackPatch: (patch: PackPatchPayload) => void;
  resetPackState: () => void;
  updateTexture: (aliasKey: string, newStatus: string, fullPath: string, imageUrl?: string | null, relativePath?: string | null) => void;
  optimisticDeleteTexture: (fullPath: string, aliasKey?: string) => void;
  optimisticDeleteEntries: (aliasKey: string, category: string, relativePath?: string) => void;
  optimisticDeleteVariation: (alias: string, relativePath: string) => void;
  optimisticDeleteBlockEntry: (blockId: string) => void;
  optimisticDeleteEntityEntry: (entityId: string) => void;
  optimisticSetVariationWeight: (alias: string, relativePath: string, weight: number) => void;
  optimisticRenameVariation: (alias: string, oldRelativePath: string, newRelativePath: string) => void;
  optimisticAddVariation: (alias: string, blockVariantIndex?: number | null, count?: number, sourceRelativePath?: string | null) => void;
  optimisticAddVanillaEntry: (id: string, category: string, alias?: string, catalogNode?: BlockGroupNodeDto | null) => void;
  setPendingAliasOp: (alias: string, op: 'deleting' | 'adding' | null) => void;
  setPendingTileOp: (fullPath: string, op: 'deleting' | 'adding' | null) => void;
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

function buildBlocksById(tree: BlockGroupNodeDto[]): Map<string, BlockGroupNodeDto> {
  const map = new Map<string, BlockGroupNodeDto>();
  for (const b of tree) {
    if (!b?.blockId) continue;
    const norm = b.blockId.toLowerCase();
    map.set(norm, b);
    const strip = norm.replace(/^minecraft:/, '');
    if (strip !== norm) map.set(strip, b);
  }
  return map;
}

function buildAliasesByKey(aliases: TextureAliasDto[]): Map<string, TextureAliasDto> {
  const map = new Map<string, TextureAliasDto>();
  for (const a of aliases) {
    const k = (a.key || a.alias || '').toLowerCase();
    if (k) map.set(k, a);
    if (a.alias) {
      const ak = a.alias.toLowerCase();
      if (ak !== k) map.set(ak, a);
    }
  }
  return map;
}

function bustUrlCache(url?: string | null): string {
  if (!url) return '';
  const base = url.replace(/[?&]t=\d+/g, '');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}t=${Date.now()}`;
}

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
  blocksById: new Map(),
  entitiesById: new Map(),
  aliasesByKey: new Map(),
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

  pendingAliasOps: {},
  pendingTileOps: {},
  lastAppliedPatchSeq: 0,

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

// Deferred notify — state is updated immediately but the React re-render pump
// fires in a microtask (outside the current event handler). Used for heavy
// selection changes (block/entity) to prevent 'click handler took Xms' violations.
let deferredNotifyScheduled = false;
function notifyDeferred(): void {
  cachedSnapshot = null; // snapshot is stale immediately
  if (!deferredNotifyScheduled) {
    deferredNotifyScheduled = true;
    setTimeout(() => {
      deferredNotifyScheduled = false;
      const t0 = performance.now();
      listeners.forEach((listener) => listener());
      const notifyMs = performance.now() - t0;
      requestAnimationFrame(() => {
        const paintMs = performance.now() - t0;
        console.log(`[PERF][REACT] pumpListeners=${notifyMs.toFixed(1)}ms framePaint=${paintMs.toFixed(1)}ms (${listeners.size} listeners)`);
      });
    }, 0);
  }
}

export const packStoreActions: PackStoreActions = {
  setPackState(dto: Partial<PackStatePayload>): void {
    const t0 = performance.now();
    const rawAliases = dto.aliases || currentState.aliases || [];
    const sanitizedAliases = Array.isArray(rawAliases) ? rawAliases : [];
    const stats = dto.stats || computeStats(sanitizedAliases);

    const newBlockWorkspaceTree = Array.isArray(dto.blockWorkspaceTree) ? dto.blockWorkspaceTree : currentState.blockWorkspaceTree;
    const newEntityWorkspaceTree = Array.isArray(dto.entityWorkspaceTree) ? dto.entityWorkspaceTree : currentState.entityWorkspaceTree;
    const newBlocksById = buildBlocksById(newBlockWorkspaceTree);
    const newEntitiesById = buildBlocksById(newEntityWorkspaceTree);
    const newAliasesByKey = buildAliasesByKey(sanitizedAliases);

    // Auto-clear resolved pending alias operations
    const updatedPendingAliasOps = { ...currentState.pendingAliasOps };
    const aliasInTreeSet = new Set<string>();
    for (const block of newBlockWorkspaceTree) {
      if (block.aliasGroups) {
        for (const ag of block.aliasGroups) {
          aliasInTreeSet.add(ag.alias.toLowerCase());
        }
      }
    }
    const packDeclaredAliasSet = new Set<string>();
    for (const a of sanitizedAliases) {
      if (a.category === 'block' && a.status !== 'ORPHAN' && (a as any).isUserDefined !== false) {
        packDeclaredAliasSet.add(a.alias.toLowerCase());
      }
    }
    Object.keys(updatedPendingAliasOps).forEach((alias) => {
      const op = updatedPendingAliasOps[alias];
      const aliasNorm = alias.toLowerCase();
      const aliasExistsInTree = aliasInTreeSet.has(aliasNorm);
      const isDeclaredInPack = packDeclaredAliasSet.has(aliasNorm);
      if (op === 'deleting') {
        if (!isDeclaredInPack || !aliasExistsInTree) {
          delete updatedPendingAliasOps[alias];
        }
      } else if (op === 'adding') {
        if (aliasExistsInTree) {
          delete updatedPendingAliasOps[alias];
        }
      }
    });

    // Auto-clear resolved pending tile operations
    const updatedPendingTileOps = { ...currentState.pendingTileOps };
    const existingTilePathSet = new Set<string>();
    for (const a of sanitizedAliases) {
      if (a.fullPath && (a.status === 'OK' || a.status === 'OVERRIDE')) {
        existingTilePathSet.add(a.fullPath.replace(/[/\\]+/g, '/').toLowerCase());
      }
    }
    Object.keys(updatedPendingTileOps).forEach((fullPath) => {
      const op = updatedPendingTileOps[fullPath];
      const pathNorm = fullPath.replace(/[/\\]+/g, '/').toLowerCase();
      const tileExistsOnDisk = existingTilePathSet.has(pathNorm);
      if (op === 'deleting' && !tileExistsOnDisk) {
        delete updatedPendingTileOps[fullPath];
      } else if (op === 'adding' && tileExistsOnDisk) {
        delete updatedPendingTileOps[fullPath];
      }
    });

    currentState = {
      ...currentState,
      packRoot: dto.packRoot ?? currentState.packRoot,
      packName: dto.packName ?? currentState.packName ?? (dto.packRoot ? 'Unnamed Pack' : null),
      hasManifest: dto.hasManifest ?? (dto.manifest !== null && dto.manifest !== undefined),
      hasPackIcon: dto.hasPackIcon ?? Boolean(dto.packIconUrl),
      packIconUrl: dto.packIconUrl ?? currentState.packIconUrl,
      manifest: dto.manifest ?? currentState.manifest,
      aliases: sanitizedAliases,
      blockWorkspaceTree: newBlockWorkspaceTree,
      entityWorkspaceTree: newEntityWorkspaceTree,
      blocksById: newBlocksById,
      entitiesById: newEntitiesById,
      aliasesByKey: newAliasesByKey,
      packFolders: Array.isArray(dto.packFolders) ? dto.packFolders : currentState.packFolders,
      recentPacks: Array.isArray(dto.recentPacks) ? dto.recentPacks : currentState.recentPacks,
      catalogTree: Array.isArray(dto.catalogTree) ? dto.catalogTree : currentState.catalogTree,
      referencePacks: Array.isArray(dto.referencePacks) && dto.referencePacks.length > 0 ? dto.referencePacks : currentState.referencePacks,
      activeReferenceId: dto.activeReferenceId ?? currentState.activeReferenceId,
      hasVanillaAssets: dto.hasVanillaAssets !== undefined ? dto.hasVanillaAssets : currentState.hasVanillaAssets,
      selectedFolderPath: dto.packRoot !== undefined && dto.packRoot !== currentState.packRoot ? null : currentState.selectedFolderPath,
      stats,
      pendingAliasOps: updatedPendingAliasOps,
      pendingTileOps: updatedPendingTileOps,
      isScanning: false,
      isGridLoading: false,
      isWorkspaceLoading: false,
      isCatalogLoading: false,
      scanProgress: null,
    };
    notifyDeferred();
    const setPackStateMs = performance.now() - t0;
    console.log(`[PERF][STORE] setPackState took ${setPackStateMs.toFixed(1)}ms (blocks: ${newBlockWorkspaceTree.length}, aliases: ${sanitizedAliases.length})`);
  },

  applyPackPatch(patch: PackPatchPayload): void {
    if (patch.seq && patch.seq < currentState.lastAppliedPatchSeq) {
      console.warn(`[PERF][STORE] Dropped outdated patch seq=${patch.seq} (current=${currentState.lastAppliedPatchSeq})`);
      return;
    }

    const t0 = performance.now();
    let aliasesChanged = false;
    let nextAliases = currentState.aliases;

    const upsertMap = new Map<string, TextureAliasDto>();
    if (patch.upsertAliases && patch.upsertAliases.length > 0) {
      for (const a of patch.upsertAliases) {
        const k = (a.key || a.alias).toLowerCase();
        upsertMap.set(k, a);
      }
    }

    const removeSet = new Set<string>();
    if (patch.removeAliasKeys && patch.removeAliasKeys.length > 0) {
      for (const k of patch.removeAliasKeys) {
        removeSet.add(k.toLowerCase());
      }
    }

    if (upsertMap.size > 0 || removeSet.size > 0) {
      aliasesChanged = true;
      const remaining: TextureAliasDto[] = [];
      const updatedKeys = new Set<string>();

      for (const alias of currentState.aliases) {
        const k = (alias.key || alias.alias).toLowerCase();
        if (removeSet.has(k)) {
          continue;
        }
        if (upsertMap.has(k)) {
          remaining.push(upsertMap.get(k)!);
          updatedKeys.add(k);
        } else {
          remaining.push(alias);
        }
      }

      for (const [k, a] of upsertMap.entries()) {
        if (!updatedKeys.has(k)) {
          remaining.push(a);
        }
      }

      nextAliases = remaining;
    }

    let nextBlocks = currentState.blockWorkspaceTree;
    if ((patch.upsertBlocks && patch.upsertBlocks.length > 0) || (patch.removeBlockIds && patch.removeBlockIds.length > 0)) {
      const blockUpsertMap = new Map<string, BlockGroupNodeDto>();
      if (patch.upsertBlocks) {
        for (const b of patch.upsertBlocks) {
          blockUpsertMap.set(b.blockId.toLowerCase(), b);
        }
      }
      const blockRemoveSet = new Set<string>();
      if (patch.removeBlockIds) {
        for (const id of patch.removeBlockIds) {
          blockRemoveSet.add(id.toLowerCase());
        }
      }

      const remainingBlocks: BlockGroupNodeDto[] = [];
      const updatedBlockIds = new Set<string>();

      for (const b of currentState.blockWorkspaceTree) {
        const id = b.blockId.toLowerCase();
        if (blockRemoveSet.has(id)) continue;
        if (blockUpsertMap.has(id)) {
          remainingBlocks.push(blockUpsertMap.get(id)!);
          updatedBlockIds.add(id);
        } else {
          remainingBlocks.push(b);
        }
      }

      for (const [id, b] of blockUpsertMap.entries()) {
        if (!updatedBlockIds.has(id)) {
          remainingBlocks.push(b);
        }
      }

      nextBlocks = remainingBlocks;
    }

    let nextEntities = currentState.entityWorkspaceTree;
    if ((patch.upsertEntities && patch.upsertEntities.length > 0) || (patch.removeEntityIds && patch.removeEntityIds.length > 0)) {
      const entityUpsertMap = new Map<string, BlockGroupNodeDto>();
      if (patch.upsertEntities) {
        for (const e of patch.upsertEntities) {
          entityUpsertMap.set(e.blockId.toLowerCase(), e);
        }
      }
      const entityRemoveSet = new Set<string>();
      if (patch.removeEntityIds) {
        for (const id of patch.removeEntityIds) {
          entityRemoveSet.add(id.toLowerCase());
        }
      }

      const remainingEntities: BlockGroupNodeDto[] = [];
      const updatedEntityIds = new Set<string>();

      for (const e of currentState.entityWorkspaceTree) {
        const id = e.blockId.toLowerCase();
        if (entityRemoveSet.has(id)) continue;
        if (entityUpsertMap.has(id)) {
          remainingEntities.push(entityUpsertMap.get(id)!);
          updatedEntityIds.add(id);
        } else {
          remainingEntities.push(e);
        }
      }

      for (const [id, e] of entityUpsertMap.entries()) {
        if (!updatedEntityIds.has(id)) {
          remainingEntities.push(e);
        }
      }

      nextEntities = remainingEntities;
    }

    const updatedPendingAliasOps = { ...currentState.pendingAliasOps };
    if (patch.removeAliasKeys) {
      for (const k of patch.removeAliasKeys) {
        delete updatedPendingAliasOps[k.toLowerCase()];
        const colonIdx = k.indexOf(':');
        if (colonIdx > 0) {
          delete updatedPendingAliasOps[k.substring(0, colonIdx).toLowerCase()];
        }
      }
    }
    if (patch.upsertAliases) {
      for (const a of patch.upsertAliases) {
        delete updatedPendingAliasOps[a.alias.toLowerCase()];
        if (a.key) {
          delete updatedPendingAliasOps[a.key.toLowerCase()];
          const colonIdx = a.key.indexOf(':');
          if (colonIdx > 0) {
            delete updatedPendingAliasOps[a.key.substring(0, colonIdx).toLowerCase()];
          }
        }
      }
    }
    if (patch.upsertBlocks) {
      for (const b of patch.upsertBlocks) {
        if (b.aliasGroups) {
          for (const ag of b.aliasGroups) {
            const norm = ag.alias.toLowerCase();
            if (updatedPendingAliasOps[norm] === 'deleting') {
              delete updatedPendingAliasOps[norm];
            }
          }
        }
      }
    }

    let nextBlocksById = currentState.blocksById;
    if (nextBlocks !== currentState.blockWorkspaceTree) {
      nextBlocksById = new Map(currentState.blocksById);
      if (patch.removeBlockIds) {
        for (const id of patch.removeBlockIds) {
          const norm = id.toLowerCase();
          nextBlocksById.delete(norm);
          nextBlocksById.delete(norm.replace(/^minecraft:/, ''));
        }
      }
      if (patch.upsertBlocks) {
        for (const b of patch.upsertBlocks) {
          const norm = b.blockId.toLowerCase();
          nextBlocksById.set(norm, b);
          const strip = norm.replace(/^minecraft:/, '');
          if (strip !== norm) nextBlocksById.set(strip, b);
        }
      }
    }

    let nextEntitiesById = currentState.entitiesById;
    if (nextEntities !== currentState.entityWorkspaceTree) {
      nextEntitiesById = new Map(currentState.entitiesById);
      if (patch.removeEntityIds) {
        for (const id of patch.removeEntityIds) {
          const norm = id.toLowerCase();
          nextEntitiesById.delete(norm);
          nextEntitiesById.delete(norm.replace(/^minecraft:/, ''));
        }
      }
      if (patch.upsertEntities) {
        for (const e of patch.upsertEntities) {
          const norm = e.blockId.toLowerCase();
          nextEntitiesById.set(norm, e);
          const strip = norm.replace(/^minecraft:/, '');
          if (strip !== norm) nextEntitiesById.set(strip, e);
        }
      }
    }

    let nextAliasesByKey = currentState.aliasesByKey;
    if (nextAliases !== currentState.aliases) {
      nextAliasesByKey = new Map(currentState.aliasesByKey);
      if (patch.removeAliasKeys) {
        for (const k of patch.removeAliasKeys) {
          nextAliasesByKey.delete(k.toLowerCase());
        }
      }
      if (patch.upsertAliases) {
        for (const a of patch.upsertAliases) {
          const k = (a.key || a.alias || '').toLowerCase();
          if (k) nextAliasesByKey.set(k, a);
          if (a.alias) nextAliasesByKey.set(a.alias.toLowerCase(), a);
        }
      }
    }

    currentState = {
      ...currentState,
      lastAppliedPatchSeq: Math.max(currentState.lastAppliedPatchSeq, patch.seq || 0),
      aliases: nextAliases,
      blockWorkspaceTree: nextBlocks,
      entityWorkspaceTree: nextEntities,
      blocksById: nextBlocksById,
      entitiesById: nextEntitiesById,
      aliasesByKey: nextAliasesByKey,
      stats: patch.stats ?? (aliasesChanged ? computeStats(nextAliases) : currentState.stats),
      manifest: patch.manifest !== undefined ? (patch.manifest ?? currentState.manifest) : currentState.manifest,
      hasPackIcon: patch.hasPackIcon !== undefined ? patch.hasPackIcon : currentState.hasPackIcon,
      packIconUrl: patch.packIconUrl !== undefined ? patch.packIconUrl : currentState.packIconUrl,
      pendingAliasOps: updatedPendingAliasOps,
      isScanning: false,
      isGridLoading: false,
      isWorkspaceLoading: false,
      isCatalogLoading: false,
      scanProgress: null,
    };

    notifyDeferred();
    const patchMs = performance.now() - t0;
    console.log(`[PERF][STORE] applyPackPatch seq=${patch.seq} took ${patchMs.toFixed(1)}ms (upsertedAliases: ${patch.upsertAliases?.length ?? 0}, removedAliases: ${patch.removeAliasKeys?.length ?? 0}, upsertedBlocks: ${patch.upsertBlocks?.length ?? 0})`);
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

      // 3. Fallback: match by target fullPath ending with exact alias relativePath
      if (!isMatch && targetNormFull && alias.relativePath) {
        const aRel = stripExt(alias.relativePath);
        if ((targetNormFull.endsWith('/' + aRel + '.png') || targetNormFull.endsWith('/' + aRel + '.tga') || targetNormFull.endsWith('\\' + aRel + '.png')) &&
            (!aliasNorm || alias.alias.toLowerCase() === aliasNorm)) {
          // Guard: if targetNormFull is e.g. door_jungle_lower_var1.png, do not match door_jungle_lower.png
          const targetFile = targetNormFull.split(/[/\\]/).pop() || '';
          const targetFileBase = targetFile.replace(/\.(png|tga)$/i, '');
          const aliasFile = aRel.split(/[/\\]/).pop() || '';
          if (targetFileBase === aliasFile) {
            isMatch = true;
          }
        }
      }

      // 4. Fallback ONLY if neither fullPath nor relativePath was supplied
      if (!isMatch && !targetNormFull && !targetNormRel) {
        isMatch = alias.alias === aliasKey || alias.key === aliasKey;
      }

      if (!isMatch) return alias;

      const resolvedImg = bustUrlCache(imageUrl || alias.imageUrl);
      return {
        ...alias,
        status: newStatus as any,
        fullPath: fullPath || alias.fullPath,
        imageUrl: resolvedImg,
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
            if (!isMatch && targetNormFull && leaf.relativePath) {
              const lRel = stripExt(leaf.relativePath);
              const targetFile = targetNormFull.split(/[/\\]/).pop() || '';
              const targetFileBase = targetFile.replace(/\.(png|tga)$/i, '');
              const leafFile = lRel.split(/[/\\]/).pop() || '';
              if (targetFileBase === leafFile && (!aliasNorm || leaf.alias.toLowerCase() === aliasNorm)) {
                isMatch = true;
              }
            }
            if (!isMatch && !targetNormFull && !targetNormRel && (leaf.alias === aliasKey)) isMatch = true;
            if (!isMatch) return leaf;
            const resolvedImg = bustUrlCache(imageUrl || leaf.imageUrl);
            return {
              ...leaf,
              status: newStatus as any,
              fullPath: fullPath || leaf.fullPath,
              imageUrl: resolvedImg,
            };
          }),
        })),
        leaves: ag.leaves?.map((leaf: any) => {
          let isMatch = false;
          if (targetNormFull && leaf.fullPath && norm(leaf.fullPath) === targetNormFull) isMatch = true;
          if (!isMatch && targetNormRel && leaf.relativePath && stripExt(leaf.relativePath) === targetNormRel && (!aliasNorm || leaf.alias.toLowerCase() === aliasNorm)) isMatch = true;
          if (!isMatch && targetNormFull && leaf.relativePath) {
            const lRel = stripExt(leaf.relativePath);
            const targetFile = targetNormFull.split(/[/\\]/).pop() || '';
            const targetFileBase = targetFile.replace(/\.(png|tga)$/i, '');
            const leafFile = lRel.split(/[/\\]/).pop() || '';
            if (targetFileBase === leafFile && (!aliasNorm || leaf.alias.toLowerCase() === aliasNorm)) {
              isMatch = true;
            }
          }
          if (!isMatch && !targetNormFull && !targetNormRel && (leaf.alias === aliasKey)) isMatch = true;
          if (!isMatch) return leaf;
          const resolvedImg = bustUrlCache(imageUrl || leaf.imageUrl);
          return {
            ...leaf,
            status: newStatus as any,
            fullPath: fullPath || leaf.fullPath,
            imageUrl: resolvedImg,
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
      blocksById: buildBlocksById(updatedBlockTree),
      entitiesById: buildBlocksById(updatedEntityTree),
      aliasesByKey: buildAliasesByKey(updatedAliases),
      stats: computeStats(updatedAliases),
    };
    notify();
  },

  optimisticDeleteTexture(fullPath: string, aliasKey?: string): void {
    if (fullPath) this.setPendingTileOp(fullPath, 'deleting');
    if (aliasKey) this.setPendingAliasOp(aliasKey, 'deleting');
  },

  optimisticDeleteEntries(aliasKey: string, _category: string, relativePath?: string): void {
    if (aliasKey) this.setPendingAliasOp(aliasKey, 'deleting');
    if (relativePath) this.setPendingTileOp(relativePath, 'deleting');
  },

  optimisticDeleteVariation(alias: string, relativePath: string): void {
    if (alias) this.setPendingAliasOp(alias, 'deleting');
    if (relativePath) this.setPendingTileOp(relativePath, 'deleting');
  },

  optimisticDeleteBlockEntry(blockId: string): void {
    if (blockId) this.setPendingAliasOp(blockId, 'deleting');
  },

  optimisticDeleteEntityEntry(entityId: string): void {
    if (entityId) this.setPendingAliasOp(entityId, 'deleting');
  },

  optimisticSetVariationWeight(alias: string, _relativePath: string, _weight: number): void {
    if (alias) this.setPendingAliasOp(alias, 'adding');
  },

  optimisticRenameVariation(alias: string, _oldRelativePath: string, _newRelativePath: string): void {
    if (alias) this.setPendingAliasOp(alias, 'adding');
  },

  optimisticAddVariation(alias: string, _blockVariantIndex?: number | null, _count = 1, _sourceRelativePath?: string | null): void {
    if (alias) this.setPendingAliasOp(alias, 'adding');
  },

  optimisticAddVanillaEntry(id: string, _category: string, alias?: string, _catalogNode?: BlockGroupNodeDto | null): void {
    if (alias) this.setPendingAliasOp(alias, 'adding');
    if (id) this.setPendingAliasOp(id, 'adding');
  },

  setPendingAliasOp(alias: string, op: 'deleting' | 'adding' | null): void {
    const next = { ...currentState.pendingAliasOps };
    const key = alias.toLowerCase();
    if (!op) {
      delete next[key];
    } else {
      next[key] = op;
      setTimeout(() => {
        if (currentState.pendingAliasOps[key]) {
          const cleaned = { ...currentState.pendingAliasOps };
          delete cleaned[key];
          currentState = { ...currentState, pendingAliasOps: cleaned };
          notifyDeferred();
        }
      }, 2500);
    }
    currentState = { ...currentState, pendingAliasOps: next };
    notifyDeferred();
  },

  setPendingTileOp(fullPath: string, op: 'deleting' | 'adding' | null): void {
    const next = { ...currentState.pendingTileOps };
    const key = fullPath.replace(/[/\\]+/g, '/').toLowerCase();
    if (!op) {
      delete next[key];
    } else {
      next[key] = op;
      setTimeout(() => {
        if (currentState.pendingTileOps[key]) {
          const cleaned = { ...currentState.pendingTileOps };
          delete cleaned[key];
          currentState = { ...currentState, pendingTileOps: cleaned };
          notifyDeferred();
        }
      }, 2500);
    }
    currentState = { ...currentState, pendingTileOps: next };
    notifyDeferred();
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
    notifyDeferred();
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
    notifyDeferred();
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
