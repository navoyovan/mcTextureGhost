// frontend/src/components/workspace/Entity3DViewer.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { RotateCcw, Play, Pause, Eye, EyeOff } from 'lucide-react';
import { useIpc } from '../../hooks/useIpc';
import { IpcMessageTypes, GeometryDataPayload } from '../../types/ipc';
import { parseBedrockGeometryJson, buildEntityModel } from './entityGeometryBuilder';
import { isTgaUrl, loadTgaAsDataUrl } from '../../utils/tgaDecoder';
import styles from './Entity3DViewer.module.css';

export interface Entity3DViewerProps {
  geometryId?: string | null;
  entityId?: string | null;
  textureUrl?: string | null;
  isGhost?: boolean;
  isAttachable?: boolean;
}

export const Entity3DViewer: React.FC<Entity3DViewerProps> = React.memo(({
  geometryId,
  entityId,
  textureUrl,
  isGhost = false,
  isAttachable = false,
}) => {
  const { subscribe, postCommand } = useIpc();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Pan & Zoom state
  const cameraTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const zoomLevelRef = useRef<number>(1.0);

  // Drag state ('rotate' | 'pan' | null)
  const dragModeRef = useRef<'rotate' | 'pan' | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Toggles & Display States
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [geoStats, setGeoStats] = useState<{ bones: number; texSize: string; identifier: string } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const autoRotateRef = useRef<boolean>(autoRotate);
  autoRotateRef.current = autoRotate;

  const wireframeRef = useRef<boolean>(wireframe);
  wireframeRef.current = wireframe;

  // Main 3D Canvas Effect
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    let isMounted = true;
    setIsLoading(true);
    setLoadingError(null);
    setGeoStats(null);

    const width = containerRef.current.clientWidth || 300;
    const height = containerRef.current.clientHeight || 320;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    cameraRef.current = camera;
    zoomLevelRef.current = 1.0;
    cameraTargetRef.current.set(0, 0, 0);

    camera.position.set(24, 20, 32);
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
      rendererRef.current = renderer;
    } catch (e) {
      console.warn('[Entity3DViewer] WebGLRenderer init failed:', e);
      return;
    }

    // 2. Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight1.position.set(20, 40, 30);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x94a3b8, 0.35);
    dirLight2.position.set(-20, -10, -20);
    scene.add(dirLight2);

    // 3. Grid Plane
    const gridHelper = new THREE.GridHelper(32, 16, 0x52525b, 0x27272a);
    gridHelper.position.y = -10;
    scene.add(gridHelper);

    // 4. Material Setup
    const textureLoader = new THREE.TextureLoader();
    let currentMaterial = new THREE.MeshStandardMaterial({
      color: isGhost ? 0x64748b : 0x3f3f46,
      roughness: 0.85,
      metalness: 0.05,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: true,
      wireframe: wireframeRef.current,
      side: THREE.DoubleSide,
    });

    const applyTexture = (tex: THREE.Texture) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;

      currentMaterial.map = tex;
      currentMaterial.color.setHex(0xffffff);
      currentMaterial.needsUpdate = true;
    };

    if (textureUrl && !isGhost) {
      if (isTgaUrl(textureUrl)) {
        loadTgaAsDataUrl(textureUrl)
          .then((dataUrl) => {
            if (!isMounted) return;
            textureLoader.load(dataUrl, (t) => {
              if (isMounted) applyTexture(t);
            });
          })
          .catch((err) => console.warn('[Entity3DViewer] TGA load error:', err));
      } else {
        textureLoader.load(
          textureUrl,
          (t) => {
            if (isMounted) applyTexture(t);
          },
          undefined,
          (err) => console.warn('[Entity3DViewer] Texture load error:', err)
        );
      }
    }

    // 5. Build Model from Bedrock Geometry JSON
    const pivotGroup = new THREE.Group();
    scene.add(pivotGroup);
    modelGroupRef.current = pivotGroup;

    let hasBuiltGeometry = false;

    const buildMeshFromGeoJson = (rawJson: string) => {
      if (hasBuiltGeometry || !isMounted) return;

      const geoData = parseBedrockGeometryJson(rawJson, geometryId);
      if (!geoData || !geoData.bones || geoData.bones.length === 0) {
        return;
      }

      hasBuiltGeometry = true;
      setIsLoading(false);
      setLoadingError(null);
      setGeoStats({
        bones: geoData.bones.length,
        texSize: `${geoData.texturewidth || 64}×${geoData.textureheight || 32}`,
        identifier: geometryId || entityId || 'Entity',
      });

      // Clear previous meshes
      while (pivotGroup.children.length > 0) {
        const c = pivotGroup.children[0];
        if (!c) break;
        pivotGroup.remove(c);
        if (c instanceof THREE.Mesh) {
          c.geometry.dispose();
        }
      }

      const entityGroup = buildEntityModel(geoData, currentMaterial);
      pivotGroup.add(entityGroup);

      // Frame camera around bounding box
      const box = new THREE.Box3().setFromObject(pivotGroup);
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 16);
        const center = box.getCenter(new THREE.Vector3());

        cameraTargetRef.current.copy(center);
        camera.position.set(center.x + maxDim * 1.3, center.y + maxDim * 0.85, center.z + maxDim * 1.5);
        camera.lookAt(center);

        gridHelper.position.y = box.min.y;
      }
    };

    // 6. IPC Listener for GEOMETRY:DATA
    const unsubGeometryData = subscribe(IpcMessageTypes.GeometryData, (payload: GeometryDataPayload) => {
      if (!isMounted || hasBuiltGeometry) return;
      if (payload && payload.rawJson && payload.rawJson.trim().startsWith('{')) {
        buildMeshFromGeoJson(payload.rawJson);
      }
    });

    // Request geometry from host via IPC
    postCommand(IpcMessageTypes.GeometryGet, { geometryId, entityId });

    // 7. Concurrent HTTP candidate fetcher
    const tryFetchGeometry = async () => {
      const candidates: string[] = [];

      const cleanEntity = (entityId || '').replace(/^minecraft:/i, '').toLowerCase();
      const cleanGeo = (geometryId || '').replace(/^geometry\./i, '').toLowerCase();
      const isBaby = cleanGeo.includes('baby') || (entityId || '').includes('baby');
      const baseGeo = cleanGeo.replace(/\.baby$/, '').split('.')[0];

      // Exact model candidates
      if (cleanGeo) {
        candidates.push(`https://pack.local/models/entity/${cleanGeo}.geo.json`);
        candidates.push(`https://vanilla.local/models/entity/${cleanGeo}.geo.json`);
      }

      // If this is a baby model, prioritize baby_<baseGeo> before adult models
      if (isBaby) {
        if (baseGeo) {
          candidates.push(`https://pack.local/models/entity/baby_${baseGeo}.geo.json`);
          candidates.push(`https://vanilla.local/models/entity/baby_${baseGeo}.geo.json`);
        }
        if (cleanEntity && cleanEntity !== baseGeo) {
          candidates.push(`https://pack.local/models/entity/baby_${cleanEntity}.geo.json`);
          candidates.push(`https://vanilla.local/models/entity/baby_${cleanEntity}.geo.json`);
        }
      }

      // Base geometry (adult) fallback ONLY if NOT a baby request
      if (!isBaby && baseGeo && baseGeo !== cleanGeo) {
        candidates.push(`https://pack.local/models/entity/${baseGeo}.geo.json`);
        candidates.push(`https://vanilla.local/models/entity/${baseGeo}.geo.json`);
      }
      if (!isBaby && cleanEntity) {
        candidates.push(`https://pack.local/models/entity/${cleanEntity}.geo.json`);
        candidates.push(`https://vanilla.local/models/entity/${cleanEntity}.geo.json`);
      }

      // Attachables & Armor models
      if (isAttachable || cleanEntity.includes('helmet') || cleanEntity.includes('chestplate') || cleanEntity.includes('leggings') || cleanEntity.includes('boots')) {
        candidates.push('https://vanilla.local/models/entity/armor.geo.json');
        candidates.push('https://vanilla.local/models/entity/armor_stand.geo.json');
      }

      for (const url of candidates) {
        if (hasBuiltGeometry || !isMounted) return;
        try {
          const res = await fetch(url);
          if (res.ok) {
            const text = await res.text();
            if (isMounted && !hasBuiltGeometry && text && text.trim().startsWith('{')) {
              buildMeshFromGeoJson(text);
              return;
            }
          }
        } catch {
          // Continue to next candidate
        }
      }

      // If still not resolved after all fetches & IPC grace period, report missing model (NO humanoid fallback!)
      setTimeout(() => {
        if (isMounted && !hasBuiltGeometry) {
          setIsLoading(false);
          setLoadingError(`No 3D geometry found for ${geometryId || entityId || 'entity'}`);
        }
      }, 600);
    };

    tryFetchGeometry();

    // 8. Render Loop
    let animId: number;
    const render = () => {
      if (!isMounted) return;
      try {
        if (autoRotateRef.current && pivotGroup) {
          pivotGroup.rotation.y += 0.01;
        }
        renderer.render(scene, camera);
        animId = requestAnimationFrame(render);
      } catch (err) {
        console.warn('[Entity3DViewer] Render loop stopped:', err);
      }
    };
    render();

    // 9. Resize & Wheel Listeners
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
    window.addEventListener('resize', handleResize);

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!cameraRef.current) return;

      const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.2, Math.min(4.0, zoomLevelRef.current * zoomFactor));
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
      unsubGeometryData();
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      containerEl.removeEventListener('wheel', handleWheelNative);
      pivotGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) child.geometry.dispose();
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
  }, [geometryId, entityId, textureUrl, isGhost, isAttachable, subscribe, postCommand]);

  // Wireframe updates
  useEffect(() => {
    if (!modelGroupRef.current) return;
    modelGroupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => {
            m.wireframe = wireframe;
            m.needsUpdate = true;
          });
        } else {
          child.material.wireframe = wireframe;
          child.material.needsUpdate = true;
        }
      }
    });
  }, [wireframe]);

  // Pointer Drag Interaction
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      dragModeRef.current = 'rotate';
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    } else if (e.button === 1) {
      e.preventDefault();
      dragModeRef.current = 'pan';
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }
    if (dragModeRef.current) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragModeRef.current) return;

    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    if (dragModeRef.current === 'rotate') {
      if (!modelGroupRef.current || !cameraRef.current) return;
      if (dx === 0 && dy === 0) return;

      const cam = cameraRef.current;
      const camRight = new THREE.Vector3();
      const camUp = new THREE.Vector3();
      cam.matrixWorld.extractBasis(camRight, camUp, new THREE.Vector3());

      const rotSpeed = 0.01;
      const yQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * rotSpeed);
      modelGroupRef.current.quaternion.premultiply(yQuat);

      const xQuat = new THREE.Quaternion().setFromAxisAngle(camRight, dy * rotSpeed);
      modelGroupRef.current.quaternion.premultiply(xQuat);
    } else if (dragModeRef.current === 'pan') {
      if (!cameraRef.current) return;

      const cam = cameraRef.current;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      cam.matrixWorld.extractBasis(right, up, new THREE.Vector3());

      const panSpeed = 0.03 * zoomLevelRef.current;
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

  const handleReset = useCallback(() => {
    if (modelGroupRef.current) {
      modelGroupRef.current.quaternion.identity();
      modelGroupRef.current.rotation.set(0, 0, 0);
    }
    if (cameraRef.current) {
      zoomLevelRef.current = 1.0;
      cameraTargetRef.current.set(0, 0, 0);
      cameraRef.current.position.set(24, 20, 32);
      cameraRef.current.lookAt(cameraTargetRef.current);
    }
  }, []);

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

      {/* Center Drag Handle for Pan */}
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

            const panSpeed = 0.03 * zoomLevelRef.current;
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

      {/* Top-Right Controls */}
      <div className={styles.overlayControls}>
        <button
          type="button"
          className={`${styles.controlButton} ${autoRotate ? styles.controlButtonActive : ''}`}
          onClick={() => setAutoRotate((prev) => !prev)}
          title={autoRotate ? 'Pause rotation' : 'Auto-rotate model'}
        >
          {autoRotate ? <Pause size={11} /> : <Play size={11} />}
        </button>

        <button
          type="button"
          className={`${styles.controlButton} ${wireframe ? styles.controlButtonActive : ''}`}
          onClick={() => setWireframe((prev) => !prev)}
          title={wireframe ? 'Shaded mode' : 'Wireframe mode'}
        >
          {wireframe ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>

        <button
          type="button"
          className={styles.controlButton}
          onClick={handleReset}
          title="Reset camera orientation"
        >
          <RotateCcw size={11} />
        </button>
      </div>

      {/* Bottom Info HUD */}
      {geoStats && (
        <div className={styles.geometryInfoTag}>
          <span className={styles.geometryInfoId}>{geoStats.identifier}</span>
          <span className={styles.geometryInfoSub}>
            {geoStats.bones} bones • {geoStats.texSize} UV
          </span>
        </div>
      )}

      {isLoading && (
        <div className={styles.statusNotice}>
          <span>Loading 3D model...</span>
        </div>
      )}

      {loadingError && !isLoading && (
        <div className={styles.errorNotice}>
          <span>{loadingError}</span>
        </div>
      )}

      <span className={styles.hintText}>Drag to rotate • Middle-drag to pan • Scroll to zoom</span>
    </div>
  );
});
