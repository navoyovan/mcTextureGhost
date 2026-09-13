// frontend/src/components/workspace/Block3DViewer.tsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RotateCcw } from 'lucide-react';
import styles from './Block3DViewer.module.css';

interface Block3DViewerProps {
  faceTextures?: {
    up?: string | null;
    down?: string | null;
    north?: string | null;
    south?: string | null;
    east?: string | null;
    west?: string | null;
    all?: string | null;
  };
}

export const Block3DViewer: React.FC<Block3DViewerProps> = ({ faceTextures = {} }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cubeRef = useRef<THREE.Mesh | null>(null);

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
    } catch (e) {
      console.warn('[Block3DViewer] Failed to initialize WebGLRenderer:', e);
      return;
    }

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // 4. Cube Materials with Nearest-Neighbor filtering
    const textureLoader = new THREE.TextureLoader();

    const createMaterial = (url?: string | null) => {
      if (!url) {
        return new THREE.MeshStandardMaterial({
          color: 0x3f3f46,
          roughness: 0.9,
          metalness: 0.05,
        });
      }

      const mat = new THREE.MeshStandardMaterial({
        roughness: 0.9,
        metalness: 0.05,
        color: 0x3f3f46,
      });

      textureLoader.load(
        url,
        (tex) => {
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.generateMipmaps = false;
          const img = tex.image as HTMLImageElement | undefined;
          if (img && img.height > img.width && img.width > 0) {
            const frameCount = Math.floor(img.height / img.width);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(1, 1 / frameCount);
            tex.offset.set(0, 1 - 1 / frameCount);
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

      return mat;
    };

    // Faces: [East (+X), West (-X), Up (+Y), Down (-Y), South (+Z), North (-Z)]
    const upTex = faceTextures.up || faceTextures.all;
    const downTex = faceTextures.down || faceTextures.all;
    const northTex = faceTextures.north || faceTextures.all;
    const southTex = faceTextures.south || faceTextures.all;
    const eastTex = faceTextures.east || faceTextures.all;
    const westTex = faceTextures.west || faceTextures.all;

    const materials: THREE.Material[] = [
      createMaterial(eastTex),  // Right (+X)
      createMaterial(westTex),  // Left (-X)
      createMaterial(upTex),    // Top (+Y)
      createMaterial(downTex),  // Bottom (-Y)
      createMaterial(southTex), // Front (+Z)
      createMaterial(northTex), // Back (-Z)
    ];

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const cube = new THREE.Mesh(geometry, materials);
    scene.add(cube);
    cubeRef.current = cube;

    // Initial default isometric orientation
    const initEuler = new THREE.Euler(Math.atan(1 / Math.SQRT2) * 0.5, Math.PI / 4, 0, 'YXZ');
    cube.quaternion.setFromEuler(initEuler);

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
    window.addEventListener('resize', handleResize);

    return () => {
      isMounted = false;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      materials.forEach((m) => {
        const mat = m as any;
        if (mat.map && typeof mat.map.dispose === 'function') {
          mat.map.dispose();
        }
        if (typeof mat.dispose === 'function') {
          mat.dispose();
        }
      });
      renderer.dispose();
    };
  }, [faceTextures]);

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
