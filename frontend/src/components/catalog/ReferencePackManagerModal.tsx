// frontend/src/components/catalog/ReferencePackManagerModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Database,
  Download,
  Trash2,
  FolderOpen,
  Copy,
  Check,
  RotateCw,
  Box,
  Image,
  FileCode,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useIpc } from '../../hooks/useIpc';
import { usePackStore } from '../../store/packStore';
import {
  IpcMessageTypes,
  ReferencePackDetailedStatusPayload,
  DownloadProgressPayload,
} from '../../types/ipc';
import { Badge } from '../common/Badge';
import styles from './ReferencePackManagerModal.module.css';

export interface ReferencePackManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReferencePackManagerModal: React.FC<ReferencePackManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { postCommand, subscribe, openInExplorer, getDetailedCatalogStatus, purgeTempArchive, purgeExtractedCatalog } = useIpc();

  const [detailedStatus, setDetailedStatus] = useState<ReferencePackDetailedStatusPayload | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressPayload | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [isPurgingArchive, setIsPurgingArchive] = useState(false);
  const [isPurgingData, setIsPurgingData] = useState(false);

  const simulateNoAssets = usePackStore((s) => s.simulateNoAssets);

  // Load detailed status on open & subscribe to updates
  useEffect(() => {
    if (!isOpen) return;

    getDetailedCatalogStatus();

    const unsubDetailed = subscribe(
      IpcMessageTypes.CatalogDetailedStatus,
      (payload: ReferencePackDetailedStatusPayload) => {
        setDetailedStatus(payload);
      }
    );

    const unsubProgress = subscribe(
      IpcMessageTypes.DownloadProgress,
      (payload: DownloadProgressPayload) => {
        setDownloadProgress(payload);
        if (payload.progress >= 1) {
          setIsDownloading(false);
          getDetailedCatalogStatus();
        }
      }
    );

    return () => {
      unsubDetailed();
      unsubProgress();
    };
  }, [isOpen, subscribe, getDetailedCatalogStatus]);

  const handleCopyPath = useCallback(() => {
    if (!detailedStatus?.referencePath) return;
    navigator.clipboard.writeText(detailedStatus.referencePath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  }, [detailedStatus?.referencePath]);

  const handleOpenExplorer = useCallback(() => {
    if (!detailedStatus?.referencePath) return;
    openInExplorer(detailedStatus.referencePath);
  }, [detailedStatus?.referencePath, openInExplorer]);

  const handleDownload = useCallback(() => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress({
      task: 'download_3d_assets',
      progress: 0.05,
      message: 'Connecting...',
    });
    postCommand(IpcMessageTypes.VanillaDownload3DAssets, {});
  }, [isDownloading, postCommand]);

  const handlePurgeArchive = useCallback(() => {
    setIsPurgingArchive(true);
    purgeTempArchive();
    setTimeout(() => {
      setIsPurgingArchive(false);
      getDetailedCatalogStatus();
    }, 400);
  }, [purgeTempArchive, getDetailedCatalogStatus]);

  const handlePurgeData = useCallback(() => {
    if (window.confirm('Are you sure you want to purge all extracted vanilla catalog assets? You can re-download them anytime.')) {
      setIsPurgingData(true);
      purgeExtractedCatalog();
      setTimeout(() => {
        setIsPurgingData(false);
        getDetailedCatalogStatus();
      }, 500);
    }
  }, [purgeExtractedCatalog, getDetailedCatalogStatus]);

  if (!isOpen) return null;

  const isReady = !simulateNoAssets && Boolean(detailedStatus?.directoryExists && detailedStatus?.hasExtractedModels);

  return createPortal(
    <div
      className={styles.modalBackdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ref-pack-manager-title"
    >
      <div
        className={styles.modalDialog}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className={styles.modalHeader}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIconBadge}>
              <Database size={18} />
            </div>
            <div>
              <h3 id="ref-pack-manager-title" className={styles.headerTitle}>
                Vanilla Catalog Manager
              </h3>
              <p className={styles.headerSubtitle}>
                Inspect Bedrock samples cache, models, textures, and storage footprint
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close dialog"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </header>

        {/* Body Content */}
        <div className={styles.modalBody}>
          {/* Reference Pack Overview & Path */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h4 className={styles.sectionTitle}>
                {detailedStatus?.activeName || 'Vanilla Bedrock'} ({detailedStatus?.versionTag || '1.21.x'})
              </h4>
              {isDownloading ? (
                <Badge variant="ok" size="sm" icon={<Loader2 size={11} className={styles.spinner} />}>
                  Syncing...
                </Badge>
              ) : isReady ? (
                <Badge variant="ok" size="sm" icon={<CheckCircle2 size={11} />}>
                  Extracted & Ready
                </Badge>
              ) : (
                <Badge variant="ghost" size="sm" icon={<AlertTriangle size={11} />}>
                  Not Extracted
                </Badge>
              )}
            </div>

            <div className={styles.pathRow}>
              <span className={styles.pathText} title={detailedStatus?.referencePath}>
                {detailedStatus?.referencePath || 'Resolving path...'}
              </span>
              <button
                type="button"
                className={styles.actionIconBtn}
                onClick={handleCopyPath}
                title={copiedPath ? 'Copied!' : 'Copy Path to Clipboard'}
                aria-label="Copy Path"
              >
                {copiedPath ? <Check size={13} style={{ color: 'var(--accent-primary, #8CEB1F)' }} /> : <Copy size={13} />}
              </button>
              <button
                type="button"
                className={styles.actionIconBtn}
                onClick={handleOpenExplorer}
                title="Open Folder in Windows File Explorer"
                aria-label="Open in Explorer"
              >
                <FolderOpen size={13} />
              </button>
            </div>
          </section>

          {/* Extracted Asset Diagnostics Metrics */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Box size={12} /> Models
              </span>
              <span className={styles.metricValue}>
                {simulateNoAssets ? 0 : (detailedStatus?.modelFilesCount ?? 0)}
              </span>
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Image size={12} /> Textures
              </span>
              <span className={styles.metricValue}>
                {simulateNoAssets ? 0 : (detailedStatus?.textureFilesCount ?? 0)}
              </span>
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <FileCode size={12} /> JSONs
              </span>
              <span className={styles.metricValue}>
                {simulateNoAssets ? 0 : (detailedStatus?.jsonFilesCount ?? 0)}
              </span>
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <HardDrive size={12} /> Total Size
              </span>
              <span className={styles.metricValue}>
                {simulateNoAssets ? '0 B' : (detailedStatus?.totalExtractedSizeFormatted ?? '0 B')}
              </span>
            </div>
          </div>

          {/* Archive Retention & Temp Storage Card */}
          <section className={styles.archiveCard}>
            <div className={styles.archiveInfo}>
              <span className={styles.archiveTitle}>Downloaded Archive (.zip)</span>
              <span className={styles.archiveMeta}>
                {detailedStatus?.tempArchiveExists
                  ? `Cached zip present (${detailedStatus.tempArchiveSizeFormatted})`
                  : 'Temporary archive purged (Clean disk footprint)'}
              </span>
            </div>

            {detailedStatus?.tempArchiveExists && (
              <button
                type="button"
                className={styles.purgeArchiveBtn}
                onClick={handlePurgeArchive}
                disabled={isPurgingArchive}
                title="Delete the downloaded temporary .zip archive to free disk space"
              >
                <Trash2 size={12} />
                <span>{isPurgingArchive ? 'Purging...' : 'Purge Zip Archive'}</span>
              </button>
            )}
          </section>

          {/* Live Download & Extraction Progress */}
          {isDownloading && (
            <div className={styles.progressContainer}>
              <div className={styles.progressTextRow}>
                <span>{downloadProgress?.message || 'Downloading...'}</span>
                <span>{Math.round((downloadProgress?.progress ?? 0.05) * 100)}%</span>
              </div>
              <div className={styles.progressBarTrack}>
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${Math.min(100, Math.round((downloadProgress?.progress ?? 0.05) * 100))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <footer className={styles.modalFooter}>
          <div className={styles.footerLeftActions}>
            {isReady && (
              <button
                type="button"
                className={styles.btnDanger}
                onClick={handlePurgeData}
                disabled={isDownloading || isPurgingData}
                title="Purge all extracted assets"
              >
                <Trash2 size={13} />
                <span>{isPurgingData ? 'Purging...' : 'Purge Extracted Data'}</span>
              </button>
            )}
          </div>

          <div className={styles.footerRightActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onClose}
            >
              Close
            </button>

            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <>
                  <Loader2 size={14} className={styles.spinner} />
                  <span>Syncing...</span>
                </>
              ) : isReady ? (
                <>
                  <RotateCw size={14} />
                  <span>Re-Download & Sync</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>Download Assets</span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};
