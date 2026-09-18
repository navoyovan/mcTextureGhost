import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Edit3, MoreVertical, Layers, Plus } from 'lucide-react';
import { TextureAliasDto, IpcMessageTypes } from '../../types/ipc';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { FlipbookThumbnail } from '../common/FlipbookThumbnail';
import { ContextMenuAnchor } from '../common/TextureContextMenu';
import { TextureDropConfirm } from './TextureDropConfirm';
import styles from './TileHoverMorphPortal.module.css';

const GHOST_ROLLING_TIPS = [
  'Add stub for placeholder',
  'Add vanilla for reference',
  'Drop file to add or replace texture',
];

export interface TileHoverMorphTarget {
  alias: TextureAliasDto;
  key: string;
  originRect: DOMRect;
  domElement: HTMLElement;
  targetType?: 'card' | 'image';
}

interface TileHoverMorphPortalProps {
  target: TileHoverMorphTarget;
  isMenuOpen?: boolean;
  onClose: () => void;
  onEdit: (alias: TextureAliasDto) => void;
  onOpenContextMenu: (alias: TextureAliasDto, anchor: ContextMenuAnchor) => void;
}

interface Coords {
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

// Helper to compute morph target coordinates
const computeMorphCoords = (
  rect: DOMRect,
  imgDimensions: { width: number; height: number } | null,
  isFlipbook: boolean
): Coords => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 16;

  const baseTexWidth = imgDimensions?.width ?? 16;
  const rawTexHeight = imgDimensions?.height ?? 16;
  const isSpriteSheet = Boolean(isFlipbook || (rawTexHeight >= baseTexWidth * 2));
  const effectiveTexHeight = isSpriteSheet ? baseTexWidth : rawTexHeight;

  // Available space inside viewport for the card
  const metaAndActionsHeight = 115;
  const maxAreaW = Math.min(viewportWidth - 2 * margin - 28, 700);
  const maxAreaH = Math.min(viewportHeight - 2 * margin - metaAndActionsHeight - 24, 520);

  // Compute pixel scale: textures < 32px scale up to match 32x32 baseline (at least ~256px sprite)
  const minScaleForSmall = Math.floor(256 / Math.max(baseTexWidth, effectiveTexHeight));
  const maxScaleCap = Math.max(10, minScaleForSmall);
  const maxScaleX = maxAreaW / baseTexWidth;
  const maxScaleY = maxAreaH / effectiveTexHeight;
  const idealScale = Math.min(maxScaleCap, maxScaleX, maxScaleY);
  const finalScale = idealScale >= 1 ? Math.floor(idealScale) : idealScale;

  const idealSpriteW = Math.round(baseTexWidth * finalScale);
  const idealSpriteH = Math.round(effectiveTexHeight * finalScale);

  const expandedWidth = Math.max(260, idealSpriteW + 28);
  const thumbHeight = Math.max(160, idealSpriteH + 24);
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
};

export const TileHoverMorphPortal: React.FC<TileHoverMorphPortalProps> = (props) => (
  // Each target owns its animation state and timers; switching cancels the old close.
  <TileHoverMorphCard key={props.target.key} {...props} />
);

const TileHoverMorphCard: React.FC<TileHoverMorphPortalProps> = ({
  target,
  isMenuOpen = false,
  onClose,
  onEdit,
  onOpenContextMenu,
}) => {
  const [isMorphed, setIsMorphed] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number } | null>(() => {
    if (target.domElement) {
      const img = target.domElement.querySelector('img');
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        return { width: img.naturalWidth, height: img.naturalHeight };
      }
      const canvas = target.domElement.querySelector('canvas');
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        return { width: canvas.width, height: canvas.height };
      }
    }
    return null;
  });

  const storeAlias = usePackStore((s) =>
    s.aliases.find((a) => {
      if (target.alias.fullPath && a.fullPath && a.fullPath.toLowerCase() === target.alias.fullPath.toLowerCase()) {
        return true;
      }
      if (target.alias.relativePath && a.relativePath && a.relativePath.toLowerCase() === target.alias.relativePath.toLowerCase()) {
        return true;
      }
      if (
        a.alias.toLowerCase() === target.alias.alias.toLowerCase() &&
        a.blockVariantIndex === target.alias.blockVariantIndex &&
        a.textureVariantIndex === target.alias.textureVariantIndex
      ) {
        return true;
      }
      return false;
    })
  );
  const [localAdded, setLocalAdded] = useState(false);
  const alias = storeAlias ? { ...target.alias, ...storeAlias } : target.alias;
  const isGhost = localAdded ? false : alias.status === 'GHOST';
  const { postCommand, dropImportTexture } = useIpc();
  const packRoot = usePackStore((s) => s.packRoot);
  const hasVanillaAssets = usePackStore((s) => s.hasVanillaAssets);
  const activeReferenceId = usePackStore((s) => s.activeReferenceId);
  const referencePacks = usePackStore((s) => s.referencePacks);
  const isInstalled = activeReferenceId === 'vanilla'
    ? hasVanillaAssets
    : Boolean(referencePacks?.find((p) => p.id === activeReferenceId)?.packPath);

  // Rolling tips state for ghost morph preview
  const [tipIndex, setTipIndex] = useState(0);
  useEffect(() => {
    if (!isGhost || !isMorphed) return;
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % GHOST_ROLLING_TIPS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [isGhost, isMorphed]);

  // Drag & drop state for morph card
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{ file: File; objectUrl: string } | null>(null);
  const dragCounterRef = useRef(0);

  const processImport = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result as string;
        if (!base64Data) return;

        const targetFullPath =
          alias.fullPath ||
          (packRoot && alias.relativePath
            ? `${packRoot.replace(/[/\\]+$/, '')}\\textures\\${alias.relativePath.replace(/^[/\\]+/, '')}`
            : '');

        if (!targetFullPath) return;

        setLocalAdded(true);
        dropImportTexture({
          aliasKey: alias.alias,
          fullPath: targetFullPath,
          base64Data,
          relativePath: alias.relativePath,
          category: alias.category,
          fileName: file.name,
        });
      };
      reader.readAsDataURL(file);
    },
    [alias, packRoot, dropImportTexture]
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.items?.length) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      setIsDragOver(false);
      dragCounterRef.current = 0;
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file) return;

    const validExtensions = ['.png', '.tga', '.jpg', '.jpeg', '.webp'];
    const lowerName = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => lowerName.endsWith(ext));

    if (!isValid) return;

    if (isGhost) {
      processImport(file);
    } else {
      const objectUrl = URL.createObjectURL(file);
      setPendingDrop({ file, objectUrl });
    }
  };

  const handleConfirmOverwrite = useCallback(() => {
    if (!pendingDrop) return;
    const { file, objectUrl } = pendingDrop;
    processImport(file);
    URL.revokeObjectURL(objectUrl);
    setPendingDrop(null);
  }, [pendingDrop, processImport]);

  const handleCancelOverwrite = useCallback(() => {
    if (pendingDrop) {
      URL.revokeObjectURL(pendingDrop.objectUrl);
      setPendingDrop(null);
    }
  }, [pendingDrop]);

  useEffect(() => {
    return () => {
      if (pendingDrop) {
        URL.revokeObjectURL(pendingDrop.objectUrl);
      }
    };
  }, [pendingDrop]);

  const isImageTarget = target.targetType === 'image' || Boolean(
    target.domElement && (
      target.domElement.className.includes('leafThumb') ||
      target.domElement.className.includes('texVarThumb')
    )
  );

  const resolveTargetElement = useCallback((rootEl: HTMLElement | null) => {
    if (!rootEl) return null;
    if (!isImageTarget) return rootEl;
    if (
      rootEl.tagName.toLowerCase() === 'img' ||
      rootEl.tagName.toLowerCase() === 'canvas' ||
      rootEl.className.includes('leafThumb') ||
      rootEl.className.includes('texVarThumb') ||
      rootEl.className.includes('tileThumbnail')
    ) {
      return rootEl;
    }
    const innerThumb = rootEl.querySelector<HTMLElement>(
      '[class*="leafThumb"], [class*="texVarThumbSlot"], [class*="leafThumbWrapper"], [class*="tileThumbnailWrapper"], img, canvas'
    );
    return innerThumb || rootEl;
  }, [isImageTarget]);

  // Synchronous initial coordinate computation prevents blank mount frame
  const [coords, setCoords] = useState<Coords>(() => {
    let initialRect = target.originRect;
    if (isImageTarget && target.domElement) {
      const el = resolveTargetElement(target.domElement);
      if (el) {
        initialRect = el.getBoundingClientRect();
      }
    }
    return computeMorphCoords(
      initialRect,
      target.domElement
        ? (() => {
          const img = target.domElement.querySelector('img');
          if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
            return { width: img.naturalWidth, height: img.naturalHeight };
          }
          const canvas = target.domElement.querySelector('canvas');
          if (canvas && canvas.width > 0 && canvas.height > 0) {
            return { width: canvas.width, height: canvas.height };
          }
          return null;
        })()
        : null,
      Boolean(target.alias.isFlipbook || target.alias.flipbook)
    );
  });

  const cardRef = useRef<HTMLDivElement>(null);
  const closingTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);

  const [isPeekingMers, setIsPeekingMers] = useState(false);

  // Derive virtual URL for companion PBR MERS map
  const mersUrl = useMemo(() => {
    if (!alias.mersFullPath) return null;
    const packRoot = usePackStore.getState().packRoot;
    if (packRoot && alias.mersFullPath.startsWith(packRoot)) {
      const rel = alias.mersFullPath.slice(packRoot.length).replace(/^[/\\]+/, '').replace(/\\/g, '/');
      return `https://pack.local/${rel}`;
    }
    if (alias.imageUrl) {
      const mersFileName = alias.mersFullPath.split(/[/\\]/).pop();
      if (mersFileName) {
        return alias.imageUrl.replace(/[^/?#]+(\?.*)?$/, `${mersFileName}$1`);
      }
    }
    return null;
  }, [alias.mersFullPath, alias.imageUrl]);

  const activePreviewSrc = (isPeekingMers && mersUrl) ? mersUrl : alias.imageUrl;

  // Fallback dimension loader if DOM image was not yet loaded at mount
  useEffect(() => {
    if (imgDimensions || isGhost || !alias.imageUrl) return;
    const img = new Image();
    img.onload = () => {
      setImgDimensions({
        width: img.naturalWidth || 16,
        height: img.naturalHeight || 16,
      });
    };
    img.src = alias.imageUrl;
    return () => {
      img.onload = null;
    };
  }, [alias.imageUrl, isGhost, imgDimensions]);

  // Update target coordinates smoothly when image dimensions become available
  useEffect(() => {
    if (!imgDimensions) return;
    setCoords((prev) => ({
      ...computeMorphCoords(
        target.originRect,
        imgDimensions,
        Boolean(alias.isFlipbook || alias.flipbook)
      ),
      originalRect: prev.originalRect,
    }));
  }, [imgDimensions, target.originRect, alias.isFlipbook, alias.flipbook]);

  // Guaranteed transition trigger without forced synchronous layout reflow
  React.useLayoutEffect(() => {
    let innerRaf: number | null = null;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => {
        setIsMorphed(true);
      });
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      if (innerRaf !== null) cancelAnimationFrame(innerRaf);
    };
  }, []);

  // Calculate file base and extension
  const rawFileName = alias.relativePath
    ? (alias.relativePath.split(/[/\\]/).pop() ?? alias.displayName ?? alias.alias)
    : (alias.displayName ?? alias.alias);
  const sourceForExt = alias.fullPath || alias.relativePath || alias.imageUrl || rawFileName;
  const dotIdx = sourceForExt.lastIndexOf('.');
  const cleanExt = dotIdx > 0 ? (sourceForExt.substring(dotIdx).split('?')[0] ?? '').split('#')[0] ?? '' : '';
  const fileExt = cleanExt && cleanExt.length <= 5 ? cleanExt : '.png';
  const rawDotIdx = rawFileName.lastIndexOf('.');
  const isMenuOpenRef = useRef(isMenuOpen);
  isMenuOpenRef.current = isMenuOpen;

  const fileBase = rawDotIdx > 0 ? rawFileName.substring(0, rawDotIdx) : rawFileName;

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const triggerSnapBack = useCallback(() => {
    if (isClosing || isMenuOpenRef.current) return;
    clearLeaveTimer();

    // Refresh original rect from live DOM element if still attached
    if (target.domElement) {
      const el = resolveTargetElement(target.domElement) || target.domElement;
      const freshRect = el.getBoundingClientRect();
      setCoords((prev) => ({
        ...prev,
        originalRect: {
          left: freshRect.left,
          top: freshRect.top,
          width: freshRect.width,
          height: freshRect.height,
        },
      }));
    }

    setIsClosing(true);
    setIsMorphed(false);

    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    closingTimerRef.current = window.setTimeout(() => {
      onClose();
    }, 220);
  }, [isClosing, target.domElement, onClose, clearLeaveTimer, resolveTargetElement]);

  const scheduleSnapBack = useCallback(() => {
    if (isClosing || isMenuOpenRef.current) return;
    if (!leaveTimerRef.current) {
      leaveTimerRef.current = window.setTimeout(() => {
        if (isMenuOpenRef.current) return;
        triggerSnapBack();
      }, 100);
    }
  }, [isClosing, triggerSnapBack]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
      clearLeaveTimer();
    };
  }, [clearLeaveTimer]);

  // Scroll tracking
  useEffect(() => {
    if (!target.domElement || isClosing) return;

    const handleScroll = () => {
      if (!target.domElement) return;
      const el = resolveTargetElement(target.domElement) || target.domElement;
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      if (rect.bottom < 0 || rect.top > viewportHeight) {
        triggerSnapBack();
        return;
      }

      setCoords((prev) => ({
        ...prev,
        originalRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      }));
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, [target.domElement, isClosing, triggerSnapBack, resolveTargetElement]);

  // Global dismiss listeners for outside click, window blur, and mousemove bounding (RAF throttled)
  useEffect(() => {
    if (!coords || isClosing) return;
    if (isMenuOpen) {
      clearLeaveTimer();
      return;
    }

    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (rafId !== null) return;
      const clientX = e.clientX;
      const clientY = e.clientY;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const pad = 20;
        const inX = clientX >= coords.left - pad && clientX <= coords.left + coords.width + pad;
        const inY = clientY >= coords.top - pad && clientY <= coords.top + coords.totalHeight + pad;

        if (inX && inY) {
          clearLeaveTimer();
        } else {
          scheduleSnapBack();
        }
      });
    };

    const handleGlobalPointerDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        clearLeaveTimer();
        triggerSnapBack();
      }
    };

    const handleBlur = () => {
      clearLeaveTimer();
      triggerSnapBack();
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('pointerdown', handleGlobalPointerDown);
    window.addEventListener('blur', handleBlur);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerdown', handleGlobalPointerDown);
      window.removeEventListener('blur', handleBlur);
    };
  }, [coords, isClosing, isMenuOpen, triggerSnapBack, clearLeaveTimer, scheduleSnapBack]);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerSnapBack();
    onEdit(alias);
  };

  const handleCreateStub = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalAdded(true);
    postCommand(IpcMessageTypes.TextureEdit, {
      aliasKey: alias.alias,
      fullPath: alias.fullPath,
      isGhost: true,
      createOnly: true,
    });
  };

  const handleExtractReference = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalAdded(true);
    postCommand(IpcMessageTypes.TextureExtractReference, {
      aliasKey: alias.alias,
      fullPath: alias.fullPath,
      relativePath: alias.relativePath,
      category: (alias.category || 'block').toLowerCase(),
    });
  };

  const handleOpenContextMenuClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearLeaveTimer();
    const rect = e.currentTarget.getBoundingClientRect();
    onOpenContextMenu(alias, {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    });
  };

  if (!coords) return null;

  const currentLeft = isMorphed ? coords.left : coords.originalRect.left;
  const currentTop = isMorphed ? coords.top : coords.originalRect.top;
  const currentWidth = isMorphed ? coords.width : coords.originalRect.width;
  const currentHeight = isMorphed ? coords.totalHeight : coords.originalRect.height;
  const currentThumbHeight = isMorphed
    ? coords.thumbHeight
    : (isImageTarget ? coords.originalRect.height : Math.max(0, coords.originalRect.width - 20));
  const baseTexWidth = imgDimensions?.width ?? 16;
  const rawTexHeight = imgDimensions?.height ?? 16;
  const isSpriteSheet = Boolean(alias.isFlipbook || alias.flipbook || (rawTexHeight >= baseTexWidth * 2));
  const effectiveTexHeight = isSpriteSheet ? baseTexWidth : rawTexHeight;

  const getStatusBadge = () => {
    switch (alias.status) {
      case 'OK':
        return <span className={`${styles.badge} ${styles.badgeOk}`}>OK</span>;
      case 'GHOST':
        return <span className={`${styles.badge} ${styles.badgeGhost}`}>GHOST</span>;
      case 'ORPHAN':
        return <span className={`${styles.badge} ${styles.badgeOrphan}`}>ORPHAN</span>;
      case 'OVERRIDE':
        return <span className={`${styles.badge} ${styles.badgeOverride}`}>OVERRIDE</span>;
      default:
        return <span className={`${styles.badge} ${styles.badgeOk}`}>OK</span>;
    }
  };

  return createPortal(
    <div className={styles.portalOverlay}>
      <div
        ref={cardRef}
        className={`${styles.morphCard} ${isImageTarget ? styles.morphCardImageTarget : ''} ${!isGhost ? styles.morphCardImageAdded : ''} ${isGhost ? styles.morphCardGhost : ''} ${isMorphed ? styles.morphed : ''} ${isClosing ? styles.closing : ''} ${isDragOver ? styles.morphCardDragOver : ''}`}
        style={{
          left: `${currentLeft}px`,
          top: `${currentTop}px`,
          width: `${currentWidth}px`,
          height: `${currentHeight}px`,
          pointerEvents: isClosing ? 'none' : 'auto',
        }}
        onMouseEnter={clearLeaveTimer}
        onMouseLeave={() => {
          if (!isMenuOpenRef.current) {
            scheduleSnapBack();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Outside Floating Badges */}
        {isMorphed && (
          <div className={styles.outsideBadgeRow}>
            {getStatusBadge()}
            {alias.isFlipbook && <span className={`${styles.badge} ${styles.badgeAnim}`}>ANIM</span>}
            {alias.hasMers && (
              <span className={`${styles.badge} ${styles.badgeMers} ${isPeekingMers ? styles.badgeMersActive : ''}`}>
                {isPeekingMers ? 'MERS MAP' : 'MERS'}
              </span>
            )}
          </div>
        )}

        {/* Thumbnail Viewport with Checkerboard */}
        <div
          className={styles.thumbArea}
          style={{ height: `${currentThumbHeight}px` }}
        >
          {isMorphed && <div className={styles.thumbCheckerboardBg} />}

          <div className={styles.thumbImageWrapper}>
            {!isGhost && activePreviewSrc ? (
              <FlipbookThumbnail
                src={activePreviewSrc}
                alt={isPeekingMers ? `${alias.alias} (MERS Map)` : alias.alias}
                className={styles.spriteImg}
                isFlipbook={!isPeekingMers && Boolean(alias.isFlipbook)}
                flipbook={!isPeekingMers ? alias.flipbook : null}
              />
            ) : (
              <div className={styles.ghostWrapper}>
                <span className={styles.ghostPlaceholder}>?</span>
                {isMorphed && (() => {
                  const tip = GHOST_ROLLING_TIPS[tipIndex % GHOST_ROLLING_TIPS.length];
                  if (!tip) return null;
                  return (
                    <span key={tipIndex} className={styles.ghostTipText}>
                      {tip}
                    </span>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Full Metadata & Actions when Morphed, lightweight placeholder when unmorphed */}
        {isMorphed ? (
          <>
            <div className={styles.metaArea}>
              <div className={styles.fileNameRow} title={`${fileBase}${fileExt}`}>
                <span className={styles.fileBase}>{fileBase}</span>
                <span className={styles.fileExt}>{fileExt}</span>
              </div>
              <div className={styles.relPath} title={alias.relativePath || alias.alias}>
                {alias.relativePath || alias.alias}
              </div>
              <div className={styles.resRow}>
                <span className={styles.resBadge}>
                  {baseTexWidth}×{effectiveTexHeight} • {alias.category?.toUpperCase() || 'TEXTURE'}
                </span>
              </div>
            </div>

            {/* Quick Action Buttons Toolbar */}
            <div className={styles.actionsBar}>
              {isGhost ? (
                <div className={styles.ghostActionsGroup}>
                  {isInstalled ? (
                    <>
                      <button
                        type="button"
                        className={styles.primaryActionBtn}
                        onClick={handleExtractReference}
                        title="Add authentic vanilla texture to pack"
                      >
                        <Plus size={13} />
                        <span>ADD</span>
                      </button>

                      <button
                        type="button"
                        className={styles.stubSquareBtn}
                        onClick={handleCreateStub}
                        title="Create stub PNG file"
                        aria-label="Create stub PNG"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          className={styles.stubSvgFull}
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <rect x="0" y="0" width="8" height="8" fill="#000000" />
                          <rect x="8" y="0" width="8" height="8" fill="var(--accent-primary, #8CEB1F)" />
                          <rect x="0" y="8" width="8" height="8" fill="var(--accent-primary, #8CEB1F)" />
                          <rect x="8" y="8" width="8" height="8" fill="#000000" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.primaryActionBtn}
                      onClick={handleCreateStub}
                      title="Create stub PNG texture file"
                    >
                      <Plus size={13} />
                      <span>CREATE STUB</span>
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className={`${styles.primaryActionBtn} ${styles.editBtnAnimIn}`}
                  onClick={handleEditClick}
                  title="Edit texture in default editor"
                >
                  <Edit3 size={13} />
                  <span>Edit</span>
                </button>
              )}

              {/* Hold to Peek MERS PBR Map Button */}
              {!isGhost && alias.hasMers && mersUrl && (
                <button
                  type="button"
                  className={`${styles.mersHoldBtn} ${isPeekingMers ? styles.mersHoldBtnActive : ''}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsPeekingMers(true);
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsPeekingMers(false);
                  }}
                  onPointerLeave={() => setIsPeekingMers(false)}
                  onPointerCancel={() => setIsPeekingMers(false)}
                  title="Hold to peek companion MERS PBR map"
                  aria-label="Hold to peek companion MERS PBR map"
                >
                  <Layers size={13} />
                  <span>MERS</span>
                </button>
              )}

              <button
                type="button"
                className={styles.iconActionBtn}
                onClick={handleOpenContextMenuClick}
                title="Texture options"
                aria-label="Texture options"
              >
                <MoreVertical size={14} />
              </button>
            </div>
          </>
        ) : (
          !isImageTarget && <div className={styles.bottomSectionUnmorphed} />
        )}
      </div>

      {/* Overwrite Confirmation Modal */}
      {pendingDrop && (
        <TextureDropConfirm
          alias={alias}
          incomingObjectUrl={pendingDrop.objectUrl}
          incomingFileName={pendingDrop.file.name}
          onConfirm={handleConfirmOverwrite}
          onCancel={handleCancelOverwrite}
        />
      )}
    </div>,
    document.body
  );
};
