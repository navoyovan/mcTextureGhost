import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { RotateCcw, Play, Pause, Eye, EyeOff } from 'lucide-react';
import { useIpc } from '../../hooks/useIpc';
import { IpcMessageTypes, GeometryDataPayload, DownloadProgressPayload } from '../../types/ipc';
import { parseBedrockGeometryJson, buildEntityModel } from './entityGeometryBuilder';
import { isTgaUrl, loadTgaAsDataUrl } from '../../utils/tgaDecoder';
import { Badge } from '../common/Badge';
import styles from './Entity3DViewer.module.css';

export interface EntitySlotVariationOption {
  index: number;
  label: string;
  badgeNumber?: number;
  leaf?: any;
  imageUrl?: string | null;
  isGhost?: boolean;
}

export interface EntitySlotOption {
  index: number;
  label: string;
  alias: string;
  badgeNumber?: number;
  geometryId?: string | null;
  variations: EntitySlotVariationOption[];
}

export interface Entity3DViewerProps {
  geometryId?: string | null;
  entityId?: string | null;
  textureUrl?: string | null;
  isGhost?: boolean;
  isAttachable?: boolean;
  slots?: EntitySlotOption[];
  activeSlotIndex?: number;
  onSelectSlotIndex?: (index: number) => void;
  activeVariationIndex?: number;
  onSelectVariationIndex?: (index: number) => void;
}

const OdometerSlotButton: React.FC<{
  st: EntitySlotOption;
  isSelected: boolean;
  onSelect: (index: number) => void;
}> = React.memo(({ st, isSelected, onSelect }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setIsExpanded(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current);
    }
    leaveTimerRef.current = window.setTimeout(() => {
      setIsExpanded(false);
      leaveTimerRef.current = null;
    }, 800);
  }, []);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) {
        clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  const stLabel = st.badgeNumber ?? st.index + 1;

  return (
    <button
      type="button"
      className={`${styles.odometerButton} ${isSelected ? styles.odometerButtonActive : ''} ${isExpanded ? styles.odometerButtonExpanded : ''}`}
      onClick={() => onSelect(st.index)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={`Slot ${stLabel}: ${st.label}`}
    >
      <span className={styles.odometerIndex}>{stLabel}</span>
      <span className={`${styles.odometerExpandWrapper} ${isExpanded ? styles.expandWrapperActive : ''}`}>
        <span className={styles.odometerPipe}>|</span>
        <Badge variant="neutral" size="sm">{st.label}</Badge>
      </span>
    </button>
  );
});

export const Entity3DViewer: React.FC<Entity3DViewerProps> = React.memo(({
  geometryId,
  entityId,
  textureUrl,
  isGhost = false,
  isAttachable = false,
  slots = [],
  activeSlotIndex = 0,
  onSelectSlotIndex,
  activeVariationIndex = 0,
  onSelectVariationIndex,
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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressPayload | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState<number>(0);

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
        clearTimeout(missingTimeout);
        buildMeshFromGeoJson(payload.rawJson);
      }
    });

    // 6b. IPC Listener for DOWNLOAD:PROGRESS
    const unsubProgress = subscribe(IpcMessageTypes.DownloadProgress, (payload: DownloadProgressPayload) => {
      if (!isMounted) return;
      setDownloadProgress(payload);
      if (payload.progress >= 100) {
        setIsDownloading(false);
        // Trigger model reload now that files are on disk
        setReloadTrigger((prev) => prev + 1);
      }
    });

    // Request geometry from host via IPC
    postCommand(IpcMessageTypes.GeometryGet, { geometryId, entityId });

    // Graceful timeout if geometry is missing from both pack and vanilla data
    const missingTimeout = setTimeout(() => {
      if (isMounted && !hasBuiltGeometry) {
        setIsLoading(false);
        setLoadingError(`No 3D geometry found for ${geometryId || entityId || 'entity'}`);
      }
    }, 450);

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
      clearTimeout(missingTimeout);
      unsubGeometryData();
      unsubProgress();
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
  }, [geometryId, entityId, textureUrl, isGhost, isAttachable, subscribe, postCommand, reloadTrigger]);

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

      {/* Entity Slot & Variation Odometer Cluster in down-left */}
      {(() => {
        const activeSl = slots.find((s) => s.index === activeSlotIndex) ?? slots[0];
        const variations = activeSl?.variations ?? [];
        const hasSlots = slots.length > 1;
        const hasVariations = variations.length > 1;

        if (!hasSlots && !hasVariations) return null;

        return (
          <div className={styles.odometerCluster}>
            {/* Vertical stack of slots ascending upwards */}
            {hasSlots && (
              <>
                <div
                  className={styles.verticalOdometerStack}
                  onWheel={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (!onSelectSlotIndex) return;
                    const delta = e.deltaY > 0 ? 1 : -1;
                    const n = slots.length;
                    const nextIdx = (((activeSlotIndex + delta) % n) + n) % n;
                    onSelectSlotIndex(nextIdx);
                  }}
                >
                  {slots.map((st) => (
                    <OdometerSlotButton
                      key={`slot_${st.index}`}
                      st={st}
                      isSelected={st.index === activeSlotIndex}
                      onSelect={(idx) => onSelectSlotIndex?.(idx)}
                    />
                  ))}
                </div>
                <div className={styles.odometerDividerH} />
              </>
            )}

            {/* Bottom row: Active corner button + Horizontal stack of variations */}
            <div className={styles.bottomOdometerRow}>
              {/* Active corner button showing compound index (e.g. 1a, 1b or 1, a) */}
              {activeSl && (
                <button
                  type="button"
                  className={`${styles.odometerButton} ${styles.odometerButtonActive}`}
                  onClick={() => {
                    if (hasSlots && onSelectSlotIndex) {
                      onSelectSlotIndex((activeSlotIndex + 1) % slots.length);
                    } else if (hasVariations && onSelectVariationIndex) {
                      onSelectVariationIndex((activeVariationIndex + 1) % variations.length);
                    }
                  }}
                  title={`Selected: Slot ${activeSl.badgeNumber ?? activeSl.index + 1}${hasVariations ? `, Variation ${String.fromCharCode(97 + (activeVariationIndex % 26))}` : ''}`}
                >
                  <span className={styles.odometerIndex}>
                    {hasSlots && hasVariations
                      ? `${activeSl.badgeNumber ?? activeSl.index + 1}${String.fromCharCode(97 + (activeVariationIndex % 26))}`
                      : hasSlots
                      ? `${activeSl.badgeNumber ?? activeSl.index + 1}`
                      : `${String.fromCharCode(97 + (activeVariationIndex % 26))}`}
                  </span>
                </button>
              )}

              {/* Horizontal variation list extending to the right */}
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
                        key={`var_${v.index}`}
                        type="button"
                        className={`${styles.odometerButton} ${isSelected ? styles.odometerButtonActive : ''}`}
                        onClick={() => onSelectVariationIndex?.(v.index)}
                        title={`Variation ${charLabel}: ${v.label}`}
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



      {isLoading && !isDownloading && !loadingError && (
        <div className={styles.statusNotice}>
          <span>Loading 3D model...</span>
        </div>
      )}

      {/* 3D Asset Missing / Downloading Modal Overlay */}
      {(isDownloading || (loadingError && !isLoading)) && (
        <div className={styles.downloadPromptOverlay}>
          <div className={styles.downloadPromptCard}>
            <h4 className={styles.downloadPromptTitle}>
              {isDownloading ? 'Downloading Assets' : 'Model Not Found'}
            </h4>
            <p className={styles.downloadPromptDesc}>
              {isDownloading
                ? downloadProgress?.message || 'Extracting...'
                : 'Geometry definition file (.geo.json) not found in pack or vanilla assets.'}
            </p>

            {isDownloading && (
              <div className={styles.progressContainer}>
                <div className={styles.progressBarBg}>
                  <div
                    className={styles.progressBarFill}
                    style={{ width: `${Math.max(5, downloadProgress?.progress ?? 0)}%` }}
                  />
                </div>
                <div className={styles.progressLabel}>
                  <span>{downloadProgress?.task || 'Downloading'}</span>
                  <span>{Math.round(downloadProgress?.progress ?? 0)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <span className={styles.hintText}>Drag to rotate • Middle-drag to pan • Scroll to zoom</span>
    </div>
  );
});
