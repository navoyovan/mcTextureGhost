// frontend/src/components/grid/useMorphCoordinates.ts

export interface MorphCoords {
  left: number;
  top: number;
  width: number;
  thumbHeight: number;
  totalHeight: number;
  originalRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

/**
 * Calculates pixel-perfect bounding coordinates for the expanded morph card
 * based on viewport boundaries, sprite dimensions, and aspect ratio.
 */
export function computeMorphCoords(
  rect: DOMRect,
  imgDimensions: { width: number; height: number } | null,
  isFlipbook: boolean
): MorphCoords {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 16;

  const baseTexWidth = imgDimensions?.width ?? 16;
  const rawTexHeight = imgDimensions?.height ?? 16;
  const isSpriteSheet = Boolean(isFlipbook || (rawTexHeight >= baseTexWidth * 2));
  const effectiveTexHeight = isSpriteSheet ? baseTexWidth : rawTexHeight;

  // Available space inside viewport for the card
  const metaAndActionsHeight = 116;
  const maxAreaW = Math.min(viewportWidth - 2 * margin - 28, 700);
  const maxAreaH = Math.min(viewportHeight - 2 * margin - metaAndActionsHeight - 24, 520);
  const maxThumbDimension = Math.min(maxAreaW, maxAreaH);

  // Compute pixel scale: textures < 32px scale up to match 32x32 baseline (at least ~256px sprite)
  const maxTexDim = Math.max(baseTexWidth, effectiveTexHeight);
  const minScaleForSmall = Math.floor(256 / maxTexDim);
  const maxScaleCap = Math.max(10, minScaleForSmall);
  const maxScale = (maxThumbDimension - 28) / maxTexDim;
  const idealScale = Math.min(maxScaleCap, maxScale);
  const finalScale = idealScale >= 1 ? Math.floor(idealScale) : idealScale;

  const idealSpriteSize = Math.max(
    Math.round(baseTexWidth * finalScale),
    Math.round(effectiveTexHeight * finalScale)
  );

  // Make thumbnail container perfectly square (1:1) so it matches the tile aspect ratio
  const thumbDimension = Math.min(maxThumbDimension, Math.max(260, idealSpriteSize + 24));
  const expandedWidth = thumbDimension;
  const thumbHeight = thumbDimension;
  const totalHeight = thumbHeight + metaAndActionsHeight;

  const originalCenterX = rect.left + rect.width / 2;
  let left = originalCenterX - expandedWidth / 2;

  if (left < margin) {
    left = margin;
  } else if (left + expandedWidth > viewportWidth - margin) {
    left = viewportWidth - margin - expandedWidth;
  }

  const topMargin = 36;
  let top = rect.top - 20;
  if (top + totalHeight > viewportHeight - margin) {
    top = viewportHeight - margin - totalHeight;
  }
  if (top < topMargin) {
    top = topMargin;
  }

  return {
    left,
    top,
    width: expandedWidth,
    thumbHeight,
    totalHeight,
    originalRect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
  };
}
