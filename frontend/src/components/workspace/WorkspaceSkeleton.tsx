// frontend/src/components/workspace/WorkspaceSkeleton.tsx
import React from 'react';
import styles from './WorkspaceSkeleton.module.css';

interface WorkspaceSkeletonProps {
  isEntity?: boolean;
}

export const WorkspaceSkeleton: React.FC<WorkspaceSkeletonProps> = ({ isEntity = false }) => {
  const itemWidths = ['65%', '50%', '75%', '40%', '60%', '70%', '45%', '55%'];

  return (
    <div
      className={styles.skeletonContainer}
      data-testid="workspace-skeleton"
      aria-label={isEntity ? 'Loading entity workspace...' : 'Loading block workspace...'}
      aria-busy="true"
    >
      {/* Left List Pane */}
      <aside className={styles.skeletonListPane}>
        <div className={styles.skeletonListHeader}>
          <div className={styles.skeletonHeaderBar} />
        </div>
        {itemWidths.map((width, idx) => (
          <div key={idx} className={styles.skeletonItem}>
            <div className={styles.skeletonItemLeft}>
              <div className={styles.skeletonItemIcon} />
              <div className={styles.skeletonItemBar} style={{ width }} />
            </div>
            <div className={styles.skeletonItemBadge} />
          </div>
        ))}
      </aside>

      {/* Right Detail Pane */}
      <section className={styles.skeletonDetailPane}>
        <div className={styles.skeletonDetailHeader}>
          <div className={styles.skeletonTitleGroup}>
            <div className={styles.skeletonTitleBar} />
            <div className={styles.skeletonSubBar} />
          </div>
        </div>

        {/* 3D Viewport Box Placeholder */}
        <div className={styles.skeletonViewportBox} />

        {/* Face / Part Cards Shimmer */}
        <div className={styles.skeletonFacesGrid}>
          <div className={styles.skeletonTileCard} />
          <div className={styles.skeletonTileCard} />
          <div className={styles.skeletonTileCard} />
          <div className={styles.skeletonTileCard} />
        </div>
      </section>
    </div>
  );
};
