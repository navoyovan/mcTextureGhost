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
  const prevMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const width = containerRef.current.clientWidth || 300;
    const height = containerRef.current.clientHeight || 220;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(2.2, 1.8, 2.2);
    camera.lookAt(0, 0, 0);

    // 2. Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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
          color: 0x27272a,
          roughness: 0.8,
          metalness: 0.1,
        });
      }

      const texture = textureLoader.load(url, (tex) => {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        renderer.render(scene, camera);
      });

      return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9,
        metalness: 0.05,
      });
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

    // Initial default isometric angle
    cube.rotation.y = Math.PI / 4;
    cube.rotation.x = Math.atan(1 / Math.SQRT2) * 0.5;

    // Render loop
    let animId: number;
    const render = () => {
      renderer.render(scene, camera);
      animId = requestAnimationFrame(render);
    };
    render();

    // Resize Handler
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      geometry.dispose();
      materials.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, [faceTextures]);

  // Orbit rotation interaction via mouse drag
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    prevMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !cubeRef.current) return;

    const deltaX = e.clientX - prevMousePos.current.x;
    const deltaY = e.clientY - prevMousePos.current.y;

    cubeRef.current.rotation.y += deltaX * 0.012;
    cubeRef.current.rotation.x += deltaY * 0.012;

    prevMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleResetRotation = () => {
    if (cubeRef.current) {
      cubeRef.current.rotation.y = Math.PI / 4;
      cubeRef.current.rotation.x = Math.atan(1 / Math.SQRT2) * 0.5;
    }
  };

  const handleInspectBottom = () => {
    if (cubeRef.current) {
      cubeRef.current.rotation.y = 0;
      cubeRef.current.rotation.x = Math.PI * 0.45; // Tilt up to see bottom face
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
          onClick={handleInspectBottom}
          title="Inspect bottom face"
        >
          View Bottom
        </button>
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
