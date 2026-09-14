// frontend/src/components/welcome/WelcomeView.tsx
import React from 'react';
import {
  FolderOpen,
  Plus,
  BookOpen,
  Clock,
  Package,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { RecentPackItemDto } from '../../types/ipc';
import styles from './WelcomeView.module.css';

interface WelcomeViewProps {
  onOpenNewPackDialog?: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({ onOpenNewPackDialog }) => {
  const { openPackFolder, createPack } = useIpc();
  const recentPacks = usePackStore((s) => s.recentPacks);

  // Show up to 5 recent workspaces
  const visibleRecentPacks = (recentPacks || []).slice(0, 5);

  const handleOpenExisting = () => {
    openPackFolder(null);
  };

  const handleCreateNew = () => {
    if (onOpenNewPackDialog) {
      onOpenNewPackDialog();
    } else {
      createPack('');
    }
  };

  const handleOpenRecent = (pack: RecentPackItemDto) => {
    if (pack.folderPath) {
      openPackFolder(pack.folderPath);
    }
  };

  const handleOpenTutorial = () => {
    window.open(
      'https://learn.microsoft.com/en-us/minecraft/creator/documents/resourcepack',
      '_blank'
    );
  };

  const formatPath = (fullPath: string): string => {
    if (!fullPath) return '';
    if (fullPath.length > 56) {
      return '...' + fullPath.slice(-52);
    }
    return fullPath;
  };

  return (
    <div className={styles.welcomeContainer} data-testid="welcome-view">
      <div className={styles.launcherCard}>
        {/* Launcher Header */}
        <header className={styles.header}>
          <div className={styles.brandGroup}>
            <div className={styles.brandTitleRow}>
              <img src="/icon.png" alt="mcTextureGhost icon" className={styles.brandIcon} />
              <h1 className={styles.brandTitle}>mcTextureGhost</h1>
            </div>
          </div>

          <button
            type="button"
            className={styles.docsLink}
            onClick={handleOpenTutorial}
            title="Open Minecraft Creator documentation"
          >
            <BookOpen className={styles.docsIcon} />
            <span>Docs & Guides</span>
          </button>
        </header>

        {/* Action Bar: Primary Open Pack & Secondary Create Pack */}
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.primaryAction}
            onClick={handleOpenExisting}
            data-testid="open-pack-card"
          >
            <FolderOpen className={styles.primaryActionIcon} />
            <div className={styles.actionText}>
              <span className={styles.primaryActionLabel}>Open Existing Pack</span>
              <span className={styles.primaryActionSub}>Select a folder containing manifest.json</span>
            </div>
          </button>

          <button
            type="button"
            className={styles.secondaryAction}
            onClick={handleCreateNew}
            data-testid="create-pack-card"
          >
            <Plus className={styles.secondaryActionIcon} />
            <div className={styles.actionText}>
              <span className={styles.secondaryActionLabel}>Create New Pack</span>
              <span className={styles.secondaryActionSub}>Initialize fresh scaffold</span>
            </div>
          </button>
        </div>

        {/* Main Focus: Recent Workspaces */}
        <section className={styles.recentSection} aria-label="Recent Workspaces">
          <div className={styles.sectionHeading}>
            <div className={styles.headingTitle}>
              <Clock className={styles.headingIcon} />
              <span>Recent Workspaces</span>
            </div>
            {visibleRecentPacks.length > 0 && (
              <span className={styles.countBadge}>{visibleRecentPacks.length}</span>
            )}
          </div>

          {visibleRecentPacks.length > 0 ? (
            <div className={styles.recentList} data-testid="recent-packs-list">
              {visibleRecentPacks.map((pack) => (
                <div
                  key={pack.folderPath}
                  className={styles.recentRow}
                  onClick={() => handleOpenRecent(pack)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenRecent(pack);
                    }
                  }}
                  title={pack.folderPath}
                >
                  <div className={styles.packThumbnailWrapper}>
                    {pack.packIconUrl ? (
                      <img
                        src={pack.packIconUrl}
                        alt=""
                        className={styles.packThumbnail}
                      />
                    ) : (
                      <Package className={styles.packFallbackIcon} />
                    )}
                  </div>

                  <div className={styles.packDetails}>
                    <div className={styles.packTitleRow}>
                      <span className={styles.packTitle}>
                        {pack.packName || pack.displayFolder || 'Unnamed Pack'}
                      </span>
                      {pack.version && (
                        <span className={styles.versionTag}>v{pack.version}</span>
                      )}
                    </div>
                    <span className={styles.packPath}>
                      {formatPath(pack.folderPath)}
                    </span>
                  </div>

                  <span className={styles.timeLabel}>
                    {pack.relativeTime || 'recently'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyRecent} data-testid="recent-packs-empty">
              <Package className={styles.emptyIcon} />
              <div className={styles.emptyTexts}>
                <span className={styles.emptyTitle}>No recent packs opened</span>
                <span className={styles.emptySub}>Packs you open or scaffold will appear here for fast access.</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
