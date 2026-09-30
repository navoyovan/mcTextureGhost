// frontend/src/components/common/LoadingOverlay.tsx
import React from 'react';
import { usePackStore } from '../../store/packStore';
import { SquareWaveLoader } from './SquareWaveLoader';
import styles from './LoadingOverlay.module.css';

interface LoadingOverlayProps {
  /** Optional custom message override */
  message?: string;
  /** Whether the overlay is in compact mode (e.g. within a panel) */
  compact?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message, compact = false }) => {
  const isScanning = usePackStore((s) => s.isScanning);
  const scanProgress = usePackStore((s) => s.scanProgress);
  const packName = usePackStore((s) => s.packName);
  const packRoot = usePackStore((s) => s.packRoot);

  if (!isScanning || scanProgress?.stage === 'scan_done') {
    return null;
  }

  const currentStep = scanProgress?.current ?? 1;
  const totalSteps = scanProgress?.total ?? 5;
  const percent = Math.min(100, Math.max(12, Math.round((currentStep / totalSteps) * 100)));

  const displayMessage =
    message ||
    scanProgress?.message ||
    'Loading resource pack textures and manifests...';

  const packLabel = packName || (packRoot ? packRoot.split(/[\\/]/).filter(Boolean).pop() : 'Resource Pack');

  if (compact) {
    return (
      <div className={styles.compactOverlay} role="status" aria-live="polite">
        <SquareWaveLoader count={4} color="var(--accent-primary, #8CEB1F)" size={8} gap={4} duration={1800} />
        <span className={styles.statusMessage}>{displayMessage}</span>
      </div>
    );
  }

  return (
    <aside
      className={styles.floatingIndicator}
      data-testid="pack-loading-indicator"
      role="status"
      aria-live="polite"
      aria-label="Loading Resource Pack"
    >
      <div className={styles.indicatorLeft}>
        <SquareWaveLoader
          count={4}
          color="var(--accent-primary, #8CEB1F)"
          size={7}
          gap={4}
          duration={1800}
        />
      </div>
      <div className={styles.indicatorContent}>
        <div className={styles.indicatorTopRow}>
          <span className={styles.indicatorTitle}>Loading {packLabel}</span>
          <span className={styles.stepCounter}>
            {currentStep}/{totalSteps}
          </span>
        </div>
        <span className={styles.statusMessage}>{displayMessage}</span>
        <div className={styles.progressBarTrack}>
          <div
            className={styles.progressBarFill}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </aside>
  );
};
