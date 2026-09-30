// frontend/src/components/grid/PackGridSkeleton.tsx
import React from 'react';
import styles from './PackGridSkeleton.module.css';

interface PackGridSkeletonProps {
  count?: number;
  tileZoom?: number;
}

export const PackGridSkeleton: React.FC<PackGridSkeletonProps> = ({
  count = 24,
  tileZoom = 120,
}) => {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <div
      className={styles.skeletonGrid}
      style={{
        '--tile-zoom': `${tileZoom}px`,
        '--tile-card-width': `${tileZoom + 40}px`,
      } as React.CSSProperties}
      data-testid="pack-grid-skeleton"
      aria-label="Loading textures"
      aria-busy="true"
    >
      {items.map((key) => (
        <div key={key} className={styles.skeletonCard}>
          <div className={styles.skeletonThumbnail} />
          <div className={styles.skeletonMeta}>
            <div className={styles.skeletonTitle} />
            <div className={styles.skeletonSubtitle} />
          </div>
        </div>
      ))}
    </div>
  );
};
