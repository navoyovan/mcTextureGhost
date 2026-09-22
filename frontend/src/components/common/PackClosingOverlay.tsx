import React, { useEffect, useState } from 'react';
import { SquareWaveLoader } from './SquareWaveLoader';
import styles from './PackClosingOverlay.module.css';

interface PackClosingOverlayProps {
  /** Called after the overlay has faded out and the transition guard can be lifted */
  onDone: () => void;
}

/**
 * Full-screen input blocker shown while a pack close reloads Chromium and IPC re-inits.
 * Covers the late welcome-view entrance cascade so the user cannot click mid-transition.
 */
export const PackClosingOverlay: React.FC<PackClosingOverlayProps> = ({ onDone }) => {
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Hold long enough for reload + IPC re-init + welcome cascade (~0.7s), then fade out
    const hideTimer = setTimeout(() => setIsLeaving(true), 900);
    const doneTimer = setTimeout(onDone, 1150);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className={`${styles.overlay} ${isLeaving ? styles.overlayLeaving : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Closing pack"
      data-testid="pack-closing-overlay"
    >
      <div className={styles.card}>
        <div className={styles.loaderWrap}>
          <SquareWaveLoader
            count={5}
            color="var(--accent-primary, #8CEB1F)"
            size={10}
            gap={6}
            duration={2100}
          />
        </div>
        <h3 className={styles.title}>Closing Pack</h3>
        <p className={styles.subtitle}>Reloading workspace…</p>
      </div>
    </div>
  );
};
