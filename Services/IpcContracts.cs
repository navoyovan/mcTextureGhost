using System.IO;
using System.Text.Json.Serialization;
using McTextureGhost.Models;
using McTextureGhost.ViewModels;

namespace McTextureGhost.Services;

#region IPC Message Envelope & Type Constants

/// <summary>
/// Standard bidirectional IPC message envelope exchanged between C# host and React frontend.
/// Matches TypeScript interface:
/// interface IpcEnvelope<T = any> { type: string; payload: T; correlationId?: string; timestamp: string; }
/// </summary>
public record IpcEnvelope<T>
{
    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("payload")]
    public required T Payload { get; init; }

    [JsonPropertyName("correlationId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CorrelationId { get; init; }

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; init; } = DateTime.UtcNow.ToString("o");
}

public static class IpcEnvelope
{
    public static IpcEnvelope<T> Create<T>(string type, T payload, string? correlationId = null) =>
        new()
        {
            Type = type,
            Payload = payload,
            CorrelationId = correlationId,
            Timestamp = DateTime.UtcNow.ToString("o")
        };
}

/// <summary>
/// Well-known message type identifiers matching PROJECT.md § Interface Contracts.
/// </summary>
public static class IpcMessageTypes
{
    // Incoming from Web to C#
    public const string PackOpenFolder   = "PACK:OPEN_FOLDER";
    public const string PackReload       = "PACK:RELOAD";
    public const string PackCreate       = "PACK:CREATE";
    public const string TextureEdit      = "TEXTURE:EDIT";
    public const string ScaffoldPlain    = "SCAFFOLD:PLAIN";
    public const string ScaffoldPerFace  = "SCAFFOLD:PER_FACE";
    public const string ScaffoldFlipbook = "SCAFFOLD:FLIPBOOK";
    public const string OrphanRegister   = "ORPHAN:REGISTER";
    public const string ManifestSave     = "MANIFEST:SAVE";
    public const string WindowAction     = "WINDOW:ACTION";
    public const string TintSet          = "TINT:SET";
    public const string VanillaAdd       = "VANILLA:ADD";
    public const string VanillaLoadCatalog = "VANILLA:LOAD_CATALOG";
    public const string OpenInExplorer   = "OPEN_IN_EXPLORER";
    public const string PackOpenExplorer = "PACK:OPEN_EXPLORER";
    public const string PackClose        = "PACK:CLOSE";
    public const string AddVanillaEntry  = "ADD_VANILLA_ENTRY";

    // Outgoing from C# to Web
    public const string PackStateChanged = "PACK:STATE_CHANGED";
    public const string ScanProgress     = "SCAN:PROGRESS";
    public const string TextureUpdated   = "TEXTURE:UPDATED";
    public const string AppConfig        = "APP:CONFIG";
    public const string ErrorNotify      = "ERROR:NOTIFY";
}

#endregion

#region Incoming Command Payloads (Web -> C#)

/// <summary>
/// Payload for "PACK:OPEN_FOLDER". If FolderPath is null or omitted, triggers native OpenFolderDialog.
/// </summary>
public record PackOpenFolderPayload(
    [property: JsonPropertyName("folderPath")] string? FolderPath = null
);

/// <summary>
/// Payload for "PACK:RELOAD". Rescans current pack.
/// </summary>
public record PackReloadPayload();

/// <summary>
/// Payload for "PACK:CREATE". Creates a brand new resource pack scaffold.
/// </summary>
public record PackCreatePayload(
    [property: JsonPropertyName("packName")] string PackName,
    [property: JsonPropertyName("targetDirectory")] string? TargetDirectory = null
);

/// <summary>
/// Payload for "TEXTURE:EDIT". Invokes placeholder generation if ghost, then native external editor.
/// </summary>
public record TextureEditPayload(
    [property: JsonPropertyName("aliasKey")] string AliasKey,
    [property: JsonPropertyName("fullPath")] string FullPath,
    [property: JsonPropertyName("isGhost")] bool IsGhost = false
);

/// <summary>
/// Payload for "SCAFFOLD:PLAIN". Creates plain single-texture block in JSON.
/// </summary>
public record ScaffoldPlainPayload(
    [property: JsonPropertyName("aliasName")] string AliasName,
    [property: JsonPropertyName("textureSubpath")] string? TextureSubpath = null,
    [property: JsonPropertyName("blockId")] string? BlockId = null
);

/// <summary>
/// Payload for "SCAFFOLD:PER_FACE". Creates 6-face block wiring in JSON.
/// </summary>
public record ScaffoldPerFacePayload(
    [property: JsonPropertyName("aliasName")] string AliasName,
    [property: JsonPropertyName("topSubpath")] string? TopSubpath = null,
    [property: JsonPropertyName("bottomSubpath")] string? BottomSubpath = null,
    [property: JsonPropertyName("sideSubpath")] string? SideSubpath = null,
    [property: JsonPropertyName("blockId")] string? BlockId = null
);

/// <summary>
/// Payload for "SCAFFOLD:FLIPBOOK". Creates animated block wiring in terrain & flipbook JSON.
/// </summary>
public record ScaffoldFlipbookPayload(
    [property: JsonPropertyName("aliasName")] string AliasName,
    [property: JsonPropertyName("textureSubpath")] string? TextureSubpath = null,
    [property: JsonPropertyName("frames")] int[]? Frames = null,
    [property: JsonPropertyName("ticksPerFrame")] int? TicksPerFrame = 10,
    [property: JsonPropertyName("blockId")] string? BlockId = null
);

/// <summary>
/// Payload for "ORPHAN:REGISTER". Registers unreferenced disk file into atlas JSON.
/// </summary>
public record OrphanRegisterPayload(
    [property: JsonPropertyName("relativePath")] string RelativePath,
    [property: JsonPropertyName("category")] string Category, // "terrain" | "item"
    [property: JsonPropertyName("alias")] string? Alias = null
);

/// <summary>
/// Payload for "MANIFEST:SAVE". Updates and saves manifest.json.
/// </summary>
public record ManifestSavePayload(
    [property: JsonPropertyName("manifest")] ManifestModelDto Manifest
);

/// <summary>
/// Payload for "WINDOW:ACTION". Controls native host window chrome.
/// </summary>
public record WindowActionPayload(
    [property: JsonPropertyName("action")] string Action // "minimize" | "maximize" | "close" | "drag"
);

/// <summary>
/// Payload for "TINT:SET". Updates frosted-glass acrylic background parameters.
/// </summary>
public record TintSetPayload(
    [property: JsonPropertyName("opacityPercent")] int OpacityPercent,
    [property: JsonPropertyName("brightness")] int Brightness,
    [property: JsonPropertyName("hex")] string? Hex = null
);

/// <summary>
/// Payload for "VANILLA:ADD". Scaffolds a vanilla block/item reference into pack.
/// </summary>
public record VanillaAddPayload(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("category")] string Category // "block" | "item"
);

/// <summary>
/// Payload for "OPEN_IN_EXPLORER" and "PACK:OPEN_EXPLORER". Opens directory or selects file in Windows File Explorer.
/// </summary>
public record OpenInExplorerPayload(
    [property: JsonPropertyName("targetPath")] string? TargetPath = null,
    [property: JsonPropertyName("selectFile")] bool SelectFile = false
);

/// <summary>
/// Payload for "PACK:CLOSE". Closes the active pack.
/// </summary>
public record PackClosePayload();

/// <summary>
/// Payload for "ADD_VANILLA_ENTRY" (alias to "VANILLA:ADD").
/// </summary>
public record AddVanillaEntryPayload(
    [property: JsonPropertyName("id")] string? Id = null,
    [property: JsonPropertyName("blockId")] string? BlockId = null,
    [property: JsonPropertyName("alias")] string? Alias = null,
    [property: JsonPropertyName("category")] string? Category = null
);

#endregion

#region Outgoing Event Payloads (C# -> Web)

/// <summary>
/// Payload for "PACK:STATE_CHANGED". Pushed on pack open, reload, or structure change.
/// </summary>
public record PackStatePayload(
    [property: JsonPropertyName("packRoot")] string? PackRoot,
    [property: JsonPropertyName("packName")] string? PackName,
    [property: JsonPropertyName("hasManifest")] bool HasManifest,
    [property: JsonPropertyName("hasPackIcon")] bool HasPackIcon,
    [property: JsonPropertyName("packIconUrl")] string? PackIconUrl,
    [property: JsonPropertyName("manifest")] ManifestModelDto? Manifest,
    [property: JsonPropertyName("aliases")] List<TextureAliasDto> Aliases,
    [property: JsonPropertyName("blockWorkspaceTree")] List<BlockGroupNodeDto> BlockWorkspaceTree,
    [property: JsonPropertyName("packFolders")] List<PackFolderItemDto> PackFolders,
    [property: JsonPropertyName("recentPacks")] List<RecentPackItemDto> RecentPacks,
    [property: JsonPropertyName("stats")] PackStatsDto Stats,
    [property: JsonPropertyName("catalogTree")] List<BlockGroupNodeDto>? CatalogTree = null
);

/// <summary>
/// Payload for "SCAN:PROGRESS". Pushed during background scan operations.
/// </summary>
public record ScanProgressPayload(
    [property: JsonPropertyName("stage")] string Stage,
    [property: JsonPropertyName("current")] int Current,
    [property: JsonPropertyName("total")] int Total,
    [property: JsonPropertyName("message")] string Message
);

/// <summary>
/// Payload for "TEXTURE:UPDATED". Pushed on FileSystemWatcher debounce or single tile edit.
/// </summary>
public record TextureUpdatedPayload(
    [property: JsonPropertyName("aliasKey")] string AliasKey,
    [property: JsonPropertyName("newStatus")] string NewStatus,
    [property: JsonPropertyName("fullPath")] string FullPath,
    [property: JsonPropertyName("imageUrl")] string? ImageUrl = null
);

/// <summary>
/// Payload for "APP:CONFIG". Pushed on initialization or settings change.
/// </summary>
public record AppConfigPayload(
    [property: JsonPropertyName("tintOpacity")] int TintOpacity,
    [property: JsonPropertyName("tintBrightness")] int TintBrightness,
    [property: JsonPropertyName("tintHex")] string TintHex,
    [property: JsonPropertyName("debugMode")] bool DebugMode,
    [property: JsonPropertyName("windowTitle")] string WindowTitle = "McTextureGhost"
);

/// <summary>
/// Payload for "ERROR:NOTIFY". Pushed to display toast/modal errors in React.
/// </summary>
public record ErrorPayload(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("severity")] string Severity = "error" // "error" | "warning" | "info"
);

#endregion

#region Domain Sub-DTOs

public record PackStatsDto(
    [property: JsonPropertyName("totalCount")] int TotalCount,
    [property: JsonPropertyName("okCount")] int OkCount,
    [property: JsonPropertyName("ghostCount")] int GhostCount,
    [property: JsonPropertyName("orphanCount")] int OrphanCount,
    [property: JsonPropertyName("blocksCount")] int BlocksCount,
    [property: JsonPropertyName("itemsCount")] int ItemsCount,
    [property: JsonPropertyName("blocksGhostCount")] int BlocksGhostCount,
    [property: JsonPropertyName("itemsGhostCount")] int ItemsGhostCount,
    [property: JsonPropertyName("total")] int Total = 0,
    [property: JsonPropertyName("done")] int Done = 0,
    [property: JsonPropertyName("ghosts")] int Ghosts = 0,
    [property: JsonPropertyName("orphans")] int Orphans = 0
);

public record BlockFaceUsageDto(
    [property: JsonPropertyName("blockId")] string BlockId,
    [property: JsonPropertyName("face")] string Face
);

public record FlipbookDefinitionDto(
    [property: JsonPropertyName("flipbookTexture")] string FlipbookTexture,
    [property: JsonPropertyName("atlasTile")] string AtlasTile,
    [property: JsonPropertyName("ticksPerFrame")] int TicksPerFrame = 1,
    [property: JsonPropertyName("frames")] int[]? Frames = null,
    [property: JsonPropertyName("blendFrames")] bool BlendFrames = true,
    [property: JsonPropertyName("atlasIndex")] int? AtlasIndex = null,
    [property: JsonPropertyName("atlasTileVariant")] int? AtlasTileVariant = null
);

public record TextureAliasDto(
    [property: JsonPropertyName("alias")] string Alias,
    [property: JsonPropertyName("displayName")] string DisplayName,
    [property: JsonPropertyName("relativePath")] string RelativePath,
    [property: JsonPropertyName("fullPath")] string FullPath,
    [property: JsonPropertyName("category")] string Category, // "block" | "item"
    [property: JsonPropertyName("status")] string Status, // "OK" | "GHOST" | "ORPHAN" | "NEW"
    [property: JsonPropertyName("exists")] bool Exists,
    [property: JsonPropertyName("imageUrl")] string ImageUrl,
    [property: JsonPropertyName("blockFaces")] List<BlockFaceUsageDto> BlockFaces,
    [property: JsonPropertyName("usedByBlocks")] List<string> UsedByBlocks,
    [property: JsonPropertyName("variantKind")] string VariantKind, // "None" | "BlockVariant" | "TextureVariant" | "NestedVariant"
    [property: JsonPropertyName("blockVariantIndex")] int? BlockVariantIndex,
    [property: JsonPropertyName("totalBlockVariants")] int? TotalBlockVariants,
    [property: JsonPropertyName("textureVariantIndex")] int? TextureVariantIndex,
    [property: JsonPropertyName("totalTextureVariants")] int? TotalTextureVariants,
    [property: JsonPropertyName("weight")] int? Weight,
    [property: JsonPropertyName("isFlipbook")] bool IsFlipbook,
    [property: JsonPropertyName("flipbook")] FlipbookDefinitionDto? Flipbook,
    [property: JsonPropertyName("primaryFaceBadgeText")] string PrimaryFaceBadgeText,
    [property: JsonPropertyName("subtitleCaption")] string SubtitleCaption,
    [property: JsonPropertyName("key")] string? Key = null
);

public record CatalogLeafDto(
    [property: JsonPropertyName("alias")] string Alias,
    [property: JsonPropertyName("displayName")] string DisplayName,
    [property: JsonPropertyName("relativePath")] string RelativePath,
    [property: JsonPropertyName("fullPath")] string FullPath,
    [property: JsonPropertyName("category")] string Category,
    [property: JsonPropertyName("status")] string Status, // "OK" | "GHOST" | "OVERRIDE" | "ORPHAN" | "VANILLA"
    [property: JsonPropertyName("imageUrl")] string ImageUrl,
    [property: JsonPropertyName("subtitleCaption")] string SubtitleCaption,
    [property: JsonPropertyName("primaryFaceBadgeText")] string PrimaryFaceBadgeText,
    [property: JsonPropertyName("isFlipbook")] bool IsFlipbook,
    [property: JsonPropertyName("flipbook")] FlipbookDefinitionDto? Flipbook
);

public record FaceNodeDto(
    [property: JsonPropertyName("faceLabel")] string FaceLabel,
    [property: JsonPropertyName("leaves")] List<CatalogLeafDto> Leaves,
    [property: JsonPropertyName("ghostCount")] int GhostCount,
    [property: JsonPropertyName("orphanCount")] int OrphanCount
);

public record AliasGroupNodeDto(
    [property: JsonPropertyName("alias")] string Alias,
    [property: JsonPropertyName("category")] string Category,
    [property: JsonPropertyName("faceSummary")] string FaceSummary,
    [property: JsonPropertyName("faceNodes")] List<FaceNodeDto> FaceNodes,
    [property: JsonPropertyName("leaves")] List<CatalogLeafDto> Leaves,
    [property: JsonPropertyName("ghostCount")] int GhostCount,
    [property: JsonPropertyName("notAddedCount")] int NotAddedCount
);

public record BlockGroupNodeDto(
    [property: JsonPropertyName("blockId")] string BlockId,
    [property: JsonPropertyName("displayName")] string DisplayName,
    [property: JsonPropertyName("category")] string Category,
    [property: JsonPropertyName("aliasGroups")] List<AliasGroupNodeDto> AliasGroups,
    [property: JsonPropertyName("ghostCount")] int GhostCount = 0,
    [property: JsonPropertyName("totalVariants")] int TotalVariants = 0
);

public record PackFolderItemDto(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("relativePath")] string RelativePath,
    [property: JsonPropertyName("fullPath")] string FullPath,
    [property: JsonPropertyName("isDirectory")] bool IsDirectory,
    [property: JsonPropertyName("depth")] int Depth,
    [property: JsonPropertyName("isMissing")] bool IsMissing,
    [property: JsonPropertyName("textureCount")] int TextureCount,
    [property: JsonPropertyName("ghostCount")] int GhostCount,
    [property: JsonPropertyName("subFolders")] List<PackFolderItemDto> SubFolders
);

public record RecentPackItemDto(
    [property: JsonPropertyName("folderPath")] string FolderPath,
    [property: JsonPropertyName("packName")] string PackName,
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("packIconPath")] string? PackIconPath,
    [property: JsonPropertyName("packIconUrl")] string? PackIconUrl,
    [property: JsonPropertyName("hasPackIcon")] bool HasPackIcon,
    [property: JsonPropertyName("lastOpened")] DateTime LastOpened,
    [property: JsonPropertyName("relativeTime")] string RelativeTime,
    [property: JsonPropertyName("version")] string? Version,
    [property: JsonPropertyName("displayFolder")] string DisplayFolder
);

public record ManifestModelDto(
    [property: JsonPropertyName("headerName")] string HeaderName,
    [property: JsonPropertyName("headerDescription")] string HeaderDescription,
    [property: JsonPropertyName("headerUuid")] string HeaderUuid,
    [property: JsonPropertyName("versionMajor")] int VersionMajor,
    [property: JsonPropertyName("versionMinor")] int VersionMinor,
    [property: JsonPropertyName("versionPatch")] int VersionPatch,
    [property: JsonPropertyName("minEngineMajor")] int MinEngineMajor,
    [property: JsonPropertyName("minEngineMinor")] int MinEngineMinor,
    [property: JsonPropertyName("minEnginePatch")] int MinEnginePatch,
    [property: JsonPropertyName("moduleUuid")] string ModuleUuid,
    [property: JsonPropertyName("moduleType")] string ModuleType,
    [property: JsonPropertyName("moduleVersionMajor")] int ModuleVersionMajor,
    [property: JsonPropertyName("moduleVersionMinor")] int ModuleVersionMinor,
    [property: JsonPropertyName("moduleVersionPatch")] int ModuleVersionPatch,
    [property: JsonPropertyName("formatVersion")] int FormatVersion,
    [property: JsonPropertyName("fileExists")] bool FileExists,
    [property: JsonPropertyName("filePath")] string? FilePath,
    [property: JsonPropertyName("versionString")] string VersionString,
    [property: JsonPropertyName("minEngineString")] string MinEngineString,
    [property: JsonPropertyName("version")] int[]? Version = null,
    [property: JsonPropertyName("minEngineVersion")] int[]? MinEngineVersion = null,
    [property: JsonPropertyName("moduleVersion")] int[]? ModuleVersion = null
);

#endregion

#region Model-to-DTO Mapping Extensions

public static class IpcContractMapper
{
    public static string BuildVirtualTextureUrl(string relativePath, string? fullPath = null, string? packRoot = null)
    {
        if (!string.IsNullOrEmpty(fullPath) && !string.IsNullOrEmpty(packRoot) && File.Exists(fullPath))
        {
            try
            {
                var rel = Path.GetRelativePath(packRoot, fullPath).Replace('\\', '/').TrimStart('/');
                if (!rel.StartsWith("..", StringComparison.Ordinal))
                {
                    return $"https://pack.local/{rel}";
                }
            }
            catch { }
        }

        if (string.IsNullOrWhiteSpace(relativePath)) return string.Empty;
        var normalized = relativePath.Replace('\\', '/').TrimStart('/');
        var ext = !string.IsNullOrEmpty(fullPath) ? Path.GetExtension(fullPath) : ".png";
        if (string.IsNullOrEmpty(ext)) ext = ".png";
        if (!normalized.EndsWith(ext, StringComparison.OrdinalIgnoreCase))
            normalized += ext;
        return $"https://pack.local/{normalized}";
    }

    public static string BuildVirtualVanillaUrl(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return string.Empty;
        var normalized = relativePath.Replace('\\', '/').TrimStart('/');
        if (!normalized.EndsWith(".png", StringComparison.OrdinalIgnoreCase) &&
            !normalized.EndsWith(".tga", StringComparison.OrdinalIgnoreCase))
            normalized += ".png";
        return $"https://vanilla.local/{normalized}";
    }

    public static TextureAliasDto ToDto(this TextureAlias alias, string? packRoot = null)
    {
        var ext = Path.GetExtension(alias.FullPath);
        if (string.IsNullOrEmpty(ext)) ext = ".png";

        var url = alias.Status == TextureStatus.NoEntry
            ? string.Empty
            : BuildVirtualTextureUrl(alias.RelativePath, alias.FullPath, packRoot);

        return new TextureAliasDto(
            Alias: alias.Alias,
            DisplayName: alias.DisplayName,
            RelativePath: alias.RelativePath,
            FullPath: alias.FullPath,
            Category: alias.Category == TextureCategory.Item ? "item" : "block",
            Status: alias.StatusLabel,
            Exists: alias.Exists,
            ImageUrl: url,
            BlockFaces: alias.BlockFaces.Select(b => new BlockFaceUsageDto(b.BlockId, b.Face)).ToList(),
            UsedByBlocks: alias.UsedByBlocks,
            VariantKind: alias.VariantKind.ToString(),
            BlockVariantIndex: alias.BlockVariantIndex,
            TotalBlockVariants: alias.TotalBlockVariants,
            TextureVariantIndex: alias.TextureVariantIndex,
            TotalTextureVariants: alias.TotalTextureVariants,
            Weight: alias.Weight,
            IsFlipbook: alias.IsFlipbook,
            Flipbook: alias.Flipbook != null ? alias.Flipbook.ToDto() : null,
            PrimaryFaceBadgeText: alias.PrimaryFaceBadgeText,
            SubtitleCaption: alias.SubtitleCaption,
            Key: alias.Alias
        );
    }

    public static FlipbookDefinitionDto ToDto(this FlipbookDefinition fb) =>
        new(
            FlipbookTexture: fb.FlipbookTexture,
            AtlasTile: fb.AtlasTile,
            TicksPerFrame: fb.TicksPerFrame,
            Frames: fb.Frames,
            BlendFrames: fb.BlendFrames,
            AtlasIndex: fb.AtlasIndex,
            AtlasTileVariant: fb.AtlasTileVariant
        );

    public static CatalogLeafDto ToDto(this CatalogLeaf leaf, string? packRoot = null)
    {
        var url = leaf.Status == CatalogEntryStatus.NotAdded
            ? BuildVirtualVanillaUrl(leaf.RelativePath)
            : BuildVirtualTextureUrl(leaf.RelativePath, leaf.FullPath, packRoot);

        return new CatalogLeafDto(
            Alias: leaf.Alias,
            DisplayName: leaf.DisplayName,
            RelativePath: leaf.RelativePath,
            FullPath: leaf.FullPath,
            Category: leaf.Category == TextureCategory.Item ? "item" : "block",
            Status: leaf.StatusLabel,
            ImageUrl: url,
            SubtitleCaption: leaf.SubtitleCaption,
            PrimaryFaceBadgeText: leaf.PrimaryFaceBadgeText,
            IsFlipbook: leaf.IsFlipbook,
            Flipbook: leaf.Flipbook != null ? leaf.Flipbook.ToDto() : null
        );
    }

    public static FaceNodeDto ToDto(this FaceNode node, string? packRoot = null) =>
        new(
            FaceLabel: node.FaceLabel,
            Leaves: node.Leaves.Select(l => l.ToDto(packRoot)).ToList(),
            GhostCount: node.GhostCount,
            OrphanCount: node.OrphanCount
        );

    public static AliasGroupNodeDto ToDto(this AliasGroupNode node, string? packRoot = null) =>
        new(
            Alias: node.Alias,
            Category: node.Category == TextureCategory.Item ? "item" : "block",
            FaceSummary: node.FaceSummary,
            FaceNodes: node.FaceNodes.Select(f => f.ToDto(packRoot)).ToList(),
            Leaves: node.Leaves.Select(l => l.ToDto(packRoot)).ToList(),
            GhostCount: node.GhostCount,
            NotAddedCount: node.NotAddedCount
        );

    public static BlockGroupNodeDto ToDto(this BlockGroupNode node, string? packRoot = null) =>
        new(
            BlockId: node.BlockId,
            DisplayName: node.DisplayName,
            Category: node.Category == TextureCategory.Item ? "item" : "block",
            AliasGroups: node.AliasGroups.Select(a => a.ToDto(packRoot)).ToList(),
            GhostCount: node.GhostCount,
            TotalVariants: node.TotalVariants
        );

    public static PackFolderItemDto ToDto(this PackFolderItem item) =>
        new(
            Name: item.Name,
            RelativePath: item.RelativePath,
            FullPath: item.FullPath,
            IsDirectory: item.IsDirectory,
            Depth: item.Depth,
            IsMissing: item.IsMissing,
            TextureCount: item.TextureCount,
            GhostCount: item.GhostCount,
            SubFolders: item.SubFolders.Where(s => !s.IsPlaceholder).Select(s => s.ToDto()).ToList()
        );

    public static RecentPackItemDto ToDto(this RecentPackItem item, string? currentPackRoot = null)
    {
        string? iconUrl = null;
        if (item.HasPackIcon && !string.IsNullOrEmpty(item.PackIconPath))
        {
            if (currentPackRoot != null &&
                string.Equals(item.FolderPath, currentPackRoot, StringComparison.OrdinalIgnoreCase))
            {
                iconUrl = "https://pack.local/pack_icon.png";
            }
            else
            {
                try
                {
                    var bytes = File.ReadAllBytes(item.PackIconPath);
                    iconUrl = $"data:image/png;base64,{Convert.ToBase64String(bytes)}";
                }
                catch { }
            }
        }

        return new RecentPackItemDto(
            FolderPath: item.FolderPath,
            PackName: item.PackName,
            Description: item.Description,
            PackIconPath: item.PackIconPath,
            PackIconUrl: iconUrl,
            HasPackIcon: item.HasPackIcon,
            LastOpened: item.LastOpened,
            RelativeTime: item.RelativeTime,
            Version: item.Version,
            DisplayFolder: item.DisplayFolder
        );
    }

    public static ManifestModelDto ToDto(this ManifestModel m) =>
        new(
            HeaderName: m.HeaderName,
            HeaderDescription: m.HeaderDescription,
            HeaderUuid: m.HeaderUuid,
            VersionMajor: m.VersionMajor,
            VersionMinor: m.VersionMinor,
            VersionPatch: m.VersionPatch,
            MinEngineMajor: m.MinEngineMajor,
            MinEngineMinor: m.MinEngineMinor,
            MinEnginePatch: m.MinEnginePatch,
            ModuleUuid: m.ModuleUuid,
            ModuleType: m.ModuleType,
            ModuleVersionMajor: m.ModuleVersionMajor,
            ModuleVersionMinor: m.ModuleVersionMinor,
            ModuleVersionPatch: m.ModuleVersionPatch,
            FormatVersion: m.FormatVersion,
            FileExists: m.FileExists,
            FilePath: m.FilePath,
            VersionString: m.VersionString,
            MinEngineString: m.MinEngineString,
            Version: new[] { m.VersionMajor, m.VersionMinor, m.VersionPatch },
            MinEngineVersion: new[] { m.MinEngineMajor, m.MinEngineMinor, m.MinEnginePatch },
            ModuleVersion: new[] { m.ModuleVersionMajor, m.ModuleVersionMinor, m.ModuleVersionPatch }
        );

    public static void ApplyTo(this ManifestModelDto dto, ManifestModel m)
    {
        m.HeaderName = dto.HeaderName;
        m.HeaderDescription = dto.HeaderDescription;
        m.HeaderUuid = dto.HeaderUuid;
        m.VersionMajor = dto.VersionMajor;
        m.VersionMinor = dto.VersionMinor;
        m.VersionPatch = dto.VersionPatch;
        m.MinEngineMajor = dto.MinEngineMajor;
        m.MinEngineMinor = dto.MinEngineMinor;
        m.MinEnginePatch = dto.MinEnginePatch;
        m.ModuleUuid = dto.ModuleUuid;
        m.ModuleType = dto.ModuleType;
        m.ModuleVersionMajor = dto.ModuleVersionMajor;
        m.ModuleVersionMinor = dto.ModuleVersionMinor;
        m.ModuleVersionPatch = dto.ModuleVersionPatch;
        m.FormatVersion = dto.FormatVersion;
    }

    public static PackStatsDto ExtractStats(this MainViewModel vm)
    {
        int total = vm.AllAliasCount;
        int ok = vm.TotalAddedCount;
        int ghost = vm.AllGhostCount;
        int orphan = vm.TotalOrphanCount;
        return new PackStatsDto(
            TotalCount: total,
            OkCount: ok,
            GhostCount: ghost,
            OrphanCount: orphan,
            BlocksCount: vm.BlocksTotalCount,
            ItemsCount: vm.ItemsTotalCount,
            BlocksGhostCount: vm.BlocksGhostCount,
            ItemsGhostCount: vm.ItemsGhostCount,
            Total: total,
            Done: ok,
            Ghosts: ghost,
            Orphans: orphan
        );
    }
}

#endregion
