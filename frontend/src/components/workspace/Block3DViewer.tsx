// frontend/src/components/workspace/Block3DViewer.tsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RotateCcw } from 'lucide-react';
import { FlipbookDefinitionDto } from '../../types/ipc';
import { flipbookCoordinator } from '../common/FlipbookThumbnail';
import { resolveBlockShape } from '../../config/blockShapes';
import { buildBlockMesh } from './blockGeometryBuilder';
import { isTgaUrl, loadTgaAsDataUrl } from '../../utils/tgaDecoder';
import styles from './Block3DViewer.module.css';

export interface TextureVariationOption {
  index: number;
  label: string;
  badgeNumber?: number;
  textures: {
    up?: string | null;
    down?: string | null;
    north?: string | null;
    south?: string | null;
    east?: string | null;
    west?: string | null;
    all?: string | null;
  };
  flipbooks: {
    up?: FlipbookDefinitionDto | null;
    down?: FlipbookDefinitionDto | null;
    north?: FlipbookDefinitionDto | null;
    south?: FlipbookDefinitionDto | null;
    east?: FlipbookDefinitionDto | null;
    west?: FlipbookDefinitionDto | null;
    all?: FlipbookDefinitionDto | null;
  };
}

export interface BlockStateOption {
  index: number;
  label: string;
  badgeNumber?: number;
  textures: {
    up?: string | null;
    down?: string | null;
    north?: string | null;
    south?: string | null;
    east?: string | null;
    west?: string | null;
    all?: string | null;
  };
  flipbooks: {
    up?: FlipbookDefinitionDto | null;
    down?: FlipbookDefinitionDto | null;
    north?: FlipbookDefinitionDto | null;
    south?: FlipbookDefinitionDto | null;
    east?: FlipbookDefinitionDto | null;
    west?: FlipbookDefinitionDto | null;
    all?: FlipbookDefinitionDto | null;
  };
  variations?: TextureVariationOption[];
}

interface Block3DViewerProps {
  blockId?: string | null;
  faceTextures?: {
    up?: string | null;
    down?: string | null;
    north?: string | null;
    south?: string | null;
    east?: string | null;
    west?: string | null;
    all?: string | null;
  };
  faceFlipbooks?: {
    up?: FlipbookDefinitionDto | null;
    down?: FlipbookDefinitionDto | null;
    north?: FlipbookDefinitionDto | null;
    south?: FlipbookDefinitionDto | null;
    east?: FlipbookDefinitionDto | null;
    west?: FlipbookDefinitionDto | null;
    all?: FlipbookDefinitionDto | null;
  };
  blockStates?: BlockStateOption[];
  activeStateIndex?: number;
  onSelectStateIndex?: (index: number) => void;
  activeVariationIndex?: number;
  onSelectVariationIndex?: (index: number) => void;
}

export const Block3DViewer: React.FC<Block3DViewerProps> = ({
  blockId,
  faceTextures = {},
  faceFlipbooks = {},
  blockStates = [],
  activeStateIndex = 0,
  onSelectStateIndex,
  activeVariationIndex = 0,
  onSelectVariationIndex,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cubeRef = useRef<THREE.Object3D | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Pan & Zoom state
  const cameraTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const zoomLevelRef = useRef<number>(1.0);

  // Drag state ('rotate' | 'pan' | null)
  const dragModeRef = useRef<'rotate' | 'pan' | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const width = containerRef.current.clientWidth || 300;
    const height = containerRef.current.clientHeight || 320;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    cameraRef.current = camera;
    zoomLevelRef.current = 1.0;
    cameraTargetRef.current.set(0, 0, 0);

    camera.position.set(2.6, 2.1, 2.6);
    camera.lookAt(cameraTargetRef.current);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        alpha: true,
        antialias: true,
        powerPreference: 'default',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch (e) {
      console.warn('[Block3DViewer] Failed to initialize WebGLRenderer:', e);
      return;
    }

    // 3. Lighting: Minecraft isometric shading
    // Top face is brightest (1.0), South/North faces slightly shaded (~0.8), East/West (~0.6), Bottom (~0.5)
    // Using an ambient light base + directional light without blowing out or washing out color saturation
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 4, 3);
    scene.add(dirLight);

    const shape = resolveBlockShape(blockId);

    // 4. Materials with Nearest-Neighbor filtering
    const textureLoader = new THREE.TextureLoader();

    interface AnimatedTex {
      texture: THREE.Texture;
      frameCount: number;
      ticksPerFrame: number;
      frames?: number[] | null;
      lastFrame: number;
    }

    const animatedTextures: AnimatedTex[] = [];

    const createMaterial = (
      url?: string | null,
      doubleSided?: boolean,
      flipbook?: FlipbookDefinitionDto | null
    ) => {
      if (!url) {
        return new THREE.MeshStandardMaterial({
          color: 0x3f3f46,
          roughness: 0.9,
          metalness: 0.05,
          side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        });
      }

      const mat = new THREE.MeshStandardMaterial({
        roughness: 0.9,
        metalness: 0.05,
        color: 0x3f3f46,
        transparent: true,
        alphaTest: 0.05,
        depthWrite: true,
        side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      });

      const loadWithUrl = (textureUrl: string) => {
        textureLoader.load(
          textureUrl,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            const img = tex.image as HTMLImageElement | undefined;
            if (img && img.height > img.width && img.width > 0) {
              const frameCount = Math.floor(img.height / img.width);
              tex.wrapS = THREE.ClampToEdgeWrapping;
              tex.wrapT = THREE.ClampToEdgeWrapping;

              const replicate = Math.max(1, flipbook?.replicate ?? 1);
              const inset = 0.05 / img.height;
              const frameH = 1 / frameCount;

              if (replicate > 1) {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(replicate, (frameH - 2 * inset) * replicate);
              } else {
                tex.repeat.set(1, frameH - 2 * inset);
              }
              tex.offset.set(0, 1 - frameH + inset);

              if (frameCount > 1) {
                animatedTextures.push({
                  texture: tex,
                  frameCount,
                  ticksPerFrame: Math.max(1, flipbook?.ticksPerFrame ?? 1),
                  frames: flipbook?.frames && flipbook.frames.length > 0 ? flipbook.frames : null,
                  lastFrame: 0,
                });
              }
            } else {
              tex.wrapS = THREE.ClampToEdgeWrapping;
              tex.wrapT = THREE.ClampToEdgeWrapping;
            }
            tex.needsUpdate = true;
            mat.map = tex;
            mat.color.setHex(0xffffff);
            mat.needsUpdate = true;
            if (isMounted) {
              try {
                renderer.render(scene, camera);
              } catch { }
            }
          },
          undefined,
          () => {
            // On error (missing/corrupted file), fall back to neutral dark material
            mat.color.setHex(0x3f3f46);
            mat.needsUpdate = true;
          }
        );
      };

      if (isTgaUrl(url)) {
        loadTgaAsDataUrl(url)
          .then((dataUrl) => {
            if (isMounted) loadWithUrl(dataUrl);
          })
          .catch(() => {
            if (isMounted) {
              mat.color.setHex(0x3f3f46);
              mat.needsUpdate = true;
            }
          });
      } else {
        loadWithUrl(url);
      }

      return mat;
    };

    // Faces: [East (+X), West (-X), Up (+Y), Down (-Y), South (+Z), North (-Z)]
    const upTex = faceTextures.up || faceTextures.all;
    const downTex = faceTextures.down || faceTextures.all;
    const northTex = faceTextures.north || faceTextures.all;
    const southTex = faceTextures.south || faceTextures.all;
    const eastTex = faceTextures.east || faceTextures.all;
    const westTex = faceTextures.west || faceTextures.all;

    const upFlip = faceFlipbooks.up || faceFlipbooks.all;
    const downFlip = faceFlipbooks.down || faceFlipbooks.all;
    const northFlip = faceFlipbooks.north || faceFlipbooks.all;
    const southFlip = faceFlipbooks.south || faceFlipbooks.all;
    const eastFlip = faceFlipbooks.east || faceFlipbooks.all;
    const westFlip = faceFlipbooks.west || faceFlipbooks.all;

    const faceMats = {
      east: createMaterial(eastTex, false, eastFlip),
      west: createMaterial(westTex, false, westFlip),
      up: createMaterial(upTex, false, upFlip),
      down: createMaterial(downTex, false, downFlip),
      south: createMaterial(southTex, false, southFlip),
      north: createMaterial(northTex, false, northFlip),
    };

    const primaryTex = southTex || upTex || eastTex || northTex || westTex || downTex;
    const primaryFlip = southFlip || upFlip || eastFlip || northFlip || westFlip || downFlip;
    const primaryMat = createMaterial(primaryTex, shape.doubleSided, primaryFlip);

    const rawBlockObj = buildBlockMesh(shape, faceMats, primaryMat);

    // Compute bounding box and center geometries inside a pivot group so rotation occurs around the exact geometric center
    const bbox = new THREE.Box3().setFromObject(rawBlockObj);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    rawBlockObj.position.sub(center);

    const pivotGroup = new THREE.Group();
    pivotGroup.add(rawBlockObj);
    scene.add(pivotGroup);
    cubeRef.current = pivotGroup;

    // Initial default isometric orientation
    const initEuler = new THREE.Euler(Math.atan(1 / Math.SQRT2) * 0.5, Math.PI / 4, 0, 'YXZ');
    pivotGroup.quaternion.setFromEuler(initEuler);

    let isMounted = true;

    // Render loop
    let animId: number;
    const render = () => {
      if (!isMounted) return;
      try {
        renderer.render(scene, camera);
        animId = requestAnimationFrame(render);
      } catch (err) {
        console.warn('[Block3DViewer] Render loop stopped:', err);
      }
    };
    render();

    // Resize Handler
    const handleResize = () => {
      if (!containerRef.current || !isMounted) return;
      try {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      } catch { }
    };
    let unsubscribeFlipbook: (() => void) | null = null;
    if (flipbookCoordinator) {
      unsubscribeFlipbook = flipbookCoordinator.subscribe((totalTicks: number) => {
        if (!isMounted || animatedTextures.length === 0) return;
        let didChange = false;

        for (const item of animatedTextures) {
          const { frameCount, ticksPerFrame, frames } = item;
          const seqLen = frames && frames.length > 0 ? frames.length : frameCount;
          const currentStep = Math.floor(totalTicks / ticksPerFrame);
          const seqIdx = ((currentStep % seqLen) + seqLen) % seqLen;
          const rawFrame = frames && frames.length > 0 ? (frames[seqIdx] ?? 0) : seqIdx;
          const frameIndex = ((rawFrame % frameCount) + frameCount) % frameCount;

          if (frameIndex !== item.lastFrame) {
            item.lastFrame = frameIndex;
            const frameH = 1 / item.frameCount;
            // WebGL Y-texture coordinates run bottom-to-top: frame 0 is at the top of the sprite
            // Include halfTexel margin to prevent sampling border pixels from adjacent frames
            const texImg = item.texture.image as HTMLImageElement | undefined;
            const imgH = texImg?.height || (item.frameCount * 16);
            const subPixel = 0.05 / imgH;

            item.texture.offset.y = 1 - (frameIndex + 1) * frameH + subPixel;
            item.texture.needsUpdate = true;
            didChange = true;
          }
        }

        if (didChange && isMounted) {
          try {
            renderer.render(scene, camera);
          } catch { }
        }
      });
    }

    // Non-passive wheel event listener to completely block page scrolling when zooming inside the viewer
    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!cameraRef.current) return;

      const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.2, Math.min(3.5, zoomLevelRef.current * zoomFactor));
      const ratio = newZoom / zoomLevelRef.current;
      zoomLevelRef.current = newZoom;

      const cam = cameraRef.current;
      const target = cameraTargetRef.current;
      const offset = cam.position.clone().sub(target).multiplyScalar(ratio);
      cam.position.copy(target).add(offset);
    };

    const containerEl = containerRef.current;
    containerEl.addEventListener('wheel', handleWheelNative, { passive: false });

    return () => {
      isMounted = false;
      if (unsubscribeFlipbook) unsubscribeFlipbook();
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      containerEl.removeEventListener('wheel', handleWheelNative);
      pivotGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) {
            child.geometry.dispose();
          }
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          } else if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, [faceTextures, blockId]);

  // Drag Start (supports left-click rotation and middle-click pan)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      // Left click = rotate
      dragModeRef.current = 'rotate';
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    } else if (e.button === 1) {
      // Middle click = pan
      e.preventDefault();
      dragModeRef.current = 'pan';
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }

    if (dragModeRef.current) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  // Pointer Move (global capture ensures dragging off container is not interrupted)
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragModeRef.current) return;

    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    if (dragModeRef.current === 'rotate') {
      if (!cubeRef.current || !cameraRef.current) return;
      if (dx === 0 && dy === 0) return;

      const cam = cameraRef.current;
      const camRight = new THREE.Vector3();
      const camUp = new THREE.Vector3();
      cam.matrixWorld.extractBasis(camRight, camUp, new THREE.Vector3());

      // Rotate around world Y (horizontal mouse motion) and camera right axis (vertical mouse motion)
      const rotSpeed = 0.012;
      const yQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * rotSpeed);
      cubeRef.current.quaternion.premultiply(yQuat);

      const xQuat = new THREE.Quaternion().setFromAxisAngle(camRight, dy * rotSpeed);
      cubeRef.current.quaternion.premultiply(xQuat);
    } else if (dragModeRef.current === 'pan') {
      if (!cameraRef.current) return;

      const cam = cameraRef.current;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      cam.matrixWorld.extractBasis(right, up, new THREE.Vector3());

      const panSpeed = 0.0035 * zoomLevelRef.current;
      const panDelta = right.clone().multiplyScalar(-dx * panSpeed).add(up.clone().multiplyScalar(dy * panSpeed));

      cameraTargetRef.current.add(panDelta);
      cam.position.add(panDelta);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch { }
    }
    dragModeRef.current = null;
  };

  const handleReset = () => {
    if (cubeRef.current) {
      const initEuler = new THREE.Euler(Math.atan(1 / Math.SQRT2) * 0.5, Math.PI / 4, 0, 'YXZ');
      cubeRef.current.quaternion.setFromEuler(initEuler);
    }
    if (cameraRef.current) {
      zoomLevelRef.current = 1.0;
      cameraTargetRef.current.set(0, 0, 0);
      cameraRef.current.position.set(2.6, 2.1, 2.6);
      cameraRef.current.lookAt(cameraTargetRef.current);
    }
  };

  return (
    <div
      ref={containerRef}
      className={styles.viewerContainer}
      onContextMenu={(e) => {
        if (dragModeRef.current === 'pan') e.preventDefault();
      }}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Side Drag Handle on the right for panning */}
      <div
        className={styles.dragHandle}
        title="Drag to pan camera"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          let prevX = e.clientX;
          let prevY = e.clientY;

          const onPointerMove = (moveEv: PointerEvent) => {
            if (!cameraRef.current) return;
            const dx = moveEv.clientX - prevX;
            const dy = moveEv.clientY - prevY;
            prevX = moveEv.clientX;
            prevY = moveEv.clientY;

            const cam = cameraRef.current;
            const right = new THREE.Vector3();
            const up = new THREE.Vector3();
            cam.matrixWorld.extractBasis(right, up, new THREE.Vector3());

            const panSpeed = 0.0035 * zoomLevelRef.current;
            const panDelta = right.clone().multiplyScalar(-dx * panSpeed).add(up.clone().multiplyScalar(dy * panSpeed));

            cameraTargetRef.current.add(panDelta);
            cam.position.add(panDelta);
          };

          const onPointerUp = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
          };

          window.addEventListener('pointermove', onPointerMove, { passive: true });
          window.addEventListener('pointerup', onPointerUp, { passive: true });
          window.addEventListener('pointercancel', onPointerUp, { passive: true });
        }}
      >
        <span className={styles.dragHandleBar} />
        <span className={styles.dragHandleBar} />
        <span className={styles.dragHandleBar} />
      </div>

      <div className={styles.overlayControls}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={handleReset}
          title="Reset to default isometric angle & position"
        >
          <RotateCcw size={11} />
        </button>
      </div>

      {/* Blockstate & Texture Variation Odometer Cluster in down-left */}
      {(() => {
        const activeSt = blockStates.find((s) => s.index === activeStateIndex) ?? blockStates[0];
        const variations = activeSt?.variations ?? [];
        const hasBlockStates = blockStates.length > 1;
        const hasVariations = variations.length > 1;

        if (!hasBlockStates && !hasVariations) return null;

        return (
          <div className={styles.odometerCluster}>
              {/* Vertical stack of blockstates ascending upwards */}
              {hasBlockStates && (
                <>
                  <div
                    className={styles.verticalOdometerStack}
                    title="Scroll or click to switch blockstate"
                    onWheel={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (!onSelectStateIndex) return;
                      const delta = e.deltaY > 0 ? 1 : -1;
                      const n = blockStates.length;
                      const nextIdx = (((activeStateIndex + delta) % n) + n) % n;
                      onSelectStateIndex(nextIdx);
                    }}
                  >
                    {blockStates.map((st) => {
                      const isSelected = st.index === activeStateIndex;
                      const stLabel = st.badgeNumber ?? st.index + 1;
                      return (
                        <button
                          key={`st_${st.index}`}
                          type="button"
                          className={`${styles.odometerButton} ${isSelected ? styles.odometerButtonActive : ''}`}
                          onClick={() => onSelectStateIndex?.(st.index)}
                          title={`Blockstate ${stLabel}: ${st.label}`}
                        >
                          {stLabel}
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.odometerDividerH} />
                </>
              )}

              {/* Bottom row: Active corner button + Horizontal stack of texture variations */}
              <div className={styles.bottomOdometerRow}>
                {/* Active corner button showing compound index (e.g. 1a, 1b or 1, a) */}
                {activeSt && (
                  <button
                    type="button"
                    className={`${styles.odometerButton} ${styles.odometerButtonActive}`}
                    onClick={() => {
                      if (hasBlockStates && onSelectStateIndex) {
                        onSelectStateIndex((activeStateIndex + 1) % blockStates.length);
                      } else if (hasVariations && onSelectVariationIndex) {
                        onSelectVariationIndex((activeVariationIndex + 1) % variations.length);
                      }
                    }}
                    title={`Selected: State ${activeSt.badgeNumber ?? activeSt.index + 1}${hasVariations ? `, Variation ${String.fromCharCode(97 + (activeVariationIndex % 26))}` : ''}`}
                  >
                    {hasBlockStates && hasVariations
                      ? `${activeSt.badgeNumber ?? activeSt.index + 1}${String.fromCharCode(97 + (activeVariationIndex % 26))}`
                      : hasBlockStates
                      ? `${activeSt.badgeNumber ?? activeSt.index + 1}`
                      : `${String.fromCharCode(97 + (activeVariationIndex % 26))}`}
                  </button>
                )}

                {/* Horizontal texture variation list extending to the right */}
                {hasVariations && (
                  <div
                    className={styles.horizontalOdometerTrack}
                    title="Scroll or click to switch texture variation"
                    onWheel={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (!onSelectVariationIndex) return;
                      const delta = e.deltaY > 0 ? 1 : -1;
                      const n = variations.length;
                      const nextIdx = (((activeVariationIndex + delta) % n) + n) % n;
                      onSelectVariationIndex(nextIdx);
                    }}
                  >
                    <div className={styles.odometerDividerV} />
                    {variations.map((v) => {
                      const isSelected = v.index === activeVariationIndex;
                      const charLabel = String.fromCharCode(97 + (v.index % 26));
                      return (
                        <button
                          key={`v_${v.index}`}
                          type="button"
                          className={`${styles.odometerButton} ${isSelected ? styles.odometerButtonActive : ''}`}
                          onClick={() => onSelectVariationIndex?.(v.index)}
                          title={`Texture variation ${charLabel}: ${v.label}`}
                        >
                          {charLabel}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
          </div>
        );
      })()}

      <span className={styles.hintText}>Drag to rotate • Middle-drag to pan • Scroll to zoom</span>
    </div>
  );
};
