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

function computeStats(aliases: TextureAliasDto[]): PackStatsDto {
  const total = aliases.length;
  const done = aliases.filter((a) => a.status === 'OK').length;
  const ghosts = aliases.filter((a) => a.status === 'GHOST').length;
  const orphans = aliases.filter((a) => a.status === 'ORPHAN').length;
  const blocks = aliases.filter((a) => a.category === 'block');
  const items = aliases.filter((a) => a.category === 'item');
  const entities = aliases.filter((a) => a.category === 'entity');

  return {
    totalCount: total,
    okCount: done,
    ghostCount: ghosts,
    orphanCount: orphans,
    blocksCount: blocks.length,
    itemsCount: items.length,
    entitiesCount: entities.length,
    blocksGhostCount: blocks.filter((a) => a.status === 'GHOST').length,
    itemsGhostCount: items.filter((a) => a.status === 'GHOST').length,
    entitiesGhostCount: entities.filter((a) => a.status === 'GHOST').length,
    total,
    done,
    ghosts,
    orphans,
  };
}

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
    const norm = (p?: string | null) => (p || '').replace(/[/\\]+/g, '/').toLowerCase();
    const targetNorm = norm(fullPath);

    const isAliasMatchForEmptyPath = (alias: TextureAliasDto) => aliasKey && alias.alias.toLowerCase() === aliasKey.toLowerCase();

    const updatedAliases: TextureAliasDto[] = currentState.aliases.map((alias) => {
      let isMatch = false;
      if (targetNorm && alias.fullPath && norm(alias.fullPath) === targetNorm) {
        isMatch = true;
      } else if (!targetNorm && isAliasMatchForEmptyPath(alias)) {
        isMatch = true;
      }
      if (!isMatch) return alias;

      return {
        ...alias,
        status: 'GHOST' as const,
        exists: false,
        imageUrl: '',
      };
    });

    const patchDelete = (tree: BlockGroupNodeDto[]): BlockGroupNodeDto[] => (tree || []).map((block) => ({
      ...block,
      aliasGroups: block.aliasGroups?.map((ag) => ({
        ...ag,
        faceNodes: (ag as any).faceNodes?.map((fn: any) => ({
          ...fn,
          leaves: fn.leaves?.map((leaf: any) => {
            const leafMatch = leaf.fullPath && norm(leaf.fullPath) === targetNorm;
            if (leafMatch) return { ...leaf, status: 'GHOST' as const, imageUrl: '' };
            return leaf;
          }),
        })),
        leaves: ag.leaves?.map((leaf: any) => {
          const leafMatch = leaf.fullPath && norm(leaf.fullPath) === targetNorm;
          if (leafMatch) return { ...leaf, status: 'GHOST' as const, imageUrl: '' };
          return leaf;
        }),
      })),
    }));

    currentState = {
      ...currentState,
      aliases: updatedAliases,
      blockWorkspaceTree: patchDelete(currentState.blockWorkspaceTree || [] as any) as any,
      entityWorkspaceTree: patchDelete(currentState.entityWorkspaceTree || [] as any) as any,
      stats: computeStats(updatedAliases),
    };
    notify();
  },

  optimisticDeleteEntries(aliasKey: string, category: string, relativePath?: string): void {
    const stripExt = (p?: string | null) => (p || '').replace(/[/\\]+/g, '/').toLowerCase().replace(/\.(png|tga|jpg|jpeg|webp)$/i, '');
    const relNorm = stripExt(relativePath);
    const keyNorm = aliasKey.toLowerCase();
    const catNorm = category.toLowerCase();

    // 1. In aliases: if texture file exists on disk (status OK / OVERRIDE / ORPHAN / fullPath / exists), transition to ORPHAN in-place; if pure ghost, remove
    const updatedAliases: TextureAliasDto[] = [];
    for (const alias of currentState.aliases) {
      const isAliasMatch = alias.alias.toLowerCase() === keyNorm && alias.category.toLowerCase() === catNorm;
      const isPathMatch = Boolean(relNorm && alias.relativePath && stripExt(alias.relativePath) === relNorm);
      const isTarget = isAliasMatch || (Boolean(relNorm) && isPathMatch && alias.category.toLowerCase() === catNorm);

      if (!isTarget) {
        updatedAliases.push(alias);
        continue;
      }

      // If this item has a physical texture file on disk (or was OK/OVERRIDE/ORPHAN), it survives as an ORPHAN!
      const hasPhysicalFile =
        alias.status === 'OK' ||
        alias.status === 'OVERRIDE' ||
        alias.status === 'ORPHAN' ||
        (Boolean(alias.exists) && alias.status !== 'GHOST');
      if (hasPhysicalFile) {
        updatedAliases.push({
          ...alias,
          status: 'ORPHAN',
          variantKind: 'None',
          isUserDefined: false,
          subtitleCaption: 'orphan texture',
        });
      }
      // If it was a GHOST without a physical file, it is pruned from aliases completely
    }

    // 2. In blockWorkspaceTree & entityWorkspaceTree:
    // When deleting alias entry declarations:
    // If the alias group has actual physical texture files on disk (status OK / OVERRIDE / ORPHAN):
    // Keep it in place, mark isUserDefined = false, transition leaves to ORPHAN/fallback so it becomes fallback in-place.
    // If it was a pure ghost with NO physical files on disk:
    // Prune the alias group immediately so it doesn't linger with broken missing file icons!
    const transformTree = (tree: BlockGroupNodeDto[]): BlockGroupNodeDto[] => (tree || []).map((block) => {
      const newAliasGroups = (block.aliasGroups || []).map((ag) => {
        const isAgMatch = ag.alias.toLowerCase() === keyNorm && (ag.category || block.category).toLowerCase() === catNorm;

        if (!isAgMatch) {
          if (relNorm) {
            const filteredLeaves = ag.leaves?.filter((l) => stripExt(l.relativePath) !== relNorm) ?? ag.leaves;
            const faceNodes = (ag as any).faceNodes?.map((fn: any) => ({
              ...fn,
              leaves: fn.leaves?.filter((l: any) => stripExt(l.relativePath) !== relNorm),
            }));
            return { ...ag, leaves: filteredLeaves, faceNodes } as any;
          }
          return ag;
        }

        // Check if this matching alias group has actual physical texture files on disk (NOT ghost, NOT vanilla reference)
        const allLeaves = [
          ...(ag.leaves ?? []),
          ...(ag.faceNodes ? ag.faceNodes.flatMap((fn) => fn.leaves ?? []) : []),
        ];
        const hasTextures = allLeaves.some((l) => l.status === 'OK' || l.status === 'OVERRIDE' || l.status === 'ORPHAN');

        if (hasTextures) {
          // Keep the group in place, mark as fallback / not user defined, transition physical leaves
          const updatedLeaves = (ag.leaves ?? [])
            .filter((l) => l.status === 'OK' || l.status === 'OVERRIDE' || l.status === 'ORPHAN')
            .map((l) => ({ ...l, status: 'ORPHAN' as any, isUserDefined: false }));

          const updatedFaceNodes = (ag.faceNodes ?? []).map((fn) => ({
            ...fn,
            leaves: (fn.leaves ?? [])
              .filter((l) => l.status === 'OK' || l.status === 'OVERRIDE' || l.status === 'ORPHAN')
              .map((l) => ({ ...l, status: 'ORPHAN' as any, isUserDefined: false })),
          }));

          return {
            ...ag,
            isUserDefined: false,
            leaves: updatedLeaves,
            faceNodes: updatedFaceNodes,
            ghostCount: 0,
          };
        }

        // Pure ghost with NO physical textures on disk -> prune immediately!
        return null;
      }).filter(Boolean) as any[];

      return {
        ...block,
        aliasGroups: newAliasGroups,
      };
    }).filter((block) => {
      // Keep block if it has alias groups
      return Boolean(block.aliasGroups && block.aliasGroups.length > 0);
    });

    const updatedBlockTree = transformTree(currentState.blockWorkspaceTree || [] as any);
    const updatedEntityTree = transformTree(currentState.entityWorkspaceTree || [] as any);

    currentState = {
      ...currentState,
      aliases: updatedAliases,
      blockWorkspaceTree: updatedBlockTree as any,
      entityWorkspaceTree: updatedEntityTree as any,
      stats: computeStats(updatedAliases),
    };
    notify();
  },

  optimisticDeleteVariation(alias: string, relativePath: string): void {
    const norm = (p?: string | null) => (p || '').replace(/[/\\]+/g, '/').toLowerCase();
    const relNorm = norm(relativePath);
    const aliasNorm = alias.toLowerCase();

    // Remove the specific variation from aliases
    const updatedAliases = currentState.aliases.filter((a) => {
      if (a.alias.toLowerCase() === aliasNorm && a.relativePath && norm(a.relativePath) === relNorm) {
        return false;
      }
      return true;
    });

    const patchDeleteVariation = (tree: BlockGroupNodeDto[]): BlockGroupNodeDto[] => (tree || []).map((block) => ({
      ...block,
      aliasGroups: block.aliasGroups?.map((ag) => {
        if (ag.alias.toLowerCase() !== aliasNorm) return ag;
        const filteredLeaves = ag.leaves?.filter((leaf) => !(leaf.relativePath && norm(leaf.relativePath) === relNorm));
        const faceNodes = (ag as any).faceNodes?.map((fn: any) => ({
          ...fn,
          leaves: fn.leaves?.filter((leaf: any) => !(leaf.relativePath && norm(leaf.relativePath) === relNorm)),
        }));
        return { ...ag, leaves: filteredLeaves, faceNodes } as any;
      }),
    }));

    const updatedBlockTree = patchDeleteVariation(currentState.blockWorkspaceTree || [] as any);
    const updatedEntityTree = patchDeleteVariation(currentState.entityWorkspaceTree || [] as any);

    currentState = {
      ...currentState,
      aliases: updatedAliases,
      blockWorkspaceTree: updatedBlockTree as any,
      entityWorkspaceTree: updatedEntityTree as any,
      stats: computeStats(updatedAliases),
    };
    notify();
  },

  optimisticAddVariation(alias: string, blockVariantIndex?: number | null, count = 1): void {
    const aliasNorm = alias.toLowerCase();
    const existing = currentState.aliases.filter((a) => a.alias.toLowerCase() === aliasNorm);
    const nextIndex = existing.length > 0 ? Math.max(...existing.map((e) => e.textureVariantIndex ?? 0)) + 1 : 1;

    const newAliases: TextureAliasDto[] = [...currentState.aliases];
    for (let i = 0; i < count; i++) {
      const varIndex = nextIndex + i;
      const stubRelativePath = `textures/blocks/${alias}_var${varIndex}.png`;
      newAliases.push({
        alias,
        displayName: `${alias} #${varIndex}`,
        category: 'block',
        relativePath: stubRelativePath,
        fullPath: '',
        status: 'GHOST',
        exists: false,
        imageUrl: '',
        variantKind: 'TextureVariant',
        textureVariantIndex: varIndex,
        totalTextureVariants: nextIndex + count,
        blockVariantIndex: blockVariantIndex ?? null,
        blockFaces: [],
        usedByBlocks: [],
        isFlipbook: false,
        primaryFaceBadgeText: '',
        subtitleCaption: '',
        key: `${alias}_var${varIndex}`,
      });
    }

    // Also inject into workspace trees so variation card immediately widens with ghost slot
    const injectVariation = (tree: BlockGroupNodeDto[]): BlockGroupNodeDto[] => (tree || []).map((block) => ({
      ...block,
      aliasGroups: block.aliasGroups?.map((ag) => {
        if (ag.alias.toLowerCase() !== aliasNorm) return ag;
        const leaves = [...(ag.leaves || [])];
        for (let i = 0; i < count; i++) {
          const varIndex = nextIndex + i;
          leaves.push({
            alias,
            displayName: `${alias} #${varIndex}`,
            category: 'block',
            relativePath: `textures/blocks/${alias}_var${varIndex}.png`,
            fullPath: '',
            status: 'GHOST',
            imageUrl: '',
            subtitleCaption: '',
            primaryFaceBadgeText: '',
            isFlipbook: false,
            variantKind: 'TextureVariant',
            textureVariantIndex: varIndex,
            totalTextureVariants: nextIndex + count,
            blockVariantIndex: blockVariantIndex ?? null,
          });
        }
        // also patch faceNodes if present
        const faceNodes = (ag as any).faceNodes?.map((fn: any) => {
          // only append to faceNodes that share same blockVariantIndex slot grouping
          // for simplicity, append to first faceNode that currently holds this alias's leaves
          return fn;
        });
        return {
          ...ag,
          leaves,
          faceNodes,
        } as any;
      }),
    }));

    const updatedBlockTree = injectVariation(currentState.blockWorkspaceTree || [] as any);
    const updatedEntityTree = injectVariation(currentState.entityWorkspaceTree || [] as any);

    currentState = {
      ...currentState,
      aliases: newAliases,
      blockWorkspaceTree: updatedBlockTree as any,
      entityWorkspaceTree: updatedEntityTree as any,
      stats: computeStats(newAliases),
    };
    notify();
  },

  optimisticAddVanillaEntry(id: string, category: string, alias?: string, catalogNode?: BlockGroupNodeDto | null): void {
    const catNorm = category.toLowerCase();
    const targetIsAliasOnly = Boolean(alias);
    const targetAliasNorm = (alias || id).toLowerCase();

    // --- aliases: add ghost entries for each leaf of catalogNode that matches alias filter ---
    const newAliases: TextureAliasDto[] = [...currentState.aliases];
    const existingKeys = new Set(newAliases.map((a) => `${a.alias.toLowerCase()}|${(a.relativePath||'').toLowerCase()}|${a.textureVariantIndex ?? ''}|${a.blockVariantIndex ?? ''}`));

    const pushLeafAsAlias = (leaf: any) => {
      const key = `${leaf.alias.toLowerCase()}|${(leaf.relativePath||'').toLowerCase()}|${leaf.textureVariantIndex ?? ''}|${leaf.blockVariantIndex ?? ''}`;
      if (existingKeys.has(key)) {
        // flip existing ghost -> mark as userDefined GHOST (declared)
        const idx = newAliases.findIndex((a) => `${a.alias.toLowerCase()}|${(a.relativePath||'').toLowerCase()}|${(a.textureVariantIndex ?? '' as any)}|${(a.blockVariantIndex ?? '' as any)}` === key);
        if (idx >= 0) {
          const existing = newAliases[idx]!;
          newAliases[idx] = { ...existing, isUserDefined: true, status: existing.status === 'ORPHAN' ? 'GHOST' as any : existing.status } as any;
        }
        return;
      }
      existingKeys.add(key);
      newAliases.push({
        alias: leaf.alias,
        displayName: leaf.displayName || leaf.alias,
        category: (leaf.category as any) || (catNorm as any),
        relativePath: leaf.relativePath || `textures/${catNorm === 'block' ? 'blocks' : catNorm === 'item' ? 'items' : 'entity'}/${leaf.alias}.png`,
        fullPath: leaf.fullPath || '',
        status: 'GHOST' as any,
        exists: false,
        imageUrl: '',
        variantKind: leaf.variantKind || 'None',
        textureVariantIndex: leaf.textureVariantIndex ?? null,
        totalTextureVariants: leaf.totalTextureVariants ?? null,
        blockVariantIndex: leaf.blockVariantIndex ?? null,
        totalBlockVariants: leaf.totalBlockVariants ?? null,
        blockFaces: [],
        usedByBlocks: [],
        isFlipbook: Boolean(leaf.isFlipbook),
        flipbook: leaf.flipbook ?? null,
        primaryFaceBadgeText: leaf.primaryFaceBadgeText || '',
        subtitleCaption: leaf.subtitleCaption || '',
        isUserDefined: true,
        key: `${leaf.alias}_${leaf.relativePath}`,
        hasMers: (leaf as any).hasMers,
        mersFullPath: (leaf as any).mersFullPath,
        hasAtlas: (leaf as any).hasAtlas,
        atlasFullPath: (leaf as any).atlasFullPath,
      } as any);
    };

    if (catalogNode) {
      for (const ag of catalogNode.aliasGroups || []) {
        if (targetIsAliasOnly && ag.alias.toLowerCase() !== targetAliasNorm) continue;
        const leaves = ag.leaves && ag.leaves.length > 0 ? ag.leaves : [];
        // also faceNodes leaves
        const allLeaves = [...leaves, ...((ag as any).faceNodes?.flatMap((fn: any) => fn.leaves ?? []) ?? [])];
        for (const leaf of allLeaves) {
          pushLeafAsAlias(leaf);
        }
        if (allLeaves.length === 0 && ag.alias) {
          // fallback: alias group without leaves
          pushLeafAsAlias({ alias: ag.alias, displayName: ag.alias, relativePath: `textures/${catNorm === 'block' ? 'blocks' : 'items'}/${ag.alias}.png`, category: catNorm, status: 'GHOST' } as any);
        }
      }
    } else if (targetIsAliasOnly) {
      // no catalog node with leaves — create minimal ghost alias
      const rel = `textures/${catNorm === 'block' ? 'blocks' : catNorm === 'item' ? 'items' : 'entity'}/${alias}.png`;
      pushLeafAsAlias({ alias: alias!, displayName: alias!, relativePath: rel, category: catNorm, status: 'GHOST' } as any);
    }

    // --- workspace trees: insert or patch block/entity node ---
    const cloneNodeForWorkspace = (node: BlockGroupNodeDto): BlockGroupNodeDto => ({
      blockId: node.blockId,
      displayName: node.displayName || node.blockId,
      category: node.category,
      ghostCount: node.aliasGroups?.reduce((s, ag) => s + (ag.leaves?.filter(l => l.status === 'GHOST' || l.status === 'VANILLA').length ?? 0), 0) ?? 0,
      totalVariants: node.totalVariants ?? node.aliasGroups?.length ?? 0,
      isUserDefined: true,
      aliasGroups: (node.aliasGroups || []).filter((ag) => !targetIsAliasOnly || ag.alias.toLowerCase() === targetAliasNorm).map((ag) => ({
        ...ag,
        leaves: (ag.leaves || []).map((leaf) => ({ ...leaf, status: (leaf.status === 'VANILLA' ? 'GHOST' : leaf.status) as any, fullPath: '', imageUrl: '' })),
        faceNodes: (ag as any).faceNodes?.map((fn: any) => ({ ...fn, leaves: fn.leaves?.map((l: any) => ({ ...l, status: (l.status === 'VANILLA' ? 'GHOST' : l.status) as any, fullPath: '', imageUrl: '' })) })) as any,
      })),
    });

    let updatedBlockTree = currentState.blockWorkspaceTree || [];
    let updatedEntityTree = currentState.entityWorkspaceTree || [];

    if (catalogNode && !targetIsAliasOnly) {
      if (catNorm === 'entity') {
        const exists = updatedEntityTree.some((b) => b.blockId.toLowerCase() === id.toLowerCase());
        if (!exists) {
          updatedEntityTree = [...updatedEntityTree, cloneNodeForWorkspace(catalogNode)];
        } else {
          updatedEntityTree = updatedEntityTree.map((b) => b.blockId.toLowerCase() === id.toLowerCase() ? { ...b, isUserDefined: true } : b);
        }
      } else {
        const exists = updatedBlockTree.some((b) => b.blockId.toLowerCase() === id.toLowerCase());
        if (!exists) {
          updatedBlockTree = [...updatedBlockTree, cloneNodeForWorkspace(catalogNode)];
          // keep sort roughly by displayName
          updatedBlockTree = [...updatedBlockTree].sort((a, b) => (a.displayName || a.blockId).localeCompare(b.displayName || b.blockId));
        } else {
          updatedBlockTree = updatedBlockTree.map((b) => b.blockId.toLowerCase() === id.toLowerCase() ? { ...b, isUserDefined: true } : b);
          // if alias groups missing, patch them
          const existing = updatedBlockTree.find((b) => b.blockId.toLowerCase() === id.toLowerCase());
          if (existing && catalogNode.aliasGroups?.length) {
            const missingGroups = catalogNode.aliasGroups.filter((ag) => !existing.aliasGroups.some((eag) => eag.alias.toLowerCase() === ag.alias.toLowerCase()));
            if (missingGroups.length > 0) {
              updatedBlockTree = updatedBlockTree.map((b) => b.blockId.toLowerCase() === id.toLowerCase() ? { ...b, aliasGroups: [...(b.aliasGroups || []), ...missingGroups.map((ag) => ({ ...ag, leaves: ag.leaves?.map(l => ({ ...l, status: 'GHOST' as any, fullPath: '', imageUrl: '' })) }))] } : b);
            }
          }
        }
      }
    } else if (targetIsAliasOnly && catalogNode) {
      // alias-only: ensure workspace shows the alias as declared; if block exists, mark alias group as userDefined GHOST
      const patchTreeForAlias = (tree: BlockGroupNodeDto[]): BlockGroupNodeDto[] => tree.map((block) => {
        // find aliasGroups that match alias
        let patched = false;
        const newAliasGroups = block.aliasGroups?.map((ag) => {
          if (ag.alias.toLowerCase() !== targetAliasNorm) return ag;
          patched = true;
          return {
            ...ag,
            leaves: ag.leaves?.map((l) => ({ ...l, status: l.status === 'VANILLA' ? 'GHOST' as any : l.status, fullPath: l.fullPath || '' })),
            faceNodes: (ag as any).faceNodes?.map((fn: any) => ({ ...fn, leaves: fn.leaves?.map((l: any) => ({ ...l, status: l.status === 'VANILLA' ? 'GHOST' as any : l.status })) })),
          } as any;
        });
        return patched ? { ...block, aliasGroups: newAliasGroups as any } : block;
      });
      if (catNorm === 'entity') updatedEntityTree = patchTreeForAlias(updatedEntityTree);
      else updatedBlockTree = patchTreeForAlias(updatedBlockTree);
    }

    currentState = {
      ...currentState,
      aliases: newAliases,
      blockWorkspaceTree: updatedBlockTree as any,
      entityWorkspaceTree: updatedEntityTree as any,
      stats: computeStats(newAliases),
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
