// frontend/src/components/common/FlipbookThumbnail.tsx
import React, { useEffect, useRef, useState } from 'react';
import { FlipbookDefinitionDto } from '../../types/ipc';
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

export interface FlipbookThumbnailProps {
  src: string;
  alt?: string;
  className?: string;
  isFlipbook?: boolean;
  flipbook?: FlipbookDefinitionDto | null;
  loading?: 'lazy' | 'eager';
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
}

export const FlipbookThumbnail: React.FC<FlipbookThumbnailProps> = ({
  src,
  alt = '',
  className,
  isFlipbook = false,
  flipbook,
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

  // Load and inspect image dimensions
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;

    img.onload = () => {
      if (!active) return;
      const nw = img.naturalWidth || 16;
      const nh = img.naturalHeight || 16;
      const isSprite = (isFlipbook || nh > nw) && nh >= nw * 2 && nw > 0;
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
  }, [src, isFlipbook]);

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

    const ticksPerFrame = Math.max(1, flipbook?.ticksPerFrame ?? 1);
    const blendFrames = flipbook?.blendFrames !== false;
    const seq = flipbook?.frames && flipbook.frames.length > 0 ? flipbook.frames : null;
    const seqLen = seq ? seq.length : frameCount;

    const drawFrame = (totalTicks: number) => {
      const stepFloat = totalTicks / ticksPerFrame;
      const currentStep = Math.floor(stepFloat);
      const progress = stepFloat - currentStep;

      const idxA = ((currentStep % seqLen) + seqLen) % seqLen;
      const frameA: number = (seq ? seq[idxA] : idxA) ?? 0;

      if (!blendFrames) {
        if (lastRenderedRef.current.frameA === frameA) return;
        lastRenderedRef.current.frameA = frameA;

        ctx.clearRect(0, 0, frameWidth, frameWidth);
        ctx.drawImage(img, 0, frameA * frameWidth, frameWidth, frameWidth, 0, 0, frameWidth, frameWidth);
      } else {
        const idxB = (((currentStep + 1) % seqLen) + seqLen) % seqLen;
        const frameB: number = (seq ? seq[idxB] : idxB) ?? 0;

        // Skip redraw if identical frame with zero progress change
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
        ctx.drawImage(img, 0, frameA * frameWidth, frameWidth, frameWidth, 0, 0, frameWidth, frameWidth);

        if (frameA !== frameB && progress > 0.01) {
          ctx.globalAlpha = Math.min(1.0, Math.max(0.0, progress));
          ctx.drawImage(img, 0, frameB * frameWidth, frameWidth, frameWidth, 0, 0, frameWidth, frameWidth);
          ctx.globalAlpha = 1.0;
        }
      }
    };

    // Draw frame 0 immediately so there is never a blank flash
    drawFrame((performance.now() / 1000) * 20);

    const unsubscribe = flipbookCoordinator.subscribe(drawFrame);
    return () => {
      unsubscribe();
    };
  }, [imageState, flipbook]);

  if (imageState.hasError) {
    return (
      <img
        src={src}
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
      src={src}
      alt={alt}
      className={`${styles.thumbnailImg} ${className || ''}`}
      loading={loading}
      onError={onError}
    />
  );
};
