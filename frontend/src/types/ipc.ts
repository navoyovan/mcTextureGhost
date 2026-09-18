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
  TextureExtractReference: 'TEXTURE:EXTRACT_REFERENCE',
  VanillaLoadCatalog: 'VANILLA:LOAD_CATALOG',
  CatalogPickReference: 'CATALOG:PICK_REFERENCE',
  CatalogSetReference: 'CATALOG:SET_REFERENCE',
  CatalogRemoveReference: 'CATALOG:REMOVE_REFERENCE',
  OpenInExplorer: 'OPEN_IN_EXPLORER',
  PackOpenExplorer: 'PACK:OPEN_EXPLORER',
  PackClose: 'PACK:CLOSE',
  AddVanillaEntry: 'ADD_VANILLA_ENTRY',
  TextureDeleteFile: 'TEXTURE:DELETE_FILE',
  TextureDeleteEntries: 'TEXTURE:DELETE_ENTRIES',
  TextureDropImport: 'TEXTURE:DROP_IMPORT',
  TextureCopyFile: 'TEXTURE:COPY_FILE',
  GeometryGet: 'GEOMETRY:GET',
  VanillaDownload3DAssets: 'VANILLA:DOWNLOAD_3D_ASSETS',
  VanillaGet3DStatus: 'VANILLA:GET_3D_STATUS',
  OpenWithGetApps: 'OPEN_WITH:GET_APPS',
  OpenWithAddCustomApp: 'OPEN_WITH:ADD_CUSTOM_APP',
  OpenWithRemoveApp: 'OPEN_WITH:REMOVE_APP',
  OpenWithSetDefault: 'OPEN_WITH:SET_DEFAULT',
  CatalogGetDetailedStatus: 'CATALOG:GET_DETAILED_STATUS',
  CatalogPurgeTempArchive: 'CATALOG:PURGE_TEMP_ARCHIVE',
  CatalogPurgeExtractedData: 'CATALOG:PURGE_EXTRACTED_DATA',

  // Outgoing from C# to Web
  PackStateChanged: 'PACK:STATE_CHANGED',
  ScanProgress: 'SCAN:PROGRESS',
  TextureUpdated: 'TEXTURE:UPDATED',
  AppConfig: 'APP:CONFIG',
  ErrorNotify: 'ERROR:NOTIFY',
  CatalogReferencesUpdated: 'CATALOG:REFERENCES_UPDATED',
  GeometryData: 'GEOMETRY:DATA',
  Vanilla3DStatus: 'VANILLA:3D_STATUS',
  DownloadProgress: 'DOWNLOAD:PROGRESS',
  OpenWithAppsList: 'OPEN_WITH:APPS_LIST',
  CatalogDetailedStatus: 'CATALOG:DETAILED_STATUS',
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

export interface OpenWithAppDto {
  id: string;
  name: string;
  exePath: string;
  iconDataUrl?: string | null;
  isDefault?: boolean;
  category?: 'image' | 'json' | string;
}

export interface OpenWithAppsListPayload {
  apps: OpenWithAppDto[];
  category?: 'image' | 'json' | string;
}

export interface TextureEditPayload {
  aliasKey: string;
  fullPath: string;
  isGhost?: boolean;
  exePath?: string | null;
  chooseDialog?: boolean;
  createOnly?: boolean;
}

export interface TextureDeleteFilePayload {
  fullPath: string;
  aliasKey?: string;
}

export interface TextureDeleteEntriesPayload {
  aliasKey: string;
  category: string;
  relativePath?: string;
}

export interface TextureDropImportPayload {
  aliasKey: string;
  fullPath: string;
  base64Data: string;
  relativePath?: string;
  category?: string;
  fileName?: string;
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

export interface TextureExtractReferencePayload {
  aliasKey: string;
  fullPath: string;
  relativePath?: string;
  category?: string;
}

export interface TextureCopyFilePayload {
  sourceFullPath: string;
  targetFullPath: string;
  targetAliasKey: string;
  targetRelativePath?: string | null;
}

export interface TileDragData {
  aliasKey: string;
  fullPath?: string | null;
  relativePath?: string | null;
  imageUrl?: string | null;
  displayName?: string | null;
  category?: string | null;
  isGhost?: boolean;
  sourceType?: 'grid' | 'workspace' | 'catalog';
}

export interface GeometryGetPayload {
  geometryId?: string | null;
  entityId?: string | null;
}

export interface GeometryDataPayload {
  geometryId: string;
  rawJson: string;
  entityId?: string | null;
}

// Sub-DTOs
export interface PackStatsDto {
  totalCount: number;
  okCount: number;
  ghostCount: number;
  orphanCount: number;
  blocksCount: number;
  itemsCount: number;
  entitiesCount: number;
  blocksGhostCount: number;
  itemsGhostCount: number;
  entitiesGhostCount: number;
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
  replicate?: number;
}

export interface TextureAliasDto {
  alias: string;
  displayName: string;
  relativePath: string;
  fullPath: string;
  category: 'block' | 'item' | 'entity';
  entityId?: string | null;
  textureKey?: string | null;
  geometryId?: string | null;
  isAttachable?: boolean;
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
  hasMers?: boolean;
  mersFullPath?: string | null;
  key?: string | null;
}

export interface CatalogLeafDto {
  alias: string;
  displayName: string;
  relativePath: string;
  fullPath: string;
  category: string;
  entityId?: string | null;
  textureKey?: string | null;
  geometryId?: string | null;
  isAttachable?: boolean;
  status: 'OK' | 'GHOST' | 'OVERRIDE' | 'ORPHAN' | 'VANILLA';
  imageUrl: string;
  subtitleCaption: string;
  primaryFaceBadgeText: string;
  isFlipbook: boolean;
  flipbook?: FlipbookDefinitionDto | null;
  variantKind?: 'None' | 'BlockVariant' | 'TextureVariant' | 'NestedVariant';
  blockVariantIndex?: number | null;
  totalBlockVariants?: number | null;
  textureVariantIndex?: number | null;
  totalTextureVariants?: number | null;
  weight?: number | null;
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
  geometryId?: string | null;
  isAttachable?: boolean;
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
  orphanCount: number;
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

export interface ReferencePackProfile {
  id: string;
  name: string;
  version: string;
  description?: string | null;
  packPath?: string | null;
  iconUrl: string;
  isVanilla: boolean;
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
  referencePacks?: ReferencePackProfile[] | null;
  activeReferenceId?: string | null;
  entityWorkspaceTree?: BlockGroupNodeDto[] | null;
  hasVanillaAssets?: boolean;
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
  openWithApps?: OpenWithAppDto[] | null;
  jsonOpenWithApps?: OpenWithAppDto[] | null;
}

export interface ErrorPayload {
  title: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface Vanilla3DStatusPayload {
  has3DModels: boolean;
  referencePath?: string | null;
}

export interface DownloadProgressPayload {
  task: string;
  progress: number;
  message: string;
}

export interface ReferencePackDetailedStatusPayload {
  activeId: string;
  activeName: string;
  referencePath: string;
  directoryExists: boolean;
  hasExtractedModels: boolean;
  modelFilesCount: number;
  textureFilesCount: number;
  jsonFilesCount: number;
  totalExtractedSizeBytes: number;
  totalExtractedSizeFormatted: string;
  tempArchiveExists: boolean;
  tempArchivePath: string | null;
  tempArchiveSizeBytes: number;
  tempArchiveSizeFormatted: string;
  versionTag: string;
  lastModifiedUtc: string | null;
}
