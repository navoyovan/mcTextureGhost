// frontend/src/components/common/LoadingOverlay.tsx
import React from 'react';
import { usePackStore } from '../../store/packStore';
import styles from './LoadingOverlay.module.css';

interface LoadingOverlayProps {
  /** Optional custom message override */
  message?: string;
  /** Whether the overlay is in compact mode (e.g. within a panel) or full screen modal */
  compact?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message, compact = false }) => {
  const isScanning = usePackStore((s) => s.isScanning);
  const scanProgress = usePackStore((s) => s.scanProgress);
  const packName = usePackStore((s) => s.packName);
  const packRoot = usePackStore((s) => s.packRoot);

  // Once a pack is already loaded in the workspace, background rescans (e.g. from file watcher)
  // must never interrupt the user with a full-screen loading modal.
  if (!isScanning) return null;
  if (packRoot && scanProgress?.stage !== 'scan_start' && scanProgress?.stage !== 'scanning' && scanProgress?.stage !== 'building_trees') {
    return null;
  }
  // If the user already has a pack loaded and active in the workspace, suppress the modal overlay entirely
  if (packRoot) return null;

  const currentStep = scanProgress?.current ?? 1;
  const totalSteps = scanProgress?.total ?? 5;
  const percent = Math.min(100, Math.max(12, Math.round((currentStep / totalSteps) * 100)));

  const displayMessage =
    message ||
    scanProgress?.message ||
    'Loading resource pack textures and manifests...';

  const packLabel = packName || (packRoot ? packRoot.split(/[\\/]/).filter(Boolean).pop() : 'Resource Pack');

  return (
    <div
      className={compact ? styles.compactOverlay : styles.fullOverlay}
      data-testid="pack-loading-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Loading Resource Pack"
    >
      <div className={styles.loadingCard}>
        {/* Animated Ghost / Spinner Visual */}
        <div className={styles.spinnerContainer}>
          <div className={styles.pulseRing} />
          <div className={styles.spinnerCore}>
            <span className={styles.ghostIcon} role="img" aria-label="Ghost">
              👻
            </span>
          </div>
        </div>

        {/* Title and Pack Name */}
        <div className={styles.textGroup}>
          <h3 className={styles.title}>Loading Resource Pack</h3>
          <p className={styles.packName} title={packRoot || undefined}>
            {packLabel}
          </p>
        </div>

        {/* Progress Bar Track */}
        <div
          className={styles.progressBarTrack}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={styles.progressBarFill}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Stage Status and Details */}
        <div className={styles.statusRow}>
          <span className={styles.statusMessage}>{displayMessage}</span>
          <span className={styles.stepCounter}>
            {currentStep}/{totalSteps}
          </span>
        </div>
      </div>
    </div>
  );
};
