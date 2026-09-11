// frontend/src/types/ipc.ts
// Typed contracts matching McTextureGhost Services/IpcContracts.cs and PROJECT.md

export interface IpcEnvelope<T = unknown> {
  type: string;
  payload: T;
  correlationId?: string;
  timestamp: string;
}

// Well-known message type constants
export const IpcMessageTypes = {
  // Incoming from Web to C#
  PackOpenFolder: 'PACK:OPEN_FOLDER',
  PackReload: 'PACK:RELOAD',
  PackCreate: 'PACK:CREATE',
  TextureEdit: 'TEXTURE:EDIT',
  ScaffoldPlain: 'SCAFFOLD:PLAIN',
  ScaffoldPerFace: 'SCAFFOLD:PER_FACE',
  ScaffoldFlipbook: 'SCAFFOLD:FLIPBOOK',
  OrphanRegister: 'ORPHAN:REGISTER',
  ManifestSave: 'MANIFEST:SAVE',
  WindowAction: 'WINDOW:ACTION',
  TintSet: 'TINT:SET',
  VanillaAdd: 'VANILLA:ADD',
  VanillaLoadCatalog: 'VANILLA:LOAD_CATALOG',
  OpenInExplorer: 'OPEN_IN_EXPLORER',
  PackOpenExplorer: 'PACK:OPEN_EXPLORER',
  PackClose: 'PACK:CLOSE',
  AddVanillaEntry: 'ADD_VANILLA_ENTRY',

  // Outgoing from C# to Web
  PackStateChanged: 'PACK:STATE_CHANGED',
  ScanProgress: 'SCAN:PROGRESS',
  TextureUpdated: 'TEXTURE:UPDATED',
  AppConfig: 'APP:CONFIG',
  ErrorNotify: 'ERROR:NOTIFY',
} as const;

export type IpcMessageType = (typeof IpcMessageTypes)[keyof typeof IpcMessageTypes];

// Web -> C# Payloads
export interface PackOpenFolderPayload {
  folderPath?: string | null;
}

export interface PackReloadPayload {
  // Empty payload
}

export interface PackCreatePayload {
  packName: string;
  targetDirectory?: string | null;
}

export interface TextureEditPayload {
  aliasKey: string;
  fullPath: string;
  isGhost?: boolean;
}

export interface ScaffoldPlainPayload {
  aliasName: string;
  textureSubpath?: string | null;
  blockId?: string | null;
}

export interface ScaffoldPerFacePayload {
  aliasName: string;
  topSubpath?: string | null;
  bottomSubpath?: string | null;
  sideSubpath?: string | null;
  blockId?: string | null;
}

export interface ScaffoldFlipbookPayload {
  aliasName: string;
  textureSubpath?: string | null;
  frames?: number[] | null;
  ticksPerFrame?: number | null;
  blockId?: string | null;
}

export interface OrphanRegisterPayload {
  relativePath: string;
  category: 'terrain' | 'item';
  alias?: string | null;
}

export interface ManifestSavePayload {
  manifest: ManifestModelDto;
}

export interface WindowActionPayload {
  action: 'minimize' | 'maximize' | 'close' | 'drag';
}

export interface TintSetPayload {
  opacityPercent: number;
  brightness: number;
  hex?: string | null;
}

export interface VanillaAddPayload {
  id: string;
  category: 'block' | 'item';
}

// Sub-DTOs
export interface PackStatsDto {
  totalCount: number;
  okCount: number;
  ghostCount: number;
  orphanCount: number;
  blocksCount: number;
  itemsCount: number;
  blocksGhostCount: number;
  itemsGhostCount: number;
  total: number;
  done: number;
  ghosts: number;
  orphans: number;
}

export interface BlockFaceUsageDto {
  blockId: string;
  face: string;
}

export interface FlipbookDefinitionDto {
  flipbookTexture: string;
  atlasTile: string;
  ticksPerFrame: number;
  frames?: number[] | null;
  blendFrames: boolean;
  atlasIndex?: number | null;
  atlasTileVariant?: number | null;
}

export interface TextureAliasDto {
  alias: string;
  displayName: string;
  relativePath: string;
  fullPath: string;
  category: 'block' | 'item';
  status: 'OK' | 'GHOST' | 'ORPHAN' | 'NEW' | 'OVERRIDE';
  exists: boolean;
  imageUrl: string;
  blockFaces: BlockFaceUsageDto[];
  usedByBlocks: string[];
  variantKind: string;
  blockVariantIndex?: number | null;
  totalBlockVariants?: number | null;
  textureVariantIndex?: number | null;
  totalTextureVariants?: number | null;
  weight?: number | null;
  isFlipbook: boolean;
  flipbook?: FlipbookDefinitionDto | null;
  primaryFaceBadgeText: string;
  subtitleCaption: string;
  key?: string | null;
}

export interface CatalogLeafDto {
  alias: string;
  displayName: string;
  relativePath: string;
  fullPath: string;
  category: string;
  status: 'OK' | 'GHOST' | 'OVERRIDE' | 'ORPHAN' | 'VANILLA';
  imageUrl: string;
  subtitleCaption: string;
  primaryFaceBadgeText: string;
  isFlipbook: boolean;
  flipbook?: FlipbookDefinitionDto | null;
}

export interface FaceNodeDto {
  faceLabel: string;
  leaves: CatalogLeafDto[];
  ghostCount: number;
  orphanCount: number;
}

export interface AliasGroupNodeDto {
  alias: string;
  category: string;
  faceSummary: string;
  faceNodes: FaceNodeDto[];
  leaves: CatalogLeafDto[];
  ghostCount: number;
  notAddedCount: number;
}

export interface BlockGroupNodeDto {
  blockId: string;
  displayName: string;
  category: string;
  aliasGroups: AliasGroupNodeDto[];
  ghostCount: number;
  totalVariants: number;
  isUserDefined?: boolean;
}

export interface PackFolderItemDto {
  name: string;
  relativePath: string;
  fullPath: string;
  isDirectory: boolean;
  depth: number;
  isMissing: boolean;
  textureCount: number;
  ghostCount: number;
  subFolders: PackFolderItemDto[];
}

export interface RecentPackItemDto {
  folderPath: string;
  packName: string;
  description?: string | null;
  packIconPath?: string | null;
  packIconUrl?: string | null;
  hasPackIcon: boolean;
  lastOpened: string;
  relativeTime: string;
  version?: string | null;
  displayFolder: string;
}

export interface ManifestModelDto {
  headerName: string;
  headerDescription: string;
  headerUuid: string;
  versionMajor: number;
  versionMinor: number;
  versionPatch: number;
  minEngineMajor: number;
  minEngineMinor: number;
  minEnginePatch: number;
  moduleUuid: string;
  moduleType: string;
  moduleVersionMajor: number;
  moduleVersionMinor: number;
  moduleVersionPatch: number;
  formatVersion: number;
  fileExists: boolean;
  filePath?: string | null;
  versionString: string;
  minEngineString: string;
  version?: number[] | null;
  minEngineVersion?: number[] | null;
  moduleVersion?: number[] | null;
}

// C# -> Web Payloads
export interface PackStatePayload {
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
  catalogTree?: BlockGroupNodeDto[] | null;
}

export interface ScanProgressPayload {
  stage: string;
  current: number;
  total: number;
  message: string;
}

export interface TextureUpdatedPayload {
  aliasKey: string;
  newStatus: string;
  fullPath: string;
  imageUrl?: string | null;
}

export interface AppConfigPayload {
  tintOpacity: number;
  tintBrightness: number;
  tintHex: string;
  debugMode: boolean;
  windowTitle: string;
}

export interface ErrorPayload {
  title: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}
