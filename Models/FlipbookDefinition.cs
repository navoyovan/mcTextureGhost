namespace McTextureGhost.Models;

/// <summary>
/// Represents an entry from textures/flipbook_textures.json defining an animated block texture.
/// </summary>
public record FlipbookDefinition(
    string FlipbookTexture,
    string AtlasTile,
    int TicksPerFrame = 1,
    int[]? Frames = null,
    bool BlendFrames = true,
    int? AtlasIndex = null,
    int? AtlasTileVariant = null
);
