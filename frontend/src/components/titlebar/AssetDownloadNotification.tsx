import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Loader2, CheckCircle2 } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import {
  IpcMessageTypes,
  DownloadProgressPayload,
  Vanilla3DStatusPayload,
  ReferencePackDetailedStatusPayload,
} from '../../types/ipc';
import styles from './AssetDownloadNotification.module.css';

export const AssetDownloadNotification: React.FC = () => {
  const { postCommand, subscribe } = useIpc();
  const hasVanillaAssets = usePackStore((s) => s.hasVanillaAssets);
  const simulateNoAssets = usePackStore((s) => s.simulateNoAssets);
  const setHasVanillaAssets = usePackStore((s) => s.setHasVanillaAssets);

  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressPayload | null>(null);
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 200);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const unsubVanillaStatus = subscribe(
      IpcMessageTypes.Vanilla3DStatus,
      (payload: Vanilla3DStatusPayload) => {
        if (payload?.has3DModels !== undefined) {
          setHasVanillaAssets(Boolean(payload.has3DModels));
        }
      }
    );

    const unsubDetailed = subscribe(
      IpcMessageTypes.CatalogDetailedStatus,
      (payload: ReferencePackDetailedStatusPayload) => {
        if (payload?.hasExtractedModels !== undefined) {
          setHasVanillaAssets(Boolean(payload.hasExtractedModels));
        }
      }
    );

    const unsubProgress = subscribe(
      IpcMessageTypes.DownloadProgress,
      (payload: DownloadProgressPayload) => {
        if (payload.task === 'download_3d_assets' || payload.task === 'vanilla_download_3d_assets') {
          setDownloadProgress(payload);
          setIsDownloading(true);

          const isDone = payload.progress >= 1 || payload.progress >= 100;
          if (isDone) {
            setIsDownloading(false);
            setShowSuccess(true);
            setHasVanillaAssets(true);

            // Re-sync catalog and 3D status across host
            postCommand(IpcMessageTypes.VanillaGet3DStatus, {});
            postCommand(IpcMessageTypes.CatalogGetDetailedStatus, {});

            if (successTimerRef.current) clearTimeout(successTimerRef.current);
            successTimerRef.current = setTimeout(() => {
              setShowSuccess(false);
            }, 1600);
          }
        }
      }
    );

    // Initial check across both vanilla 3D and catalog diagnostic endpoints
    postCommand(IpcMessageTypes.VanillaGet3DStatus, {});
    postCommand(IpcMessageTypes.CatalogGetDetailedStatus, {});

    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      unsubVanillaStatus();
      unsubDetailed();
      unsubProgress();
    };
  }, [postCommand, subscribe, setHasVanillaAssets]);

  const handleStartDownload = useCallback(() => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress({
      task: 'download_3d_assets',
      progress: 0.05,
      message: 'Connecting...',
    });
    postCommand(IpcMessageTypes.VanillaDownload3DAssets, {});
  }, [isDownloading, postCommand]);

  // Compute normalized progress between 0 and 100
  const normalizedProgress = downloadProgress?.progress
    ? downloadProgress.progress <= 1.0
      ? Math.round(downloadProgress.progress * 100)
      : Math.min(100, Math.round(downloadProgress.progress))
    : 5;

  // Hover video popup container — pure portrait 4:3 container like morph tile
  const renderPopup = () => {
    if (!isHovered) return null;

    return (
      <div
        className={styles.hoverPopup}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Authentic Minecraft checkerboard background */}
        <div className={styles.checkerboardBg} />

        <video
          ref={(el) => {
            if (el) el.muted = true;
          }}
          src="/tut.webm"
          className={styles.videoContent}
          autoPlay
          loop
          muted
          playsInline
        />
      </div>
    );
  };

  const effectiveHasAssets = !simulateNoAssets && hasVanillaAssets;

  // If assets are already installed and not downloading or showing success, show nothing
  if (effectiveHasAssets && !isDownloading && !showSuccess) return null;

  if (showSuccess) {
    return (
      <div
        className={styles.container}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className={styles.successPill}>
          <CheckCircle2 size={13} className={styles.successIcon} />
          <span>Assets Installed</span>
        </div>
        {renderPopup()}
      </div>
    );
  }

  if (isDownloading) {
    return (
      <div
        className={styles.container}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className={styles.progressContainer}>
          <Loader2 size={13} className={styles.spinner} />
          <div className={styles.progressBarTrack}>
            <div
              className={styles.progressBarFill}
              style={{ width: `${Math.min(100, Math.max(5, normalizedProgress))}%` }}
            />
          </div>
          <span className={styles.progressPercent}>{normalizedProgress}%</span>
          <span className={styles.progressStage}>
            {downloadProgress?.message || 'Downloading...'}
          </span>
        </div>
        {renderPopup()}
      </div>
    );
  }

  return (
    <div
      className={styles.container}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={styles.notificationBtn}
        onClick={handleStartDownload}
        aria-label="Download Assets"
      >
        <Download size={12} className={styles.downloadIcon} />
        <span>Download Assets</span>
      </button>
      {renderPopup()}
    </div>
  );
};
