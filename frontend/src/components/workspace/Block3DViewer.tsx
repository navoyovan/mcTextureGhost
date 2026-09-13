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
}

export const Block3DViewer: React.FC<Block3DViewerProps> = ({
  blockId,
  faceTextures = {},
  faceFlipbooks = {},
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cubeRef = useRef<THREE.Object3D | null>(null);

  // Track rotation state
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const width = containerRef.current.clientWidth || 300;
    const height = containerRef.current.clientHeight || 220;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(2.2, 1.8, 2.2);
    camera.lookAt(0, 0, 0);

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

    const blockObj = buildBlockMesh(shape, faceMats, primaryMat);
    scene.add(blockObj);
    cubeRef.current = blockObj;

    // Initial default isometric orientation
    const initEuler = new THREE.Euler(Math.atan(1 / Math.SQRT2) * 0.5, Math.PI / 4, 0, 'YXZ');
    blockObj.quaternion.setFromEuler(initEuler);

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

    return () => {
      isMounted = false;
      if (unsubscribeFlipbook) unsubscribeFlipbook();
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      blockObj.traverse((child) => {
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

  // Project 2D client coordinates onto a virtual unit hemisphere (Trackball / Arcball)
  const projectToTrackballSphere = (clientX: number, clientY: number): THREE.Vector3 => {
    if (!containerRef.current) return new THREE.Vector3(0, 0, 1);
    const rect = containerRef.current.getBoundingClientRect();
    const w = rect.width || 300;
    const h = rect.height || 220;
    const r = Math.min(w, h) * 0.5;

    // Center-relative coordinates normalized by radius
    const x = (clientX - rect.left - w * 0.5) / r;
    const y = -(clientY - rect.top - h * 0.5) / r;

    const lenSq = x * x + y * y;
    let z = 0;
    if (lenSq <= 1.0) {
      z = Math.sqrt(1.0 - lenSq);
    } else {
      // Hyperbolic fallback outside virtual sphere
      z = 0.5 / Math.sqrt(lenSq);
    }

    return new THREE.Vector3(x, y, z).normalize();
  };

  const lastTrackballVecRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 1));

  // Orbit rotation interaction via virtual trackball (arcball)
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastTrackballVecRef.current = projectToTrackballSphere(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !cubeRef.current) return;

    const currentVec = projectToTrackballSphere(e.clientX, e.clientY);
    const prevVec = lastTrackballVecRef.current;

    // Angle of rotation around the cross-product axis
    const dot = Math.min(1.0, Math.max(-1.0, prevVec.dot(currentVec)));
    const angle = Math.acos(dot);

    if (angle > 0.001) {
      const axis = new THREE.Vector3().crossVectors(prevVec, currentVec).normalize();
      // Incremental rotation in camera view space
      const deltaQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle * 1.5);
      // Pre-multiply quaternion so rotation happens relative to current viewing perspective
      cubeRef.current.quaternion.premultiply(deltaQuat);
      lastTrackballVecRef.current = currentVec;
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleResetRotation = () => {
    if (cubeRef.current) {
      const initEuler = new THREE.Euler(Math.atan(1 / Math.SQRT2) * 0.5, Math.PI / 4, 0, 'YXZ');
      cubeRef.current.quaternion.setFromEuler(initEuler);
    }
  };

  return (
    <div
      ref={containerRef}
      className={styles.viewerContainer}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas ref={canvasRef} className={styles.canvas} />

      <div className={styles.overlayControls}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={handleResetRotation}
          title="Reset to default isometric angle"
        >
          <RotateCcw size={11} />
        </button>
      </div>

      <span className={styles.hintText}>Drag to rotate 360°</span>
    </div>
  );
};
