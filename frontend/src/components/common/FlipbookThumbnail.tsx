import React, { useEffect, useRef, useState } from 'react';
import { FlipbookDefinitionDto } from '../../types/ipc';
import { isTgaUrl, loadTgaAsDataUrl } from '../../utils/tgaDecoder';
import styles from './FlipbookThumbnail.module.css';

type RenderCallback = (totalTicks: number) => void;

/**
 * Centralized frame coordinator for Minecraft Bedrock flipbook animated textures.
 * Synchronizes all animations to the 20Hz (50ms) Minecraft global world tick clock.
 * Starts a single requestAnimationFrame loop only when at least one flipbook is mounted.
 */
class FlipbookCoordinator {
  private subscribers = new Set<RenderCallback>();
  private animId: number | null = null;
  private isRunning = false;

  public subscribe(cb: RenderCallback): () => void {
    this.subscribers.add(cb);
    if (!this.isRunning) {
      this.start();
    }
    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0) {
        this.stop();
      }
    };
  }

  private start(): void {
    this.isRunning = true;
    const loop = () => {
      if (!this.isRunning) return;
      const nowSeconds = performance.now() / 1000;
      const totalTicks = nowSeconds * 20; // 20 ticks per second
      this.subscribers.forEach((cb) => {
        try {
          cb(totalTicks);
        } catch {
          // Keep loop resilient
        }
      });
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  private stop(): void {
    this.isRunning = false;
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }
}

export const flipbookCoordinator = new FlipbookCoordinator();

let globalMousePos: { x: number; y: number } | null = null;
const mouseListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener(
    'mousemove',
    (e) => {
      globalMousePos = { x: e.clientX, y: e.clientY };
      mouseListeners.forEach((cb) => {
        try {
          cb();
        } catch {
          // ignore
        }
      });
    },
    { passive: true }
  );
}

export function detectEasterEggType(aliasKey?: string, src?: string): 'compass' | 'clock' | null {
  const key = (aliasKey || '').toLowerCase();
  const path = (src || '').toLowerCase();

  if (
    key.includes('compass') ||
    path.includes('compass')
  ) {
    return 'compass';
  }

  if (
    key.includes('clock') ||
    key.includes('watch') ||
    path.includes('clock') ||
    path.includes('watch')
  ) {
    return 'clock';
  }

  return null;
}

export interface FlipbookThumbnailProps {
  src: string;
  atlasSrc?: string | null;
  alt?: string;
  className?: string;
  isFlipbook?: boolean;
  flipbook?: FlipbookDefinitionDto | null;
  aliasKey?: string;
  loading?: 'lazy' | 'eager';
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
}

const AnimatedFlipbookThumbnail: React.FC<FlipbookThumbnailProps> = ({
  src,
  atlasSrc,
  alt = '',
  className,
  isFlipbook = false,
  flipbook,
  aliasKey,
  loading = 'lazy',
  onError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageState, setImageState] = useState<{
    img: HTMLImageElement | null;
    isSpriteSheet: boolean;
    frameWidth: number;
    frameCount: number;
    hasError: boolean;
  }>({
    img: null,
    isSpriteSheet: false,
    frameWidth: 16,
    frameCount: 1,
    hasError: false,
  });

  const lastRenderedRef = useRef<{
    frameA: number;
    frameB: number;
    progress: number;
  }>({ frameA: -1, frameB: -1, progress: -1 });

  const activeSrc = atlasSrc || src;
  const [resolvedSrc, setResolvedSrc] = useState<string>(activeSrc);

  const easterEggType = detectEasterEggType(aliasKey || alt, activeSrc);

  // Resolve TGA if needed
  useEffect(() => {
    let active = true;
    if (isTgaUrl(activeSrc)) {
      loadTgaAsDataUrl(activeSrc)
        .then((dataUrl) => {
          if (active) setResolvedSrc(dataUrl);
        })
        .catch(() => {
          if (active) setImageState((prev) => ({ ...prev, hasError: true }));
        });
    } else {
      setResolvedSrc(activeSrc);
    }
    return () => {
      active = false;
    };
  }, [activeSrc]);

  // Load and inspect image dimensions
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = resolvedSrc;

    img.onload = () => {
      if (!active) return;
      const nw = img.naturalWidth || 16;
      const nh = img.naturalHeight || 16;
      const isSprite = (isFlipbook || Boolean(atlasSrc) || Boolean(easterEggType) || nh > nw) && nh >= nw * 2 && nw > 0;
      const count = isSprite ? Math.max(1, Math.floor(nh / nw)) : 1;

      setImageState({
        img,
        isSpriteSheet: isSprite,
        frameWidth: nw,
        frameCount: count,
        hasError: false,
      });
    };

    img.onerror = () => {
      if (!active) return;
      setImageState((prev) => ({ ...prev, hasError: true }));
    };

    return () => {
      active = false;
    };
  }, [resolvedSrc, isFlipbook, atlasSrc, easterEggType]);

  // Handle animation loop subscription and frame drawing
  useEffect(() => {
    if (!imageState.isSpriteSheet || !imageState.img || imageState.hasError) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const { img, frameWidth, frameCount } = imageState;
    canvas.width = frameWidth;
    canvas.height = frameWidth;
    ctx.imageSmoothingEnabled = false;

    const renderTiled = (frameIndex: number) => {
      const replicate = Math.max(1, flipbook?.replicate ?? 1);
      if (replicate === 1) {
        ctx.drawImage(img, 0, frameIndex * frameWidth, frameWidth, frameWidth, 0, 0, frameWidth, frameWidth);
      } else {
        const subSize = frameWidth / replicate;
        for (let rx = 0; rx < replicate; rx++) {
          for (let ry = 0; ry < replicate; ry++) {
            ctx.drawImage(
              img,
              0,
              frameIndex * frameWidth,
              frameWidth,
              frameWidth,
              rx * subSize,
              ry * subSize,
              subSize,
              subSize
            );
          }
        }
      }
    };

    // ─── 1. Compass Easter Egg (Follow User Mouse) ───
    if (easterEggType === 'compass') {
      const drawCompass = () => {
        let frameIndex = 16; // default North
        if (globalMousePos && canvas) {
          const rect = canvas.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = globalMousePos.x - cx;
          const dy = globalMousePos.y - cy;
          // In vanilla compass_atlas.png:
          // Frame 0 is South, Frame 8 is West, Frame 16 is North, Frame 24 is East
          const angle = Math.atan2(dy, dx);
          let norm = (angle - Math.PI / 2) / (Math.PI * 2);
          norm = ((norm % 1.0) + 1.0) % 1.0;
          frameIndex = Math.round(norm * frameCount) % frameCount;
        }

        if (lastRenderedRef.current.frameA === frameIndex) return;
        lastRenderedRef.current.frameA = frameIndex;

        ctx.clearRect(0, 0, frameWidth, frameWidth);
        renderTiled(frameIndex);
      };

      drawCompass();
      mouseListeners.add(drawCompass);

      return () => {
        mouseListeners.delete(drawCompass);
      };
    }

    // ─── 2. Clock Easter Egg (Follow Real-World Local Time) ───
    if (easterEggType === 'clock') {
      const drawClock = () => {
        const now = new Date();
        const totalDaySeconds =
          now.getHours() * 3600 +
          now.getMinutes() * 60 +
          now.getSeconds() +
          now.getMilliseconds() / 1000;
        const dayProgress = totalDaySeconds / 86400; // 0.0 to 1.0 (0.0 = midnight)
        // In vanilla watch_atlas.png:
        // Frame 0 is 12:00 Midday, Frame 16 is 18:00 Sunset, Frame 32 is 00:00 Midnight, Frame 48 is 06:00 Sunrise
        let clockOffset = (dayProgress - 0.50) % 1.0;
        if (clockOffset < 0) clockOffset += 1.0;

        const stepFloat = clockOffset * frameCount;
        const frameA = Math.floor(stepFloat) % frameCount;
        const frameB = (frameA + 1) % frameCount;
        const progress = stepFloat - Math.floor(stepFloat);

        if (
          lastRenderedRef.current.frameA === frameA &&
          lastRenderedRef.current.frameB === frameB &&
          Math.abs(lastRenderedRef.current.progress - progress) < 0.01
        ) {
          return;
        }

        lastRenderedRef.current = { frameA, frameB, progress };

        ctx.clearRect(0, 0, frameWidth, frameWidth);
        ctx.globalAlpha = 1.0;
        renderTiled(frameA);

        if (frameA !== frameB && progress > 0.01) {
          ctx.globalAlpha = Math.min(1.0, Math.max(0.0, progress));
          renderTiled(frameB);
          ctx.globalAlpha = 1.0;
        }
      };

      drawClock();
      let unsubscribe: (() => void) | null = null;

      const observer = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry && entry.isIntersecting) {
            if (!unsubscribe) {
              unsubscribe = flipbookCoordinator.subscribe(drawClock);
            }
          } else {
            if (unsubscribe) {
              unsubscribe();
              unsubscribe = null;
            }
          }
        },
        { rootMargin: '100px' }
      );

      observer.observe(canvas);

      return () => {
        observer.disconnect();
        if (unsubscribe) unsubscribe();
      };
    }

    // ─── 3. Standard Global Tick Flipbook Loop ───
    const ticksPerFrame = Math.max(1, flipbook?.ticksPerFrame ?? 1);
    const blendFrames = flipbook?.blendFrames !== false;
    const seq = flipbook?.frames && flipbook.frames.length > 0 ? flipbook.frames : null;
    const seqLen = seq ? seq.length : frameCount;

    const drawFrame = (totalTicks: number) => {
      const stepFloat = totalTicks / ticksPerFrame;
      const currentStep = Math.floor(stepFloat);
      const progress = stepFloat - currentStep;

      const idxA = ((currentStep % seqLen) + seqLen) % seqLen;
      const rawFrameA: number = (seq ? seq[idxA] : idxA) ?? 0;
      const frameA = ((rawFrameA % frameCount) + frameCount) % frameCount;

      if (!blendFrames) {
        if (lastRenderedRef.current.frameA === frameA) return;
        lastRenderedRef.current.frameA = frameA;

        ctx.clearRect(0, 0, frameWidth, frameWidth);
        renderTiled(frameA);
      } else {
        const idxB = (((currentStep + 1) % seqLen) + seqLen) % seqLen;
        const rawFrameB: number = (seq ? seq[idxB] : idxB) ?? 0;
        const frameB = ((rawFrameB % frameCount) + frameCount) % frameCount;

        if (
          lastRenderedRef.current.frameA === frameA &&
          lastRenderedRef.current.frameB === frameB &&
          Math.abs(lastRenderedRef.current.progress - progress) < 0.02
        ) {
          return;
        }

        lastRenderedRef.current = { frameA, frameB, progress };

        ctx.clearRect(0, 0, frameWidth, frameWidth);
        ctx.globalAlpha = 1.0;
        renderTiled(frameA);

        if (frameA !== frameB && progress > 0.01) {
          ctx.globalAlpha = Math.min(1.0, Math.max(0.0, progress));
          renderTiled(frameB);
          ctx.globalAlpha = 1.0;
        }
      }
    };

    // Draw frame 0 immediately so there is never a blank flash
    drawFrame((performance.now() / 1000) * 20);

    // Only subscribe to the global animation tick loop when the canvas is intersecting the viewport
    let unsubscribe: (() => void) | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && entry.isIntersecting) {
          if (!unsubscribe) {
            unsubscribe = flipbookCoordinator.subscribe(drawFrame);
          }
        } else {
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(canvas);

    return () => {
      observer.disconnect();
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [imageState, flipbook, easterEggType]);

  if (imageState.hasError) {
    return (
      <img
        src={resolvedSrc}
        alt={alt}
        className={`${styles.thumbnailImg} ${className || ''}`}
        loading={loading}
        onError={onError}
      />
    );
  }

  if (imageState.isSpriteSheet) {
    return (
      <canvas
        ref={canvasRef}
        className={`${styles.thumbnailCanvas} ${className || ''}`}
        title={alt}
        aria-label={alt}
      />
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={`${styles.thumbnailImg} ${className || ''}`}
      loading={loading}
      onError={onError}
    />
  );
};

export const FlipbookThumbnail: React.FC<FlipbookThumbnailProps> = (props) => {
  const isEasterEgg = Boolean(detectEasterEggType(props.aliasKey || props.alt, props.atlasSrc || props.src));

  // FAST-PATH: If this is definitely a static texture and not a TGA or easter egg, render native <img> directly
  if (!props.isFlipbook && !props.flipbook && !props.atlasSrc && !isEasterEgg && !isTgaUrl(props.src)) {
    return (
      <img
        src={props.src}
        alt={props.alt || ''}
        className={`${styles.thumbnailImg} ${props.className || ''}`}
        loading={props.loading || 'lazy'}
        decoding="async"
        onError={props.onError}
      />
    );
  }

  return <AnimatedFlipbookThumbnail {...props} />;
};
