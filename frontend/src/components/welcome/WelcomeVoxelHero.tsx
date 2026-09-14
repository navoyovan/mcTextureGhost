// frontend/src/components/welcome/WelcomeVoxelHero.tsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import styles from './WelcomeVoxelHero.module.css';

/**
 * Generates an authentic procedural 16x16 Minecraft voxel texture (Respawn Anchor / Ancient Relic style)
 * with gold inlay trim and glowing energy core to ensure 100% offline availability without needing asset downloads.
 */
function createProceduralBlockTexture(type: 'top' | 'side' | 'bottom'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.magFilter = THREE.NearestFilter;
    return fallback;
  }

  const p = 4; // 16x16 pixels scaled to 64x64

  if (type === 'top') {
    // Respawn Anchor / Ancient Core Top face
    ctx.fillStyle = '#17141e';
    ctx.fillRect(0, 0, 64, 64);

    // Glowing core center
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 28);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.35, '#ca8a04');
    grad.addColorStop(0.7, '#854d0e');
    grad.addColorStop(1, '#2e1065');
    ctx.fillStyle = grad;
    ctx.fillRect(8, 8, 48, 48);

    // Gold corner brackets
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, 0, 16, 8);
    ctx.fillRect(0, 0, 8, 16);
    ctx.fillRect(48, 0, 16, 8);
    ctx.fillRect(56, 0, 8, 16);
    ctx.fillRect(0, 48, 8, 16);
    ctx.fillRect(0, 56, 16, 8);
    ctx.fillRect(56, 48, 8, 16);
    ctx.fillRect(48, 56, 16, 8);

    // Border bevel details
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 60, 60);
  } else if (type === 'side') {
    // Crying Obsidian side with stone noise and gold rim bands
    ctx.fillStyle = '#1a1423';
    ctx.fillRect(0, 0, 64, 64);

    // Stone texture noise
    const colors = ['#221a2e', '#130e1a', '#2d223c', '#1e1628'];
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        if (Math.random() > 0.4) {
          const color = colors[Math.floor(Math.random() * colors.length)] ?? '#1e1628';
          ctx.fillStyle = color;
          ctx.fillRect(x * p, y * p, p, p);
        }
      }
    }

    // Top gold rim band
    ctx.fillStyle = '#d97706';
    ctx.fillRect(0, 0, 64, 8);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(0, 0, 64, 3);

    // Bottom gold rim band
    ctx.fillStyle = '#b45309';
    ctx.fillRect(0, 56, 64, 8);

    // Center runic portal glow
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(20, 20, 24, 24);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(24, 24, 16, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(28, 28, 8, 8);
  } else {
    // Bottom Obsidian stone
    ctx.fillStyle = '#0f0c14';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#1a1523';
    ctx.fillRect(4, 4, 56, 56);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export const WelcomeVoxelHero: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const width = containerRef.current.clientWidth || 460;
    const height = containerRef.current.clientHeight || 280;

    // 1. Scene & Isometric Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(2.4, 2.0, 2.4);
    camera.lookAt(0, -0.05, 0);

    // 2. Renderer with transparent glass passthrough
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 3. Lighting: Studio Ambient + Specular Key Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
    keyLight.position.set(4, 5, 3);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    rimLight.position.set(-3, 2, -3);
    scene.add(rimLight);

    // 4. Cube Materials (6 faces with pixel-crisp textures)
    const topTex = createProceduralBlockTexture('top');
    const sideTex = createProceduralBlockTexture('side');
    const botTex = createProceduralBlockTexture('bottom');

    const materials = [
      new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.4, metalness: 0.1 }), // right (+X)
      new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.4, metalness: 0.1 }), // left (-X)
      new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.3, metalness: 0.2 }),  // top (+Y)
      new THREE.MeshStandardMaterial({ map: botTex, roughness: 0.6, metalness: 0.0 }),  // bottom (-Y)
      new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.4, metalness: 0.1 }), // front (+Z)
      new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.4, metalness: 0.1 }), // back (-Z)
    ];

    const geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const cube = new THREE.Mesh(geometry, materials);
    cube.position.set(0, 0.05, 0);
    scene.add(cube);

    // 5. Floating shadow disc beneath block
    const shadowGeo = new THREE.PlaneGeometry(1.5, 1.5);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 64;
    shadowCanvas.height = 64;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(32, 32, 0, 32, 32, 30);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
      grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.2)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 64, 64);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -0.75, 0);
    scene.add(shadow);

    // 6. Smooth Gentle Floating & Rotation Animation
    let rafId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      cube.rotation.y = elapsed * 0.35;
      cube.position.y = 0.05 + Math.sin(elapsed * 1.5) * 0.06;
      shadow.scale.setScalar(1 + Math.sin(elapsed * 1.5) * 0.08);

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };

    animate();

    // Resize Observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nw = entry.contentRect.width;
        const nh = entry.contentRect.height;
        if (nw > 0 && nh > 0) {
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
          renderer.setSize(nw, nh);
        }
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
      renderer.dispose();
      geometry.dispose();
      shadowGeo.dispose();
      materials.forEach((m) => m.dispose());
      topTex.dispose();
      sideTex.dispose();
      botTex.dispose();
      shadowTex.dispose();
    };
  }, []);

  return (
    <div className={styles.voxelHeroCard} ref={containerRef} aria-label="3D Voxel Showcase">
      <div className={styles.voxelGlowBackdrop} />
      <canvas ref={canvasRef} className={styles.voxelCanvas} />
    </div>
  );
};
